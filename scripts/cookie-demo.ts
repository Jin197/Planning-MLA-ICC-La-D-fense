/**
 * Outil de developpement : imprime un cookie de session valide pour un compte
 * de la demonstration, afin de verifier les pages au navigateur ou en ligne
 * de commande. Inutile en production.
 *
 * Usage : node --conditions=react-server --import tsx scripts/cookie-demo.ts email@exemple.test
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const email = process.argv[2];
if (!email) {
  console.error("Indiquez un email.");
  process.exit(1);
}

const file = join(process.cwd(), ".data", "diapason-demo.json");
const snapshot = JSON.parse(readFileSync(file, "utf8")) as {
  profiles: { id: string; email: string }[];
};
const profile = snapshot.profiles.find((p) => p.email === email);
if (!profile) {
  console.error(`Aucun compte pour ${email}.`);
  process.exit(1);
}

const secret =
  process.env.DIAPASON_SESSION_SECRET ??
  "diapason-developpement-secret-non-destine-a-la-production";
const body = Buffer.from(
  JSON.stringify({ userId: profile.id, issuedAt: Date.now() }),
  "utf8",
).toString("base64url");
const signature = createHmac("sha256", secret).update(body).digest("base64url");
console.log(`diapason_session=${body}.${signature}`);
