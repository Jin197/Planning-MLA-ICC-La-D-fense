import { describe, expect, it } from "vitest";
import {
  assertNoPrivateReason,
  computeReminderSchedule,
  DEFAULT_PREFERENCES,
  discussionRecipients,
  emailDeliveryMode,
  notificationIdempotencyKey,
  organisationRecipients,
  type RecipientCandidate,
} from "@/domain/notifications";
import { computePublicationReadiness } from "@/domain/events";
import type { NotificationPreference } from "@/domain/types";

const prefs = (over: Partial<NotificationPreference> = {}): NotificationPreference => ({
  userId: "u1",
  ...DEFAULT_PREFERENCES,
  ...over,
});

const candidate = (
  userId: string,
  over: Partial<RecipientCandidate> = {},
): RecipientCandidate => ({
  userId,
  activeMember: true,
  assigned: false,
  preferences: prefs({ userId }),
  ...over,
});

/** Critere 14 : une reprise n'envoie pas deux fois le meme email logique. */
describe("cle d'idempotence", () => {
  it("est stable pour la meme notification logique", () => {
    const a = notificationIdempotencyKey({
      kind: "planning_publie",
      recipientUserId: "u1",
      subjectId: "e1",
      revision: 2,
    });
    const b = notificationIdempotencyKey({
      kind: "planning_publie",
      recipientUserId: "u1",
      subjectId: "e1",
      revision: 2,
    });
    expect(a).toBe(b);
  });

  it("change quand le destinataire change", () => {
    const a = notificationIdempotencyKey({
      kind: "planning_publie",
      recipientUserId: "u1",
      subjectId: "e1",
    });
    const b = notificationIdempotencyKey({
      kind: "planning_publie",
      recipientUserId: "u2",
      subjectId: "e1",
    });
    expect(a).not.toBe(b);
  });

  it("change quand une nouvelle version est publiee", () => {
    const v1 = notificationIdempotencyKey({
      kind: "planning_publie",
      recipientUserId: "u1",
      subjectId: "e1",
      revision: 1,
    });
    const v2 = notificationIdempotencyKey({
      kind: "planning_publie",
      recipientUserId: "u1",
      subjectId: "e1",
      revision: 2,
    });
    expect(v1).not.toBe(v2);
  });
});

describe("destinataires d'un message", () => {
  it("exclut l'auteur", () => {
    const list = discussionRecipients([candidate("u1"), candidate("u2")], {
      eventId: "e1",
      authorUserId: "u1",
    });
    expect(list).toEqual(["u2"]);
  });

  it("exclut une sourdine d'evenement", () => {
    const muted = candidate("u2", {
      preferences: prefs({ userId: "u2", mutedEventIds: ["e1"] }),
    });
    const list = discussionRecipients([candidate("u1"), muted], {
      eventId: "e1",
      authorUserId: "u1",
    });
    expect(list).toEqual([]);
  });

  it("respecte la preference « seulement mes evenements »", () => {
    const narrow = candidate("u2", {
      preferences: prefs({ userId: "u2", subscriptionScope: "mes_evenements" }),
    });
    const narrowAssigned = candidate("u3", {
      assigned: true,
      preferences: prefs({ userId: "u3", subscriptionScope: "mes_evenements" }),
    });
    const list = discussionRecipients([candidate("u1"), narrow, narrowAssigned], {
      eventId: "e1",
      authorUserId: "u1",
    });
    expect(list).toEqual(["u3"]);
  });

  it("exclut un membre retire", () => {
    const removed = candidate("u2", { activeMember: false });
    const list = discussionRecipients([candidate("u1"), removed], {
      eventId: "e1",
      authorUserId: "u1",
    });
    expect(list).toEqual([]);
  });
});

describe("notifications d'organisation", () => {
  it("ne sont pas filtrees par la portee d'abonnement", () => {
    const narrow = candidate("u2", {
      preferences: prefs({ userId: "u2", subscriptionScope: "mes_evenements" }),
    });
    const list = organisationRecipients([narrow], "affectation_nouvelle");
    expect(list).toEqual(["u2"]);
  });

  it("peuvent cibler une personne precise", () => {
    const list = organisationRecipients(
      [candidate("u1"), candidate("u2")],
      "affectation_nouvelle",
      { targetUserIds: ["u2"] },
    );
    expect(list).toEqual(["u2"]);
  });
});

