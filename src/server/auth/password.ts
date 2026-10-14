import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Exigences minimales du mot de passe. Volontairement simples et explicites :
 * une regle que l'utilisateur comprend vaut mieux qu'un score opaque.
 */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 10) {
    issues.push("Au moins 10 caracteres.");
  }
  if (!/[a-zA-Z]/.test(password)) issues.push("Au moins une lettre.");
  if (!/\d/.test(password)) issues.push("Au moins un chiffre.");
  return issues;
}
