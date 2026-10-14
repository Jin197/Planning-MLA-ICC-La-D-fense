import { MapPin } from "lucide-react";
import {
  durationMinutes,
  formatDurationHuman,
  formatRange,
  localDayKey,
} from "@/lib/time";
import type { EventDetail } from "@/server/services/events";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { RepondreRepetition } from "./repondre-repetition";

/**
 * Repetitions : rendez-vous dates distincts, avec leurs propres reponses de
 * disponibilite. Une disponibilite du jour ne vaut pas pour la repetition.
 */
export function OngletRepetitions({
  communityId,
  vue,
}: {
  communityId: string;
  vue: EventDetail;
}) {
  const ouvert = vue.event.state === "collecte" || vue.event.state === "publie";

  return (
    <div className="space-y-6">
      <Alerte ton="info" titre="Reponses distinctes">
        Les repetitions ont leurs propres reponses : etre disponible un dimanche
        ne signifie pas etre disponible a la repetition du vendredi.
      </Alerte>

      {vue.rehearsals.length === 0 ? (
        <Card>
          <CardBody>
            <EtatVide
              titre="Aucune repetition pour cet evenement"
              description={
                vue.isAdmin
                  ? "Ajoutez les repetitions depuis la creation ou la modification de l'evenement."
                  : "Les repetitions apparaitront ici des qu'elles seront planifiees."
              }
            />
          </CardBody>
        </Card>
      ) : (
        vue.rehearsals.map((repetition) => {
          const franchitMinuit =
            localDayKey(repetition.endsAt, vue.event.timezone) !==
            localDayKey(repetition.startsAt, vue.event.timezone);
          const equipes = repetition.teamIds
            .map((id) => vue.teams.find((t) => t.id === id)?.name)
            .filter((n): n is string => Boolean(n));

          return (
            <Card key={repetition.id}>
              <CardHeader
                titre={repetition.label}
                sousTitre={formatRange(
                  repetition.startsAt,
                  repetition.endsAt,
                  vue.event.timezone,
                )}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Badge ton="neutre">
                      {formatDurationHuman(
                        durationMinutes(repetition.startsAt, repetition.endsAt),
                      )}
                    </Badge>
                    {franchitMinuit ? (
                      <Badge ton="alerte">Se termine le lendemain</Badge>
                    ) : null}
                  </div>
                }
              />
              <CardBody className="space-y-4">
                <div className="space-y-1 text-sm">
                  {repetition.locationName ? (
                    <p className="inline-flex items-center gap-1.5 text-nuit-doux">
                      <MapPin aria-hidden="true" className="size-3.5" />
                      {repetition.locationName}
                      {repetition.locationAddress
                        ? ` - ${repetition.locationAddress}`
                        : ""}
                      {repetition.room ? ` (${repetition.room})` : ""}
                    </p>
                  ) : null}
                  {equipes.length > 0 ? (
                    <p className="text-nuit-doux">
                      Equipes concernees : {equipes.join(", ")}
                    </p>
                  ) : (
                    <p className="text-nuit-doux">Toutes les equipes.</p>
                  )}
                </div>

                {ouvert ? (
                  <RepondreRepetition
                    communityId={communityId}
                    eventId={vue.event.id}
                    rehearsalId={repetition.id}
                    etatActuel={
                      repetition.myAvailability
                        ? repetition.myAvailability.needsReconfirmation
                          ? "a_reconfirmer"
                          : (repetition.myAvailability.answer as
                              | "disponible"
                              | "indisponible")
                        : "a_renseigner"
                    }
                  />
                ) : (
                  <p className="text-sm text-nuit-doux">
                    Les reponses ne sont pas ouvertes dans cet etat.
                  </p>
                )}
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
