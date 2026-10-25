import { beforeEach, describe, expect, it } from "vitest";
import {
  createCommunity,
  createEventWithPlan,
  createVerifiedUser,
  joinAsMember,
  resetStore,
  rpc,
  signIn,
  tx,
  type EventFixture,
} from "./helpers";
import { assignMember, listCandidates, setAssignmentState } from "@/server/services/assignments";
import { answerAvailability, availabilityGrid } from "@/server/services/availability";
import { getEventDetail, publishEvent, changeEventState, updateEvent } from "@/server/services/events";
import { postMessage, readThread } from "@/server/services/messages";
import type { Id, Profile } from "@/domain/types";

interface World {
  admin: Profile;
  member: Profile;
  other: Profile;
  communityId: Id;
  adminMembershipId: Id;
  memberMembershipId: Id;
  otherMembershipId: Id;
  event: EventFixture;
}

async function setup(options: { state?: "brouillon" | "collecte" | "publie" } = {}): Promise<World> {
  const admin = await createVerifiedUser("admin@test.local", "Nadia", "Admin");
  const member = await createVerifiedUser("membre@test.local", "Elias", "Membre");
  const other = await createVerifiedUser("autre@test.local", "Soline", "Autre");
  const { communityId, membershipId } = await createCommunity(admin.id, "MLA");
  const memberMembershipId = await joinAsMember(communityId, admin.id, member.id);
  const otherMembershipId = await joinAsMember(communityId, admin.id, other.id);
  const event = await createEventWithPlan(communityId, admin.id, {
    state: options.state ?? "collecte",
  });
  return {
    admin,
    member,
    other,
    communityId,
    adminMembershipId: membershipId,
    memberMembershipId,
    otherMembershipId,
    event,
  };
}

const slot = (world: World, planIndex: number, label: string): Id =>
  world.event.slotIdsByLabel.get(`${world.event.planIds[planIndex]}:${label}`)!;

describe("disponibilites par creneau", () => {
  beforeEach(resetStore);

  /** Critere 7 : une reponse differente aux cultes 1 et 2 fonctionne. */
  it("enregistre une reponse distincte par creneau", async () => {
    const world = await setup();
    await signIn(world.member.id);

    const first = await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "disponible",
    });
    const second = await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[1]!],
      answer: "indisponible",
      reason: "Rendez-vous familial",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const rows = await tx((t) =>
      t.select("availabilities", {
        where: { membershipId: world.memberMembershipId },
      }),
    );
    expect(rows).toHaveLength(2);
    const bySession = new Map(rows.map((r) => [r.sessionId, r.answer]));
    expect(bySession.get(world.event.sessionIds[0]!)).toBe("disponible");
    expect(bySession.get(world.event.sessionIds[1]!)).toBe("indisponible");
  });

  it("une selection multiple ecrit une reponse par creneau choisi", async () => {
    const world = await setup();
    await signIn(world.member.id);
    const result = await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: world.event.sessionIds,
      answer: "disponible",
    });
    expect(result.ok && result.value.saved).toBe(2);
  });

  it("met a jour une reponse existante sans la dupliquer", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "disponible",
    });
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "indisponible",
    });
    const rows = await tx((t) =>
      t.select("availabilities", {
        where: {
          membershipId: world.memberMembershipId,
          sessionId: world.event.sessionIds[0]!,
        },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.answer).toBe("indisponible");
  });

  /** Critere 9 : le motif reste prive, meme via une requete de service. */
  it("ne laisse pas un autre membre lire le motif", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "indisponible",
      reason: "Motif strictement personnel",
    });

    await signIn(world.other.id);
    const asMember = await availabilityGrid(world.communityId, world.event.eventId);
    expect(asMember.ok).toBe(true);
    if (asMember.ok) {
      const serialised = JSON.stringify(asMember.value);
      expect(serialised).not.toContain("Motif strictement personnel");
    }

    await signIn(world.admin.id);
    const asAdmin = await availabilityGrid(world.communityId, world.event.eventId);
    expect(asAdmin.ok).toBe(true);
    if (asAdmin.ok) {
      expect(JSON.stringify(asAdmin.value)).toContain("Motif strictement personnel");
    }
  });

  it("l'auteur relit son propre motif", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "indisponible",
      reason: "Mon motif a moi",
    });
    const grid = await availabilityGrid(world.communityId, world.event.eventId);
    expect(grid.ok).toBe(true);
    if (grid.ok) {
      expect(JSON.stringify(grid.value)).toContain("Mon motif a moi");
    }
  });

  it("refuse de repondre sur un brouillon", async () => {
    const world = await setup({ state: "brouillon" });
    await signIn(world.member.id);
    const result = await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "disponible",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("collecte_fermee");
  });
});

