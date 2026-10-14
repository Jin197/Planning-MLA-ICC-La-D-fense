import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/context";

export default async function Racine() {
  const session = await getSession();
  redirect(session ? "/accueil" : "/connexion");
}
