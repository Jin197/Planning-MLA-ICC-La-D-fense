import { beforeEach, describe, expect, it } from "vitest";
import {
  createCommunity,
  createVerifiedUser,
  joinAsMember,
  resetStore,
  rpc,
  tx,
} from "./helpers";
import { ConstraintError } from "@/server/data/port";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";

describe("creation d'une communaute", () => {
  beforeEach(resetStore);

  /** Critere 1. */
  it("rend seulement son createur admin de celle-ci et installe le modele une fois", async () => {
    const creator = await createVerifiedUser("createur@exemple.test");
    const autre = await createVerifiedUser("autre@exemple.test");
    const { communityId } = await createCommunity(creator.id, "MLA");

    const state = await tx(async (t) => ({
      memberships: await t.select("community_memberships", { where: { communityId } }),
      templates: await t.select("planning_templates", { where: { communityId } }),
      fields: await t.select("template_fields", { where: { communityId } }),
      autresAdhesions: await t.select("community_memberships", {
        where: { userId: autre.id },
      }),
    }));

    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]!.userId).toBe(creator.id);
    expect(state.memberships[0]!.role).toBe("admin");
    expect(state.templates).toHaveLength(1);
    expect(state.fields.filter((f) => f.label === "LEAD")).toHaveLength(1);
    // Aucun droit accorde ailleurs.
    expect(state.autresAdhesions).toHaveLength(0);
  });

  it("installe Star 1 a Star 4 pour une communaute Accueil", async () => {
    const creator = await createVerifiedUser("accueil@exemple.test");
    const { communityId } = await createCommunity(creator.id, "ACCUEIL", "Accueil test");
    const fields = await tx((t) =>
      t.select("template_fields", { where: { communityId } }),
    );
    const labels = fields.filter((f) => f.assignable).map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Star 1", "Star 2", "Star 3", "Star 4"]),
    );
  });

  it("deux creations successives donnent deux modeles independants", async () => {
    const creator = await createVerifiedUser("double@exemple.test");
    const a = await createCommunity(creator.id, "MLA", "Premiere");
    const b = await createCommunity(creator.id, "ACCUEIL", "Seconde");
    expect(a.communityId).not.toBe(b.communityId);
    const templates = await tx((t) => t.select("planning_templates"));
    expect(templates).toHaveLength(2);
  });

  it("refuse la creation si l'email n'est pas verifie", async () => {
    const profile = await tx(async (t) =>
      t.insert("profiles", {
        id: newId(),
        email: "nonverifie@exemple.test",
        firstName: "Non",
        lastName: "Verifie",
        declaredMinistry: "",
        description: null,
        onboardingChoice: "responsable",
        emailVerifiedAt: null,
        createdAt: nowIso(),
      }),
    );
    await expect(createCommunity(profile.id)).rejects.toThrow(ConstraintError);
  });

  it("un utilisateur peut etre admin ici et membre ailleurs", async () => {
    const a = await createVerifiedUser("a@exemple.test");
    const b = await createVerifiedUser("b@exemple.test");
    const first = await createCommunity(a.id, "MLA", "Chez A");
    const second = await createCommunity(b.id, "ACCUEIL", "Chez B");
    await joinAsMember(second.communityId, b.id, a.id);

    const memberships = await tx((t) =>
      t.select("community_memberships", { where: { userId: a.id } }),
    );
    const roles = new Map(memberships.map((m) => [m.communityId, m.role]));
    expect(roles.get(first.communityId)).toBe("admin");
    expect(roles.get(second.communityId)).toBe("membre");
  });
});