describe("affectations", () => {
  beforeEach(resetStore);

  /** Critere 6. */
  it("accepte plusieurs personnes sur un poste et refuse le doublon exact", async () => {
    const world = await setup();
    const leadSlot = slot(world, 0, "LEAD");
    await signIn(world.admin.id);

    const first = await assignMember(world.communityId, {
      slotId: leadSlot,
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "Accord verbal",
    });
    const second = await assignMember(world.communityId, {
      slotId: leadSlot,
      membershipId: world.otherMembershipId,
      acceptExceptions: true,
      exceptionReason: "Accord verbal",
    });
    const duplicate = await assignMember(world.communityId, {
      slotId: leadSlot,
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "Accord verbal",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("doublon_exact");
  });

  it("accepte la meme personne sur plusieurs postes compatibles", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const a = await assignMember(world.communityId, {
      slotId: slot(world, 0, "LEAD"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "ok",
    });
    const b = await assignMember(world.communityId, {
      slotId: slot(world, 0, "Charge des paroles"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "ok",
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("exige une confirmation d'exception sans reponse de disponibilite", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const result = await assignMember(world.communityId, {
      slotId: slot(world, 0, "Piano"),
      membershipId: world.memberMembershipId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("exception_a_confirmer");
  });

  it("exige un motif administratif pour une personne indisponible", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "indisponible",
    });

    await signIn(world.admin.id);
    const sansMotif = await assignMember(world.communityId, {
      slotId: slot(world, 0, "Piano"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
    });
    expect(sansMotif.ok).toBe(false);
    if (!sansMotif.ok) expect(sansMotif.code).toBe("motif_administratif_requis");

    const avecMotif = await assignMember(world.communityId, {
      slotId: slot(world, 0, "Piano"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "Accord obtenu par telephone.",
    });
    expect(avecMotif.ok).toBe(true);
  });

  it("conserve intacte la disponibilite declaree apres une affectation par exception", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "indisponible",
      reason: "Indisponible ce matin",
    });
    await signIn(world.admin.id);
    await assignMember(world.communityId, {
      slotId: slot(world, 0, "Piano"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "Exception justifiee",
    });
    const rows = await tx((t) =>
      t.select("availabilities", {
        where: {
          membershipId: world.memberMembershipId,
          sessionId: world.event.sessionIds[0]!,
        },
      }),
    );
    expect(rows[0]!.answer).toBe("indisponible");
  });

  /** Critere 3 : un membre ne peut pas ecrire une affectation. */
  it("refuse une affectation ecrite par un membre", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await expect(
      assignMember(world.communityId, {
        slotId: slot(world, 0, "LEAD"),
        membershipId: world.memberMembershipId,
        acceptExceptions: true,
        exceptionReason: "tentative",
      }),
    ).rejects.toThrow(/admins/i);
  });

  it("refuse une affectation vers un non-membre", async () => {
    const world = await setup();
    const etranger = await createVerifiedUser("etranger@test.local");
    const autreComm = await createCommunity(etranger.id, "ACCUEIL", "Ailleurs");
    await signIn(world.admin.id);
    const result = await assignMember(world.communityId, {
      slotId: slot(world, 0, "LEAD"),
      membershipId: autreComm.membershipId,
      acceptExceptions: true,
      exceptionReason: "test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("adhesion_inactive");
  });

  /** Critere 8 : l'indisponibilite declenche « A remplacer », sans suppression. */
  it("passe l'affectation a « a remplacer » et notifie les admins", async () => {
    const world = await setup();
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "disponible",
    });

    await signIn(world.admin.id);
    const assigned = await assignMember(world.communityId, {
      slotId: slot(world, 0, "Piano"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "hors competence acceptee",
    });
    expect(assigned.ok).toBe(true);

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "indisponible",
      reason: "Empechement de derniere minute",
    });

    const state = await tx(async (t) => ({
      assignments: await t.select("assignments", {
        where: { membershipId: world.memberMembershipId },
      }),
      notifications: await t.select("notifications", {
        where: { userId: world.admin.id, kind: "affectation_a_remplacer" },
      }),
    }));

    expect(state.assignments).toHaveLength(1);
    expect(state.assignments[0]!.state).toBe("a_remplacer");
    expect(state.notifications.length).toBeGreaterThan(0);
    // Aucun motif prive dans la notification.
    expect(JSON.stringify(state.notifications)).not.toContain(
      "Empechement de derniere minute",
    );
  });

  it("laisse le membre confirmer, mais pas retirer", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const assigned = await assignMember(world.communityId, {
      slotId: slot(world, 0, "LEAD"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "ok",
    });
    if (!assigned.ok) throw new Error("affectation attendue");

    await signIn(world.member.id);
    const confirmed = await setAssignmentState(
      world.communityId,
      assigned.value.assignmentId,
      "confirmee",
    );
    expect(confirmed.ok).toBe(true);

    const removed = await setAssignmentState(
      world.communityId,
      assigned.value.assignmentId,
      "retiree",
    );
    expect(removed.ok).toBe(false);
  });

  it("empeche un membre de repondre pour l'affectation d'un autre", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const assigned = await assignMember(world.communityId, {
      slotId: slot(world, 0, "LEAD"),
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "ok",
    });
    if (!assigned.ok) throw new Error("affectation attendue");

    await signIn(world.other.id);
    const result = await setAssignmentState(
      world.communityId,
      assigned.value.assignmentId,
      "confirmee",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("non_autorise");
  });

  it("montre par defaut les personnes disponibles et compatibles", async () => {
    const world = await setup();
    const skill = await tx(async (t) => {
      const skills = await t.select("skills", { where: { communityId: world.communityId } });
      const piano = skills.find((s) => s.label === "Piano")!;
      await t.insert("membership_skills", {
        id: `${world.memberMembershipId}-piano`,
        communityId: world.communityId,
        membershipId: world.memberMembershipId,
        skillId: piano.id,
      });
      return piano;
    });
    expect(skill.label).toBe("Piano");

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId: world.event.eventId,
      sessionIds: [world.event.sessionIds[0]!],
      answer: "disponible",
    });

    await signIn(world.admin.id);
    const defaults = await listCandidates(world.communityId, slot(world, 0, "Piano"));
    expect(defaults.ok).toBe(true);
    if (defaults.ok) {
      expect(defaults.value.candidates.map((c) => c.membershipId)).toEqual([
        world.memberMembershipId,
      ]);
    }

    const all = await listCandidates(world.communityId, slot(world, 0, "Piano"), {
      includeAll: true,
    });
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.value.candidates.length).toBeGreaterThan(1);
      const sansReponse = all.value.candidates.find(
        (c) => c.membershipId === world.otherMembershipId,
      );
      expect(sansReponse?.availability).toBe("a_renseigner");
    }
  });
});

