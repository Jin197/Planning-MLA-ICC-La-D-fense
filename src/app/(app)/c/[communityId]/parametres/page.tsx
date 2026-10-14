import type { Metadata } from "next";
import { requireCommunityAction } from "@/server/auth/context";
import {
  getCommunity,
  getTemplate,
  listMembers,
  listSkills,
  listTeams,
} from "@/server/services/communities";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/primitives";
import { EditeurModele } from "./editeur-modele";
import { GestionEquipes } from "./gestion-equipes";

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

  const [community, template, equipes, membres, competences] = await Promise.all([
    getCommunity(communityId),
    getTemplate(communityId),
    listTeams(communityId),
    listMembers(communityId),
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
          Modele de planning, equipes et competences. Fuseau de la communaute :{" "}
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

      <GestionEquipes
        communityId={communityId}
        equipes={equipes.map((e) => ({ id: e.id, name: e.name }))}
        membres={membres
          .filter((m) => m.status === "active")
          .map((m) => ({
            membershipId: m.membershipId,
            nom: `${m.firstName} ${m.lastName}`,
            equipes: m.teams,
          }))}
        competences={competences.map((c) => c.label)}
      />
    </div>
  );
}
