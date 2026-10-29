import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/context";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { FormulaireInscription } from "./formulaire";

export const metadata: Metadata = { title: "Creer un compte" };

export default async function PageInscription() {
  const session = await getSession();
  if (session) redirect("/accueil");

  return (
    <Card>
      <CardHeader
        niveau={1}
        titre="Creer un compte"
        sousTitre="Quelques informations suffisent. Vous choisirez vos communautes ensuite."
      />
      <CardBody>
        <FormulaireInscription />
        <p className="mt-6 text-sm text-nuit-doux">
          Deja un compte ?{" "}
          <Link href="/connexion" className="text-accent underline">
            Se connecter
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
