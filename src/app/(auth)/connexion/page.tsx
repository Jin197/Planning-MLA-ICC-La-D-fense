import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/context";
import { isDemoMode } from "@/server/data";
import { Card, CardBody, CardHeader, Alerte } from "@/components/ui/primitives";
import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ reinitialise?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/accueil");
  const params = await searchParams;

  return (
    <div className="space-y-5">
      {params.reinitialise ? (
        <Alerte ton="succes" titre="Mot de passe mis a jour">
          Vous pouvez vous connecter avec votre nouveau mot de passe.
        </Alerte>
      ) : null}

      <Card>
        <CardHeader
          niveau={1}
          titre="Connexion"
          sousTitre="Votre email est votre identifiant."
        />
        <CardBody>
          <FormulaireConnexion />
          <div className="mt-6 space-y-2 text-sm">
            <p>
              <Link href="/mot-de-passe-oublie" className="text-accent underline">
                Mot de passe oublie
              </Link>
            </p>
            <p className="text-nuit-doux">
              Pas encore de compte ?{" "}
              <Link href="/inscription" className="text-accent underline">
                Creer un compte
              </Link>
            </p>
          </div>
        </CardBody>
      </Card>

      {isDemoMode() ? (
        <Card>
          <CardHeader
            titre="Comptes de demonstration"
            sousTitre="Donnees fictives. Mot de passe commun : diapason2026"
          />
          <CardBody className="text-sm">
            <ul className="space-y-1.5">
              <li>
                <code className="rounded bg-ivoire-fonce px-1.5 py-0.5">
                  noa.bertrand@exemple.test
                </code>{" "}
                - admin du MLA
              </li>
              <li>
                <code className="rounded bg-ivoire-fonce px-1.5 py-0.5">
                  elias.marchand@exemple.test
                </code>{" "}
                - membre du MLA
              </li>
              <li>
                <code className="rounded bg-ivoire-fonce px-1.5 py-0.5">
                  gaspard.nguema@exemple.test
                </code>{" "}
                - membre de deux ministeres
              </li>
              <li>
                <code className="rounded bg-ivoire-fonce px-1.5 py-0.5">
                  anaelle.rakoto@exemple.test
                </code>{" "}
                - sans adhesion
              </li>
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
