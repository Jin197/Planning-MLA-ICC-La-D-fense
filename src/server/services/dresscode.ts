import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import type { DressCode, EventAsset, Id } from "@/domain/types";
import { getDataAdapter } from "../data";
import { getStorage } from "../storage";
import { requireActiveMembership, requireCommunityAction } from "../auth/context";

/**
 * Dress-code : theme, mood, couleurs, matieres, consigne et moodboard.
 * Une consigne commune peut avoir des variantes par equipe. Le referent
 * dress-code reste un poste affectable distinct, gere avec les affectations.
 */

export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ASSET_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export interface DressCodeInput {
  eventId: Id;
  /** null = consigne commune a l'evenement. */
  teamId: Id | null;
  theme: string;
  mood: string;
  colors: string[];
  materials: string;
  instruction: string;
}

export async function upsertDressCode(
  communityId: Id,
  input: DressCodeInput,
): Promise<Result<{ id: Id }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const event = await tx.selectOne("events", {
      where: { id: input.eventId, communityId },
    });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    await requireCommunityAction(communityId, "evenement.modifier", {
      eventState: event.state,
    });

    if (input.teamId) {
      const team = await tx.selectOne("teams", {
        where: { id: input.teamId, communityId },
      });
      if (!team) return err("equipe_inconnue", "Equipe introuvable.");
    }

    const colors = input.colors
      .map((c) => c.trim())
      .filter((c) => c !== "")
      .slice(0, 8);

    const existing = (
      await tx.select("dress_codes", { where: { eventId: input.eventId } })
    ).find((d) => d.teamId === input.teamId);

    const at = nowIso();
    if (existing) {
      await tx.update("dress_codes", existing.id, {
        theme: input.theme.trim(),
        mood: input.mood.trim(),
        colors,
        materials: input.materials.trim(),
        instruction: input.instruction.trim(),
        updatedAt: at,
      });
      return ok({ id: existing.id });
    }

    const row: DressCode = {
      id: newId(),
      communityId,
      eventId: input.eventId,
      teamId: input.teamId,
      theme: input.theme.trim(),
      mood: input.mood.trim(),
      colors,
      materials: input.materials.trim(),
      instruction: input.instruction.trim(),
      updatedAt: at,
    };
    await tx.insert("dress_codes", row);
    return ok({ id: row.id });
  });
}

export async function listDressCodes(
  communityId: Id,
  eventId: Id,
): Promise<DressCode[]> {
  await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  return adapter.read((tx) => tx.select("dress_codes", { where: { eventId } }));
}

export interface AssetUpload {
  eventId: Id;
  dressCodeId: Id | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Texte alternatif obligatoire. */
  alt: string;
  /** Contenu, deja ecrit dans l'espace prive par l'appelant. */
  storagePath: string;
}

/** Les signatures de fichier acceptees, verifiees sur le contenu reel. */
const SIGNATURES: { mime: string; octets: number[]; decalage: number }[] = [
  { mime: "image/jpeg", octets: [0xff, 0xd8, 0xff], decalage: 0 },
  { mime: "image/png", octets: [0x89, 0x50, 0x4e, 0x47], decalage: 0 },
  // WEBP et AVIF : conteneur RIFF / ISOBMFF, le type suit a l'octet 8.
  { mime: "image/webp", octets: [0x57, 0x45, 0x42, 0x50], decalage: 8 },
  { mime: "image/avif", octets: [0x61, 0x76, 0x69, 0x66], decalage: 8 },
];

/**
 * Verifie que le contenu correspond vraiment a une image.
 *
 * Le type declare par le navigateur ne prouve rien : un fichier renomme
 * passerait le controle d'extension. On lit donc les premiers octets.
 */
export function detectImageMime(contenu: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    const fin = signature.decalage + signature.octets.length;
    if (contenu.length < fin) continue;
    const correspond = signature.octets.every(
      (octet, index) => contenu[signature.decalage + index] === octet,
    );
    if (correspond) return signature.mime;
  }
  return null;
}

/**
 * Les limites de taille et de format sont verifiees ici, cote serveur, et
 * pas seulement dans le formulaire.
 */
