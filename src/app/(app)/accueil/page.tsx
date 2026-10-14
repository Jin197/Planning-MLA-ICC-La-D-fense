import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarCheck2, MessageSquare, ShieldAlert } from "lucide-react";
import { formatDateLong, formatTime } from "@/lib/time";
import { loadTableauDeBord } from "@/server/services/home";
import { requireSession } from "@/server/auth/context";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  FiletDore,
} from "@/components/ui/primitives";
import { BadgeAffectation, BadgeEtatEvenement } from "@/components/app/status-badges";

export const metadata: Metadata = { title: "Accueil" };

export default async function PageAccueil() {
  const session = await requireSession();
  const bord = await loadTableauDeBord();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">Bonjour</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">
          {session.profile.firstName} {session.profile.lastName}
        </h1>
        <div className="mt-3">
          <FiletDore />
        </div>
      </header>

      {!session.viewer.emailVerified ? (
        <Alerte ton="attention" titre="Email non verifie">
          <p>
            La creation d&apos;une communaute demande un email verifie.{" "}
            <Link href="/verification-email" className="underline">
              Verifier maintenant
            </Link>
            .
          </p>
        </Alerte>
      ) : null}

      {bord.aucuneAdhesion ? (
        <Card>
          <CardHeader
            titre="Rejoindre une communaute"
            sousTitre="Vous n'etes pas encore membre d'un ministere."
          />
          <CardBody>
            <EtatVide
              titre="Aucune adhesion pour le moment"
              description="Parcourez le catalogue des communautes de l'espace ICC et demandez a rejoindre celles qui vous concernent. Un admin de la communaute validera votre demande."
              action={
                <Link
                  href="/communautes"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-indigo-accent px-4 py-2 text-white"
                >
                  Voir le catalogue <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : null}

      {bord.tachesAdmin.length > 0 ? (
        <Card>
          <CardHeader
            titre="A traiter comme admin"
            sousTitre="Uniquement pour les communautes dont vous etes admin."
          />
          <CardBody className="space-y-3">
            {bord.tachesAdmin.map((tache) => (
              <div
                key={tache.communityId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-doux)] border border-bordure bg-ivoire-fonce/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{tache.communityName}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {tache.demandesEnAttente > 0 ? (
                      <Badge ton="indigo">
                        {tache.demandesEnAttente} demande(s) d&apos;adhesion
                      </Badge>
                    ) : null}
                    {tache.postesACompleter > 0 ? (
                      <Badge ton="alerte">
                        {tache.postesACompleter} poste(s) a completer
                      </Badge>
                    ) : null}
                    {tache.affectationsARemplacer > 0 ? (
                      <Badge ton="indispo">
                        {tache.affectationsARemplacer} a remplacer
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  {tache.demandesEnAttente > 0 ? (
                    <Link
                      href={`/c/${tache.communityId}/demandes`}
                      className="inline-flex min-h-9 items-center rounded-[var(--radius-doux)] border border-bordure-forte px-3 text-sm"
                    >
                      Demandes
                    </Link>
                  ) : null}
                  <Link
                    href={`/c/${tache.communityId}/planning`}
                    className="inline-flex min-h-9 items-center rounded-[var(--radius-doux)] border border-bordure-forte px-3 text-sm"
                  >
                    Planning
                  </Link>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            titre="Prochain evenement"
            sousTitre="Toutes vos communautes confondues."
          />
          <CardBody>
            {bord.prochainEvenement ? (
              <Link
                href={`/c/${bord.prochainEvenement.communityId}/evenements/${bord.prochainEvenement.eventId}`}
                className="block rounded-[var(--radius-doux)] border border-bordure p-4 hover:bg-ivoire-fonce/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-nuit-doux">
                      {bord.prochainEvenement.communityName}
                    </p>
                    <p className="mt-0.5 text-lg font-medium">
                      {bord.prochainEvenement.title}
                    </p>
                    <p className="mt-1 text-sm text-nuit-doux">
                      {bord.prochainEvenement.sessionLabel} -{" "}
                      {formatDateLong(
                        bord.prochainEvenement.startsAt,
                        bord.prochainEvenement.timezone,
                      )}{" "}
                      a{" "}
                      {formatTime(
                        bord.prochainEvenement.startsAt,
                        bord.prochainEvenement.timezone,
                      )}
                    </p>
                  </div>
                  <BadgeEtatEvenement etat={bord.prochainEvenement.state} />
                </div>
              </Link>
            ) : (
              <EtatVide
                titre="Aucun evenement a venir"
                description="Les prochains cultes apparaitront ici des qu'un admin les aura crees."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            titre="Disponibilites a renseigner"
            sousTitre="Une reponse par creneau, meme si la journee en comporte plusieurs."
          />
          <CardBody>
            {bord.reponsesAttendues.length === 0 ? (
              <EtatVide
                titre="Tout est a jour"
                description="Vous avez repondu pour tous les creneaux ouverts."
              />
            ) : (
              <ul className="space-y-3">
                {bord.reponsesAttendues.map((reponse) => (
                  <li key={reponse.eventId}>
                    <Link
                      href={`/c/${reponse.communityId}/evenements/${reponse.eventId}`}
                      className="block rounded-[var(--radius-doux)] border border-bordure p-3 hover:bg-ivoire-fonce/60"
                    >
                      <p className="text-sm text-nuit-doux">{reponse.communityName}</p>
                      <p className="font-medium">{reponse.eventTitle}</p>
                      <p className="mt-1 text-sm text-nuit-doux">
                        {reponse.sessions.length} creneau(x) sans reponse :{" "}
                        {reponse.sessions.map((s) => s.label).join(", ")}
                      </p>
                      {reponse.deadline ? (
                        <p className="mt-1 text-xs text-alerte-texte">
                          A repondre avant le{" "}
                          {formatDateLong(reponse.deadline, reponse.timezone)}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          titre="Mes prochaines affectations"
          sousTitre="Confirmez votre participation ou signalez un empechement depuis l'evenement."
          actions={
            <span className="inline-flex items-center gap-1.5 text-sm text-nuit-doux">
              <CalendarCheck2 aria-hidden="true" className="size-4" />
              {bord.mesAffectations.length}
            </span>
          }
        />
        <CardBody>
          {bord.mesAffectations.length === 0 ? (
            <EtatVide
              titre="Aucune affectation a venir"
              description="Les affectations apparaissent ici une fois le planning publie."
            />
          ) : (
            <ul className="divide-y divide-bordure">
              {bord.mesAffectations.map((affectation) => (
                <li key={affectation.assignmentId} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/c/${affectation.communityId}/evenements/${affectation.eventId}`}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {affectation.slotLabel}
                        {affectation.detail ? (
                          <span className="font-normal text-nuit-doux">
                            {" "}
                            ({affectation.detail})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-nuit-doux">
                        {affectation.eventTitle} - {affectation.sessionLabel} -{" "}
                        {formatDateLong(affectation.startsAt, affectation.timezone)} a{" "}
                        {formatTime(affectation.startsAt, affectation.timezone)}
                      </p>
                      <p className="text-xs text-nuit-tres-doux">
                        {affectation.communityName}
                      </p>
                    </div>
                    <BadgeAffectation etat={affectation.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {bord.messagesNonLus.length > 0 ? (
        <Card>
          <CardHeader titre="Messages non lus" />
          <CardBody>
            <ul className="space-y-2">
              {bord.messagesNonLus.map((message) => (
                <li key={message.eventId}>
                  <Link
                    href={`/c/${message.communityId}/evenements/${message.eventId}?onglet=discussion`}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-doux)] border border-bordure px-3 py-2 hover:bg-ivoire-fonce/60"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <MessageSquare aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{message.eventTitle}</span>
                    </span>
                    <Badge ton="indigo">{message.count} non lu(s)</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <p className="flex items-start gap-2 text-xs text-nuit-tres-doux">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Les motifs d&apos;indisponibilite restent prives : seuls leur auteur et les
        admins de la communaute concernee peuvent les lire.
      </p>
    </div>
  );
}
