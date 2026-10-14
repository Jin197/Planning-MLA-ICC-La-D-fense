import { describe, expect, it } from "vitest";
import {
  can,
  canReadReason,
  canSeeAssignments,
  canSeeEvent,
  canWriteDiscussion,
  wouldLeaveNoAdmin,
  type MembershipContext,
  type Viewer,
} from "@/domain/permissions";
import { EVENT_STATES } from "@/domain/types";

const viewer: Viewer = { userId: "u1", emailVerified: true };
const other: Viewer = { userId: "u2", emailVerified: true };

const admin: MembershipContext = {
  communityId: "A",
  role: "admin",
  status: "active",
  membershipId: "mA",
};
const member: MembershipContext = {
  communityId: "A",
  role: "membre",
  status: "active",
  membershipId: "mM",
};
const revoked: MembershipContext = { ...member, status: "revoked" };

/** Critere 3 : un membre ne peut pas administrer. */
describe("un membre actif", () => {
  it("peut repondre pour lui et ecrire dans la discussion", () => {
    expect(can(viewer, member, "disponibilite.repondre_pour_soi").allowed).toBe(true);
    expect(can(viewer, member, "affectation.repondre_pour_soi").allowed).toBe(true);
    expect(
      can(viewer, member, "discussion.ecrire", { eventState: "collecte" }).allowed,
    ).toBe(true);
  });

  it("ne peut ni creer un evenement, ni affecter, ni changer un role", () => {
    expect(can(viewer, member, "evenement.creer").allowed).toBe(false);
    expect(can(viewer, member, "affectation.ecrire").allowed).toBe(false);
    expect(can(viewer, member, "communaute.gerer_roles").allowed).toBe(false);
    expect(can(viewer, member, "communaute.decider_adhesion").allowed).toBe(false);
    expect(can(viewer, member, "evenement.publier").allowed).toBe(false);
    expect(can(viewer, member, "communaute.importer").allowed).toBe(false);
  });

  it("ne peut pas lire le motif prive d'un autre membre", () => {
    expect(can(viewer, member, "motif.voir_les_autres").allowed).toBe(false);
    expect(canReadReason(viewer, member, "u2")).toBe(false);
    expect(canReadReason(viewer, member, "u1")).toBe(true);
  });
});

/** Critere 2 : une demande en attente n'ouvre aucun acces. */
describe("sans adhesion active", () => {
  it("ne voit que la fiche publique", () => {
    expect(can(viewer, null, "communaute.voir_fiche_publique").allowed).toBe(true);
    expect(can(viewer, null, "communaute.voir_contenu_prive").allowed).toBe(false);
    for (const state of EVENT_STATES) {
      expect(can(viewer, null, "evenement.voir", { eventState: state }).allowed).toBe(
        false,
      );
      expect(can(viewer, null, "discussion.lire", { eventState: state }).allowed).toBe(
        false,
      );
    }
  });

  it("une adhesion revoquee ne donne plus rien", () => {
    expect(can(viewer, revoked, "evenement.voir", { eventState: "publie" }).allowed).toBe(
      false,
    );
    expect(can(viewer, revoked, "discussion.lire", { eventState: "publie" }).allowed).toBe(
      false,
    );
    expect(canSeeEvent(revoked, "publie")).toBe(false);
  });

  it("une session absente ne passe jamais", () => {
    expect(can(null, admin, "evenement.creer").allowed).toBe(false);
    expect(can(null, admin, "communaute.voir_fiche_publique").allowed).toBe(false);
  });
});

/** Critere 4 : un admin de A n'a aucun droit dans B. */
describe("cloisonnement entre communautes", () => {
  it("un admin de A sans adhesion dans B ne peut rien y faire", () => {
    expect(can(other, null, "evenement.creer").allowed).toBe(false);
    expect(can(other, null, "affectation.ecrire").allowed).toBe(false);
    expect(can(other, null, "communaute.voir_contenu_prive").allowed).toBe(false);
  });
});

/** Critere 10 : la collecte n'expose pas le brouillon des affectations. */
describe("visibilite selon l'etat de l'evenement", () => {
  it("un brouillon reste aux admins", () => {
    expect(canSeeEvent(member, "brouillon")).toBe(false);
    expect(canSeeEvent(admin, "brouillon")).toBe(true);
  });

  it("pendant la collecte le membre voit l'evenement mais pas les affectations", () => {
    expect(canSeeEvent(member, "collecte")).toBe(true);
    expect(canSeeAssignments(member, "collecte")).toBe(false);
    expect(canSeeAssignments(admin, "collecte")).toBe(true);
  });

  it("la publication revele le plan", () => {
    expect(canSeeAssignments(member, "publie")).toBe(true);
  });

  it("une archive et une annulation sont en lecture seule", () => {
    expect(canWriteDiscussion(member, "archive")).toBe(false);
    expect(canWriteDiscussion(member, "annule")).toBe(false);
    expect(canWriteDiscussion(admin, "archive")).toBe(false);
    expect(can(viewer, admin, "evenement.modifier", { eventState: "archive" }).allowed).toBe(
      false,
    );
    expect(can(viewer, admin, "affectation.ecrire", { eventState: "annule" }).allowed).toBe(
      false,
    );
  });
});

/** Critere 11 : le depart du dernier admin est bloque. */
describe("garde-fou du dernier admin", () => {
  it("bloque quand il ne resterait aucun admin", () => {
    expect(wouldLeaveNoAdmin(["u1"], "u1")).toBe(true);
  });

  it("autorise quand il en reste un", () => {
    expect(wouldLeaveNoAdmin(["u1", "u2"], "u1")).toBe(false);
  });

  it("n'est pas trompe par un doublon de la cible", () => {
    expect(wouldLeaveNoAdmin(["u1", "u1"], "u1")).toBe(true);
  });
});
