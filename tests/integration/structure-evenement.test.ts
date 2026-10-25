import { beforeEach, describe, expect, it } from "vitest";
import {
  createCommunity,
  createVerifiedUser,
  joinAsMember,
  resetStore,
  signIn,
  tx,
} from "./helpers";
import {
  addSession,
  createEvent,
  getEventDetail,
  publishEvent,
  updateEvent,
} from "@/server/services/events";
import {
  addTeam,
  attachTeam,
  detachTeam,
  removeTeam,
  setTeamMembers,
} from "@/server/services/event-teams";
import { answerAvailability } from "@/server/services/availability";
import { assignMember, selfAssign } from "@/server/services/assignments";
import type { Id, Profile } from "@/domain/types";

/**
 * Structure d'un evenement : l'admin le nomme, lui donne son horaire, ajoute
 * ou non des sous-evenements, et cree autant d'equipes qu'il veut dedans.
 */

interface World {
  admin: Profile;
  member: Profile;
  communityId: Id;
  memberMembershipId: Id;
  adminMembershipId: Id;
}

async function setup(): Promise<World> {
  const admin = await createVerifiedUser("admin@test.local", "Nadia", "Admin");
  const member = await createVerifiedUser("membre@test.local", "Elias", "Membre");
  const { communityId, membershipId } = await createCommunity(admin.id, "MLA");
  const memberMembershipId = await joinAsMember(communityId, admin.id, member.id);
  await signIn(admin.id);
  return {
    admin,
    member,
    communityId,
    memberMembershipId,
    adminMembershipId: membershipId,
  };
}

const HORAIRE = {
  start: { date: "2026-11-21", time: "18:00" },
  end: { date: "2026-11-21", time: "21:30" },
};

describe("un evenement sans sous-evenement", () => {
  beforeEach(resetStore);

  it("se cree, et son equipe couvre toute sa duree", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "Un seul bloc.",
      ...HORAIRE,
      locationName: "Salle des fetes",
      locationAddress: "",
      sessions: [],
      teams: [
        {
          name: "Groupe louange du soir",
          membershipIds: [world.memberMembershipId],
          sessionOrdinals: [],
          templateFieldIds: [],
        },
      ],
      rehearsals: [],
      openCollection: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const detail = await getEventDetail(world.communityId, created.value.eventId);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    expect(detail.value.sessions).toHaveLength(0);
    // Une seule occurrence : l'evenement lui-meme.
    expect(detail.value.occurrences).toHaveLength(1);
    expect(detail.value.occurrences[0]!.sessionId).toBeNull();
    expect(detail.value.occurrences[0]!.label).toBe("Soiree anniversaire");
    expect(detail.value.occurrences[0]!.plans).toHaveLength(1);
    expect(detail.value.teams).toHaveLength(1);
    expect(detail.value.teams[0]!.members).toHaveLength(1);
    expect(detail.value.teams[0]!.attachments[0]!.sessionId).toBeNull();
    // Rien n'est range « a part » : l'occurrence unique porte le plan.
    expect(detail.value.eventWidePlans).toHaveLength(0);
  });

  it("recoit la reponse de disponibilite sur l'evenement lui-meme", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: true,
    });
    if (!created.ok) return;

    await signIn(world.member.id);
    // Liste vide : la reponse porte sur l'evenement.
    const reponse = await answerAvailability(world.communityId, {
      eventId: created.value.eventId,
      sessionIds: [],
      answer: "disponible",
    });
    expect(reponse.ok && reponse.value.saved).toBe(1);

    const rows = await tx((t) =>
      t.select("availabilities", { where: { eventId: created.value.eventId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessionId).toBeNull();
    expect(rows[0]!.answer).toBe("disponible");
  });

  it("est publiable : l'absence de sous-evenement ne bloque pas", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;

    const detail = await getEventDetail(world.communityId, created.value.eventId);
    if (!detail.ok) return;
    expect(detail.value.readiness?.publishableWithExceptions).toBe(true);

    const publie = await publishEvent(world.communityId, created.value.eventId, {
      expectedVersion: detail.value.event.version,
      acceptExceptions: true,
    });
    expect(publie.ok).toBe(true);
  });
});

