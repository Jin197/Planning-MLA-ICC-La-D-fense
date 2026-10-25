import type { Metadata } from "next";
import Link from "next/link";
import { requireCommunityAction } from "@/server/auth/context";
import {
  getCommunity,
  getTemplate,
  listSkills,
} from "@/server/services/communities";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/primitives";
import { EditeurModele } from "./editeur-modele";

export const metadata: Metadata = { title: "Parametres de la communaute" };

const LIBELLES_TYPE: Record<string, string> = {
  texte: "Texte",
  texte_long: "Texte long",
  lieu: "Lieu",
  creneau_horaire: "Date et heure du creneau",
  dress_code: "Dress-code",
  repetition_lieu: "Lieu de repetition",
  repetition_horaire: "Date et heures de repetition",
  poste: "Poste affectable",
};

export default async function PageParametres({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  await requireCommunityAction(communityId, "communaute.gerer_modele");

  const [community, template, competences] = await Promise.all([
    getCommunity(communityId),
    getTemplate(communityId),
    listSkills(communityId),
  ]);

  const champs = template?.fields ?? [];
  const postes = champs.filter((f) => f.assignable && f.archivedAt === null);
  const metadonnees = champs.filter((f) => !f.assignable);
  const archives = champs.filter((f) => f.archivedAt !== null);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">{community?.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">Parametres</h1>
        <p className="mt-1 max-w-prose text-sm text-nuit-doux">
          Modele de planning et competences. Fuseau de la communaute :{" "}
          {community?.timezone}.
        </p>
      </header>

      <Alerte ton="info" titre="Portee d'une modification du modele">
        Une modification du modele s&apos;applique aux nouveaux plans. Les plans
        deja crees gardent leurs postes, leurs libelles et leurs affectations :
        les modifier demande une action explicite depuis l&apos;evenement
        concerne.
      </Alerte>

      <Card>
        <CardHeader
          titre="Informations non affectables"
          sousTitre="Metadonnees, consigne vestimentaire et rendez-vous. Ces champs ne recoivent jamais de selecteur de membres."
        />
        <CardBody>
          <ul className="flex flex-wrap gap-2">
            {metadonnees.map((champ) => (
              <li key={champ.id}>
                <Badge ton="neutre" titre={LIBELLES_TYPE[champ.kind] ?? champ.kind}>
                  {champ.label}
                </Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <EditeurModele
        communityId={communityId}
        version={template?.version ?? 1}
        postes={postes.map((p) => ({
          id: p.id,
          label: p.label,
          minRequired: p.minRequired,
          order: p.order,
        }))}
        suggestions={template?.suggestedRoles ?? []}
      />

      {archives.length > 0 ? (
        <Card>
          <CardHeader
            titre="Postes archives"
            sousTitre="Conserves parce qu'ils sont encore utilises dans l'historique."
          />
          <CardBody>
            <ul className="flex flex-wrap gap-2">
              {archives.map((champ) => (
                <li key={champ.id}>
                  <Badge ton="neutre">{champ.label}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          titre="Equipes"
          sousTitre="Elles ne se gerent pas ici."
        />
        <CardBody>
          <p className="max-w-prose text-sm text-nuit-doux">
            Une equipe appartient a un evenement : elle se cree dans
            l&apos;evenement concerne, avec son effectif et ses rattachements,
            et disparait avec lui. Ouvrez un evenement puis son onglet
            « Equipes et postes ». Les competences, elles, restent attachees aux
            personnes et se reglent depuis la page{" "}
            <Link href={`/c/${communityId}/membres`} className="underline">
              Membres
            </Link>
            .
          </p>
          {competences.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {competences.map((competence) => (
                <li key={competence.id}>
                  <Badge ton="neutre">{competence.label}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
