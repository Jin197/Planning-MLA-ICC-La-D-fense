import { MapPin } from "lucide-react";
import type { EventDetail } from "@/server/services/events";
import { formatRange, formatTime } from "@/lib/time";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/primitives";
import { BadgeDisponibilite } from "@/components/app/status-badges";
import { RepondreDisponibilite } from "./repondre-disponibilite";
import { InformationsEvenement } from "./informations-evenement";
import { PanneauPublication } from "./panneau-publication";
import { BoutonSourdine } from "./bouton-sourdine";
import { MesAffectations } from "./mes-affectations";
import { SePositionner } from "./se-positionner";

export function OngletApercu({
  communityId,
  vue,
  conflits,
  enSourdine,
}: {
  communityId: string;
  vue: EventDetail;
  conflits: number;
  enSourdine: boolean;
}) {
  const ouvertAuxReponses =
    vue.event.state === "collecte" || vue.event.state === "publie";

  return (
    <div className="space-y-6">
      {vue.event.description ? (
        <Card>
          <CardHeader titre="Description" />
          <CardBody>
            <p className="whitespace-pre-line text-sm">{vue.event.description}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          titre={
            vue.sessions.length === 0 ? "Quand et ou" : "Sous-evenements"
          }
          sousTitre={
            vue.sessions.length === 0
              ? "Cet evenement est d'un seul bloc : la disponibilite porte sur lui."
              : "Une disponibilite porte sur un sous-evenement, pas sur la journee."
          }
          actions={
            <BoutonSourdine
              communityId={communityId}
              eventId={vue.event.id}
              enSourdine={enSourdine}
            />
          }
        />
        <CardBody>
          <ul className="space-y-3">
            {vue.occurrences.map((occurrence) => (
              <li
                key={occurrence.sessionId ?? "evenement"}
                className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {occurrence.label}
                      {occurrence.scheduleProvisional ? (
                        <Badge ton="alerte" className="ml-2">
                          Horaire a definir
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-nuit-doux">
                      {occurrence.scheduleProvisional
                        ? "L'horaire exact n'est pas encore fixe."
                        : formatRange(
                            occurrence.startsAt,
                            occurrence.endsAt,
                            vue.event.timezone,
                          )}
                    </p>
                    {occurrence.locationName ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-nuit-doux">
                        <MapPin aria-hidden="true" className="size-3.5" />
                        {occurrence.locationName}
                        {occurrence.locationAddress
                          ? ` - ${occurrence.locationAddress}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <BadgeDisponibilite
                      etat={
                        occurrence.myAvailability
                          ? occurrence.myAvailability.needsReconfirmation
                            ? "a_reconfirmer"
                            : occurrence.myAvailability.answer
                          : "a_renseigner"
                      }
                    />
                    {occurrence.responseSummary ? (
                      <p className="text-xs text-nuit-doux">
                        {occurrence.responseSummary.disponible} dispo /{" "}
                        {occurrence.responseSummary.indisponible} indispo /{" "}
                        {occurrence.responseSummary.aRenseigner} a renseigner
                      </p>
                    ) : null}
                  </div>
                </div>
                {occurrence.myReason ? (
                  <p className="mt-2 rounded bg-ivoire-fonce px-2 py-1 text-xs text-nuit-doux">
                    Votre motif (prive) : {occurrence.myReason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {ouvertAuxReponses ? (
        <Card>
          <CardHeader
            titre="Repondre a mes disponibilites"
            sousTitre={
              vue.sessions.length === 0
                ? "Une seule reponse pour cet evenement."
                : "Selectionnez un ou plusieurs sous-evenements, puis repondez en une fois."
            }
          />
          <CardBody>
            <RepondreDisponibilite
              communityId={communityId}
              eventId={vue.event.id}
              creneaux={vue.occurrences.map((occurrence) => ({
                id: occurrence.sessionId,
                label: occurrence.label,
                heure: occurrence.scheduleProvisional
                  ? "horaire a definir"
                  : formatTime(occurrence.startsAt, vue.event.timezone),
                etat: occurrence.myAvailability
                  ? occurrence.myAvailability.needsReconfirmation
                    ? "a_reconfirmer"
                    : occurrence.myAvailability.answer
                  : "a_renseigner",
              }))}
              deadline={vue.event.responseDeadline}
              timezone={vue.event.timezone}
            />
          </CardBody>
        </Card>
      ) : (
        <Alerte ton="info" titre="Reponses fermees">
          Les reponses de disponibilite ne sont pas ouvertes dans cet etat.
        </Alerte>
      )}

      {/*
        * Se positionner soi-meme : reserve aux membres. Un admin dispose du
        * selecteur complet dans l'onglet « Equipes et postes ».
        */}
      {ouvertAuxReponses && !vue.isAdmin ? (
        <Card>
          <CardHeader
            titre="Prendre un poste"
            sousTitre="Les postes ou il manque quelqu'un, sur les creneaux ou vous etes disponible."
          />
          <CardBody className="space-y-4">
            {vue.occurrences.map((occurrence) => (
              <SePositionner
                key={occurrence.sessionId ?? "evenement"}
                communityId={communityId}
                eventId={vue.event.id}
                occurrence={occurrence}
                sansSousEvenement={vue.sessions.length === 0}
              />
            ))}
          </CardBody>
        </Card>
      ) : null}

      <MesAffectations communityId={communityId} vue={vue} />

      {vue.isAdmin ? (
        <>
          <InformationsEvenement
            communityId={communityId}
            eventId={vue.event.id}
            version={vue.event.version}
            titre={vue.event.title}
            description={vue.event.description}
            evenement={vue.event}
          />
          <PanneauPublication communityId={communityId} vue={vue} conflits={conflits} />
        </>
      ) : null}
    </div>
  );
}