describe("cycle de vie et publication", () => {
  beforeEach(resetStore);

  /** Critere 10. */
  it("la collecte permet de repondre sans exposer les affectations", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    await assignMember(world.communityId, {
      slotId: slot(world, 0, "LEAD"),
      membershipId: world.otherMembershipId,
      acceptExceptions: true,
      exceptionReason: "ok",
    });

    await signIn(world.member.id);
    const asMember = await getEventDetail(world.communityId, world.event.eventId);
    expect(asMember.ok).toBe(true);
    if (asMember.ok) {
      expect(asMember.value.canSeePlan).toBe(false);
      expect(asMember.value.occurrences[0]!.plans).toEqual([]);
      expect(asMember.value.readiness).toBeNull();
    }

    await signIn(world.admin.id);
    const asAdmin = await getEventDetail(world.communityId, world.event.eventId);
    expect(asAdmin.ok).toBe(true);
    if (asAdmin.ok) {
      expect(asAdmin.value.canSeePlan).toBe(true);
      expect(asAdmin.value.occurrences[0]!.plans.length).toBeGreaterThan(0);
    }
  });

  it("un brouillon est invisible pour un membre", async () => {
    const world = await setup({ state: "brouillon" });
    await signIn(world.member.id);
    const result = await getEventDetail(world.communityId, world.event.eventId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("evenement_non_visible");
  });

  it("la publication revele le plan aux membres", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    await assignMember(world.communityId, {
      slotId: slot(world, 0, "LEAD"),
      membershipId: world.otherMembershipId,
      acceptExceptions: true,
      exceptionReason: "ok",
    });
    const published = await publishEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      acceptExceptions: true,
    });
    expect(published.ok).toBe(true);

    await signIn(world.member.id);
    const detail = await getEventDetail(world.communityId, world.event.eventId);
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.value.canSeePlan).toBe(true);
      expect(detail.value.event.state).toBe("publie");
    }
  });

  it("exige une confirmation explicite quand la publication comporte des alertes", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const refused = await publishEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      acceptExceptions: false,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("publication_needs_confirmation");
  });

  it("refuse de publier un evenement dont l'horaire est provisoire", async () => {
    const admin = await createVerifiedUser("prov@test.local");
    const { communityId } = await createCommunity(admin.id, "MLA");
    const event = await createEventWithPlan(communityId, admin.id, {
      sessions: [
        {
          label: "Culte EJP",
          startsAt: "2026-10-25T14:00:00.000Z",
          endsAt: "2026-10-25T16:00:00.000Z",
          provisional: true,
        },
      ],
    });
    await signIn(admin.id);
    const result = await publishEvent(communityId, event.eventId, {
      expectedVersion: 1,
      acceptExceptions: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/horaire a definir/i);
  });

  it("une archive reste en lecture seule", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    await publishEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      acceptExceptions: true,
    });
    const archived = await changeEventState(
      world.communityId,
      world.event.eventId,
      "archive",
      { expectedVersion: 2 },
    );
    expect(archived.ok).toBe(true);

    await expect(
      updateEvent(world.communityId, world.event.eventId, {
        expectedVersion: 3,
        title: "Nouveau titre",
      }),
    ).rejects.toThrow(/archive|annule/i);
  });

  /** Critere 12 : une modification concurrente ne perd pas le travail. */
  it("refuse la seconde ecriture sur la meme version", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const first = await updateEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      title: "Titre A",
    });
    expect(first.ok).toBe(true);

    const second = await updateEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      title: "Titre B",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("conflit_de_version");

    const event = await tx((t) =>
      t.selectOne("events", { where: { id: world.event.eventId } }),
    );
    expect(event?.title).toBe("Titre A");
  });

  it("une publication ne rejoue pas la meme notification logique", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    await publishEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      acceptExceptions: true,
    });
    const outboxBefore = await tx((t) =>
      t.select("notification_outbox", {
        where: { eventId: world.event.eventId, kind: "planning_publie" },
      }),
    );

    // Une seconde publication sur la meme version est refusee : pas de doublon.
    const again = await publishEvent(world.communityId, world.event.eventId, {
      expectedVersion: 1,
      acceptExceptions: true,
    });
    expect(again.ok).toBe(false);

    const outboxAfter = await tx((t) =>
      t.select("notification_outbox", {
        where: { eventId: world.event.eventId, kind: "planning_publie" },
      }),
    );
    expect(outboxAfter).toHaveLength(outboxBefore.length);
    const keys = new Set(outboxAfter.map((o) => o.idempotencyKey));
    expect(keys.size).toBe(outboxAfter.length);
  });
});

