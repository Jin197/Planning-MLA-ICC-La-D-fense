import { formatRange } from "@/lib/time";
import type { EventDetail } from "@/server/services/events";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { AjouterSousEvenement } from "./ajouter-sous-evenement";
import { EditeurCreneau } from "./editeur-creneau";
import { EquipesAdmin } from "./equipes-admin";
import { FeuillePostes } from "./feuille-postes";

/**
 * Equipes et postes.
 *
 * La lecture suit la structure de l'evenement : chaque occurrence — un
 * sous-evenement, ou l'evenement lui-meme s'il n'en a aucun — montre les
 * equipes qui y servent, puis viennent les equipes qui couvrent toute la
 * duree de l'evenement.
 */
export function OngletEquipes({
  communityId,
  vue,
  membres,
}: {
  communityId: string;
  vue: EventDetail;
  membres: { membershipId: string; name: string }[];
}) {
  if (!vue.canSeePlan) {
    return (
      <Card>
        <CardHeader titre="Equipes et postes" />
        <CardBody>
          <EtatVide
            titre="Plan non encore publie"
            description="Pendant la collecte, les affectations en preparation restent reservees aux admins. Vous verrez le plan complet des sa publication."
          />
        </CardBody>
      </Card>
    );
  }

  const sousEvenements = vue.sessions.map((session) => ({
    sessionId: session.id as string | null,
    label: session.label,
  }));

  return (
    <div className="space-y-6">
      {vue.isAdmin ? (
        <>
          <EquipesAdmin
            communityId={communityId}
            eventId={vue.event.id}
            version={vue.event.version}
            equipes={vue.teams}
            sousEvenements={sousEvenements}
            membres={membres}
          />
          <AjouterSousEvenement
            communityId={communityId}
            eventId={vue.event.id}
            version={vue.event.version}
            equipes={vue.teams.map((t) => ({ id: t.id, name: t.name }))}
            premier={vue.sessions.length === 0}
          />
        </>
      ) : null}

      {vue.occurrences.map((occurrence) => (
        <Card key={occurrence.sessionId ?? "evenement"}>
          <CardHeader
            titre={
              occurrence.sessionId === null
                ? "Programme de l'evenement"
                : occurrence.label
            }
            sousTitre={
              occurrence.scheduleProvisional
                ? "Horaire a definir avant publication."
                : formatRange(
                    occurrence.startsAt,
                    occurrence.endsAt,
                    vue.event.timezone,
                  )
            }
            actions={
              <Badge ton="neutre">
                {occurrence.plans.length} equipe(s)
              </Badge>
            }
          />
          <CardBody className="space-y-6">
            {vue.isAdmin && occurrence.sessionId !== null ? (
              <EditeurCreneau
                communityId={communityId}
                eventId={vue.event.id}
                version={vue.event.version}
                session={
                  vue.sessions.find((s) => s.id === occurrence.sessionId)!
                }
                timezone={vue.event.timezone}
              />
            ) : null}

            {occurrence.plans.length === 0 ? (
              <EtatVide
                titre={
                  occurrence.sessionId === null
                    ? "Aucune equipe sur cet evenement"
                    : "Aucune equipe sur ce sous-evenement"
                }
                description="Un admin cree une equipe et la rattache ici ; elle recoit alors la feuille de postes du modele."
              />
            ) : (
              occurrence.plans.map((plan) => (
                <FeuillePostes
                  key={plan.id}
                  communityId={communityId}
                  eventId={vue.event.id}
                  plan={plan}
                  estAdmin={vue.isAdmin}
                />
              ))
            )}
          </CardBody>
        </Card>
      ))}

      {vue.eventWidePlans.length > 0 ? (
        <Card>
          <CardHeader
            titre="Sur toute la duree de l'evenement"
            sousTitre="Ces equipes ne sont pas rattachees a un sous-evenement en particulier."
          />
          <CardBody className="space-y-6">
            {vue.eventWidePlans.map((plan) => (
              <FeuillePostes
                key={plan.id}
                communityId={communityId}
                eventId={vue.event.id}
                plan={plan}
                estAdmin={vue.isAdmin}
              />
            ))}
          </CardBody>
        </Card>
      ) : null}

      {vue.isAdmin ? (
        <Alerte ton="info" titre="Affectations multiples">
          Un poste accueille plusieurs personnes, et une personne peut tenir
          plusieurs postes compatibles sur une meme occurrence. Les doublons
          exacts sont refuses et les incompatibilites d&apos;instruments
          declenchent une alerte.
        </Alerte>
      ) : null}
    </div>
  );
}
