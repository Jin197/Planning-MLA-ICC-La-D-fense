import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { FormulaireReinitialisation } from "./formulaire";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function PageReinitialisation({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card>
      <CardHeader niveau={1} titre="Nouveau mot de passe" />
      <CardBody>
        <FormulaireReinitialisation jeton={params.jeton ?? ""} />
      </CardBody>
    </Card>
  );
}