describe("discussion", () => {
  beforeEach(resetStore);

  /** Critere 13. */
  it("persiste un message, le garde prive a la communaute et met a jour les non-lus", async () => {
    const world = await setup();
    await signIn(world.member.id);
    const posted = await postMessage(world.communityId, world.event.eventId, {
      body: "Je serai la des 8h30.",
    });
    expect(posted.ok).toBe(true);

    await signIn(world.other.id);
    const thread = await readThread(world.communityId, world.event.eventId);
    expect(thread.ok).toBe(true);
    if (thread.ok) {
      expect(thread.value.messages.map((m) => m.body)).toContain("Je serai la des 8h30.");
      expect(thread.value.unread).toBe(1);
    }

    // Un compte d'une autre communaute n'y accede pas.
    const etranger = await createVerifiedUser("etranger2@test.local");
    await createCommunity(etranger.id, "ACCUEIL", "Autre ministere");
    await signIn(etranger.id);
    await expect(
      readThread(world.communityId, world.event.eventId),
    ).rejects.toThrow(/adhesion active/i);
  });

  it("un membre retire ne recoit plus de nouveau contenu", async () => {
    const world = await setup();
    await rpc("revoke_membership", {
      actorUserId: world.admin.id,
      membershipId: world.otherMembershipId,
    });

    await signIn(world.member.id);
    await postMessage(world.communityId, world.event.eventId, {
      body: "Message apres le retrait.",
    });

    const notifications = await tx((t) =>
      t.select("notifications", {
        where: { userId: world.other.id, kind: "message_nouveau" },
      }),
    );
    expect(notifications).toHaveLength(0);

    await signIn(world.other.id);
    await expect(
      readThread(world.communityId, world.event.eventId),
    ).rejects.toThrow(/adhesion active/i);
  });

  it("la discussion d'un evenement annule passe en lecture seule", async () => {
    const world = await setup();
    await signIn(world.admin.id);
    const cancelled = await changeEventState(
      world.communityId,
      world.event.eventId,
      "annule",
      { expectedVersion: 1, reason: "Salle indisponible" },
    );
    expect(cancelled.ok).toBe(true);

    await signIn(world.member.id);
    const result = await postMessage(world.communityId, world.event.eventId, {
      body: "Toujours la ?",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("discussion_fermee");

    const thread = await readThread(world.communityId, world.event.eventId);
    expect(thread.ok).toBe(true);
    if (thread.ok) expect(thread.value.canWrite).toBe(false);
  });

  it("ne mentionne que des membres actifs", async () => {
    const world = await setup();
    const etranger = await createVerifiedUser("etranger3@test.local");
    await signIn(world.member.id);
    const posted = await postMessage(world.communityId, world.event.eventId, {
      body: "Bonjour",
      mentions: [etranger.id, world.admin.id],
    });
    expect(posted.ok).toBe(true);
    const messages = await tx((t) =>
      t.select("event_messages", { where: { eventId: world.event.eventId } }),
    );
    expect(messages[0]!.mentions).toEqual([world.admin.id]);
  });
});
