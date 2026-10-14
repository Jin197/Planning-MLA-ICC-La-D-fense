import { beforeAll, describe, expect, it } from "vitest";
import { resetStore, signIn, tx } from "./helpers";
import { buildSeedSnapshot } from "@/server/data/demo/seed";
import { replaceSnapshot } from "@/server/data/demo/store";
import { assignMember, listCandidates } from "@/server/services/assignments";
import { getEventDetail, updateEvent } from "@/server/services/events";
import { availabilityGrid } from "@/server/services/availability";
import { moveSetlistItem } from "@/server/services/songs";
import type { Id } from "@/domain/types";

/**
 * Verifie les scenarios decrits dans `docs/scenarios-utilisation.md` contre le
 * jeu de donnees fictif reel. Si un scenario de la documentation cesse d'etre
 * vrai, ces tests echouent.
 */

interface Reperes {
  mlaId: Id;
  noaId: Id;
  gaspardMembershipId: Id;
  culte1Id: Id;
  pianoSlotCulte1: Id;
  publieId: Id;
}

let reperes: Reperes;

beforeAll(async () => {
  resetStore();
  replaceSnapshot(await buildSeedSnapshot(), false);

  reperes = await tx(async (t) => {
    const mla = (await t.select("communities")).find((c) => c.type === "MLA")!;
    const noa = (await t.select("profiles")).find(
      (p) => p.email === "noa.bertrand@exemple.test",
    )!;
    const gaspard = (await t.select("profiles")).find(
      (p) => p.email === "gaspard.nguema@exemple.test",
    )!;
    const gaspardMembership = (
      await t.select("community_memberships", {
        where: { communityId: mla.id, userId: gaspard.id },
      })
    )[0]!;

    const publie = (await t.select("events", { where: { communityId: mla.id } })).find(
      (e) => e.state === "publie" && e.title.includes("18 octobre"),
    )!;
    const culte1 = (
      await t.select("event_sessions", { where: { eventId: publie.id } })
    ).find((s) => s.label === "Culte 1")!;

    const equipe1 = (await t.select("teams", { where: { communityId: mla.id } })).find(
      (e) => e.name === "Equipe 1",
    )!;
    const plan = (
      await t.select("event_plans", {
        where: { sessionId: culte1.id, teamId: equipe1.id },
      })
    )[0]!;
    const piano = (
      await t.select("event_role_slots", { where: { planId: plan.id } })
    ).find((s) => s.label === "Piano")!;

    return {
      mlaId: mla.id,
      noaId: noa.id,
      gaspardMembershipId: gaspardMembership.id,
      culte1Id: culte1.id,
      pianoSlotCulte1: piano.id,
      publieId: publie.id,
    };
  });
});

describe("scenario : un musicien engage dans un autre ministere", () => {
  it("n'apparait pas dans la liste par defaut, car il n'a pas repondu", async () => {
    await signIn(reperes.noaId);
    const parDefaut = await listCandidates(reperes.mlaId, reperes.pianoSlotCulte1);
    expect(parDefaut.ok).toBe(true);
    if (!parDefaut.ok) return;
    expect(
      parDefaut.value.candidates.map((c) => c.membershipId),
    ).not.toContain(reperes.gaspardMembershipId);
  });

  it("apparait avec « Tous les membres », et son conflit est masque", async () => {
    await signIn(reperes.noaId);
    const tous = await listCandidates(reperes.mlaId, reperes.pianoSlotCulte1, {
      includeAll: true,
    });
    expect(tous.ok).toBe(true);
    if (!tous.ok) return;

    const gaspard = tous.value.candidates.find(
      (c) => c.membershipId === reperes.gaspardMembershipId,
    );
    expect(gaspard).toBeDefined();
    expect(gaspard?.availability).toBe("a_renseigner");
    // Sa competence Piano correspond bien au poste.
    expect(gaspard?.matchesSkills).toBe(true);
    // Il sonorise ce meme creneau dans un autre ministere.
    expect(gaspard?.conflicts.length).toBeGreaterThan(0);
    expect(gaspard?.conflicts[0]).toEqual({
      visibility: "masque",
      message: "Conflit sur ce creneau",
    });
    // Rien de l'autre ministere ne fuit.
    expect(JSON.stringify(gaspard)).not.toContain("Sonorisation");
  });

  it("exige une confirmation d'exception puis un motif administratif", async () => {
    await signIn(reperes.noaId);

    const sansRien = await assignMember(reperes.mlaId, {
      slotId: reperes.pianoSlotCulte1,
      membershipId: reperes.gaspardMembershipId,
    });
    expect(sansRien.ok).toBe(false);
    if (!sansRien.ok) expect(sansRien.code).toBe("exception_a_confirmer");

    const sansMotif = await assignMember(reperes.mlaId, {
      slotId: reperes.pianoSlotCulte1,
      membershipId: reperes.gaspardMembershipId,
      acceptExceptions: true,
    });
    expect(sansMotif.ok).toBe(false);
    if (!sansMotif.ok) expect(sansMotif.code).toBe("motif_administratif_requis");

    const avecMotif = await assignMember(reperes.mlaId, {
      slotId: reperes.pianoSlotCulte1,
      membershipId: reperes.gaspardMembershipId,
      acceptExceptions: true,
      exceptionReason: "Accord du pole son : il quitte la regie a 10h.",
    });
    expect(avecMotif.ok).toBe(true);
    if (avecMotif.ok) {
      expect(avecMotif.value.exceptions).toEqual(
        expect.arrayContaining(["sans_reponse", "conflit"]),
      );
    }
  });
});

