import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dossierTemporaire = mkdtempSync(join(tmpdir(), "diapason-assets-"));
process.env.DIAPASON_ASSETS_DIR = dossierTemporaire;

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCommunity,
  createEventWithPlan,
  createVerifiedUser,
  joinAsMember,
  resetStore,
  signIn,
  tx,
} from "./helpers";
import {
  detectImageMime,
  MAX_ASSET_BYTES,
  readMoodboard,
  removeMoodboard,
  uploadMoodboard,
} from "@/server/services/dresscode";
import type { Id } from "@/domain/types";

/**
 * Visuels de moodboard : les limites de taille et de format sont verifiees
 * cote serveur, sur le contenu reel du fichier, et un visuel ne se lit pas
 * sans adhesion.
 */

afterAll(() => {
  rmSync(dossierTemporaire, { recursive: true, force: true });
});

/** En-tetes reels, suffisants pour la detection par signature. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const TEXTE = new TextEncoder().encode("Ceci n'est pas une image.");

describe("detection du format par signature", () => {
  it("reconnait les formats acceptes", () => {
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(WEBP)).toBe("image/webp");
  });

  it("refuse un fichier qui n'est pas une image, meme renomme", () => {
    expect(detectImageMime(TEXTE)).toBeNull();
    expect(detectImageMime(new Uint8Array([]))).toBeNull();
  });
});

describe("televersement d'un visuel", () => {
  let communityId: Id;
  let eventId: Id;
  let membreId: Id;

  beforeEach(async () => {
    resetStore();
    const admin = await createVerifiedUser("admin-visuel@test.local");
    const membre = await createVerifiedUser("membre-visuel@test.local");
    const communaute = await createCommunity(admin.id, "MLA");
    communityId = communaute.communityId;
    membreId = membre.id;
    await joinAsMember(communityId, admin.id, membre.id);
    const event = await createEventWithPlan(communityId, admin.id);
    eventId = event.eventId;
    await signIn(admin.id);
  });

  it("accepte une image avec son texte alternatif", async () => {
    const resultat = await uploadMoodboard(communityId, {
      eventId,
      dressCodeId: null,
      filename: "inspiration.png",
      alt: "Haut ivoire, veste brune",
      contenu: PNG,
    });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const asset = await tx((t) =>
      t.selectOne("event_assets", { where: { id: resultat.value.id } }),
    );
    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.alt).toBe("Haut ivoire, veste brune");
    // Le chemin est cloisonne par communaute et par evenement.
    expect(asset?.storagePath).toContain(communityId);
    expect(asset?.storagePath).toContain(eventId);
  });

  it("refuse un texte alternatif vide", async () => {
    const resultat = await uploadMoodboard(communityId, {
      eventId,
      dressCodeId: null,
      filename: "sans-alt.png",
      alt: "   ",
      contenu: PNG,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.code).toBe("alt_requis");
  });

  it("refuse un fichier qui n'est pas une image, meme avec un nom en .png", async () => {
    const resultat = await uploadMoodboard(communityId, {
      eventId,
      dressCodeId: null,
      filename: "piege.png",
      alt: "Tentative",
      contenu: TEXTE,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.code).toBe("format_refuse");
  });

  it("refuse un fichier trop lourd", async () => {
    const tropGros = new Uint8Array(MAX_ASSET_BYTES + 1);
    tropGros.set(PNG, 0);
    const resultat = await uploadMoodboard(communityId, {
      eventId,
      dressCodeId: null,
      filename: "enorme.png",
      alt: "Trop lourd",
      contenu: tropGros,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.code).toBe("taille_refusee");
  });

  it("refuse un fichier vide", async () => {
    const resultat = await uploadMoodboard(communityId, {
      eventId,
      dressCodeId: null,
      filename: "vide.png",
      alt: "Rien",
      contenu: new Uint8Array([]),
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.code).toBe("fichier_vide");
  });

  it("refuse le televersement par un membre non admin", async () => {
    await signIn(membreId);
    await expect(
      uploadMoodboard(communityId, {
        eventId,
        dressCodeId: null,
        filename: "tentative.png",
        alt: "Tentative",
        contenu: PNG,
      }),
    ).rejects.toThrow(/admins/i);
  });
});

describe("lecture et retrait d'un visuel", () => {
  let communityId: Id;
  let assetId: Id;
  let membreId: Id;
  let adminId: Id;

  beforeEach(async () => {
    resetStore();
    const admin = await createVerifiedUser("admin-lecture@test.local");
    const membre = await createVerifiedUser("membre-lecture@test.local");
    const communaute = await createCommunity(admin.id, "MLA");
    communityId = communaute.communityId;
    adminId = admin.id;
    membreId = membre.id;
    await joinAsMember(communityId, admin.id, membre.id);
    const event = await createEventWithPlan(communityId, admin.id);

    await signIn(admin.id);
    const ajout = await uploadMoodboard(communityId, {
      eventId: event.eventId,
      dressCodeId: null,
      filename: "moodboard.png",
      alt: "Palette automnale",
      contenu: PNG,
    });
    if (!ajout.ok) throw new Error(ajout.message);
    assetId = ajout.value.id;
  });

  it("est lisible par un membre actif", async () => {
    await signIn(membreId);
    const lecture = await readMoodboard(communityId, assetId);
    expect(lecture.ok).toBe(true);
    if (lecture.ok) {
      expect(lecture.value.mimeType).toBe("image/png");
      expect(Array.from(lecture.value.contenu.slice(0, 4))).toEqual([
        0x89, 0x50, 0x4e, 0x47,
      ]);
    }
  });

  it("n'est pas lisible sans adhesion a cette communaute", async () => {
    const etranger = await createVerifiedUser("etranger-visuel@test.local");
    await createCommunity(etranger.id, "ACCUEIL", "Ailleurs");
    await signIn(etranger.id);
    await expect(readMoodboard(communityId, assetId)).rejects.toThrow(
      /adhesion active/i,
    );
  });

  it("est retire par un admin, fichier compris", async () => {
    await signIn(adminId);
    const retrait = await removeMoodboard(communityId, assetId);
    expect(retrait.ok).toBe(true);

    const restant = await tx((t) =>
      t.selectOne("event_assets", { where: { id: assetId } }),
    );
    expect(restant).toBeNull();

    await signIn(membreId);
    const lecture = await readMoodboard(communityId, assetId);
    expect(lecture.ok).toBe(false);
  });

  it("ne peut pas etre retire par un membre", async () => {
    await signIn(membreId);
    await expect(removeMoodboard(communityId, assetId)).rejects.toThrow(/admins/i);
  });
});
