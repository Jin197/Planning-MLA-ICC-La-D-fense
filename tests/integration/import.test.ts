import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCommunity,
  createVerifiedUser,
  joinAsMember,
  resetStore,
  signIn,
  tx,
} from "./helpers";
import { analyserClasseur } from "@/server/import/workbook";
import {
  analyserFichier,
  chargerPreview,
  importerDefinitivement,
  rapprocherPersonne,
} from "@/server/import/service";

/**
 * Critere 16 : la previsualisation ne modifie pas la base metier, les
 * ambiguites restent a valider, et relancer le meme import ne cree pas de
 * doublon.
 *
 * Le classeur reel n'est pas versionne. Quand il est absent du depot, les
 * tests qui en dependent sont ignores explicitement plutot que de tester une
 * version inventee.
 */
const CHEMIN_CLASSEUR = join(process.cwd(), "PLANNING MLA LA DEFENSE (1).xlsx");
const classeurPresent = existsSync(CHEMIN_CLASSEUR);

function lireClasseur(): ArrayBuffer {
  const buffer = readFileSync(CHEMIN_CLASSEUR);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe.skipIf(!classeurPresent)("lecture du classeur reel", () => {
  it("detecte les cinq feuilles connues", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    expect(analyse.sheetsDetected).toEqual(
      expect.arrayContaining([
        "PLANNING MLA",
        "LISTE CHANTS",
        "DRESS CODE",
        "PLANNING MLA EJP",
        "historique",
      ]),
    );
    expect(analyse.sheetsManquantes).toEqual([]);
  });

  it("propose une annee etayee par le fichier", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    expect(analyse.yearEvidence).not.toBeNull();
    expect(analyse.yearEvidence?.year).toBeGreaterThanOrEqual(2020);
    expect(analyse.yearEvidence?.evidence).toBeTruthy();
  });

  it("lit l'annuaire, les disponibilites et les affectations avec leur provenance", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    expect(analyse.personnes.length).toBeGreaterThan(20);
    expect(analyse.disponibilites.length).toBeGreaterThan(50);
    expect(analyse.affectations.length).toBeGreaterThan(20);
    for (const personne of analyse.personnes.slice(0, 5)) {
      expect(personne.sheet).toBeTruthy();
      expect(personne.cell).toMatch(/^[A-Z]+\d+$/);
    }
  });

  it("lit les chants et leurs liens externes", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    expect(analyse.chants.length).toBeGreaterThan(5);
    const avecLien = analyse.chants.filter((c) => c.links.length > 0);
    expect(avecLien.length).toBeGreaterThan(0);
    for (const chant of avecLien) {
      for (const lien of chant.links) {
        expect(lien).toMatch(/^https?:\/\//);
      }
    }
  });

  it("lit les dress-codes de la feuille dediee", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    expect(analyse.dressCodes.length).toBeGreaterThan(0);
  });

  it("reconstitue des repetitions, y compris apres minuit", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    const rendezVous = analyse.repetitions.flatMap((r) => r.parsed);
    expect(rendezVous.length).toBeGreaterThan(5);
    const apresMinuit = rendezVous.filter((r) => r.crossesMidnight);
    expect(apresMinuit.length).toBeGreaterThan(0);
  });

  it("signale les anomalies au lieu de les deviner", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    expect(analyse.anomalies.length).toBeGreaterThan(0);
    for (const anomalie of analyse.anomalies.slice(0, 5)) {
      expect(anomalie.message).toBeTruthy();
      expect(anomalie.sheet).toBeTruthy();
    }
  });

  it("ne traite jamais « N/A » comme une personne", async () => {
    const analyse = await analyserClasseur(lireClasseur());
    const nomsLus = analyse.affectations.flatMap((a) => a.parsed.names);
    expect(nomsLus.some((n) => /^n\/?a$/i.test(n))).toBe(false);
    expect(analyse.affectations.some((a) => a.parsed.notApplicable)).toBe(true);
  });
});