describe("scenario : le LEAD change entre le culte 1 et le culte 2", () => {
  it("expose bien deux personnes differentes sur le meme poste", async () => {
    await signIn(reperes.noaId);
    const detail = await getEventDetail(reperes.mlaId, reperes.publieId);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    const leadsParCreneau = detail.value.sessions.map((vue) => ({
      creneau: vue.session.label,
      leads: vue.plans
        .flatMap((p) => p.slots.filter((s) => s.label === "LEAD"))
        .flatMap((s) => s.assignments.map((a) => a.name)),
    }));

    const culte1 = leadsParCreneau.find((l) => l.creneau === "Culte 1");
    const culte2 = leadsParCreneau.find((l) => l.creneau === "Culte 2");
    expect(culte1?.leads).toEqual(["Noa Bertrand"]);
    expect(culte2?.leads).toEqual(["Ines Valadier"]);
  });
});

describe("scenario : une disponibilite differente entre deux cultes du jour", () => {
  it("est enregistree et lisible creneau par creneau", async () => {
    await signIn(reperes.noaId);
    const grille = await availabilityGrid(reperes.mlaId, reperes.publieId);
    expect(grille.ok).toBe(true);
    if (!grille.ok) return;

    const maelys = grille.value.rows.find((r) => r.name === "Maelys Fontaine");
    expect(maelys).toBeDefined();

    const detail = await getEventDetail(reperes.mlaId, reperes.publieId);
    if (!detail.ok) return;
    const [c1, c2] = detail.value.sessions;

    expect(maelys?.answers[c1!.session.id]?.state).toBe("disponible");
    expect(maelys?.answers[c2!.session.id]?.state).toBe("indisponible");
    // L'admin lit le motif ; un membre ne le verrait pas.
    expect(maelys?.answers[c2!.session.id]?.reason).toContain("familial");
  });
});

