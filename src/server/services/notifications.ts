import "server-only";
import { nowIso } from "@/lib/time";
import { ok, type Result } from "@/lib/result";
import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import {
  isDiscussionKind,
  type Id,
  type Notification,
  type NotificationPreference,
} from "@/domain/types";
import { getDataAdapter } from "../data";
import { requireSession } from "../auth/context";

/**
 * Centre de notifications et preferences. Les notifications d'organisation
 * restent separees des discussions a l'affichage comme a l'envoi.
 */

export interface NotificationFeed {
  organisation: Notification[];
  discussions: Notification[];
  unread: number;
}

export async function listNotifications(limit = 60): Promise<NotificationFeed> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const rows = await tx.select("notifications", {
      where: { userId: session.viewer.userId },
      orderBy: { column: "createdAt", direction: "desc" },
      limit,
    });
    return {
      organisation: rows.filter((n) => !isDiscussionKind(n.kind)),
      discussions: rows.filter((n) => isDiscussionKind(n.kind)),
      unread: rows.filter((n) => n.readAt === null).length,
    };
  });
}

export async function unreadCount(): Promise<number> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const rows = await tx.select("notifications", {
      where: { userId: session.viewer.userId, readAt: null },
    });
    return rows.length;
  });
}

export async function markNotificationRead(
  notificationId: Id,
): Promise<Result<{ id: Id }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const row = await tx.selectOne("notifications", {
      where: { id: notificationId, userId: session.viewer.userId },
    });
    if (!row) return ok({ id: notificationId });
    await tx.update("notifications", notificationId, { readAt: nowIso() });
    return ok({ id: notificationId });
  });
}

export async function markAllRead(): Promise<Result<{ count: number }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const rows = await tx.updateWhere(
      "notifications",
      { userId: session.viewer.userId, readAt: null },
      { readAt: nowIso() },
    );
    return ok({ count: rows.length });
  });
}

export async function getPreferences(): Promise<NotificationPreference> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const existing = await tx.selectOne("notification_preferences", {
      where: { userId: session.viewer.userId },
    });
    return existing ?? { userId: session.viewer.userId, ...DEFAULT_PREFERENCES };
  });
}

export async function updatePreferences(
  patch: Partial<Omit<NotificationPreference, "userId">>,
): Promise<Result<{ saved: true }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const existing = await tx.selectOne("notification_preferences", {
      where: { userId: session.viewer.userId },
    });
    const clean: Partial<NotificationPreference> = { ...patch };
    if (patch.reminderOffsetsHours) {
      clean.reminderOffsetsHours = [
        ...new Set(
          patch.reminderOffsetsHours
            .map((h) => Math.abs(Math.round(h)))
            .filter((h) => h > 0 && h <= 336),
        ),
      ].sort((a, b) => b - a);
    }
    if (existing) {
      await tx.update("notification_preferences", session.viewer.userId, clean);
    } else {
      await tx.insert("notification_preferences", {
        userId: session.viewer.userId,
        ...DEFAULT_PREFERENCES,
        ...clean,
      });
    }
    return ok({ saved: true as const });
  });
}

export async function toggleEventMute(
  eventId: Id,
  muted: boolean,
): Promise<Result<{ muted: boolean }>> {
  const session = await requireSession();
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const existing = await tx.selectOne("notification_preferences", {
      where: { userId: session.viewer.userId },
    });
    const current = existing ?? {
      userId: session.viewer.userId,
      ...DEFAULT_PREFERENCES,
    };
    const next = muted
      ? [...new Set([...current.mutedEventIds, eventId])]
      : current.mutedEventIds.filter((id) => id !== eventId);
    if (existing) {
      await tx.update("notification_preferences", session.viewer.userId, {
        mutedEventIds: next,
      });
    } else {
      await tx.insert("notification_preferences", {
        ...current,
        mutedEventIds: next,
      });
    }
    return ok({ muted });
  });
}
