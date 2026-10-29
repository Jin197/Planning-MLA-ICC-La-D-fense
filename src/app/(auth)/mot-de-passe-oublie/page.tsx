import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { FormulaireOubli } from "./formulaire";

export const metadata: Metadata = { title: "Mot de passe oublie" };

export default function PageOubli() {
  return (
    <Card>
      <CardHeader
        niveau={1}
        titre="Mot de passe oublie"
        sousTitre="Indiquez votre email pour recevoir un lien de reinitialisation."
      />
      <CardBody className="space-y-4">
        <FormulaireOubli />
        <p className="text-sm">
          <Link href="/connexion" className="text-accent underline">
            Retour a la connexion
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
