/**
 * Sequences initiales d'une liste de chants. Partagees par le serveur et
 * l'interface : ce module ne depend de rien cote serveur.
 */
export const DEFAULT_SEQUENCES = [
  "Chant 1",
  "Chant 2",
  "Chant 3",
  "Sainte Cene",
  "Offrandes",
] as const;

export type Sequence = (typeof DEFAULT_SEQUENCES)[number];

/** Un lien de chant est une ressource externe : seules http(s) sont acceptees. */
export function isExternalResourceLink(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
