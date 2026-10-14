import { deaccent } from "@/lib/ids";
import type {
  AvailabilityAnswer,
  AvailabilityDisplayState,
  EventSession,
  SessionAvailability,
} from "./types";

/**
 * Vocabulaire du classeur. Les valeurs n'ont pas toutes le meme sens :
 *
 * - « Tous les cultes »          -> disponible sur tous les creneaux du jour
 * - « Cultes 1 & 2 », « 3 & 4 »  -> disponible sur les creneaux cites
 * - « Culte EJP »                -> disponible sur le creneau EJP
 * - « Disponible »               -> disponible, journee a un seul creneau
 * - « Indisponible »             -> indisponible sur tous les creneaux du jour
 * - cellule vide                 -> information absente, aucune reponse
 * - « N/A »                      -> non applicable, aucune reponse
 */
export type AvailabilityToken =
  | { kind: "tous_les_cultes" }
  | { kind: "creneaux_cites"; ordinals: number[] }
  | { kind: "creneau_nomme"; labelContains: string }
  | { kind: "disponible" }
  | { kind: "indisponible" }
  | { kind: "non_applicable" }
  | { kind: "absent" }
  | { kind: "inconnu"; raw: string };

const norm = (raw: string) =>
  deaccent(raw).toLowerCase().replace(/\s+/g, " ").trim();

/** Lit « Cultes 1 & 2 », « Cultes 1 et 2 », « culte 3 et 4 »... */
function readCitedOrdinals(n: string): number[] | null {
  if (!/^cultes?\b/.test(n)) return null;
  const digits = n.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const ordinals = [...new Set(digits.map(Number))].filter(
    (d) => Number.isInteger(d) && d > 0 && d <= 12,
  );
  return ordinals.length > 0 ? ordinals.sort((a, b) => a - b) : null;
}

export function parseAvailabilityToken(raw: string | null | undefined): AvailabilityToken {
  if (raw === null || raw === undefined) return { kind: "absent" };
  const n = norm(raw);
  if (n === "") return { kind: "absent" };
  if (n === "n/a" || n === "na" || n === "non applicable") {
    return { kind: "non_applicable" };
  }
  if (n === "indisponible" || n === "indispo") return { kind: "indisponible" };
  if (n === "disponible" || n === "dispo") return { kind: "disponible" };
  if (n === "tous les cultes" || n === "tous cultes" || n === "tout les cultes") {
    return { kind: "tous_les_cultes" };
  }
  if (n.includes("ejp")) return { kind: "creneau_nomme", labelContains: "ejp" };
  const ordinals = readCitedOrdinals(n);
  if (ordinals) return { kind: "creneaux_cites", ordinals };
  return { kind: "inconnu", raw };
}

export interface ResolvedAvailability {
  sessionId: string;
  answer: AvailabilityAnswer;
}

export interface ResolveOptions {
  /**
   * Choix d'import valide par un admin : considerer les creneaux non cites
   * comme indisponibles. Par defaut faux, car le classeur ne le dit pas.
   */
  inferMissingAsUnavailable?: boolean;
}

export interface ResolveOutcome {
  resolved: ResolvedAvailability[];
  /** Creneaux volontairement laisses « a renseigner ». */
  unanswered: string[];
  notes: string[];
}

/**
 * Projette une valeur du classeur sur les creneaux reels d'une journee.
 * Ne devine rien : ce qui n'est pas dit reste sans reponse.
 */
