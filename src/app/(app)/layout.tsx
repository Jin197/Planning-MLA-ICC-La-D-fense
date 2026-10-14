import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/context";
import { loadNavigation } from "@/server/services/navigation";
import { Shell } from "@/components/app/shell";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/connexion");
  const nav = await loadNavigation();
  return <Shell nav={nav}>{children}</Shell>;
}
