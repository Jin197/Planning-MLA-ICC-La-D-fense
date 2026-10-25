import { describe, expect, it } from "vitest";
import {
  displayState,
  isSignificantScheduleChange,
  parseAvailabilityToken,
  resolveAvailabilityForDay,
} from "@/domain/availability";
import type { Availability } from "@/domain/types";

const sessions = [
  { id: "s1", ordinal: 1, label: "Culte 1" },
  { id: "s2", ordinal: 2, label: "Culte 2" },
  { id: "s3", ordinal: 3, label: "Culte 3" },
  { id: "s4", ordinal: 4, label: "Culte 4" },
];

describe("vocabulaire du classeur", () => {
  it("distingue les valeurs qui n'ont pas le meme sens", () => {
    expect(parseAvailabilityToken("Tous les cultes").kind).toBe("tous_les_cultes");
    expect(parseAvailabilityToken("Indisponible").kind).toBe("indisponible");
    expect(parseAvailabilityToken("Disponible").kind).toBe("disponible");
    expect(parseAvailabilityToken("").kind).toBe("absent");
    expect(parseAvailabilityToken(null).kind).toBe("absent");
    expect(parseAvailabilityToken("N/A").kind).toBe("non_applicable");
    expect(parseAvailabilityToken("Culte EJP").kind).toBe("creneau_nomme");
  });

  it("lit « Cultes 1 & 2 » et « Cultes 1 et 2 » de la meme facon", () => {
    const a = parseAvailabilityToken("Cultes 1 & 2");
    const b = parseAvailabilityToken("Cultes 1 et 2");
    expect(a).toEqual({ kind: "creneaux_cites", ordinals: [1, 2] });
    expect(b).toEqual({ kind: "creneaux_cites", ordinals: [1, 2] });
  });

  it("signale une valeur non reconnue au lieu de l'interpreter", () => {
    expect(parseAvailabilityToken("peut-etre").kind).toBe("inconnu");
  });
});

/** Critere 16 et section 10 : l'import ne devine rien. */
describe("projection sur les creneaux reels", () => {
  it("« Cultes 1 & 2 » est une disponibilite explicite sur deux creneaux", () => {
    const outcome = resolveAvailabilityForDay(
      parseAvailabilityToken("Cultes 1 & 2"),
      sessions,
    );
    expect(outcome.resolved).toEqual([
      { sessionId: "s1", answer: "disponible" },
      { sessionId: "s2", answer: "disponible" },
    ]);
    // Les creneaux non cites restent « a renseigner ».
    expect(outcome.unanswered).toEqual(["s3", "s4"]);
  });

  it("deduit l'indisponibilite seulement si un admin l'a valide", () => {
    const outcome = resolveAvailabilityForDay(
      parseAvailabilityToken("Cultes 1 & 2"),
      sessions,
      { inferMissingAsUnavailable: true },
    );
    expect(outcome.unanswered).toEqual([]);
    expect(outcome.resolved).toContainEqual({ sessionId: "s3", answer: "indisponible" });
  });

  it("une cellule vide ne cree aucune reponse", () => {
    const outcome = resolveAvailabilityForDay(parseAvailabilityToken(""), sessions);
    expect(outcome.resolved).toEqual([]);
    expect(outcome.unanswered).toHaveLength(4);
  });

  it("« N/A » ne cree aucune reponse non plus", () => {
    const outcome = resolveAvailabilityForDay(parseAvailabilityToken("N/A"), sessions);
    expect(outcome.resolved).toEqual([]);
    expect(outcome.notes.join(" ")).toContain("non applicable");
  });

  it("« Indisponible » couvre tous les creneaux de la journee", () => {
    const outcome = resolveAvailabilityForDay(
      parseAvailabilityToken("Indisponible"),
      sessions,
    );
    expect(outcome.resolved).toHaveLength(4);
    expect(outcome.resolved.every((r) => r.answer === "indisponible")).toBe(true);
  });

  it("« Culte EJP » ne touche que le creneau EJP", () => {
    const withEjp = [...sessions, { id: "s5", ordinal: 5, label: "Culte EJP" }];
    const outcome = resolveAvailabilityForDay(
      parseAvailabilityToken("Culte EJP"),
      withEjp,
    );
    expect(outcome.resolved).toEqual([{ sessionId: "s5", answer: "disponible" }]);
  });

  it("signale un creneau cite absent de la journee", () => {
    const outcome = resolveAvailabilityForDay(
      parseAvailabilityToken("Cultes 3 & 4"),
      sessions.slice(0, 2),
    );
    expect(outcome.resolved).toEqual([]);
    expect(outcome.notes.join(" ")).toContain("absents");
  });
});

describe("etat affiche", () => {
  const base: Availability = {
    id: "a1",
    communityId: "c1",
    eventId: "e1",
    sessionId: "s1",
    membershipId: "m1",
    answer: "disponible",
    needsReconfirmation: false,
    answeredAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };

  it("l'absence de reponse reste « a renseigner »", () => {
    expect(displayState(null)).toBe("a_renseigner");
    expect(displayState(undefined)).toBe("a_renseigner");
  });

  it("une reconfirmation attendue est un etat distinct", () => {
    expect(displayState({ ...base, needsReconfirmation: true })).toBe("a_reconfirmer");
  });

  it("une reponse est rendue telle quelle", () => {
    expect(displayState(base)).toBe("disponible");
    expect(displayState({ ...base, answer: "indisponible" })).toBe("indisponible");
  });
});

describe("modification d'horaire", () => {
  const before = {
    startsAt: "2026-10-18T07:00:00.000Z",
    endsAt: "2026-10-18T08:45:00.000Z",
  };

  it("un decalage de 30 minutes est important", () => {
    expect(
      isSignificantScheduleChange(before, {
        startsAt: "2026-10-18T07:30:00.000Z",
        endsAt: "2026-10-18T09:15:00.000Z",
      }),
    ).toBe(true);
  });

  it("un ajustement de 5 minutes ne l'est pas", () => {
    expect(
      isSignificantScheduleChange(before, {
        startsAt: "2026-10-18T07:05:00.000Z",
        endsAt: "2026-10-18T08:45:00.000Z",
      }),
    ).toBe(false);
  });
});
