import { describe, expect, it } from "vitest";
import {
  canActorTransition,
  canTransition,
  computeSlotFill,
  exceptionRequirement,
  findIncompatibleRoles,
  isExactDuplicate,
} from "@/domain/assignments";
import { describeConflict, detectConflicts, type Commitment } from "@/domain/conflicts";
import type { Assignment, EventRoleSlot } from "@/domain/types";

const slot = (over: Partial<EventRoleSlot> = {}): EventRoleSlot => ({
  id: "slot1",
  communityId: "A",
  planId: "p1",
  templateFieldId: "f1",
  label: "Piano",
  order: 1,
  minRequired: 1,
  multiple: true,
  allowsDetail: false,
  enabled: true,
  ...over,
});

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a1",
  communityId: "A",
  planId: "p1",
  slotId: "slot1",
  membershipId: "m1",
  state: "a_confirmer",
  detail: null,
  exceptions: [],
  memberNote: null,
  createdBy: "u1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

/** Critere 6 : plusieurs postes, plusieurs membres, pas de doublon exact. */
describe("doublons et effectifs", () => {
  it("refuse exactement la meme personne sur le meme poste", () => {
    expect(
      isExactDuplicate([assignment()], { slotId: "slot1", membershipId: "m1" }),
    ).toBe(true);
  });

  it("accepte une autre personne sur le meme poste", () => {
    expect(
      isExactDuplicate([assignment()], { slotId: "slot1", membershipId: "m2" }),
    ).toBe(false);
  });

  it("accepte la meme personne sur un autre poste", () => {
    expect(
      isExactDuplicate([assignment()], { slotId: "slot2", membershipId: "m1" }),
    ).toBe(false);
  });

  it("ne compte pas une affectation retiree comme un doublon", () => {
    expect(
      isExactDuplicate([assignment({ state: "retiree" })], {
        slotId: "slot1",
        membershipId: "m1",
      }),
    ).toBe(false);
  });

  it("compte l'effectif et signale le manque", () => {
    const fill = computeSlotFill(slot({ minRequired: 2 }), [assignment()]);
    expect(fill.missing).toBe(1);
    expect(fill.incomplete).toBe(true);
  });

  it("un poste a remplacer ne compte pas dans l'effectif", () => {
    const fill = computeSlotFill(slot({ minRequired: 1 }), [
      assignment({ state: "a_remplacer" }),
    ]);
    expect(fill.toReplace).toBe(1);
    expect(fill.incomplete).toBe(true);
  });
});

/** Un poste volontairement non utilise ne rend pas le planning incomplet. */
describe("postes facultatifs et desactives", () => {
  it("un minimum de zero n'est jamais incomplet", () => {
    expect(computeSlotFill(slot({ minRequired: 0 }), []).incomplete).toBe(false);
  });

  it("un poste desactive n'est jamais incomplet", () => {
    expect(
      computeSlotFill(slot({ minRequired: 3, enabled: false }), []).incomplete,
    ).toBe(false);
  });
});

describe("cycle de vie d'une affectation", () => {
  it("suit les transitions prevues", () => {
    expect(canTransition("a_confirmer", "confirmee")).toBe(true);
    expect(canTransition("confirmee", "a_remplacer")).toBe(true);
    expect(canTransition("retiree", "confirmee")).toBe(false);
  });

  it("le membre confirme ou signale, il ne retire pas", () => {
    expect(canActorTransition("membre", "a_confirmer", "confirmee")).toBe(true);
    expect(canActorTransition("membre", "confirmee", "a_remplacer")).toBe(true);
    expect(canActorTransition("membre", "confirmee", "retiree")).toBe(false);
    expect(canActorTransition("admin", "confirmee", "retiree")).toBe(true);
  });
});