describe("equipes creees dans un evenement", () => {
  beforeEach(resetStore);

  async function evenementAvecDeuxCultes(world: World) {
    const created = await createEvent(world.communityId, {
      title: "Cultes du dimanche",
      description: "",
      start: { date: "2026-10-18", time: "09:00" },
      end: { date: "2026-10-18", time: "12:45" },
      locationName: "ICC La Defense",
      locationAddress: "",
      sessions: [
        {
          label: "Culte 1",
          start: { date: "2026-10-18", time: "09:00" },
          end: { date: "2026-10-18", time: "10:45" },
          locationName: "",
          locationAddress: "",
        },
        {
          label: "Culte 2",
          start: { date: "2026-10-18", time: "11:00" },
          end: { date: "2026-10-18", time: "12:45" },
          locationName: "",
          locationAddress: "",
        },
      ],
      teams: [
        { name: "Equipe 1", membershipIds: [], sessionOrdinals: [1], templateFieldIds: [] },
        { name: "Equipe 2", membershipIds: [], sessionOrdinals: [2], templateFieldIds: [] },
      ],
      rehearsals: [],
      openCollection: true,
    });
    if (!created.ok) throw new Error(created.message);
    return created.value.eventId;
  }

  it("rattache chaque equipe au sous-evenement choisi", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const [culte1, culte2] = detail.value.occurrences;
    expect(culte1!.plans.map((p) => p.teamName)).toEqual(["Equipe 1"]);
    expect(culte2!.plans.map((p) => p.teamName)).toEqual(["Equipe 2"]);
  });

  it("porte les equipes couvrant toute la duree a part", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    let detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const ajout = await addTeam(world.communityId, eventId, {
      name: "Technique",
      sessionIds: [],
      expectedVersion: detail.value.event.version,
    });
    expect(ajout.ok).toBe(true);

    detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    expect(detail.value.eventWidePlans.map((p) => p.teamName)).toEqual([
      "Technique",
    ]);
    // Elle n'apparait pas en double sous chaque sous-evenement.
    for (const occurrence of detail.value.occurrences) {
      expect(occurrence.plans.map((p) => p.teamName)).not.toContain("Technique");
    }
  });

  it("refuse deux equipes du meme nom dans le meme evenement", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const doublon = await addTeam(world.communityId, eventId, {
      name: "Equipe 1",
      expectedVersion: detail.value.event.version,
    });
    expect(doublon.ok).toBe(false);
  });

  it("laisse le meme nom d'equipe exister dans deux evenements", async () => {
    const world = await setup();
    const premier = await evenementAvecDeuxCultes(world);
    expect(premier).toBeTruthy();

    // Le second evenement recree « Equipe 1 » pour son compte.
    const second = await createEvent(world.communityId, {
      title: "Cultes du dimanche suivant",
      description: "",
      start: { date: "2026-10-25", time: "09:00" },
      end: { date: "2026-10-25", time: "10:45" },
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: false,
    });
    expect(second.ok).toBe(true);
  });

  it("rattache et detache une equipe sans toucher aux autres", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    let detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const equipe1 = detail.value.teams.find((t) => t.name === "Equipe 1")!;
    const culte2 = detail.value.sessions[1]!;

    const rattache = await attachTeam(world.communityId, equipe1.id, {
      sessionId: culte2.id,
      expectedVersion: detail.value.event.version,
    });
    expect(rattache.ok).toBe(true);
    if (!rattache.ok) return;

    detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    expect(
      detail.value.teams.find((t) => t.name === "Equipe 1")!.attachments,
    ).toHaveLength(2);

    const retrait = await detachTeam(world.communityId, rattache.value.planId, {
      expectedVersion: detail.value.event.version,
    });
    expect(retrait.ok).toBe(true);

    detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    expect(
      detail.value.teams.find((t) => t.name === "Equipe 1")!.attachments,
    ).toHaveLength(1);
    expect(
      detail.value.teams.find((t) => t.name === "Equipe 2")!.attachments,
    ).toHaveLength(1);
  });

  it("bloque la publication tant qu'une equipe n'est rattachee nulle part", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    let detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const equipe2 = detail.value.teams.find((t) => t.name === "Equipe 2")!;
    await detachTeam(world.communityId, equipe2.attachments[0]!.planId, {
      expectedVersion: detail.value.event.version,
    });

    detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    const bloquants = (detail.value.readiness?.blockers ?? []).filter(
      (b) => b.severity === "bloquant",
    );
    expect(bloquants.map((b) => b.code)).toContain("equipe_sans_rattachement");
  });

  it("supprime une equipe avec ses affectations, sans toucher au reste", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    let detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const plan = detail.value.occurrences[0]!.plans[0]!;
    const poste = plan.slots.find((s) => s.label === "LEAD")!;
    const affecte = await assignMember(world.communityId, {
      slotId: poste.id,
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "Test",
    });
    expect(affecte.ok).toBe(true);

    detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    const equipe1 = detail.value.teams.find((t) => t.name === "Equipe 1")!;
    const suppression = await removeTeam(world.communityId, equipe1.id, {
      expectedVersion: detail.value.event.version,
    });
    expect(suppression.ok && suppression.value.assignmentsRemoved).toBe(1);

    detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    expect(detail.value.teams.map((t) => t.name)).toEqual(["Equipe 2"]);
    expect(detail.value.occurrences[1]!.plans).toHaveLength(1);
  });

  it("met l'effectif de l'equipe en tete des candidats", async () => {
    const world = await setup();
    const eventId = await evenementAvecDeuxCultes(world);
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;

    const equipe1 = detail.value.teams.find((t) => t.name === "Equipe 1")!;
    const effectif = await setTeamMembers(world.communityId, equipe1.id, {
      membershipIds: [world.memberMembershipId],
      expectedVersion: detail.value.event.version,
    });
    expect(effectif.ok && effectif.value.members).toBe(1);

    const apres = await getEventDetail(world.communityId, eventId);
    if (!apres.ok) return;
    expect(
      apres.value.teams.find((t) => t.name === "Equipe 1")!.members,
    ).toHaveLength(1);
  });
});

