import type { EventState, EventSession, Id } from "./types";
import { computeSlotFill, type SlotFillState } from "./assignments";
import type { Assignment, EventRoleSlot } from "./types";

/**
 * Cycle de vie d'un evenement.
 *
 * Brouillon -> Collecte des disponibilites -> Publie, avec Annule et Archive
 * accessibles depuis les etats actifs.
 */
const TRANSITIONS: Record<EventState, readonly EventState[]> = {
  brouillon: ["collecte", "publie", "annule"],
  collecte: ["brouillon", "publie", "annule"],
  publie: ["collecte", "annule", "archive"],
  annule: ["archive", "brouillon"],
  archive: [],
};

export function canTransitionEvent(from: EventState, to: EventState): boolean {
  return TRANSITIONS[from].includes(to);
}

export const EVENT_STATE_LABELS: Record<EventState, string> = {
  brouillon: "Brouillon",
  collecte: "Collecte des disponibilites",
  publie: "Publie",
  annule: "Annule",
  archive: "Archive",
};

export const EVENT_STATE_HELP: Record<EventState, string> = {
  brouillon: "Visible et modifiable par les admins uniquement.",
  collecte:
    "Les membres actifs consultent les informations et repondent. Les affectations en preparation restent reservees aux admins.",
  publie: "Le planning complet est visible par tous les membres actifs.",
  annule:
    "Les personnes concernees ont ete prevenues. Aucune nouvelle affectation ; discussion en lecture seule.",
  archive: "Consultation de l'historique, aucune modification ordinaire.",
};

/* -------------------------------------------------------------------------- */
/* Controles avant publication                                                */
/* -------------------------------------------------------------------------- */

export interface PublicationBlocker {
  severity: "bloquant" | "alerte";
  code:
    | "aucun_creneau"
    | "horaire_provisoire"
    | "aucun_plan"
    | "poste_a_completer"
    | "reponses_manquantes"
    | "affectations_non_confirmees"
    | "affectations_a_remplacer"
    | "conflits";
  message: string;
  count?: number;
}

export interface PublicationReadinessInput {
  sessions: readonly EventSession[];
  plans: readonly { id: Id; sessionId: Id; teamId: Id }[];
  slots: readonly EventRoleSlot[];
  assignments: readonly Assignment[];
  /** Nombre de reponses de disponibilite attendues et manquantes. */
  missingResponses: number;
  conflictCount: number;
}

export interface PublicationReadiness {
  ready: boolean;
  /** Publiable uniquement avec une confirmation d'exception de l'admin. */
  publishableWithExceptions: boolean;
  blockers: PublicationBlocker[];
  slotStates: SlotFillState[];
}

/**
 * Un poste volontairement non utilise (desactive, ou minimum zero) ne rend
 * pas le planning incomplet. Une publication peut donc etre complete avec des
 * postes facultatifs vides.
 */
export function computePublicationReadiness(
  input: PublicationReadinessInput,
): PublicationReadiness {
  const blockers: PublicationBlocker[] = [];

  if (input.sessions.length === 0) {
    blockers.push({
      severity: "bloquant",
      code: "aucun_creneau",
      message: "L'evenement n'a aucun creneau date.",
    });
  }

  const provisional = input.sessions.filter((s) => s.scheduleProvisional);
  if (provisional.length > 0) {
    blockers.push({
      severity: "bloquant",
      code: "horaire_provisoire",
      count: provisional.length,
      message: `Horaire a definir sur ${provisional.length} creneau(x) : ${provisional
        .map((s) => s.label)
        .join(", ")}.`,
    });
  }

  if (input.plans.length === 0) {
    blockers.push({
      severity: "bloquant",
      code: "aucun_plan",
      message: "Aucun plan d'equipe n'a ete prepare pour ces creneaux.",
    });
  }

  const slotStates = input.slots.map((slot) =>
    computeSlotFill(slot, input.assignments),
  );
  const incomplete = slotStates.filter((s) => s.incomplete);
  if (incomplete.length > 0) {
    blockers.push({
      severity: "alerte",
      code: "poste_a_completer",
      count: incomplete.length,
      message: `${incomplete.length} poste(s) a completer : ${incomplete
        .map((s) => `${s.slot.label} (${s.missing} manquant)`)
        .join(", ")}.`,
    });
  }

  if (input.missingResponses > 0) {
    blockers.push({
      severity: "alerte",
      code: "reponses_manquantes",
      count: input.missingResponses,
      message: `${input.missingResponses} reponse(s) de disponibilite encore a renseigner.`,
    });
  }

  const unconfirmed = input.assignments.filter((a) => a.state === "a_confirmer");
  if (unconfirmed.length > 0) {
    blockers.push({
      severity: "alerte",
      code: "affectations_non_confirmees",
      count: unconfirmed.length,
      message: `${unconfirmed.length} affectation(s) pas encore confirmee(s).`,
    });
  }

  const toReplace = input.assignments.filter((a) => a.state === "a_remplacer");
  if (toReplace.length > 0) {
    blockers.push({
      severity: "alerte",
      code: "affectations_a_remplacer",
      count: toReplace.length,
      message: `${toReplace.length} affectation(s) a remplacer.`,
    });
  }

  if (input.conflictCount > 0) {
    blockers.push({
      severity: "alerte",
      code: "conflits",
      count: input.conflictCount,
      message: `${input.conflictCount} chevauchement(s) detecte(s).`,
    });
  }

  const hard = blockers.filter((b) => b.severity === "bloquant");
  return {
    ready: blockers.length === 0,
    publishableWithExceptions: hard.length === 0,
    blockers,
    slotStates,
  };
}

/* -------------------------------------------------------------------------- */
/* Duplication                                                                */
/* -------------------------------------------------------------------------- */

export interface DuplicateOptions {
  /** Reprendre la liste de chants. */
  includeSetlist: boolean;
  /** Reprendre le dress-code. */
  includeDressCode: boolean;
  /** Reprendre les repetitions (dates a ajuster). */
  includeRehearsals: boolean;
  /**
   * Recopier les affectations. Action explicite : elles reviennent toutes a
   * l'etat « A confirmer ».
   */
  includeAssignments: boolean;
}

export const DEFAULT_DUPLICATE_OPTIONS: DuplicateOptions = {
  includeSetlist: true,
  includeDressCode: true,
  includeRehearsals: false,
  includeAssignments: false,
};

/**
 * Une copie ne reprend jamais les disponibilites ni les confirmations des
 * membres : ces reponses appartiennent a l'evenement d'origine.
 */
export const NEVER_DUPLICATED = [
  "session_availabilities",
  "availability_reasons",
  "rehearsal_availabilities",
  "event_messages",
  "message_read_cursors",
  "notifications",
] as const;