describe.skipIf(!classeurPresent)("parcours d'import controle", () => {
  beforeEach(resetStore);

  async function preparer() {
    const admin = await createVerifiedUser("admin-import@test.local", "Nadia", "Admin");
    const membre = await createVerifiedUser("membre-import@test.local", "Elias", "Marchand");
    const { communityId } = await createCommunity(admin.id, "MLA");
    const membershipId = await joinAsMember(communityId, admin.id, membre.id);
    await signIn(admin.id);
    return { admin, membre, communityId, membershipId };
  }

  it("l'analyse ne touche pas la base metier", async () => {
    const { communityId } = await preparer();

    const avant = await tx(async (t) => ({
      events: (await t.select("events")).length,
      availabilities: (await t.select("availabilities")).length,
      assignments: (await t.select("assignments")).length,
      songs: (await t.select("songs")).length,
    }));

    const result = await analyserFichier(communityId, {
      name: "classeur.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 200000,
      buffer: lireClasseur(),
    });
    expect(result.ok).toBe(true);

    const apres = await tx(async (t) => ({
      events: (await t.select("events")).length,
      availabilities: (await t.select("availabilities")).length,
      assignments: (await t.select("assignments")).length,
      songs: (await t.select("songs")).length,
      rows: (await t.select("import_rows")).length,
      people: (await t.select("imported_people")).length,
    }));

    expect(apres.events).toBe(avant.events);
    expect(apres.availabilities).toBe(avant.availabilities);
    expect(apres.assignments).toBe(avant.assignments);
    expect(apres.songs).toBe(avant.songs);
    // Tout est en staging.
    expect(apres.rows).toBeGreaterThan(50);
    expect(apres.people).toBeGreaterThan(20);
  });

  it("laisse chaque personne a rapprocher et ne cree aucun compte", async () => {
    const { communityId } = await preparer();
    const analyse = await analyserFichier(communityId, {
      name: "classeur.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 200000,
      buffer: lireClasseur(),
    });
    if (!analyse.ok) throw new Error(analyse.message);

    const preview = await chargerPreview(communityId, analyse.value.jobId);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(preview.value.personnes.length).toBeGreaterThan(20);
    expect(
      preview.value.personnes.every((p) => p.statut === "a_rapprocher"),
    ).toBe(true);

    const comptes = await tx((t) => t.select("profiles"));
    // Seuls les deux comptes crees par le test existent.
    expect(comptes).toHaveLength(2);

    const adhesions = await tx((t) =>
      t.select("community_memberships", { where: { communityId } }),
    );
    expect(adhesions).toHaveLength(2);
  });

  it("relancer le meme import ne cree pas de doublon", async () => {
    const { communityId, membershipId } = await preparer();

    const premier = await analyserFichier(communityId, {
      name: "classeur.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 200000,
      buffer: lireClasseur(),
    });
    if (!premier.ok) throw new Error(premier.message);

    // Un rapprochement explicite, pour verifier que les donnees liees passent.
    const preview = await chargerPreview(communityId, premier.value.jobId);
    if (!preview.ok) throw new Error(preview.message);
    const cible = preview.value.personnes[0]!;
    await rapprocherPersonne(communityId, {
      jobId: premier.value.jobId,
      importedPersonId: cible.id,
      decision: "lier",
      membershipId,
    });

    const rapport1 = await importerDefinitivement(communityId, premier.value.jobId);
    expect(rapport1.ok).toBe(true);
    if (!rapport1.ok) return;
    expect(rapport1.value.evenementsCrees).toBeGreaterThan(0);

    const apresPremier = await tx(async (t) => ({
      events: (await t.select("events")).length,
      sessions: (await t.select("event_sessions")).length,
      songs: (await t.select("songs")).length,
    }));

    // Deuxieme passage : nouvel import du meme fichier.
    const second = await analyserFichier(communityId, {
      name: "classeur.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 200000,
      buffer: lireClasseur(),
    });
    if (!second.ok) throw new Error(second.message);
    const rapport2 = await importerDefinitivement(communityId, second.value.jobId);
    expect(rapport2.ok).toBe(true);
    if (!rapport2.ok) return;

    expect(rapport2.value.evenementsCrees).toBe(0);
    expect(rapport2.value.evenementsIgnores.length).toBeGreaterThan(0);

    const apresSecond = await tx(async (t) => ({
      events: (await t.select("events")).length,
      sessions: (await t.select("event_sessions")).length,
      songs: (await t.select("songs")).length,
    }));
    expect(apresSecond.events).toBe(apresPremier.events);
    expect(apresSecond.sessions).toBe(apresPremier.sessions);
    expect(apresSecond.songs).toBe(apresPremier.songs);
  });

  it("cree des evenements en brouillon avec des horaires a definir", async () => {
    const { communityId } = await preparer();
    const analyse = await analyserFichier(communityId, {
      name: "classeur.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 200000,
      buffer: lireClasseur(),
    });
    if (!analyse.ok) throw new Error(analyse.message);
    const rapport = await importerDefinitivement(communityId, analyse.value.jobId);
    expect(rapport.ok).toBe(true);

    const etat = await tx(async (t) => ({
      events: await t.select("events", { where: { communityId } }),
      sessions: await t.select("event_sessions", { where: { communityId } }),
    }));

    expect(etat.events.length).toBeGreaterThan(0);
    expect(etat.events.every((e) => e.state === "brouillon")).toBe(true);
    expect(etat.sessions.every((s) => s.scheduleProvisional)).toBe(true);
  });

  it("marque les disponibilites importees a reconfirmer", async () => {
    const { communityId, membershipId } = await preparer();
    const analyse = await analyserFichier(communityId, {
      name: "classeur.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 200000,
      buffer: lireClasseur(),
    });
    if (!analyse.ok) throw new Error(analyse.message);

    const preview = await chargerPreview(communityId, analyse.value.jobId);
    if (!preview.ok) throw new Error(preview.message);
    // On lie une personne qui a des disponibilites dans le classeur.
    for (const personne of preview.value.personnes.slice(0, 6)) {
      await rapprocherPersonne(communityId, {
        jobId: analyse.value.jobId,
        importedPersonId: personne.id,
        decision: "lier",
        membershipId,
      });
    }

    await importerDefinitivement(communityId, analyse.value.jobId);
    const dispos = await tx((t) =>
      t.select("availabilities", { where: { communityId } }),
    );
    if (dispos.length > 0) {
      expect(dispos.every((d) => d.needsReconfirmation)).toBe(true);
    }

    const affectations = await tx((t) =>
      t.select("assignments", { where: { communityId } }),
    );
    for (const affectation of affectations) {
      expect(affectation.state).toBe("a_confirmer");
    }
  });
});