describe("demandes d'adhesion", () => {
  beforeEach(resetStore);

  /** Critere 2 : l'acceptation ouvre les droits de membre, pas avant. */
  it("une demande en attente ne cree aucune adhesion", async () => {
    const admin = await createVerifiedUser("admin@exemple.test");
    const demandeur = await createVerifiedUser("demandeur@exemple.test");
    const { communityId } = await createCommunity(admin.id);

    await tx((t) =>
      t.insert("join_requests", {
        id: newId(),
        communityId,
        userId: demandeur.id,
        message: null,
        status: "en_attente",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: nowIso(),
      }),
    );

    const memberships = await tx((t) =>
      t.select("community_memberships", { where: { userId: demandeur.id } }),
    );
    expect(memberships).toHaveLength(0);
  });

  it("l'acceptation cree une adhesion membre et notifie le demandeur", async () => {
    const admin = await createVerifiedUser("admin2@exemple.test");
    const demandeur = await createVerifiedUser("demandeur2@exemple.test");
    const { communityId } = await createCommunity(admin.id);
    const membershipId = await joinAsMember(communityId, admin.id, demandeur.id);

    const state = await tx(async (t) => ({
      membership: await t.selectOne("community_memberships", {
        where: { id: membershipId },
      }),
      request: await t.selectOne("join_requests", { where: { userId: demandeur.id } }),
      notifications: await t.select("notifications", { where: { userId: demandeur.id } }),
    }));

    expect(state.membership?.role).toBe("membre");
    expect(state.membership?.status).toBe("active");
    expect(state.request?.status).toBe("acceptee");
    expect(state.notifications.map((n) => n.kind)).toContain("adhesion_acceptee");
  });

  /** Critere 3 : meme par appel direct, un membre n'administre pas. */
  it("un membre ne peut pas accepter une demande", async () => {
    const admin = await createVerifiedUser("admin3@exemple.test");
    const membre = await createVerifiedUser("membre3@exemple.test");
    const tiers = await createVerifiedUser("tiers3@exemple.test");
    const { communityId } = await createCommunity(admin.id);
    await joinAsMember(communityId, admin.id, membre.id);

    const requestId = await tx(async (t) => {
      const id = newId();
      await t.insert("join_requests", {
        id,
        communityId,
        userId: tiers.id,
        message: null,
        status: "en_attente",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: nowIso(),
      });
      return id;
    });

    await expect(
      rpc("accept_join_request", {
        actorUserId: membre.id,
        requestId,
        note: null,
      }),
    ).rejects.toThrow(/admins/i);
  });

  /** Critere 4 : un admin d'une autre communaute n'a aucun droit ici. */
  it("un admin d'une autre communaute ne peut pas accepter la demande", async () => {
    const adminA = await createVerifiedUser("adminA@exemple.test");
    const adminB = await createVerifiedUser("adminB@exemple.test");
    const tiers = await createVerifiedUser("tiersB@exemple.test");
    const a = await createCommunity(adminA.id, "MLA", "Communaute A");
    await createCommunity(adminB.id, "ACCUEIL", "Communaute B");

    const requestId = await tx(async (t) => {
      const id = newId();
      await t.insert("join_requests", {
        id,
        communityId: a.communityId,
        userId: tiers.id,
        message: null,
        status: "en_attente",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: nowIso(),
      });
      return id;
    });

    await expect(
      rpc("accept_join_request", {
        actorUserId: adminB.id,
        requestId,
        note: null,
      }),
    ).rejects.toThrow(/admins/i);
  });

  it("empeche deux demandes en attente en double", async () => {
    const admin = await createVerifiedUser("admin4@exemple.test");
    const demandeur = await createVerifiedUser("demandeur4@exemple.test");
    const { communityId } = await createCommunity(admin.id);

    const insert = () =>
      tx((t) =>
        t.insert("join_requests", {
          id: newId(),
          communityId,
          userId: demandeur.id,
          message: null,
          status: "en_attente",
          decidedBy: null,
          decidedAt: null,
          decisionNote: null,
          createdAt: nowIso(),
        }),
      );

    await insert();
    await expect(insert()).rejects.toThrow(/en attente/i);
  });

  it("refuse une double adhesion pour la meme personne", async () => {
    const admin = await createVerifiedUser("admin5@exemple.test");
    const membre = await createVerifiedUser("membre5@exemple.test");
    const { communityId } = await createCommunity(admin.id);
    await joinAsMember(communityId, admin.id, membre.id);

    await expect(
      tx((t) =>
        t.insert("community_memberships", {
          id: newId(),
          communityId,
          userId: membre.id,
          role: "membre",
          status: "active",
          joinedAt: nowIso(),
          revokedAt: null,
        }),
      ),
    ).rejects.toThrow(/deja une adhesion/i);
  });
});

describe("roles et dernier admin", () => {
  beforeEach(resetStore);

  /** Critere 11. */
  it("bloque la retrogradation du dernier admin", async () => {
    const admin = await createVerifiedUser("seul@exemple.test");
    const { communityId, membershipId } = await createCommunity(admin.id);
    await expect(
      rpc("change_membership_role", {
        actorUserId: admin.id,
        membershipId,
        role: "membre",
      }),
    ).rejects.toThrow(/au moins un admin/i);

    const membership = await tx((t) =>
      t.selectOne("community_memberships", { where: { id: membershipId } }),
    );
    expect(membership?.role).toBe("admin");
    expect(communityId).toBeDefined();
  });

  it("bloque le depart du dernier admin", async () => {
    const admin = await createVerifiedUser("seul2@exemple.test");
    const { membershipId } = await createCommunity(admin.id);
    await expect(
      rpc("revoke_membership", { actorUserId: admin.id, membershipId }),
    ).rejects.toThrow(/dernier admin/i);
  });

  it("autorise la retrogradation quand un autre admin reste", async () => {
    const admin = await createVerifiedUser("premier@exemple.test");
    const second = await createVerifiedUser("second@exemple.test");
    const { communityId, membershipId } = await createCommunity(admin.id);
    const secondMembership = await joinAsMember(communityId, admin.id, second.id);
    await rpc("change_membership_role", {
      actorUserId: admin.id,
      membershipId: secondMembership,
      role: "admin",
    });

    await rpc("change_membership_role", {
      actorUserId: second.id,
      membershipId,
      role: "membre",
    });

    const rows = await tx((t) =>
      t.select("community_memberships", {
        where: { communityId, role: "admin", status: "active" },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(second.id);
  });

  /**
   * Critere 11, cas concurrent : deux retrogradations simultanees ne doivent
   * pas laisser la communaute sans admin. Les ecritures sont serialisees et la
   * seconde relit l'etat.
   */
  it("resiste a deux retrogradations simultanees", async () => {
    const a = await createVerifiedUser("concurrent-a@exemple.test");
    const b = await createVerifiedUser("concurrent-b@exemple.test");
    const { communityId, membershipId: mA } = await createCommunity(a.id);
    const mB = await joinAsMember(communityId, a.id, b.id);
    await rpc("change_membership_role", {
      actorUserId: a.id,
      membershipId: mB,
      role: "admin",
    });

    const results = await Promise.allSettled([
      rpc("change_membership_role", {
        actorUserId: a.id,
        membershipId: mA,
        role: "membre",
      }),
      rpc("change_membership_role", {
        actorUserId: b.id,
        membershipId: mB,
        role: "membre",
      }),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);

    const admins = await tx((t) =>
      t.select("community_memberships", {
        where: { communityId, role: "admin", status: "active" },
      }),
    );
    expect(admins).toHaveLength(1);
  });
});