describe("exceptions a l'affectation", () => {
  it("aucune exception pour une personne disponible et competente", () => {
    const req = exceptionRequirement({
      availability: "disponible",
      matchesSkills: true,
      hasConflict: false,
    });
    expect(req.required).toBe(false);
  });

  it("exige une exception pour une personne sans reponse", () => {
    const req = exceptionRequirement({
      availability: "a_renseigner",
      matchesSkills: true,
      hasConflict: false,
    });
    expect(req.kinds).toContain("sans_reponse");
  });

  it("exige une exception pour une personne indisponible", () => {
    const req = exceptionRequirement({
      availability: "indisponible",
      matchesSkills: true,
      hasConflict: false,
    });
    expect(req.kinds).toContain("indisponible");
  });

  it("avertit hors competence sans bloquer", () => {
    const req = exceptionRequirement({
      availability: "disponible",
      matchesSkills: false,
      hasConflict: false,
    });
    expect(req.kinds).toEqual(["hors_competence"]);
    expect(req.messages.join(" ")).toContain("qualification");
  });
});

describe("incompatibilites d'instruments", () => {
  it("alerte sur piano et batterie au meme creneau", () => {
    expect(findIncompatibleRoles(["Piano", "Batterie"]).length).toBeGreaterThan(0);
  });

  it("n'alerte pas sur alto et charge des paroles", () => {
    expect(findIncompatibleRoles(["Alto", "Charge des paroles"])).toEqual([]);
  });
});

/** Critere 7 : un chevauchement reel est detecte, deux cultes successifs non. */
describe("detection de conflits", () => {
  const commitment = (over: Partial<Commitment>): Commitment => ({
    kind: "creneau",
    communityId: "A",
    eventId: "e1",
    refId: "s1",
    label: "Culte 1",
    eventTitle: "Dimanche",
    startsAt: "2026-10-18T07:00:00.000Z",
    endsAt: "2026-10-18T08:45:00.000Z",
    ...over,
  });

  it("deux creneaux successifs sont permis", () => {
    const report = detectConflicts(
      { startsAt: "2026-10-18T09:00:00.000Z", endsAt: "2026-10-18T10:45:00.000Z" },
      [commitment({})],
      "A",
    );
    expect(report.hasConflict).toBe(false);
  });

  it("un recouvrement dans la meme communaute est detaille", () => {
    const report = detectConflicts(
      { startsAt: "2026-10-18T08:00:00.000Z", endsAt: "2026-10-18T09:30:00.000Z" },
      [commitment({})],
      "A",
    );
    expect(report.hasConflict).toBe(true);
    expect(report.conflicts[0]?.visibility).toBe("detaille");
    expect(describeConflict(report.conflicts[0]!)).toContain("Culte 1");
  });

  it("un recouvrement dans un autre ministere ne revele rien", () => {
    const report = detectConflicts(
      { startsAt: "2026-10-18T08:00:00.000Z", endsAt: "2026-10-18T09:30:00.000Z" },
      [commitment({ communityId: "B", eventTitle: "Son du dimanche" })],
      "A",
    );
    expect(report.hasConflict).toBe(true);
    expect(report.conflicts[0]).toEqual({
      visibility: "masque",
      message: "Conflit sur ce creneau",
    });
    expect(JSON.stringify(report)).not.toContain("Son du dimanche");
  });

  it("le creneau cible ne se compare pas a lui-meme", () => {
    const report = detectConflicts(
      {
        startsAt: "2026-10-18T07:00:00.000Z",
        endsAt: "2026-10-18T08:45:00.000Z",
        refId: "s1",
      },
      [commitment({ refId: "s1" })],
      "A",
    );
    expect(report.hasConflict).toBe(false);
  });

  it("une repetition ou la presence est attendue cree un conflit", () => {
    const report = detectConflicts(
      { startsAt: "2026-10-23T20:00:00.000Z", endsAt: "2026-10-23T22:30:00.000Z" },
      [
        commitment({
          kind: "repetition",
          refId: "r1",
          label: "Repetition de nuit",
          startsAt: "2026-10-23T20:00:00.000Z",
          endsAt: "2026-10-23T22:30:00.000Z",
        }),
      ],
      "A",
    );
    expect(report.hasConflict).toBe(true);
    expect(describeConflict(report.conflicts[0]!)).toContain("Repetition");
  });
});