describe("garde-fous de l'import", () => {
  beforeEach(resetStore);

  it("refuse un fichier trop grand", async () => {
    const admin = await createVerifiedUser("gros@test.local");
    const { communityId } = await createCommunity(admin.id, "MLA");
    await signIn(admin.id);
    const result = await analyserFichier(communityId, {
      name: "gros.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 50 * 1024 * 1024,
      buffer: new ArrayBuffer(8),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("fichier_trop_grand");
  });

  it("refuse un format non tableur", async () => {
    const admin = await createVerifiedUser("format@test.local");
    const { communityId } = await createCommunity(admin.id, "MLA");
    await signIn(admin.id);
    const result = await analyserFichier(communityId, {
      name: "notes.txt",
      type: "text/plain",
      size: 10,
      buffer: new ArrayBuffer(8),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("format_refuse");
  });

  it("refuse l'import a un membre non admin", async () => {
    const admin = await createVerifiedUser("admin-droit@test.local");
    const membre = await createVerifiedUser("membre-droit@test.local");
    const { communityId } = await createCommunity(admin.id, "MLA");
    await joinAsMember(communityId, admin.id, membre.id);
    await signIn(membre.id);

    await expect(
      analyserFichier(communityId, {
        name: "classeur.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 1000,
        buffer: new ArrayBuffer(8),
      }),
    ).rejects.toThrow(/admins/i);
  });
});
