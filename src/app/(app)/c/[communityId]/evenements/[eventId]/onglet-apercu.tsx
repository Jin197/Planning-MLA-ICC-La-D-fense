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
          titre="Creneaux"
          sousTitre="Une disponibilite porte sur un creneau, pas sur la journee."
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
            {vue.sessions.map(({ session, myAvailability, myReason, responseSummary }) => (
              <li
                key={session.id}
                className="rounded-[var(--radius-doux)] border border-bordure p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {session.label}
                      {session.scheduleProvisional ? (
                        <Badge ton="alerte" className="ml-2">
                          Horaire a definir
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-nuit-doux">
                      {session.scheduleProvisional
                        ? "L'horaire exact n'est pas encore fixe."
                        : formatRange(session.startsAt, session.endsAt, vue.event.timezone)}
                    </p>
                    {session.locationName ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-nuit-doux">
                        <MapPin aria-hidden="true" className="size-3.5" />
                        {session.locationName}
                        {session.locationAddress ? ` - ${session.locationAddress}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <BadgeDisponibilite
                      etat={
                        myAvailability
                          ? myAvailability.needsReconfirmation
                            ? "a_reconfirmer"
                            : myAvailability.answer
                          : "a_renseigner"
                      }
                    />
                    {responseSummary ? (
                      <p className="text-xs text-nuit-doux">
                        {responseSummary.disponible} dispo /{" "}
                        {responseSummary.indisponible} indispo /{" "}
                        {responseSummary.aRenseigner} a renseigner
                      </p>
                    ) : null}
                  </div>
                </div>
                {myReason ? (
                  <p className="mt-2 rounded bg-ivoire-fonce px-2 py-1 text-xs text-nuit-doux">
                    Votre motif (prive) : {myReason}
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
            sousTitre="Selectionnez un ou plusieurs creneaux, puis repondez en une fois."
          />
          <CardBody>
            <RepondreDisponibilite
              communityId={communityId}
              eventId={vue.event.id}
              creneaux={vue.sessions.map(({ session, myAvailability }) => ({
                id: session.id,
                label: session.label,
                heure: session.scheduleProvisional
                  ? "horaire a definir"
                  : formatTime(session.startsAt, vue.event.timezone),
                etat: myAvailability
                  ? myAvailability.needsReconfirmation
                    ? "a_reconfirmer"
                    : myAvailability.answer
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

      <MesAffectations communityId={communityId} vue={vue} />

      {vue.isAdmin ? (
        <>
          <InformationsEvenement
            communityId={communityId}
            eventId={vue.event.id}
            version={vue.event.version}
            titre={vue.event.title}
            description={vue.event.description}
          />
          <PanneauPublication communityId={communityId} vue={vue} conflits={conflits} />
        </>
      ) : null}
    </div>
  );
}
