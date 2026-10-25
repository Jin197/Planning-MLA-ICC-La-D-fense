import Link from "next/link";
import { MapPin, MessageSquare, Music2 } from "lucide-react";
import {
  durationMinutes,
  formatDateLong,
  formatDurationHuman,
  formatTime,
  localDayKey,
} from "@/lib/time";
import type { VuePlanning } from "@/server/services/planning-views";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import {
  BadgeAffectation,
  BadgeDisponibilite,
  BadgeEtatEvenement,
} from "@/components/app/status-badges";

/**
 * Agenda : liste chronologique groupee par journee. Ne deborde pas
 * horizontalement, et reste lisible sur un telephone.
 */
export function VueAgenda({ planning }: { planning: VuePlanning }) {
  const parJour = new Map<string, VuePlanning["evenements"]>();
  for (const evenement of planning.evenements) {
    const jour = evenement.jour;
    parJour.set(jour, [...(parJour.get(jour) ?? []), evenement]);
  }
  const jours = [...parJour.keys()].sort();

  return (
    <div className="space-y-8">
      {jours.map((jour) => {
        const evenements = parJour.get(jour) ?? [];
        const premier = evenements[0]?.creneaux[0];
        return (
          <section key={jour} aria-labelledby={`jour-${jour}`}>
            <h2
              id={`jour-${jour}`}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-nuit-doux"
            >
              {premier
                ? formatDateLong(premier.startsAt, planning.timezone)
                : jour}
            </h2>

            <div className="space-y-4">
              {evenements.map((evenement) => (
                <Card key={evenement.id}>
                  <CardHeader
                    titre={
                      <Link
                        href={`/c/${planning.communityId}/evenements/${evenement.id}`}
                        className="hover:underline"
                      >
                        {evenement.title}
                      </Link>
                    }
                    actions={
                      <div className="flex flex-wrap items-center gap-2">
                        {evenement.messagesNonLus > 0 ? (
                          <Badge ton="indigo" icone={<MessageSquare className="size-3" />}>
                            {evenement.messagesNonLus} message(s)
                          </Badge>
                        ) : null}
                        <BadgeEtatEvenement etat={evenement.state} />
                      </div>
                    }
                  />
                  <CardBody className="space-y-4">
                    <ul className="space-y-3">
                      {evenement.creneaux.map((creneau) => (
                        <li
                          key={creneau.cle}
                          className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">
                                {creneau.label}
                                <span className="ml-2 font-normal text-nuit-doux">
                                  {creneau.scheduleProvisional ? (
                                    "horaire a definir"
                                  ) : (
                                    <>
                                      {formatTime(creneau.startsAt, evenement.timezone)} -{" "}
                                      {formatTime(creneau.endsAt, evenement.timezone)}
                                      {localDayKey(creneau.endsAt, evenement.timezone) !==
                                      localDayKey(creneau.startsAt, evenement.timezone)
                                        ? " (lendemain)"
                                        : ""}
                                    </>
                                  )}
                                </span>
                              </p>
                              {creneau.locationName ? (
                                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-nuit-doux">
                                  <MapPin aria-hidden="true" className="size-3.5" />
                                  {creneau.locationName}
                                </p>
                              ) : null}
                              {creneau.mesPostes.length > 0 ? (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {creneau.mesPostes.map((poste, index) => (
                                    <li key={`${poste.label}-${index}`}>
                                      <span className="inline-flex items-center gap-1.5 rounded-full bg-ivoire-fonce px-2.5 py-0.5 text-xs">
                                        <Music2 aria-hidden="true" className="size-3" />
                                        {poste.label}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>

                            <div className="flex flex-col items-end gap-1.5">
                              <BadgeDisponibilite etat={creneau.maDisponibilite} />
                              {creneau.mesPostes.map((poste, index) => (
                                <BadgeAffectation
                                  key={`etat-${poste.label}-${index}`}
                                  etat={poste.state}
                                />
                              ))}
                              {planning.estAdmin && creneau.postesACompleter > 0 ? (
                                <Badge ton="alerte">
                                  {creneau.postesACompleter} poste(s) a completer
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {evenement.repetitions.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-semibold text-nuit-doux">
                          Repetitions
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {evenement.repetitions.map((repetition) => (
                            <li
                              key={repetition.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/70 px-3 py-2 text-sm"
                            >
                              <span className="min-w-0">
                                <span className="font-medium">{repetition.label}</span>{" "}
                                <span className="text-nuit-doux">
                                  {formatDateLong(repetition.startsAt, evenement.timezone)}{" "}
                                  {formatTime(repetition.startsAt, evenement.timezone)} -{" "}
                                  {formatTime(repetition.endsAt, evenement.timezone)}
                                  {localDayKey(repetition.endsAt, evenement.timezone) !==
                                  localDayKey(repetition.startsAt, evenement.timezone)
                                    ? " le lendemain"
                                    : ""}{" "}
                                  (
                                  {formatDurationHuman(
                                    durationMinutes(repetition.startsAt, repetition.endsAt),
                                  )}
                                  )
                                  {repetition.locationName
                                    ? ` - ${repetition.locationName}`
                                    : ""}
                                  {repetition.room ? ` (${repetition.room})` : ""}
                                </span>
                              </span>
                              <BadgeDisponibilite etat={repetition.maDisponibilite} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <Link
                      href={`/c/${planning.communityId}/evenements/${evenement.id}`}
                      className="inline-flex min-h-11 items-center rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4 text-sm"
                    >
                      Ouvrir l&apos;evenement
                    </Link>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
