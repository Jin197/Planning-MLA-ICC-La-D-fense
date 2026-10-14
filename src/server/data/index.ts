import "server-only";
import type { DataAdapter } from "./port";
import { demoAdapter } from "./demo/adapter";
import { createSupabaseAdapter } from "./supabase/adapter";

/**
 * Selection de l'adaptateur. Les donnees fictives et les comptes reels ne se
 * melangent jamais : un seul adaptateur est actif par deploiement.
 */
export type AdapterKind = "demo" | "supabase";

export function configuredAdapterKind(): AdapterKind {
  return process.env.DIAPASON_DATA_ADAPTER === "supabase" ? "supabase" : "demo";
}

export function isDemoMode(): boolean {
  return configuredAdapterKind() === "demo";
}

export function getDataAdapter(accessToken?: string | null): DataAdapter {
  if (configuredAdapterKind() === "demo") return demoAdapter;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "DIAPASON_DATA_ADAPTER=supabase requiert NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createSupabaseAdapter({
    url,
    publishableKey: key,
    accessToken: accessToken ?? null,
  });
}

export type { DataAdapter, Tx } from "./port";