describe("ajout d'un premier sous-evenement", () => {
  beforeEach(resetStore);

  it("rattache les reponses deja donnees au nouveau sous-evenement", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: true,
    });
    if (!created.ok) return;
    const eventId = created.value.eventId;

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [],
      answer: "disponible",
    });

    await signIn(world.admin.id);
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    const ajout = await addSession(world.communityId, eventId, {
      label: "Premiere partie",
      start: { date: "2026-11-21", time: "18:00" },
      end: { date: "2026-11-21", time: "19:30" },
      locationName: "",
      locationAddress: "",
      expectedVersion: detail.value.event.version,
    });
    expect(ajout.ok).toBe(true);
    if (!ajout.ok) return;

    // La reponse n'est pas perdue : elle suit la question.
    const rows = await tx((t) => t.select("availabilities", { where: { eventId } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessionId).toBe(ajout.value.sessionId);
  });

  it("elargit la fenetre de l'evenement a un sous-evenement qui depasse", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Convention",
      description: "",
      start: { date: "2026-11-21", time: "18:00" },
      end: { date: "2026-11-21", time: "21:30" },
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;
    const eventId = created.value.eventId;

    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    await addSession(world.communityId, eventId, {
      label: "Veillee",
      start: { date: "2026-11-21", time: "22:00" },
      end: { date: "2026-11-22", time: "01:00" },
      locationName: "",
      locationAddress: "",
      expectedVersion: detail.value.event.version,
    });

    const apres = await getEventDetail(world.communityId, eventId);
    if (!apres.ok) return;
    // La fin annoncee a 21h30 couvre maintenant la veillee.
    expect(apres.value.event.endsAt > detail.value.event.endsAt).toBe(true);
  });
});

describe("notification a la creation", () => {
  beforeEach(resetStore);

  it("previent les membres actifs, avec une tache d'envoi par destinataire", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: true,
    });
    if (!created.ok) return;

    const notifications = await tx((t) =>
      t.select("notifications", { where: { eventId: created.value.eventId } }),
    );
    expect(notifications.map((n) => n.kind)).toEqual([
      "collecte_ouverte",
      "collecte_ouverte",
    ]);

    const outbox = await tx((t) =>
      t.select("notification_outbox", { where: { eventId: created.value.eventId } }),
    );
    expect(outbox).toHaveLength(2);
    // Rien n'est envoye ici : la tache est enregistree, pas livree.
    expect(new Set(outbox.map((o) => o.state))).toEqual(new Set(["enregistre"]));
  });

  it("n'envoie rien quand l'evenement reste en brouillon", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "En preparation",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [{ name: "Equipe 1", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;

    const outbox = await tx((t) =>
      t.select("notification_outbox", { where: { eventId: created.value.eventId } }),
    );
    expect(outbox).toHaveLength(0);
  });
});