describe("scenario : une repetition qui se termine apres minuit", () => {
  it("porte une duree correcte et une date de fin au lendemain", async () => {
    await signIn(reperes.noaId);
    const collecte = await tx(async (t) => {
      const events = await t.select("events", { where: { communityId: reperes.mlaId } });
      return events.find((e) => e.title.includes("25 octobre") && e.state === "collecte")!;
    });

    const detail = await getEventDetail(reperes.mlaId, collecte.id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    const nuit = detail.value.rehearsals.find((r) => r.label === "Repetition de nuit");
    expect(nuit).toBeDefined();
    const duree =
      (new Date(nuit!.endsAt).getTime() - new Date(nuit!.startsAt).getTime()) / 60000;
    expect(duree).toBe(150);
    expect(nuit!.startsAt).not.toBe(nuit!.endsAt);

    const changementHeure = detail.value.rehearsals.find((r) =>
      r.label.includes("changement d'heure"),
    );
    expect(changementHeure).toBeDefined();
    const dureeChangement =
      (new Date(changementHeure!.endsAt).getTime() -
        new Date(changementHeure!.startsAt).getTime()) /
      60000;
    // 23h00 -> 01h30 la nuit du passage a l'heure d'hiver : 2 h 30 reelles.
    expect(dureeChangement).toBe(150);
  });
});

describe("scenario : corriger la description d'un evenement", () => {
  it("ne remet aucune reponse ni aucune confirmation a zero", async () => {
    await signIn(reperes.noaId);

    const avant = await tx(async (t) => ({
      dispos: await t.select("session_availabilities", {
        where: { communityId: reperes.mlaId },
      }),
      confirmees: (
        await t.select("assignments", { where: { communityId: reperes.mlaId } })
      ).filter((a) => a.state === "confirmee").length,
      version: (await t.selectOne("events", { where: { id: reperes.publieId } }))!
        .version,
    }));

    const resultat = await updateEvent(reperes.mlaId, reperes.publieId, {
      expectedVersion: avant.version,
      description: "Precision ajoutee : entree des musiciens par la porte laterale.",
    });
    expect(resultat.ok).toBe(true);

    const apres = await tx(async (t) => ({
      dispos: await t.select("session_availabilities", {
        where: { communityId: reperes.mlaId },
      }),
      confirmees: (
        await t.select("assignments", { where: { communityId: reperes.mlaId } })
      ).filter((a) => a.state === "confirmee").length,
      aReconfirmer: (
        await t.select("session_availabilities", {
          where: { communityId: reperes.mlaId, needsReconfirmation: true },
        })
      ).length,
    }));

    expect(apres.dispos).toHaveLength(avant.dispos.length);
    expect(apres.confirmees).toBe(avant.confirmees);
    // Aucune reconfirmation declenchee : ce n'est pas un changement d'horaire.
    expect(apres.aReconfirmer).toBe(0);
  });
});

describe("scenario : reordonner la liste de chants", () => {
  it("echange deux rangs et refuse de depasser les bornes", async () => {
    await signIn(reperes.noaId);

    const liste = await tx(async (t) => {
      const items = await t.select("setlist_items", {
        where: { eventId: reperes.publieId },
      });
      const duCulte1 = items
        .filter((i) => i.sessionId === reperes.culte1Id)
        .sort((a, b) => a.order - b.order);
      return duCulte1;
    });
    expect(liste.length).toBeGreaterThan(2);

    const premier = liste[0]!;
    const second = liste[1]!;

    // Le premier ne peut pas monter.
    const impossible = await moveSetlistItem(reperes.mlaId, premier.id, "haut");
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) expect(impossible.code).toBe("deplacement_impossible");

    // Descendre le premier l'echange avec le second.
    const deplace = await moveSetlistItem(reperes.mlaId, premier.id, "bas");
    expect(deplace.ok).toBe(true);

    const apres = await tx(async (t) =>
      (
        await t.select("setlist_items", { where: { sessionId: reperes.culte1Id } })
      ).sort((a, b) => a.order - b.order),
    );
    expect(apres[0]?.id).toBe(second.id);
    expect(apres[1]?.id).toBe(premier.id);
    // Les rangs restent contigus, de 1 a n.
    expect(apres.map((i) => i.order)).toEqual(
      apres.map((_, index) => index + 1),
    );
  });
});

describe("scenario : un creneau dont l'horaire reste a definir", () => {
  it("bloque la publication tant qu'il n'est pas fixe", async () => {
    await signIn(reperes.noaId);
    const ejp = await tx(async (t) => {
      const events = await t.select("events", { where: { communityId: reperes.mlaId } });
      return events.find((e) => e.title.includes("Culte EJP"))!;
    });

    const detail = await getEventDetail(reperes.mlaId, ejp.id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    expect(detail.value.sessions[0]?.session.scheduleProvisional).toBe(true);
    const bloquants = (detail.value.readiness?.blockers ?? []).filter(
      (b) => b.severity === "bloquant",
    );
    expect(bloquants.map((b) => b.code)).toContain("horaire_provisoire");
    expect(detail.value.readiness?.publishableWithExceptions).toBe(false);
  });
});
