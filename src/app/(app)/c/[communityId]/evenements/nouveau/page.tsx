import type { Metadata } from "next";
import Link from "next/link";
import { requireCommunityAction } from "@/server/auth/context";
import { getCommunity, listTeams, getTemplate } from "@/server/services/communities";
import { Alerte, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { FormulaireEvenement } from "./formulaire";

export const metadata: Metadata = { title: "Nouvel evenement" };

export default async function PageNouvelEvenement({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  await requireCommunityAction(communityId, "evenement.creer");

  const [community, teams, template] = await Promise.all([
    getCommunity(communityId),
    listTeams(communityId),
    getTemplate(communityId),
  ]);

  const postes = (template?.fields ?? []).filter(
    (f) => f.assignable && f.archivedAt === null,
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">
          <Link href={`/c/${communityId}/planning`} className="underline">
            {community?.name}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Nouvel evenement</h1>
        <p className="mt-1 max-w-prose text-sm text-nuit-doux">
          Une journee peut comporter plusieurs creneaux avec des horaires et des
          affectations differents. Les postes du modele sont copies
          automatiquement dans chaque plan.
        </p>
      </header>

      {teams.length === 0 ? (
        <Alerte ton="attention" titre="Aucune equipe">
          <p>
            Creez au moins une equipe dans les{" "}
            <Link href={`/c/${communityId}/parametres`} className="underline">
              parametres de la communaute
            </Link>
            .
          </p>
        </Alerte>
      ) : null}

      <Card>
        <CardHeader
          titre="Informations, creneaux et repetitions"
          sousTitre="Chaque date est explicite : une heure seule ne permet pas de planifier."
        />
        <CardBody>
          <FormulaireEvenement
            communityId={communityId}
            equipes={teams.map((t) => ({ id: t.id, name: t.name }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre={`Postes copies du modele (${postes.length})`}
          sousTitre="Vous pourrez les renommer, les reordonner, regler leur effectif ou en desactiver pour cet evenement."
        />
        <CardBody>
          <ul className="flex flex-wrap gap-2">
            {postes.map((poste) => (
              <li
                key={poste.id}
                className="rounded-full bg-ivoire-fonce px-3 py-1 text-sm"
              >
                {poste.label}
                {poste.minRequired === 0 ? (
                  <span className="ml-1 text-xs text-nuit-tres-doux">facultatif</span>
                ) : (
                  <span className="ml-1 text-xs text-nuit-tres-doux">
                    min {poste.minRequired}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
