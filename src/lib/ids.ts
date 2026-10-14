import { randomUUID, createHash } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

/**
 * Cle stable derivee d'un contenu : sert aux cles d'idempotence de l'outbox
 * et a la deduplication des lignes d'import.
 */
export function stableKey(...parts: (string | number | null | undefined)[]): string {
  const h = createHash("sha256");
  h.update(parts.map((p) => String(p ?? "")).join("\u0000"));
  return h.digest("hex").slice(0, 32);
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Retire les accents sans perdre l'information lisible. */
export function deaccent(input: string): string {
  return input.normalize("NFD").replace(COMBINING_MARKS, "");
}

/** Slug lisible pour les URL publiques des communautes. */
export function slugify(input: string): string {
  return deaccent(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
