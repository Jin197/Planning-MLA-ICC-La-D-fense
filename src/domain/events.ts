import type { IsoInstant } from "@/lib/time";
import type { Event, EventState, EventSession, Id } from "./types";
import { computeSlotFill, type SlotFillState } from "./assignments";
import type { Assignment, EventRoleSlot } from "./types";

/* -------------------------------------------------------------------------- */
/* Occurrences                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Occurrence d'un evenement : un de ses sous-evenements, ou l'evenement
 * lui-meme quand il n'en a aucun.
 *
 * Les sous-evenements etant facultatifs, c'est cette unite — et pas le
 * sous-evenement — que lisent le planning, les rappels, les exports et les
 * reponses de disponibilite. Le reste du code n'a donc pas a repeter le cas
 * « aucun sous-evenement ».
 */
export interface EventOccurrence {
  /** null quand l'occurrence est l'evenement lui-meme. */
  sessionId: Id | null;
  label: string;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  locationName: string;
  locationAddress: string;
  scheduleProvisional: boolean;
}

export type EventSchedule = Pick<
  Event,
  | "title"
  | "startsAt"
  | "endsAt"
  | "locationName"
  | "locationAddress"
  | "scheduleProvisional"
>;

export function occurrencesOf(
  event: EventSchedule,
  sessions: readonly EventSession[],
): EventOccurrence[] {
  if (sessions.length === 0) {
    return [
      {
        sessionId: null,
        label: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        locationName: event.locationName,
        locationAddress: event.locationAddress,
        scheduleProvisional: event.scheduleProvisional,
      },
    ];
  }
  return [...sessions]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((session) => ({
      sessionId: session.id,
      label: session.label,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      locationName: session.locationName,
      locationAddress: session.locationAddress,
      scheduleProvisional: session.scheduleProvisional,
    }));
}

/**
 * Fenetre d'ensemble d'un evenement : son propre horaire, elargi a celui de
 * ses sous-evenements. Un sous-evenement place en dehors de la fenetre
 * annoncee l'etend, il ne la contredit pas.
 */
export function eventWindow(
  event: Pick<Event, "startsAt" | "endsAt">,
  sessions: readonly { startsAt: IsoInstant; endsAt: IsoInstant }[],
): { startsAt: IsoInstant; endsAt: IsoInstant } {
  let { startsAt, endsAt } = event;
  for (const session of sessions) {
    if (session.startsAt < startsAt) startsAt = session.startsAt;
    if (session.endsAt > endsAt) endsAt = session.endsAt;
  }
  return { startsAt, endsAt };
}

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
    | "horaire_provisoire"
    | "aucune_equipe"
    | "equipe_sans_rattachement"
    | "poste_a_completer"
    | "reponses_manquantes"
    | "affectations_non_confirmees"
    | "affectations_a_remplacer"
    | "conflits";
  message: string;
  count?: number;
}

export interface PublicationReadinessInput {
  event: EventSchedule;
  /** Sous-evenements, eventuellement aucun. */
  sessions: readonly EventSession[];
  teams: readonly { id: Id; name: string }[];
  plans: readonly { id: Id; sessionId: Id | null; teamId: Id }[];
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

  // Un evenement sans sous-evenement est complet : il repond pour lui-meme.
  const provisional = occurrencesOf(input.event, input.sessions).filter(
    (o) => o.scheduleProvisional,
  );
  if (provisional.length > 0) {
    blockers.push({
      severity: "bloquant",
      code: "horaire_provisoire",
      count: provisional.length,
      message:
        provisional.length === 1 && provisional[0]!.sessionId === null
          ? "L'horaire de l'evenement reste a definir."
          : `Horaire a definir sur ${provisional.length} sous-evenement(s) : ${provisional
              .map((o) => o.label)
              .join(", ")}.`,
    });
  }

  if (input.teams.length === 0) {
    blockers.push({
      severity: "bloquant",
      code: "aucune_equipe",
      message: "Aucune equipe n'a ete creee dans cet evenement.",
    });
  } else {
    const orphans = input.teams.filter(
      (team) => !input.plans.some((plan) => plan.teamId === team.id),
    );
    if (orphans.length > 0) {
      blockers.push({
        severity: "bloquant",
        code: "equipe_sans_rattachement",
        count: orphans.length,
        message: `${orphans.length} equipe(s) sans rattachement : ${orphans
          .map((t) => t.name)
          .join(", ")}. Rattachez-les a l'evenement ou a un sous-evenement.`,
      });
    }
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
  "availabilities",
  "availability_reasons",
  "rehearsal_availabilities",
  "event_messages",
  "message_read_cursors",
  "notifications",
] as const;