describe("indisponibilite partielle et equipe couvrant tout l'evenement", () => {
  beforeEach(resetStore);

  it("ne marque pas « a remplacer » une affectation encore tenable", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "Cultes du dimanche",
      description: "",
      start: { date: "2026-10-18", time: "09:00" },
      end: { date: "2026-10-18", time: "12:45" },
      locationName: "",
      locationAddress: "",
      sessions: [
        {
          label: "Culte 1",
          start: { date: "2026-10-18", time: "09:00" },
          end: { date: "2026-10-18", time: "10:45" },
          locationName: "",
          locationAddress: "",
        },
        {
          label: "Culte 2",
          start: { date: "2026-10-18", time: "11:00" },
          end: { date: "2026-10-18", time: "12:45" },
          locationName: "",
          locationAddress: "",
        },
      ],
      // L'equipe technique sert sur toute la duree.
      teams: [{ name: "Technique", membershipIds: [], sessionOrdinals: [], templateFieldIds: [] }],
      rehearsals: [],
      openCollection: true,
    });
    if (!created.ok) return;
    const eventId = created.value.eventId;

    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    const plan = detail.value.eventWidePlans[0]!;
    const poste = plan.slots.find((s) => s.label === "LEAD")!;
    await assignMember(world.communityId, {
      slotId: poste.id,
      membershipId: world.memberMembershipId,
      acceptExceptions: true,
      exceptionReason: "Test",
    });

    // Indisponible sur un seul culte : l'engagement sur la duree tient.
    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [detail.value.sessions[0]!.id],
      answer: "indisponible",
    });

    let affectations = await tx((t) =>
      t.select("assignments", { where: { membershipId: world.memberMembershipId } }),
    );
    expect(affectations[0]!.state).toBe("a_confirmer");

    // Indisponible partout : il faut alors le remplacer.
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [detail.value.sessions[1]!.id],
      answer: "indisponible",
    });

    affectations = await tx((t) =>
      t.select("assignments", { where: { membershipId: world.memberMembershipId } }),
    );
    expect(affectations[0]!.state).toBe("a_remplacer");
  });
});

