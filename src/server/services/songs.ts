import "server-only";
import { newId } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { err, ok, type Result } from "@/lib/result";
import type { Id, SetlistItem, Song } from "@/domain/types";
import { isExternalResourceLink } from "@/domain/songs";
import { getDataAdapter } from "../data";
import { requireActiveMembership, requireCommunityAction } from "../auth/context";

/**
 * Chants : bibliothèque de la communaute et liste ordonnee par creneau.
 * Aucun telechargement de video, aucune recopie de paroles : les liens
 * s'ouvrent comme ressources externes.
 */

function sanitizeLinks(links: readonly string[]): string[] {
  return links
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .filter(isExternalResourceLink)
    .slice(0, 8);
}

export async function listSongs(communityId: Id): Promise<Song[]> {
  await requireActiveMembership(communityId);
  const adapter = getDataAdapter();
  return adapter.read(async (tx) => {
    const songs = await tx.select("songs", {
      where: { communityId },
      orderBy: { column: "title" },
    });
    return songs.filter((s) => s.archivedAt === null);
  });
}

export interface SongInput {
  title: string;
  songKey?: string | null;
  tempo?: number | null;
  defaultLead?: string | null;
  links?: string[];
  notes?: string | null;
}

export async function createSong(
  communityId: Id,
  input: SongInput,
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "evenement.modifier");
  const title = input.title.trim();
  if (title === "") return err("titre_requis", "Indiquez un titre.");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const id = newId();
    await tx.insert("songs", {
      id,
      communityId,
      title,
      songKey: input.songKey?.trim() || null,
      tempo: input.tempo ?? null,
      defaultLead: input.defaultLead?.trim() || null,
      links: sanitizeLinks(input.links ?? []),
      notes: input.notes?.trim() || null,
      archivedAt: null,
      createdAt: nowIso(),
    });
    return ok({ id });
  });
}

export async function archiveSong(
  communityId: Id,
  songId: Id,
): Promise<Result<{ id: Id }>> {
  await requireCommunityAction(communityId, "evenement.modifier");
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const song = await tx.selectOne("songs", { where: { id: songId, communityId } });
    if (!song) return err("chant_inconnu", "Chant introuvable.");
    await tx.update("songs", songId, { archivedAt: nowIso() });
    return ok({ id: songId });
  });
}

export interface SetlistEntryInput {
  eventId: Id;
  /** null = liste commune a l'evenement, qui n'a pas de sous-evenement. */
  sessionId: Id | null;
  sequence: string;
  songId?: Id | null;
  freeTitle?: string | null;
  links?: string[];
  notes?: string | null;
}

export async function addSetlistItem(
  communityId: Id,
  input: SetlistEntryInput,
): Promise<Result<{ id: Id }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const event = await tx.selectOne("events", {
      where: { id: input.eventId, communityId },
    });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (input.sessionId !== null) {
      const session = await tx.selectOne("event_sessions", {
        where: { id: input.sessionId, eventId: event.id },
      });
      if (!session) {
        return err("sous_evenement_inconnu", "Sous-evenement introuvable.");
      }
    }
    await requireCommunityAction(communityId, "evenement.modifier", {
      eventState: event.state,
    });

    if (!input.songId && !(input.freeTitle ?? "").trim()) {
      return err("chant_requis", "Choisissez un chant ou saisissez un titre.");
    }

    const existing = (
      await tx.select("setlist_items", { where: { eventId: event.id } })
    ).filter((i) => i.sessionId === input.sessionId);
    const id = newId();
    await tx.insert("setlist_items", {
      id,
      communityId,
      eventId: event.id,
      sessionId: input.sessionId,
      sequence: input.sequence.trim() || `Chant ${existing.length + 1}`,
      order: existing.length + 1,
      songId: input.songId ?? null,
      freeTitle: input.freeTitle?.trim() || null,
      links: sanitizeLinks(input.links ?? []),
      notes: input.notes?.trim() || null,
    });
    return ok({ id });
  });
}

