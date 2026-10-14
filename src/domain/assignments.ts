import type {
  Assignment,
  AssignmentState,
  AvailabilityDisplayState,
  EventRoleSlot,
  ExceptionKind,
  Id,
} from "./types";

/**
 * Cycle de vie d'une affectation. Le membre confirme ou signale un
 * empechement ; il ne modifie ni le poste, ni le nom d'un autre membre.
 */
const TRANSITIONS: Record<AssignmentState, readonly AssignmentState[]> = {
  a_confirmer: ["confirmee", "a_remplacer", "retiree"],
  confirmee: ["a_remplacer", "retiree"],
  a_remplacer: ["confirmee", "retiree"],
  retiree: ["a_confirmer"],
};

export function canTransition(
  from: AssignmentState,
  to: AssignmentState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export type AssignmentActor = "admin" | "membre";

/** Transitions ouvertes au destinataire de l'affectation lui-meme. */
const MEMBER_TRANSITIONS: readonly AssignmentState[] = [
  "confirmee",
  "a_remplacer",
];

export function canActorTransition(
  actor: AssignmentActor,
  from: AssignmentState,
  to: AssignmentState,
): boolean {
  if (!canTransition(from, to)) return false;
  if (actor === "admin") return true;
  return MEMBER_TRANSITIONS.includes(to);
}

export const ASSIGNMENT_LABELS: Record<AssignmentState, string> = {
  a_confirmer: "A confirmer",
  confirmee: "Confirmee",
  a_remplacer: "A remplacer",
  retiree: "Retiree",
};

export function isActiveAssignment(a: Assignment): boolean {
  return a.state !== "retiree";
}

/**
 * Un doublon exact (meme personne, meme poste, affectation encore active)
 * est refuse. Plusieurs personnes sur un poste et une personne sur plusieurs
 * postes compatibles restent permis.
 */
export function isExactDuplicate(
  existing: readonly Assignment[],
  candidate: { slotId: Id; membershipId: Id },
): boolean {
  return existing.some(
    (a) =>
      a.slotId === candidate.slotId &&
      a.membershipId === candidate.membershipId &&
      isActiveAssignment(a),
  );
}

export interface ExceptionRequirement {
  required: boolean;
  kinds: ExceptionKind[];
  messages: string[];
}

/**
 * Determine si une affectation necessite une confirmation d'exception.
 * La disponibilite declaree par le membre n'est jamais modifiee.
 */
export function exceptionRequirement(input: {
  availability: AvailabilityDisplayState;
  matchesSkills: boolean;
  hasConflict: boolean;
}): ExceptionRequirement {
  const kinds: ExceptionKind[] = [];
  const messages: string[] = [];

  if (input.availability === "a_renseigner" || input.availability === "a_reconfirmer") {
    kinds.push("sans_reponse");
    messages.push(
      "Cette personne n'a pas renseigne sa disponibilite pour ce creneau.",
    );
  }
  if (input.availability === "indisponible") {
    kinds.push("indisponible");
    messages.push("Cette personne s'est declaree indisponible sur ce creneau.");
  }
  if (!input.matchesSkills) {
    kinds.push("hors_competence");
    messages.push(
      "Ce poste ne figure pas dans les competences declarees : l'affectation reste possible, la qualification n'est pas verifiee automatiquement.",
    );
  }
  if (input.hasConflict) {
    kinds.push("conflit");
    messages.push("Un chevauchement est detecte sur ce creneau.");
  }

  return { required: kinds.length > 0, kinds, messages };
}

export interface SlotFillState {
  slot: EventRoleSlot;
  active: Assignment[];
  confirmed: number;
  toReplace: number;
  /** Effectif manquant par rapport au minimum, 0 si satisfait. */
  missing: number;
  /** Un poste desactive ou a minimum zero n'est jamais « incomplet ». */
  incomplete: boolean;
}

export function computeSlotFill(
  slot: EventRoleSlot,
  assignments: readonly Assignment[],
): SlotFillState {
  const active = assignments.filter(
    (a) => a.slotId === slot.id && isActiveAssignment(a),
  );
  const counted = active.filter((a) => a.state !== "a_remplacer");
  const missing = slot.enabled
    ? Math.max(0, slot.minRequired - counted.length)
    : 0;
  return {
    slot,
    active,
    confirmed: active.filter((a) => a.state === "confirmee").length,
    toReplace: active.filter((a) => a.state === "a_remplacer").length,
    missing,
    incomplete: slot.enabled && missing > 0,
  };
}

/**
 * Plusieurs instruments simultanes sur un meme creneau declenchent une
 * alerte ; les incompatibilites sont parametrables par communaute.
 */
export const DEFAULT_INCOMPATIBLE_GROUPS: readonly (readonly string[])[] = [
  ["Piano", "Batterie", "Basse", "Guitare"],
  ["LEAD", "Piano", "Batterie", "Basse"],
];

export function findIncompatibleRoles(
  labels: readonly string[],
  groups: readonly (readonly string[])[] = DEFAULT_INCOMPATIBLE_GROUPS,
): string[][] {
  const hits: string[][] = [];
  const norm = labels.map((l) => l.trim().toLowerCase());
  for (const group of groups) {
    const present = group.filter((g) => norm.includes(g.trim().toLowerCase()));
    if (present.length > 1) hits.push(present);
  }
  return hits;
}