export async function registerAsset(
  communityId: Id,
  input: AssetUpload,
): Promise<Result<{ id: Id }>> {
  const ctx = await requireCommunityAction(communityId, "evenement.modifier");
  if (!ALLOWED_ASSET_MIME.includes(input.mimeType as (typeof ALLOWED_ASSET_MIME)[number])) {
    return err(
      "format_refuse",
      `Formats acceptes : ${ALLOWED_ASSET_MIME.join(", ")}.`,
    );
  }
  if (input.sizeBytes > MAX_ASSET_BYTES) {
    return err(
      "taille_refusee",
      `Taille maximale ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} Mo.`,
    );
  }
  if (input.alt.trim() === "") {
    return err("alt_requis", "Un texte alternatif est requis pour chaque visuel.");
  }

  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const event = await tx.selectOne("events", {
      where: { id: input.eventId, communityId },
    });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    const asset: EventAsset = {
      id: newId(),
      communityId,
      eventId: input.eventId,
      dressCodeId: input.dressCodeId,
      storagePath: input.storagePath,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      alt: input.alt.trim(),
      uploadedBy: ctx.viewer.userId,
      createdAt: nowIso(),
    };
    await tx.insert("event_assets", asset);
    return ok({ id: asset.id });
  });
}

export async function listAssets(
  communityId: Id,
  eventId: Id,
): Promise<EventAsset[]> {
  await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  return adapter.read((tx) => tx.select("event_assets", { where: { eventId } }));
}

/**
 * Televerse un visuel de moodboard. Les limites de taille et de format sont
 * verifiees ici, cote serveur, **sur le contenu reel** du fichier.
 */
export async function uploadMoodboard(
  communityId: Id,
  input: {
    eventId: Id;
    dressCodeId: Id | null;
    filename: string;
    alt: string;
    contenu: Uint8Array;
  },
): Promise<Result<{ id: Id }>> {
  const ctx = await requireCommunityAction(communityId, "evenement.modifier");

  if (input.alt.trim() === "") {
    return err("alt_requis", "Un texte alternatif est requis pour chaque visuel.");
  }
  if (input.contenu.byteLength === 0) {
    return err("fichier_vide", "Choisissez un fichier image.");
  }
  if (input.contenu.byteLength > MAX_ASSET_BYTES) {
    return err(
      "taille_refusee",
      `Taille maximale ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)} Mo.`,
    );
  }

  const mimeReel = detectImageMime(input.contenu);
  if (mimeReel === null) {
    return err(
      "format_refuse",
      `Ce fichier n'est pas une image reconnue. Formats acceptes : ${ALLOWED_ASSET_MIME.join(", ")}.`,
    );
  }

  const adapter = getDataAdapter();
  const storage = getStorage();

  return adapter.transaction(async (tx) => {
    const event = await tx.selectOne("events", {
      where: { id: input.eventId, communityId },
    });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (input.dressCodeId) {
      const consigne = await tx.selectOne("dress_codes", {
        where: { id: input.dressCodeId, communityId },
      });
      if (!consigne) return err("dress_code_inconnu", "Consigne introuvable.");
    }

    const id = newId();
    const extension = mimeReel.split("/")[1] ?? "bin";
    // Chemin cloisonne par communaute et par evenement.
    const storagePath = await storage.write(
      `${communityId}/${input.eventId}/${id}.${extension}`,
      input.contenu,
    );

    const asset: EventAsset = {
      id,
      communityId,
      eventId: input.eventId,
      dressCodeId: input.dressCodeId,
      storagePath,
      filename: input.filename.slice(0, 160),
      mimeType: mimeReel,
      sizeBytes: input.contenu.byteLength,
      alt: input.alt.trim(),
      uploadedBy: ctx.viewer.userId,
      createdAt: nowIso(),
    };
    await tx.insert("event_assets", asset);
    return ok({ id });
  });
}

/**
 * Renvoie le contenu d'un visuel, apres verification de l'adhesion. Les
 * fichiers ne sont jamais servis directement : ils vivent en dehors de
 * `public/`.
 */
export async function readMoodboard(
  communityId: Id,
  assetId: Id,
): Promise<Result<{ contenu: Uint8Array; mimeType: string; filename: string }>> {
  await requireActiveMembership(communityId);
  const adapter = getDataAdapter();

  const asset = await adapter.read((tx) =>
    tx.selectOne("event_assets", { where: { id: assetId, communityId } }),
  );
  if (!asset) return err("visuel_inconnu", "Visuel introuvable.");

  const contenu = await getStorage().read(asset.storagePath);
  if (!contenu) return err("contenu_absent", "Le fichier n'est plus disponible.");

  return ok({
    contenu,
    mimeType: asset.mimeType,
    filename: asset.filename,
  });
}

export async function removeMoodboard(
  communityId: Id,
  assetId: Id,
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "evenement.modifier");
  const adapter = getDataAdapter();

  return adapter.transaction(async (tx) => {
    const asset = await tx.selectOne("event_assets", {
      where: { id: assetId, communityId },
    });
    if (!asset) return err("visuel_inconnu", "Visuel introuvable.");
    await tx.remove("event_assets", assetId);
    await getStorage().remove(asset.storagePath);
    return ok({ id: assetId });
  });
}
