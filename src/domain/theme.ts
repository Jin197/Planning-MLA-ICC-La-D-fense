/**
 * Apparence de l'interface : valeurs et libelles partages par le serveur et
 * les composants clients.
 *
 * Ce module ne depend de rien cote serveur, pour pouvoir etre importe depuis
 * un composant client. La lecture et l'ecriture du cookie vivent dans
 * `src/server/theme.ts`.
 */
export const THEMES = ["sombre", "clair"] as const;
export type Theme = (typeof THEMES)[number];

/** Le sombre est le choix par defaut. */
export const THEME_PAR_DEFAUT: Theme = "sombre";

export const LIBELLES_THEME: Record<Theme, string> = {
  sombre: "Sombre",
  clair: "Clair",
};

export const DESCRIPTIONS_THEME: Record<Theme, string> = {
  sombre: "Fond bleu nuit, texte ivoire. Confortable en soiree et en studio.",
  clair: "Fond ivoire, texte bleu nuit. Plus lisible en pleine lumiere.",
};

export function estTheme(valeur: string | undefined): valeur is Theme {
  return valeur === "sombre" || valeur === "clair";
}

/** Valeur de l'attribut `data-theme` attendue par la feuille de style. */
export function attributTheme(theme: Theme): "dark" | "light" {
  return theme === "sombre" ? "dark" : "light";
}
