import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lit le jeu de donnees fictif installe par le global setup, pour viser
 * directement les URL des communautes et des evenements.
 */
interface Instantane {
  communities: { id: string; name: string; type: string }[];
  events: { id: string; communityId: string; title: string; state: string }[];
}

function lire(): Instantane {
  const fichier =
    process.env.DIAPASON_DEMO_FILE ?? join(".data", "diapason-e2e.json");
  return JSON.parse(readFileSync(fichier, "utf8")) as Instantane;
}

export function communauteMla(): { id: string; name: string } {
  const instantane = lire();
  const communaute = instantane.communities.find((c) => c.type === "MLA");
  if (!communaute) throw new Error("Communaute MLA absente du jeu de donnees.");
  return { id: communaute.id, name: communaute.name };
}

export function evenement(fragmentDuTitre: string): {
  id: string;
  communityId: string;
  state: string;
} {
  const instantane = lire();
  const trouve = instantane.events.find((e) => e.title.includes(fragmentDuTitre));
  if (!trouve) {
    throw new Error(`Evenement « ${fragmentDuTitre} » absent du jeu de donnees.`);
  }
  return {
    id: trouve.id,
    communityId: trouve.communityId,
    state: trouve.state,
  };
}

export function urlPlanning(vue?: "agenda" | "calendrier" | "tableau"): string {
  const { id } = communauteMla();
  return vue ? `/c/${id}/planning?vue=${vue}` : `/c/${id}/planning`;
}

export function urlEvenement(fragmentDuTitre: string, onglet?: string): string {
  const cible = evenement(fragmentDuTitre);
  const base = `/c/${cible.communityId}/evenements/${cible.id}`;
  return onglet ? `${base}?onglet=${onglet}` : base;
}
