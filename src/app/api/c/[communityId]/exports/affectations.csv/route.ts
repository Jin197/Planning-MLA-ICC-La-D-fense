import { NextResponse } from "next/server";
import { exportAssignmentsCsv } from "@/server/services/exports";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ communityId: string }> },
): Promise<NextResponse> {
  const { communityId } = await params;
  try {
    const csv = await exportAssignmentsCsv(communityId);
    // BOM : Excel en configuration francaise lit alors correctement l'UTF-8.
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="affectations.csv"',
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Export indisponible.";
    return NextResponse.json({ erreur: message }, { status: 403 });
  }
}
