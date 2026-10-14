/**
 * Etat partage des formulaires. Les valeurs saisies sont renvoyees avec
 * l'erreur : un formulaire ne se vide jamais parce qu'un champ etait invalide.
 */
export interface FormState {
  status: "repos" | "succes" | "erreur";
  message?: string;
  /** Erreurs par champ, pour les relier avec aria-describedby. */
  champs?: Record<string, string>;
  /** Valeurs a reafficher. */
  valeurs?: Record<string, string>;
  /** Informations complementaires (identifiants crees, jetons de demo...). */
  extra?: Record<string, string>;
}

export const ETAT_INITIAL: FormState = { status: "repos" };

export function echec(
  message: string,
  options: {
    champs?: Record<string, string>;
    valeurs?: Record<string, string>;
  } = {},
): FormState {
  return { status: "erreur", message, ...options };
}

export function succes(
  message: string,
  extra?: Record<string, string>,
): FormState {
  return extra ? { status: "succes", message, extra } : { status: "succes", message };
}

export function texte(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function texteOuNull(data: FormData, name: string): string | null {
  const value = texte(data, name);
  return value === "" ? null : value;
}

export function nombre(data: FormData, name: string, defaut = 0): number {
  const value = Number(texte(data, name));
  return Number.isFinite(value) ? value : defaut;
}

export function booleen(data: FormData, name: string): boolean {
  const value = data.get(name);
  return value === "on" || value === "true" || value === "1";
}

export function liste(data: FormData, name: string): string[] {
  return data
    .getAll(name)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

/** Conserve les valeurs d'un formulaire pour les reafficher apres une erreur. */
export function valeursDe(data: FormData, noms: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const nom of noms) out[nom] = texte(data, nom);
  return out;
}
