import type { Metadata } from "next";
import { requireCommunityAction } from "@/server/auth/context";
import { chargerPreview, listerImports } from "@/server/import/service";
import { listMembers, getCommunity } from "@/server/services/communities";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  GrilleDefilante,
} from "@/components/ui/primitives";
import { FormulaireAnalyse, PanneauPreview } from "./formulaires";

export const metadata: Metadata = { title: "Import du classeur" };

const ETAPES = [
  "Charger",
  "Analyser",
  "Previsualiser",
  "Rapprocher",
  "Valider",
  "Importer",
] as const;

export default async function PageImport({
  params,
  searchParams,
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { communityId } = await params;
  const query = await searchParams;
  await requireCommunityAction(communityId, "communaute.importer");

  const [community, imports, membres] = await Promise.all([
    getCommunity(communityId),
    listerImports(communityId),
    listMembers(communityId),
  ]);

  const jobId = query.job ?? imports[0]?.id ?? null;
  const preview = jobId ? await chargerPreview(communityId, jobId) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">{community?.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">
          Import du classeur Excel
        </h1>
        <p className="mt-1 max-w-prose text-sm text-nuit-doux">
          Reserve aux admins de cette communaute. Le parcours est : charger,
          analyser, previsualiser, rapprocher, valider, importer. Selectionner un
          fichier n&apos;ecrit rien.
        </p>
      </header>

      <Card>
        <CardBody>
          <ol className="flex flex-wrap gap-2 text-sm">
            {ETAPES.map((etape, index) => (
              <li key={etape} className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-clair text-xs font-semibold text-indigo-fonce">
                  {index + 1}
                </span>
                {etape}
                {index < ETAPES.length - 1 ? (
                  <span aria-hidden="true" className="text-nuit-tres-doux">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Alerte ton="attention" titre="Ce que l'import ne fait pas">
        <ul className="mt-1 list-inside list-disc space-y-1">
          <li>
            Aucun compte n&apos;est cree : le classeur ne fournit pas les emails.
            Les personnes non rapprochees restent des fiches importees.
          </li>
          <li>
            Aucune adhesion n&apos;est deduite d&apos;une egalite de nom, et deux
            lignes ressemblantes ne sont jamais fusionnees automatiquement.
          </li>
          <li>
            Les evenements arrivent en brouillon, avec des horaires marques
            « a definir » : ils bloquent la publication jusqu&apos;a saisie.
          </li>
          <li>
            Les disponibilites importees sont marquees « a reconfirmer » et les
            affectations « a confirmer » : rien n&apos;est suppose accepte.
          </li>
        </ul>
      </Alerte>

      <Card>
        <CardHeader
          titre="1. Charger et analyser"
          sousTitre="Classeur .xlsx, 12 Mo maximum. L'analyse reste en zone de staging."
        />
        <CardBody>
          <FormulaireAnalyse communityId={communityId} />
        </CardBody>
      </Card>

      {imports.length > 0 ? (
        <Card>
          <CardHeader titre="Imports precedents" />
          <CardBody>
            <GrilleDefilante legende="Historique des imports">
              <table className="min-w-max text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Fichier
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Etat
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Annee retenue
                    </th>
                    <th scope="col" className="border-b border-bordure px-3 py-2 text-left">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((job) => (
                    <tr key={job.id} className="even:bg-ivoire-fonce/40">
                      <td className="border-b border-bordure px-3 py-2">
                        <a
                          href={`/c/${communityId}/import?job=${job.id}`}
                          className="text-indigo-accent underline"
                        >
                          {job.filename}
                        </a>
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        <Badge ton={job.state === "importe" ? "dispo" : "attente"}>
                          {job.state}
                        </Badge>
                      </td>
                      <td className="border-b border-bordure px-3 py-2">
                        {job.assumedYear ?? "a definir"}
                      </td>
                      <td className="border-b border-bordure px-3 py-2 whitespace-nowrap">
                        {new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                          hour12: false,
                        }).format(new Date(job.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GrilleDefilante>
          </CardBody>
        </Card>
      ) : null}

      {preview === null ? (
        <Card>
          <CardBody>
            <EtatVide
              titre="Aucune analyse en cours"
              description="Chargez un classeur pour voir la previsualisation."
            />
          </CardBody>
        </Card>
      ) : preview.ok ? (
        <PanneauPreview
          communityId={communityId}
          preview={preview.value}
          membres={membres
            .filter((m) => m.status === "active")
            .map((m) => ({
              membershipId: m.membershipId,
              nom: `${m.firstName} ${m.lastName}`,
            }))}
        />
      ) : (
        <Alerte ton="erreur">{preview.message}</Alerte>
      )}
    </div>
  );
}
