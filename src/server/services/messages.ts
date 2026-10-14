import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import { canReadDiscussion, canWriteDiscussion } from "@/domain/permissions";
import { discussionRecipients, type RecipientCandidate } from "@/domain/notifications";
import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import type { Id } from "@/domain/types";
import { getDataAdapter } from "../data";
import { requireActiveMembership } from "../auth/context";
import { enqueueNotifications, writeAudit } from "../notifications/enqueue";

/**
 * Messagerie d'evenement. Les messages sont persistes : le temps reel
 * actualise l'interface, il ne remplace pas l'historique.
 */

export interface MessageView {
  id: Id;
  authorUserId: Id;
  authorName: string;
  authorInitials: string;
  body: string;
  mentions: Id[];
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  moderated: boolean;
  isMine: boolean;
}

export interface ThreadPage {
  messages: MessageView[];
  /** Curseur de pagination : createdAt du message le plus ancien renvoye. */
  nextCursor: string | null;
  canWrite: boolean;
  unread: number;
  mentionables: { userId: Id; name: string }[];
}

const PAGE_SIZE = 30;

export async function readThread(
  communityId: Id,
  eventId: Id,
  options: { cursor?: string | null } = {},
): Promise<Result<ThreadPage>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  return adapter.read(async (tx) => {
    const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (!canReadDiscussion(ctx.membership, event.state)) {
      return err("discussion_fermee", "Cette discussion n'est pas accessible.");
    }

    const all = (await tx.select("event_messages", { where: { eventId } }))
      .filter((m) => m.deletedAt === null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const windowed = options.cursor
      ? all.filter((m) => m.createdAt < options.cursor!)
      : all;
    const page = windowed.slice(0, PAGE_SIZE);

    const memberships = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
    });
    const profiles = await tx.select("profiles", {
      whereIn: { id: memberships.map((m) => m.userId) },
    });
    const byId = new Map(profiles.map((p) => [p.id, p]));

    const cursor = await tx.selectOne("message_read_cursors", {
      where: { eventId, userId: ctx.viewer.userId },
    });
    const lastRead = cursor?.lastReadAt ?? "1970-01-01T00:00:00.000Z";

    return ok({
      messages: page
        .slice()
        .reverse()
        .map((m): MessageView => {
          const p = byId.get(m.authorUserId);
          return {
            id: m.id,
            authorUserId: m.authorUserId,
            authorName: p ? `${p.firstName} ${p.lastName}` : "Membre retire",
            authorInitials: p
              ? `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase()
              : "--",
            body: m.body,
            mentions: m.mentions,
            pinned: m.pinned,
            createdAt: m.createdAt,
            editedAt: m.editedAt,
            moderated: m.moderatedBy !== null,
            isMine: m.authorUserId === ctx.viewer.userId,
          };
        }),
      nextCursor:
        windowed.length > PAGE_SIZE ? (page[page.length - 1]?.createdAt ?? null) : null,
      canWrite: canWriteDiscussion(ctx.membership, event.state),
      unread: all.filter(
        (m) => m.createdAt > lastRead && m.authorUserId !== ctx.viewer.userId,
      ).length,
      mentionables: memberships
        .map((m) => {
          const p = byId.get(m.userId);
          return {
            userId: m.userId,
            name: p ? `${p.firstName} ${p.lastName}` : "Membre",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    });
  });
}

export async function postMessage(
  communityId: Id,
  eventId: Id,
  input: { body: string; mentions?: Id[] },
): Promise<Result<{ id: Id }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  const body = input.body.trim();
  if (body === "") return err("message_vide", "Ecrivez un message.");
  if (body.length > 4000) {
    return err("message_trop_long", "Message limite a 4000 caracteres.");
  }

  return adapter.transaction(async (tx) => {
    const event = await tx.selectOne("events", { where: { id: eventId, communityId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (!canWriteDiscussion(ctx.membership, event.state)) {
      return err("discussion_fermee", "Cette discussion est en lecture seule.");
    }

    // Seuls des membres actifs peuvent etre mentionnes.
    const activeMembers = await tx.select("community_memberships", {
      where: { communityId, status: "active" },
    });
    const activeUserIds = new Set(activeMembers.map((m) => m.userId));
    const mentions = (input.mentions ?? []).filter((id) => activeUserIds.has(id));

    const at = nowIso();
    const id = newId();
    await tx.insert("event_messages", {
      id,
      communityId,
      eventId,
      authorUserId: ctx.viewer.userId,
      body,
      mentions,
      pinned: false,
      createdAt: at,
      editedAt: null,
      moderatedBy: null,
      moderationNote: null,
      deletedAt: null,
    });

    // L'autorisation du destinataire est recalculee a chaque envoi : une
    // adhesion revoquee ne recoit plus de contenu.
    const plans = await tx.select("event_plans", { where: { eventId } });
    const assignments = await tx.select("assignments", {
      whereIn: { planId: plans.map((p) => p.id) },
    });
    const assignedMembershipIds = new Set(
      assignments.filter((a) => a.state !== "retiree").map((a) => a.membershipId),
    );

    const candidates: RecipientCandidate[] = [];
    for (const m of activeMembers) {
      const prefs = await tx.selectOne("notification_preferences", {
        where: { userId: m.userId },
      });
      candidates.push({
        userId: m.userId,
        activeMember: true,
        assigned: assignedMembershipIds.has(m.id),
        preferences: prefs ?? { userId: m.userId, ...DEFAULT_PREFERENCES },
      });
    }

    const recipients = discussionRecipients(candidates, {
      eventId,
      authorUserId: ctx.viewer.userId,
    });

    await enqueueNotifications(tx, {
      kind: "message_nouveau",
      recipientUserIds: recipients,
      communityId,
      eventId,
      body: `${ctx.profile.firstName} ${ctx.profile.lastName} a ecrit dans « ${event.title} ».`,
      href: `/c/${communityId}/evenements/${eventId}?onglet=discussion`,
      subjectId: id,
    });

    return ok({ id });
  });
}

export async function editMessage(
  communityId: Id,
  messageId: Id,
  body: string,
): Promise<Result<{ id: Id }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  const trimmed = body.trim();
  if (trimmed === "") return err("message_vide", "Ecrivez un message.");

  return adapter.transaction(async (tx) => {
    const message = await tx.selectOne("event_messages", {
      where: { id: messageId, communityId },
    });
    if (!message) return err("message_inconnu", "Message introuvable.");
    // L'edition est limitee a son auteur.
    if (message.authorUserId !== ctx.viewer.userId) {
      return err("non_autorise", "Seul l'auteur peut modifier son message.");
    }
    await tx.update("event_messages", messageId, {
      body: trimmed,
      editedAt: nowIso(),
    });
    return ok({ id: messageId });
  });
}

/** Moderation par un admin : trace conservee, contenu masque. */
export async function moderateMessage(
  communityId: Id,
  messageId: Id,
  note: string,
): Promise<Result<{ id: Id }>> {
  const ctx = await requireActiveMembership(communityId);
  if (ctx.membership.role !== "admin") {
    return err("non_autorise", "Reserve aux admins.");
  }
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const message = await tx.selectOne("event_messages", {
      where: { id: messageId, communityId },
    });
    if (!message) return err("message_inconnu", "Message introuvable.");
    await tx.update("event_messages", messageId, {
      body: "Message retire par la moderation.",
      moderatedBy: ctx.viewer.userId,
      moderationNote: note.trim() || null,
      editedAt: nowIso(),
    });
    await writeAudit(tx, {
      communityId,
      actorUserId: ctx.viewer.userId,
      action: "message.modere",
      targetType: "event_message",
      targetId: messageId,
      metadata: { note },
    });
    return ok({ id: messageId });
  });
}

export async function pinMessage(
  communityId: Id,
  messageId: Id,
  pinned: boolean,
): Promise<Result<{ id: Id }>> {
  const ctx = await requireActiveMembership(communityId);
  if (ctx.membership.role !== "admin") {
    return err("non_autorise", "Reserve aux admins.");
  }
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const message = await tx.selectOne("event_messages", {
      where: { id: messageId, communityId },
    });
    if (!message) return err("message_inconnu", "Message introuvable.");
    if (pinned) {
      await tx.updateWhere(
        "event_messages",
        { eventId: message.eventId, pinned: true },
        { pinned: false },
      );
    }
    await tx.update("event_messages", messageId, { pinned });
    return ok({ id: messageId });
  });
}

export async function markThreadRead(
  communityId: Id,
  eventId: Id,
): Promise<Result<{ at: string }>> {
  const ctx = await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const at = nowIso();
    const existing = await tx.selectOne("message_read_cursors", {
      where: { eventId, userId: ctx.viewer.userId },
    });
    if (existing) {
      await tx.update("message_read_cursors", existing.id, { lastReadAt: at });
    } else {
      await tx.insert("message_read_cursors", {
        id: newId(),
        communityId,
        eventId,
        userId: ctx.viewer.userId,
        lastReadAt: at,
      });
    }
    return ok({ at });
  });
}
