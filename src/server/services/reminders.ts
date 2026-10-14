import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { computeReminderSchedule } from "@/domain/notifications";
import type { Id } from "@/domain/types";
import { notificationIdempotencyKey } from "@/domain/notifications";
import { ConstraintError, type Tx } from "../data/port";
import { preferencesFor } from "../notifications/enqueue";

/**
 * Rappels. Recalcules apres un deplacement, une publication ou une
 * annulation : les anciennes taches encore en attente sont abandonnees, et
 * aucun rappel dont l'echeance est passee n'est programme.
 */
export async function scheduleRemindersForEvent(
  tx: Tx,
  eventId: Id,
): Promise<{ scheduled: number; dropped: number }> {
  const event = await tx.selectOne("events", { where: { id: eventId } });
  if (!event) return { scheduled: 0, dropped: 0 };

  const at = nowIso();
  const stale = await tx.updateWhere(
    "notification_outbox",
    { eventId, kind: "rappel", state: "enregistre" },
    { state: "abandonne", updatedAt: at },
  );

  if (event.state === "annule" || event.state === "archive") {
    return { scheduled: 0, dropped: stale.length };
  }

  const sessions = await tx.select("event_sessions", { where: { eventId } });
  if (sessions.length === 0) return { scheduled: 0, dropped: stale.length };
  const first = sessions
    .slice()
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))[0]!;

  const plans = await tx.select("event_plans", { where: { eventId } });
  const assignments = (
    await tx.select("assignments", { whereIn: { planId: plans.map((p) => p.id) } })
  ).filter((a) => a.state !== "retiree");
  const memberships = await tx.select("community_memberships", {
    whereIn: { id: assignments.map((a) => a.membershipId) },
  });

  let scheduled = 0;
  for (const membership of memberships) {
    if (membership.status !== "active") continue;
    const prefs = await preferencesFor(tx, membership.userId);
    if (prefs.mutedEventIds.includes(eventId)) continue;
    const slots = computeReminderSchedule(
      first.startsAt,
      prefs.reminderOffsetsHours,
      at,
    );
    for (const when of slots) {
      const key = notificationIdempotencyKey({
        kind: "rappel",
        recipientUserId: membership.userId,
        subjectId: `${eventId}:${when}`,
        revision: event.publishedVersion,
      });
      try {
        await tx.insert("notification_outbox", {
          id: newId(),
          idempotencyKey: key,
          kind: "rappel",
          recipientUserId: membership.userId,
          communityId: event.communityId,
          eventId,
          subject: "Rappel",
          body: `« ${event.title} » approche.`,
          state: "enregistre",
          attempts: 0,
          scheduledFor: when,
          lastError: null,
          providerMessageId: null,
          createdAt: at,
          updatedAt: at,
        });
        scheduled += 1;
      } catch (error) {
        if (
          error instanceof ConstraintError &&
          error.code === "outbox_idempotency_unique"
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  return { scheduled, dropped: stale.length };
}