export function resolveAvailabilityForDay(
  token: AvailabilityToken,
  sessions: readonly Pick<EventSession, "id" | "ordinal" | "label">[],
  options: ResolveOptions = {},
): ResolveOutcome {
  const all = sessions.map((s) => s.id);
  const none: ResolveOutcome = { resolved: [], unanswered: all, notes: [] };

  switch (token.kind) {
    case "absent":
      return { ...none, notes: ["Cellule vide : information absente."] };
    case "non_applicable":
      return { ...none, notes: ["« N/A » : non applicable, aucune reponse."] };
    case "inconnu":
      return {
        ...none,
        notes: [`Valeur non reconnue : « ${token.raw} ». A trancher.`],
      };
    case "indisponible":
      return {
        resolved: sessions.map((s) => ({
          sessionId: s.id,
          answer: "indisponible" as const,
        })),
        unanswered: [],
        notes: [],
      };
    case "tous_les_cultes":
      return {
        resolved: sessions.map((s) => ({
          sessionId: s.id,
          answer: "disponible" as const,
        })),
        unanswered: [],
        notes: [],
      };
    case "disponible": {
      if (sessions.length === 1) {
        const only = sessions[0]!;
        return {
          resolved: [{ sessionId: only.id, answer: "disponible" }],
          unanswered: [],
          notes: [],
        };
      }
      return {
        resolved: sessions.map((s) => ({
          sessionId: s.id,
          answer: "disponible" as const,
        })),
        unanswered: [],
        notes: [
          "« Disponible » applique a tous les creneaux de la journee : a verifier si la journee en comporte plusieurs.",
        ],
      };
    }
    case "creneau_nomme": {
      const matching = sessions.filter((s) =>
        norm(s.label).includes(token.labelContains),
      );
      if (matching.length === 0) {
        return {
          ...none,
          notes: [
            `Aucun creneau ne correspond a « ${token.labelContains} » ce jour-la.`,
          ],
        };
      }
      return buildPartial(matching.map((s) => s.id), sessions, options);
    }
    case "creneaux_cites": {
      const matching = sessions.filter((s) => token.ordinals.includes(s.ordinal));
      const missing = token.ordinals.filter(
        (o) => !sessions.some((s) => s.ordinal === o),
      );
      const outcome = buildPartial(matching.map((s) => s.id), sessions, options);
      if (missing.length > 0) {
        outcome.notes.push(
          `Creneaux cites absents de la journee : ${missing.join(", ")}.`,
        );
      }
      return outcome;
    }
  }
}

function buildPartial(
  availableIds: readonly string[],
  sessions: readonly Pick<EventSession, "id" | "ordinal" | "label">[],
  options: ResolveOptions,
): ResolveOutcome {
  const others = sessions.filter((s) => !availableIds.includes(s.id));
  const resolved: ResolvedAvailability[] = availableIds.map((id) => ({
    sessionId: id,
    answer: "disponible",
  }));
  if (options.inferMissingAsUnavailable) {
    for (const s of others) {
      resolved.push({ sessionId: s.id, answer: "indisponible" });
    }
    return {
      resolved,
      unanswered: [],
      notes:
        others.length > 0
          ? [
              "Creneaux non cites marques indisponibles (deduction validee par l'admin).",
            ]
          : [],
    };
  }
  return {
    resolved,
    unanswered: others.map((s) => s.id),
    notes:
      others.length > 0
        ? [
            "Creneaux non cites laisses « a renseigner » : le classeur ne precise pas.",
          ]
        : [],
  };
}

/**
 * Etat affiche pour un membre et un creneau. L'absence de reponse reste
 * « a renseigner » : elle n'est jamais convertie.
 */
export function displayState(
  availability:
    | Pick<SessionAvailability, "answer" | "needsReconfirmation">
    | null
    | undefined,
): AvailabilityDisplayState {
  if (!availability) return "a_renseigner";
  if (availability.needsReconfirmation) return "a_reconfirmer";
  return availability.answer;
}

export const AVAILABILITY_LABELS: Record<AvailabilityDisplayState, string> = {
  disponible: "Disponible",
  indisponible: "Indisponible",
  a_renseigner: "A renseigner",
  a_reconfirmer: "A reconfirmer",
};

/**
 * Une modification importante des horaires cree un etat de reconfirmation
 * distinct, sans effacer la reponse initiale.
 */
export function isSignificantScheduleChange(
  before: { startsAt: string; endsAt: string },
  after: { startsAt: string; endsAt: string },
  thresholdMinutes = 15,
): boolean {
  const delta = (a: string, b: string) =>
    Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
  return (
    delta(before.startsAt, after.startsAt) >= thresholdMinutes ||
    delta(before.endsAt, after.endsAt) >= thresholdMinutes
  );
}
