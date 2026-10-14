import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import {
  DEFAULT_PREFERENCES,
  NOTIFICATION_TITLES,
  emailDeliveryMode,
  notificationIdempotencyKey,
} from "@/domain/notifications";
import type { Id, NotificationKind, NotificationPreference } from "@/domain/types";
import { ConstraintError, type Tx } from "../data/port";

/**
 * Outbox transactionnelle : la modification metier, la notification dans
 * l'application et la tache d'email sont ecrites dans la meme transaction.
 * Un worker separe envoie ensuite les emails.
 */
export interface EnqueueInput {
  kind: NotificationKind;
  recipientUserIds: readonly Id[];
  communityId: Id | null;
  eventId: Id | null;
  title?: string;
  body: string;
  href?: string | null;
  /** Identifie la notification logique : evenement, demande, message... */
  subjectId: string;
  /** Autorise un nouvel envoi apres un changement reel. */
  revision?: string | number;
  /** Envoi differe, pour les rappels. */
  scheduledFor?: string;
}

export async function preferencesFor(
  tx: Tx,
  userId: Id,
): Promise<NotificationPreference> {
  const existing = await tx.selectOne("notification_preferences", {
    where: { userId },
  });
  return existing ?? { userId, ...DEFAULT_PREFERENCES };
}

export async function enqueueNotifications(
  tx: Tx,
  input: EnqueueInput,
): Promise<{ inApp: number; queuedEmails: number }> {
  const at = nowIso();
  const title = input.title ?? NOTIFICATION_TITLES[input.kind];
  let inApp = 0;
  let queuedEmails = 0;

  for (const userId of new Set(input.recipientUserIds)) {
    await tx.insert("notifications", {
      id: newId(),
      userId,
      communityId: input.communityId,
      eventId: input.eventId,
      kind: input.kind,
      title,
      body: input.body,
      href: input.href ?? null,
      createdAt: at,
      readAt: null,
    });
    inApp += 1;

    const prefs = await preferencesFor(tx, userId);
    const mode = emailDeliveryMode(input.kind, prefs);
    if (mode === "aucun") continue;
    if (input.eventId && prefs.mutedEventIds.includes(input.eventId)) continue;

    const key = notificationIdempotencyKey({
      kind: input.kind,
      recipientUserId: userId,
      subjectId: input.subjectId,
      revision: input.revision,
    });

    try {
      await tx.insert("notification_outbox", {
        id: newId(),
        idempotencyKey: key,
        kind: input.kind,
        recipientUserId: userId,
        communityId: input.communityId,
        eventId: input.eventId,
        subject: title,
        body: input.body,
        state: "enregistre",
        attempts: 0,
        scheduledFor: input.scheduledFor ?? at,
        lastError: null,
        providerMessageId: null,
        createdAt: at,
        updatedAt: at,
      });
      queuedEmails += 1;
    } catch (error) {
      // Meme notification logique deja en file : on ne la double pas.
      if (
        error instanceof ConstraintError &&
        error.code === "outbox_idempotency_unique"
      ) {
        continue;
      }
      throw error;
    }
  }

  return { inApp, queuedEmails };
}

/** Trace administrative privee. */
export async function writeAudit(
  tx: Tx,
  entry: {
    communityId: Id | null;
    actorUserId: Id;
    action: string;
    targetType: string;
    targetId: Id | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert("audit_logs", {
    id: newId(),
    communityId: entry.communityId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ?? {},
    at: nowIso(),
  });
}
