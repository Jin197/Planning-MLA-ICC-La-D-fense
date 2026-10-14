import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Session de l'adaptateur de demonstration : un cookie signe HttpOnly.
 * Le chemin Supabase utilise Auth et `@supabase/ssr` ; aucune des deux voies
 * ne lit un role envoye par le navigateur.
 */
const COOKIE_NAME = "diapason_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function secret(): string {
  const value = process.env.DIAPASON_SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DIAPASON_SESSION_SECRET est requis en production (32 octets aleatoires).",
    );
  }
  // Developpement uniquement : evite de bloquer un premier lancement.
  return "diapason-developpement-secret-non-destine-a-la-production";
}

interface SessionPayload {
  userId: string;
  issuedAt: number;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof parsed.userId !== "string") return null;
    if (Date.now() - parsed.issuedAt > MAX_AGE_SECONDS * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode({ userId, issuedAt: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return decode(raw)?.userId ?? null;
}