describe("postes retenus par equipe", () => {
  beforeEach(resetStore);

  /** Identifiants des postes du modele, par libelle. */
  async function postesDuModele(communityId: Id): Promise<Map<string, Id>> {
    return tx(async (t) => {
      const template = await t.selectOne("planning_templates", {
        where: { communityId },
      });
      const fields = await t.select("template_fields", {
        where: { templateId: template!.id },
      });
      return new Map(
        fields.filter((f) => f.assignable).map((f) => [f.label, f.id]),
      );
    });
  }

  it("ne copie que les postes coches", async () => {
    const world = await setup();
    const postes = await postesDuModele(world.communityId);
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [
        {
          name: "Groupe louange",
          membershipIds: [],
          sessionOrdinals: [],
          templateFieldIds: [postes.get("LEAD")!, postes.get("Piano")!],
        },
      ],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;

    const detail = await getEventDetail(world.communityId, created.value.eventId);
    if (!detail.ok) return;
    expect(detail.value.occurrences[0]!.plans[0]!.slots.map((s) => s.label)).toEqual([
      "LEAD",
      "Piano",
    ]);
  });

  it("reprend tout le modele quand rien n'est coche", async () => {
    const world = await setup();
    const postes = await postesDuModele(world.communityId);
    const created = await createEvent(world.communityId, {
      title: "Soiree anniversaire",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [
        {
          name: "Groupe louange",
          membershipIds: [],
          sessionOrdinals: [],
          templateFieldIds: [],
        },
      ],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;

    const detail = await getEventDetail(world.communityId, created.value.eventId);
    if (!detail.ok) return;
    expect(detail.value.occurrences[0]!.plans[0]!.slots).toHaveLength(postes.size);
  });

  it("donne la meme feuille a chaque rattachement de l'equipe", async () => {
    const world = await setup();
    const postes = await postesDuModele(world.communityId);
    const created = await createEvent(world.communityId, {
      title: "Cultes du dimanche",
      description: "",
      start: { date: "2026-10-18", time: "09:00" },
      end: { date: "2026-10-18", time: "12:45" },
      locationName: "",
      locationAddress: "",
      sessions: [
        {
          label: "Culte 1",
          start: { date: "2026-10-18", time: "09:00" },
          end: { date: "2026-10-18", time: "10:45" },
          locationName: "",
          locationAddress: "",
        },
        {
          label: "Culte 2",
          start: { date: "2026-10-18", time: "11:00" },
          end: { date: "2026-10-18", time: "12:45" },
          locationName: "",
          locationAddress: "",
        },
      ],
      teams: [
        {
          name: "Equipe 1",
          membershipIds: [],
          sessionOrdinals: [1, 2],
          templateFieldIds: [postes.get("LEAD")!, postes.get("Batterie")!],
        },
      ],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;

    const detail = await getEventDetail(world.communityId, created.value.eventId);
    if (!detail.ok) return;
    for (const occurrence of detail.value.occurrences) {
      expect(occurrence.plans[0]!.slots.map((s) => s.label)).toEqual([
        "LEAD",
        "Batterie",
      ]);
    }
  });

  it("reprend la feuille de l'equipe sur un rattachement ajoute apres coup", async () => {
    const world = await setup();
    const postes = await postesDuModele(world.communityId);
    const created = await createEvent(world.communityId, {
      title: "Cultes du dimanche",
      description: "",
      start: { date: "2026-10-18", time: "09:00" },
      end: { date: "2026-10-18", time: "12:45" },
      locationName: "",
      locationAddress: "",
      sessions: [
        {
          label: "Culte 1",
          start: { date: "2026-10-18", time: "09:00" },
          end: { date: "2026-10-18", time: "10:45" },
          locationName: "",
          locationAddress: "",
        },
        {
          label: "Culte 2",
          start: { date: "2026-10-18", time: "11:00" },
          end: { date: "2026-10-18", time: "12:45" },
          locationName: "",
          locationAddress: "",
        },
      ],
      teams: [
        {
          name: "Equipe 1",
          membershipIds: [],
          sessionOrdinals: [1],
          templateFieldIds: [postes.get("LEAD")!],
        },
      ],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;
    const eventId = created.value.eventId;

    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    const equipe = detail.value.teams[0]!;
    await attachTeam(world.communityId, equipe.id, {
      sessionId: detail.value.sessions[1]!.id,
      expectedVersion: detail.value.event.version,
    });

    const apres = await getEventDetail(world.communityId, eventId);
    if (!apres.ok) return;
    // Le second rattachement ne repart pas de tout le modele.
    expect(apres.value.occurrences[1]!.plans[0]!.slots.map((s) => s.label)).toEqual([
      "LEAD",
    ]);
  });
});

describe("un membre se positionne lui-meme", () => {
  beforeEach(resetStore);

  async function evenementOuvert(world: World) {
    const created = await createEvent(world.communityId, {
      title: "Cultes du dimanche",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [
        {
          name: "Equipe 1",
          membershipIds: [],
          sessionOrdinals: [],
          templateFieldIds: [],
        },
      ],
      rehearsals: [],
      openCollection: true,
    });
    if (!created.ok) throw new Error(created.message);
    return created.value.eventId;
  }

  async function posteOuvert(world: World, eventId: Id, label: string): Promise<Id> {
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) throw new Error(detail.message);
    const poste = detail.value.occurrences[0]!.postesOuverts.find(
      (p) => p.label === label,
    );
    if (!poste) throw new Error(`Poste « ${label} » non ouvert.`);
    return poste.slotId;
  }

  it("refuse tant que la disponibilite n'est pas declaree", async () => {
    const world = await setup();
    const eventId = await evenementOuvert(world);
    const slotId = await posteOuvert(world, eventId, "LEAD");

    await signIn(world.member.id);
    const essai = await selfAssign(world.communityId, { slotId });
    expect(essai.ok).toBe(false);
    if (!essai.ok) expect(essai.code).toBe("disponibilite_requise");
  });

  it("accepte un membre disponible, et previent les admins", async () => {
    const world = await setup();
    const eventId = await evenementOuvert(world);
    const slotId = await posteOuvert(world, eventId, "LEAD");

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [],
      answer: "disponible",
    });
    const pris = await selfAssign(world.communityId, { slotId });
    expect(pris.ok).toBe(true);

    const affectations = await tx((t) =>
      t.select("assignments", { where: { membershipId: world.memberMembershipId } }),
    );
    expect(affectations).toHaveLength(1);
    // La personne s'engage en se positionnant : rien a reconfirmer.
    expect(affectations[0]!.state).toBe("confirmee");

    const notifications = await tx((t) =>
      t.select("notifications", { where: { eventId, kind: "positionnement" } }),
    );
    expect(notifications).toHaveLength(1);
  });

  it("refuse un poste deja pourvu", async () => {
    const world = await setup();
    const eventId = await evenementOuvert(world);
    const slotId = await posteOuvert(world, eventId, "LEAD");

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [],
      answer: "disponible",
    });
    await selfAssign(world.communityId, { slotId });

    // L'admin est disponible aussi, mais ce poste n'attend qu'une personne.
    await signIn(world.admin.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [],
      answer: "disponible",
    });
    const second = await selfAssign(world.communityId, { slotId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("poste_pourvu");
  });

  it("ne propose plus un poste pourvu, ni celui que je tiens", async () => {
    const world = await setup();
    const eventId = await evenementOuvert(world);
    const slotId = await posteOuvert(world, eventId, "LEAD");

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [],
      answer: "disponible",
    });
    await selfAssign(world.communityId, { slotId });

    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    const occurrence = detail.value.occurrences[0]!;
    expect(occurrence.postesOuverts.map((p) => p.label)).not.toContain("LEAD");
    expect(occurrence.mesPostes.map((p) => p.label)).toEqual(["LEAD"]);
  });

  it("montre les postes ouverts sans reveler qui est deja place", async () => {
    const world = await setup();
    const eventId = await evenementOuvert(world);
    const slotId = await posteOuvert(world, eventId, "LEAD");

    // L'admin place quelqu'un pendant la collecte.
    await assignMember(world.communityId, {
      slotId,
      membershipId: world.adminMembershipId,
      acceptExceptions: true,
      exceptionReason: "Test",
    });

    await signIn(world.member.id);
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    // La composition reste reservee aux admins...
    expect(detail.value.canSeePlan).toBe(false);
    expect(detail.value.occurrences[0]!.plans).toEqual([]);
    // ... mais ce qui manque se voit, sans aucun nom.
    const ouverts = detail.value.occurrences[0]!.postesOuverts;
    expect(ouverts.length).toBeGreaterThan(0);
    expect(ouverts.map((p) => p.label)).not.toContain("LEAD");
    expect(JSON.stringify(ouverts)).not.toContain("Nadia");
  });

  it("refuse apres un changement d'horaire non reconfirme", async () => {
    const world = await setup();
    const eventId = await evenementOuvert(world);
    const slotId = await posteOuvert(world, eventId, "LEAD");

    await signIn(world.member.id);
    await answerAvailability(world.communityId, {
      eventId,
      sessionIds: [],
      answer: "disponible",
    });

    await signIn(world.admin.id);
    const detail = await getEventDetail(world.communityId, eventId);
    if (!detail.ok) return;
    await updateEvent(world.communityId, eventId, {
      expectedVersion: detail.value.event.version,
      start: { date: "2026-11-21", time: "20:00" },
      end: { date: "2026-11-21", time: "23:00" },
    });

    await signIn(world.member.id);
    const essai = await selfAssign(world.communityId, { slotId });
    expect(essai.ok).toBe(false);
    if (!essai.ok) expect(essai.code).toBe("reconfirmation_requise");
  });

  it("refuse sur un evenement en brouillon", async () => {
    const world = await setup();
    const created = await createEvent(world.communityId, {
      title: "En preparation",
      description: "",
      ...HORAIRE,
      locationName: "",
      locationAddress: "",
      sessions: [],
      teams: [
        {
          name: "Equipe 1",
          membershipIds: [],
          sessionOrdinals: [],
          templateFieldIds: [],
        },
      ],
      rehearsals: [],
      openCollection: false,
    });
    if (!created.ok) return;

    const detail = await getEventDetail(world.communityId, created.value.eventId);
    if (!detail.ok) return;
    const slotId = detail.value.occurrences[0]!.plans[0]!.slots[0]!.id;

    await signIn(world.member.id);
    const essai = await selfAssign(world.communityId, { slotId });
    expect(essai.ok).toBe(false);
  });
});