/**
 * Deplace un element d'un rang vers le haut ou vers le bas.
 *
 * Le reordonnancement se fait par boutons plutot que par glisser-deposer :
 * c'est utilisable au clavier et sur un telephone.
 */
export async function moveSetlistItem(
  communityId: Id,
  itemId: Id,
  direction: "haut" | "bas",
): Promise<Result<{ order: number }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const item = await tx.selectOne("setlist_items", {
      where: { id: itemId, communityId },
    });
    if (!item) return err("element_inconnu", "Element introuvable.");
    const event = await tx.selectOne("events", { where: { id: item.eventId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    await requireCommunityAction(communityId, "evenement.modifier", {
      eventState: event.state,
    });

    const fratrie = (
      await tx.select("setlist_items", { where: { eventId: item.eventId } })
    )
      .filter((i) => i.sessionId === item.sessionId)
      .sort((a, b) => a.order - b.order);

    const position = fratrie.findIndex((i) => i.id === itemId);
    const cible = direction === "haut" ? position - 1 : position + 1;
    if (position < 0 || cible < 0 || cible >= fratrie.length) {
      return err(
        "deplacement_impossible",
        direction === "haut"
          ? "Cet element est deja en premier."
          : "Cet element est deja en dernier.",
      );
    }

    // Les rangs sont reecrits de 1 a n : l'ordre reste contigu meme apres des
    // suppressions anterieures.
    const reordonne = [...fratrie];
    const [deplace] = reordonne.splice(position, 1);
    reordonne.splice(cible, 0, deplace!);
    for (const [index, element] of reordonne.entries()) {
      if (element.order !== index + 1) {
        await tx.update("setlist_items", element.id, { order: index + 1 });
      }
    }

    return ok({ order: cible + 1 });
  });
}

export async function removeSetlistItem(
  communityId: Id,
  itemId: Id,
): Promise<Result<{ id: Id }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const item = await tx.selectOne("setlist_items", {
      where: { id: itemId, communityId },
    });
    if (!item) return err("element_inconnu", "Element introuvable.");
    const event = await tx.selectOne("events", { where: { id: item.eventId } });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    await requireCommunityAction(communityId, "evenement.modifier", {
      eventState: event.state,
    });
    await tx.remove("setlist_items", itemId);
    return ok({ id: itemId });
  });
}

/**
 * Copie la liste d'une occurrence vers une autre, dans le meme evenement.
 * Le partage est explicite : les deux listes deviennent independantes et
 * peuvent etre adaptees. `null` designe l'evenement lui-meme.
 */
export async function copySetlist(
  communityId: Id,
  eventId: Id,
  cibles: { source: Id | null; cible: Id | null },
): Promise<Result<{ copied: number }>> {
  const adapter = getDataAdapter();
  return adapter.transaction(async (tx) => {
    const event = await tx.selectOne("events", {
      where: { id: eventId, communityId },
    });
    if (!event) return err("evenement_inconnu", "Evenement introuvable.");
    if (cibles.source === cibles.cible) {
      return err("meme_occurrence", "Choisissez deux occurrences differentes.");
    }
    const sessions = await tx.select("event_sessions", { where: { eventId } });
    for (const id of [cibles.source, cibles.cible]) {
      if (id !== null && !sessions.some((s) => s.id === id)) {
        return err("sous_evenement_inconnu", "Sous-evenement introuvable.");
      }
    }
    await requireCommunityAction(communityId, "evenement.modifier", {
      eventState: event.state,
    });

    const tous = await tx.select("setlist_items", { where: { eventId } });
    const items = tous.filter((i) => i.sessionId === cibles.source);
    for (const existant of tous.filter((i) => i.sessionId === cibles.cible)) {
      await tx.remove("setlist_items", existant.id);
    }
    const copies: SetlistItem[] = items.map((i) => ({
      ...i,
      id: newId(),
      eventId,
      sessionId: cibles.cible,
    }));
    await tx.insertMany("setlist_items", copies);
    return ok({ copied: copies.length });
  });
}
