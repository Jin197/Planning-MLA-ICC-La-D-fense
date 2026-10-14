import { NextResponse } from "next/server";
import { readMoodboard } from "@/server/services/dresscode";

/**
 * Sert un visuel de moodboard apres verification de l'adhesion.
 *
 * Les fichiers vivent en dehors de `public/` : ils ne sont jamais accessibles
 * sans passer par ce controle. La reponse est privee et non mise en cache
 * partage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ communityId: string; assetId: string }> },
): Promise<NextResponse> {
  const { communityId, assetId } = await params;

  try {
    const result = await readMoodboard(communityId, assetId);
    if (!result.ok) {
      return NextResponse.json({ erreur: result.message }, { status: 404 });
    }
    return new NextResponse(result.value.contenu as unknown as BodyInit, {
      headers: {
        "Content-Type": result.value.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(result.value.filename)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Aucune indication sur l'existence du visuel pour qui n'y a pas droit.
    return NextResponse.json({ erreur: "Visuel indisponible." }, { status: 403 });
  }
}
