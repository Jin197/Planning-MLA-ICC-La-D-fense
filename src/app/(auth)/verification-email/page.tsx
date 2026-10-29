import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { isDemoMode } from "@/server/data";
import Link from "next/link";
import { FormulaireVerification } from "./formulaire";

export const metadata: Metadata = { title: "Verifier mon email" };

export default async function PageVerification({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader
        niveau={1}
        titre="Verifier mon email"
        sousTitre="La verification est necessaire pour creer une communaute."
      />
      <CardBody className="space-y-4">
        <FormulaireVerification jeton={params.jeton ?? ""} />
        {isDemoMode() ? (
          <p className="text-sm text-nuit-doux">
            Aucun fournisseur d&apos;email n&apos;est configure. Les jetons en
            attente sont listes dans la{" "}
            <Link href="/dev/boite-mail" className="text-accent underline">
              boite de developpement
            </Link>
            .
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
