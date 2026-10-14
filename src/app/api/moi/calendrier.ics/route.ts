import { NextResponse } from "next/server";
import { exportPersonalIcs } from "@/server/services/exports";

export async function GET(): Promise<NextResponse> {
  try {
    const ics = await exportPersonalIcs();
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="diapason-mes-services.ics"',
        // Donnees personnelles : jamais mises en cache partage.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Export indisponible.";
    return NextResponse.json({ erreur: message }, { status: 401 });
  }
}