describe("mode d'envoi des emails", () => {
  it("regroupe les discussions quand c'est demande", () => {
    expect(emailDeliveryMode("message_nouveau", prefs({ digestDiscussion: true }))).toBe(
      "regroupe",
    );
  });

  it("n'applique jamais le regroupement a une affectation", () => {
    expect(
      emailDeliveryMode("affectation_nouvelle", prefs({ digestDiscussion: true })),
    ).toBe("immediat");
  });

  it("respecte la coupure complete", () => {
    expect(emailDeliveryMode("rappel", prefs({ emailImmediate: false }))).toBe("aucun");
  });
});

describe("rappels", () => {
  const start = "2026-10-18T07:00:00.000Z";

  it("programme 48 h et 24 h avant par defaut", () => {
    const schedule = computeReminderSchedule(start, [48, 24], "2026-10-10T00:00:00.000Z");
    expect(schedule).toEqual([
      "2026-10-16T07:00:00.000Z",
      "2026-10-17T07:00:00.000Z",
    ]);
  });

  it("n'envoie pas un rappel dont l'echeance est passee", () => {
    const schedule = computeReminderSchedule(start, [48, 24], "2026-10-17T12:00:00.000Z");
    expect(schedule).toEqual([]);
  });

  it("garde le rappel encore a venir", () => {
    const schedule = computeReminderSchedule(start, [48, 24], "2026-10-16T12:00:00.000Z");
    expect(schedule).toEqual(["2026-10-17T07:00:00.000Z"]);
  });
});

describe("confidentialite des emails", () => {
  it("refuse un corps qui contient un motif prive", () => {
    expect(() =>
      assertNoPrivateReason(
        "Maelys est indisponible : engagement familial a midi.",
        ["Engagement familial a midi."],
      ),
    ).not.toThrow();
    expect(() =>
      assertNoPrivateReason(
        "Motif : engagement familial a midi",
        ["engagement familial a midi"],
      ),
    ).toThrow();
  });
});

/** Section 5 : les controles avant publication. */
describe("etat de preparation avant publication", () => {
  const base = {
    sessions: [
      {
        id: "s1",
        communityId: "A",
        eventId: "e1",
        label: "Culte 1",
        ordinal: 1,
        startsAt: "2026-10-18T07:00:00.000Z",
        endsAt: "2026-10-18T08:45:00.000Z",
        locationName: "",
        locationAddress: "",
        scheduleProvisional: false,
      },
    ],
    plans: [{ id: "p1", sessionId: "s1", teamId: "t1" }],
    slots: [],
    assignments: [],
    missingResponses: 0,
    conflictCount: 0,
  };

  it("est prete quand tout est complet", () => {
    const readiness = computePublicationReadiness(base);
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it("bloque sans creneau", () => {
    const readiness = computePublicationReadiness({ ...base, sessions: [] });
    expect(readiness.publishableWithExceptions).toBe(false);
    expect(readiness.blockers.some((b) => b.code === "aucun_creneau")).toBe(true);
  });

  it("bloque sur un horaire encore provisoire", () => {
    const readiness = computePublicationReadiness({
      ...base,
      sessions: [{ ...base.sessions[0]!, scheduleProvisional: true }],
    });
    expect(readiness.publishableWithExceptions).toBe(false);
    expect(readiness.blockers.some((b) => b.code === "horaire_provisoire")).toBe(true);
  });

  it("signale les alertes sans empecher une publication confirmee", () => {
    const readiness = computePublicationReadiness({
      ...base,
      missingResponses: 4,
      conflictCount: 1,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.publishableWithExceptions).toBe(true);
    expect(readiness.blockers.map((b) => b.code)).toContain("reponses_manquantes");
    expect(readiness.blockers.map((b) => b.code)).toContain("conflits");
  });

  it("reste complete avec des postes facultatifs vides", () => {
    const readiness = computePublicationReadiness({
      ...base,
      slots: [
        {
          id: "slot1",
          communityId: "A",
          planId: "p1",
          templateFieldId: "f1",
          label: "Guitare",
          order: 1,
          minRequired: 0,
          multiple: true,
          allowsDetail: false,
          enabled: true,
        },
        {
          id: "slot2",
          communityId: "A",
          planId: "p1",
          templateFieldId: "f2",
          label: "Mass Choir",
          order: 2,
          minRequired: 2,
          multiple: true,
          allowsDetail: false,
          enabled: false,
        },
      ],
    });
    expect(readiness.ready).toBe(true);
  });
});
