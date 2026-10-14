import { overlaps, type IsoInstant } from "@/lib/time";
import type { Id } from "./types";

/**
 * Detection des chevauchements. Un engagement est un creneau d'evenement ou
 * une repetition ou la presence est attendue.
 */
export interface Commitment {
  kind: "creneau" | "repetition";
  communityId: Id;
  eventId: Id;
  /** sessionId ou rehearsalId. */
  refId: Id;
  label: string;
  eventTitle: string;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
}

export type ConflictDetail =
  | {
      visibility: "detaille";
      kind: Commitment["kind"];
      communityId: Id;
      eventId: Id;
      eventTitle: string;
      label: string;
      startsAt: IsoInstant;
      endsAt: IsoInstant;
    }
  | {
      /**
       * Hors de la communaute consultee : on signale le conflit sans reveler
       * le ministere, l'evenement ni le lieu.
       */
      visibility: "masque";
      message: "Conflit sur ce creneau";
    };

export interface ConflictReport {
  hasConflict: boolean;
  conflicts: ConflictDetail[];
}

/**
 * Deux creneaux successifs dans la journee ne sont pas un conflit : seul un
 * recouvrement reel en est un.
 */
export function detectConflicts(
  target: { startsAt: IsoInstant; endsAt: IsoInstant; refId?: Id },
  commitments: readonly Commitment[],
  viewerCommunityId: Id,
): ConflictReport {
  const conflicts: ConflictDetail[] = [];
  for (const c of commitments) {
    if (target.refId && c.refId === target.refId) continue;
    if (!overlaps(target, c)) continue;
    if (c.communityId === viewerCommunityId) {
      conflicts.push({
        visibility: "detaille",
        kind: c.kind,
        communityId: c.communityId,
        eventId: c.eventId,
        eventTitle: c.eventTitle,
        label: c.label,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
      });
    } else {
      conflicts.push({ visibility: "masque", message: "Conflit sur ce creneau" });
    }
  }
  return { hasConflict: conflicts.length > 0, conflicts };
}

export function describeConflict(c: ConflictDetail): string {
  if (c.visibility === "masque") return c.message;
  const what = c.kind === "repetition" ? "Repetition" : "Creneau";
  return `${what} « ${c.label} » de « ${c.eventTitle} »`;
}
