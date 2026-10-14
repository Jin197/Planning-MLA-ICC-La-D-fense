import { NextResponse } from "next/server";
import { isDemoMode } from "@/server/data";

/**
 * Remise a zero du jeu de donnees fictif, pour les parcours au navigateur.
 *
 * Trois verrous, cumulatifs :
 *  - uniquement avec l'adaptateur de demonstration ;
 *  - uniquement si `DIAPASON_ALLOW_TEST_RESET=1`, que seule la configuration
 *    Playwright positionne ;
 *  - uniquement hors production.
 *
 * Sans ces trois conditions, la route repond 404 et ne charge meme pas le
 * module de graines. Elle est donc inerte dans tout deploiement reel.
 */
function autorisee(): boolean {
  return (
    isDemoMode() &&
    process.env.DIAPASON_ALLOW_TEST_RESET === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function POST(): Promise<NextResponse> {
  if (!autorisee()) {
    return NextResponse.json({ erreur: "Route indisponible." }, { status: 404 });
  }

  // Import tardif : rien de tout cela n'est charge si la route est fermee.
  const [{ buildSeedSnapshot }, { replaceSnapshot }] = await Promise.all([
    import("@/server/data/demo/seed"),
    import("@/server/data/demo/store"),
  ]);

  const snapshot = await buildSeedSnapshot();
  replaceSnapshot(snapshot);

  return NextResponse.json(
    { ok: true, comptes: snapshot.profiles.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
