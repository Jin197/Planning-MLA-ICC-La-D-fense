import "server-only";
import { cookies } from "next/headers";
import { estTheme, THEME_PAR_DEFAUT, type Theme } from "@/domain/theme";

/**
 * Lecture et ecriture de la preference d'apparence.
 *
 * Elle est lue cote serveur avant le premier rendu : l'attribut est pose
 * directement sur <html>, donc aucune page ne s'affiche brievement dans le
 * mauvais theme.
 *
 * Le choix est stocke dans un cookie et non en base : c'est une preference
 * d'appareil. La meme personne peut vouloir le sombre sur son telephone le
 * soir et le clair sur l'ordinateur du studio.
 *
 * Les valeurs et les libelles vivent dans `src/domain/theme.ts`, pour rester
 * importables depuis un composant client.
 */
const COOKIE_NAME = "diapason_theme";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function readTheme(): Promise<Theme> {
  const store = await cookies();
  const valeur = store.get(COOKIE_NAME)?.value;
  return estTheme(valeur) ? valeur : THEME_PAR_DEFAUT;
}

/**
 * A appeler depuis une action serveur ou une route : HTTP n'autorise pas de
 * poser un cookie une fois le flux de reponse commence.
 */
export async function writeTheme(theme: Theme): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, theme, {
    // Pas de donnee personnelle : lisible par le navigateur sans souci.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
