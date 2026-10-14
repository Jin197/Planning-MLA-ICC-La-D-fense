import { NextResponse } from "next/server";
import { logout } from "@/server/services/accounts";

export async function POST(request: Request): Promise<NextResponse> {
  await logout();
  return NextResponse.redirect(new URL("/connexion", request.url), 303);
}
