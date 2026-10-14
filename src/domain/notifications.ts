import { stableKey } from "@/lib/ids";
import { addHours, isBefore, nowIso, type IsoInstant } from "@/lib/time";
import {
  isDiscussionKind,
  type Id,
  type NotificationKind,
  type NotificationPreference,
} from "./types";

export const DEFAULT_PREFERENCES: Omit<NotificationPreference, "userId"> = {
  emailImmediate: true,
  digestDiscussion: false,
  subscriptionScope: "toute_la_communaute",
  mutedEventIds: [],
  reminderOffsetsHours: [48, 24],
};

/**
 * Cle d'idempotence d'une notification logique. Une reprise de l'outbox
 * n'envoie pas deux fois le meme email.
 */
export function notificationIdempotencyKey(input: {
  kind: NotificationKind;
  recipientUserId: Id;
  /** Ressource concernee : evenement, demande, message, affectation. */
  subjectId: string;
  /** Version du planning ou horodatage logique, pour autoriser un renvoi. */
  revision?: string | number;
}): string {
  return stableKey(
    input.kind,
    input.recipientUserId,
    input.subjectId,
    input.revision ?? "",
  );
}

export interface RecipientCandidate {
  userId: Id;
  /** Adhesion active dans la communaute de l'evenement. */
  activeMember: boolean;
  /** Affecte sur cet evenement : abonnement automatique. */
  assigned: boolean;
  preferences: NotificationPreference;
}

/**
 * Destinataires d'un nouveau message : membres actifs abonnes a l'evenement,
 * hors auteur, sourdine respectee.
 */
export function discussionRecipients(
  candidates: readonly RecipientCandidate[],
  ctx: { eventId: Id; authorUserId: Id },
): Id[] {
  return candidates
    .filter((c) => c.activeMember)
    .filter((c) => c.userId !== ctx.authorUserId)
    .filter((c) => !c.preferences.mutedEventIds.includes(ctx.eventId))
    .filter((c) =>
      c.preferences.subscriptionScope === "toute_la_communaute"
        ? true
        : c.assigned,
    )
    .map((c) => c.userId);
}

/**
 * Les notifications d'organisation ne sont pas filtrees par la portee
 * d'abonnement : une affectation ou une annulation concerne directement la
 * personne.
 */
export function organisationRecipients(
  candidates: readonly RecipientCandidate[],
  kind: NotificationKind,
  ctx: { targetUserIds?: Id[] } = {},
): Id[] {
  const targeted = ctx.targetUserIds;
  return candidates
    .filter((c) => c.activeMember)
    .filter((c) => (targeted ? targeted.includes(c.userId) : true))
    .filter(() => !isDiscussionKind(kind))
    .map((c) => c.userId);
}

/** Un email de discussion peut etre regroupe ; une affectation jamais. */
export function emailDeliveryMode(
  kind: NotificationKind,
  prefs: NotificationPreference,
): "immediat" | "regroupe" | "aucun" {
  if (isDiscussionKind(kind)) {
    if (prefs.digestDiscussion) return "regroupe";
    return prefs.emailImmediate ? "immediat" : "aucun";
  }
  return prefs.emailImmediate ? "immediat" : "aucun";
}

/**
 * Rappels : on ne programme jamais un rappel dont l'echeance est deja passee.
 * Apres un deplacement ou une annulation, les rappels sont recalcules.
 */
export function computeReminderSchedule(
  startsAt: IsoInstant,
  offsetsHours: readonly number[],
  from: IsoInstant = nowIso(),
): IsoInstant[] {
  return offsetsHours
    .map((h) => addHours(startsAt, -Math.abs(h)))
    .filter((at) => isBefore(from, at))
    .sort();
}

export const NOTIFICATION_TITLES: Record<NotificationKind, string> = {
  adhesion_demandee: "Nouvelle demande d'adhesion",
  adhesion_acceptee: "Demande d'adhesion acceptee",
  adhesion_refusee: "Demande d'adhesion refusee",
  collecte_ouverte: "Collecte des disponibilites ouverte",
  planning_publie: "Planning publie",
  affectation_nouvelle: "Nouvelle affectation",
  affectation_a_remplacer: "Remplacement necessaire",
  modification_importante: "Modification importante du planning",
  evenement_annule: "Evenement annule",
  rappel: "Rappel",
  message_nouveau: "Nouveau message",
};

/** Un email de groupe ne contient jamais un motif prive. */
export function assertNoPrivateReason(body: string, reasons: readonly string[]): void {
  for (const r of reasons) {
    const trimmed = r.trim();
    if (trimmed.length > 0 && body.includes(trimmed)) {
      throw new Error(
        "Un motif prive ne peut pas figurer dans le corps d'une notification.",
      );
    }
  }
}
