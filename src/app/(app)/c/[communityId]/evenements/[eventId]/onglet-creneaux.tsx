import { SUGGESTED_EXTRA_ROLES } from "@/domain/template";
import { formatRange } from "@/lib/time";
import type { EventDetail } from "@/server/services/events";
import {
  Alerte,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import { BadgeAffectation } from "@/components/app/status-badges";
import { SelecteurMembre } from "./selecteur-membre";
import { BoutonRetirerAffectation, ReglagesPoste } from "./poste-admin";
import { AjouterPoste } from "./ajouter-poste";
import { AjouterCreneau } from "./ajouter-creneau";
import { EditeurCreneau } from "./editeur-creneau";

/**
 * Creneaux et equipes. Un plan par equipe et par creneau, avec les postes
 * copies du modele au moment de la creation.
 */
export function OngletCreneaux({
  communityId,
  vue,
}: {
  communityId: string;
  vue: EventDetail;
}) {
  if (!vue.canSeePlan) {
    return (
      <Card>
        <CardHeader titre="Creneaux et equipes" />
        <CardBody>
          <EtatVide
            titre="Plan non encore publie"
            description="Pendant la collecte, les affectations en preparation restent reservees aux admins. Vous verrez le plan complet des sa publication."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {vue.isAdmin ? (
        <AjouterCreneau
          communityId={communityId}
          eventId={vue.event.id}
          version={vue.event.version}
          equipes={vue.teams
            .filter((t) => t.archivedAt === null)
            .map((t) => ({ id: t.id, name: t.name }))}
          creneaux={vue.sessions.map(({ session, plans }) => ({
            id: session.id,
            label: session.label,
            equipesPresentes: plans.map((p) => p.teamId),
          }))}
        />
      ) : null}

      {vue.sessions.map(({ session, plans }) => (
        <Card key={session.id}>
          <CardHeader
            titre={session.label}
            sousTitre={
              session.scheduleProvisional
                ? "Horaire a definir avant publication."
                : formatRange(session.startsAt, session.endsAt, vue.event.timezone)
            }
            actions={
              <Badge ton="neutre">
                {plans.length} equipe(s) sur ce creneau
              </Badge>
            }
          />
          <CardBody className="space-y-6">
            {vue.isAdmin ? (
              <EditeurCreneau
                communityId={communityId}
                eventId={vue.event.id}
                version={vue.event.version}
                session={session}
                timezone={vue.event.timezone}
              />
            ) : null}

            {plans.length === 0 ? (
              <EtatVide
                titre="Aucun plan d'equipe sur ce creneau"
                description="Un admin peut preparer un plan par equipe sur ce creneau."
              />
            ) : (
              plans.map((plan) => (
                <section
                  key={plan.id}
                  aria-labelledby={`plan-${plan.id}`}
                  className="rounded-[var(--radius-carte)] border border-bordure"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bordure bg-ivoire-fonce/50 px-4 py-2.5">
                    <h3 id={`plan-${plan.id}`} className="font-medium">
                      {plan.teamName}
                    </h3>
                    <Badge ton="neutre">
                      {plan.slots.filter((s) => s.incomplete).length} poste(s) a
                      completer
                    </Badge>
                  </div>

                  <ul className="divide-y divide-bordure">
                    {plan.slots.map((slot) => (
                      <li key={slot.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {slot.label}
                              {!slot.enabled ? (
                                <Badge ton="neutre" className="ml-2">
                                  Non utilise
                                </Badge>
                              ) : slot.minRequired === 0 ? (
                                <Badge ton="neutre" className="ml-2">
                                  Facultatif
                                </Badge>
                              ) : (
                                <span className="ml-2 text-xs font-normal text-nuit-doux">
                                  minimum {slot.minRequired}
                                </span>
                              )}
                            </p>
                            {slot.incomplete ? (
                              <p className="mt-1 text-xs text-alerte-texte">
                                {slot.missing} personne(s) manquante(s)
                              </p>
                            ) : null}
                          </div>
                          {vue.isAdmin ? (
                            <ReglagesPoste
                              communityId={communityId}
                              eventId={vue.event.id}
                              slotId={slot.id}
                              label={slot.label}
                              minRequired={slot.minRequired}
                              enabled={slot.enabled}
                            />
                          ) : null}
                        </div>

                        {slot.assignments.length > 0 ? (
                          <ul className="mt-3 space-y-2">
                            {slot.assignments.map((affectation) => (
                              <li
                                key={affectation.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <Avatar
                                    initiales={affectation.initials}
                                    nom={affectation.name}
                                    taille="petit"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                      {affectation.name}
                                      {affectation.detail ? (
                                        <span className="font-normal text-nuit-doux">
                                          {" "}
                                          ({affectation.detail})
                                        </span>
                                      ) : null}
                                    </span>
                                    {affectation.exceptions.length > 0 ? (
                                      <span className="block text-xs text-alerte-texte">
                                        Exception :{" "}
                                        {affectation.exceptions
                                          .map((e) => e.kind.replace("_", " "))
                                          .join(", ")}
                                        {affectation.exceptions[0]?.reason
                                          ? ` - ${affectation.exceptions[0].reason}`
                                          : ""}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2">
                                  <BadgeAffectation etat={affectation.state} />
                                  {vue.isAdmin ? (
                                    <BoutonRetirerAffectation
                                      communityId={communityId}
                                      eventId={vue.event.id}
                                      assignmentId={affectation.id}
                                      nom={affectation.name}
                                    />
                                  ) : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-nuit-doux">
                            Personne sur ce poste pour l&apos;instant.
                          </p>
                        )}

                        {vue.isAdmin && slot.enabled ? (
                          <SelecteurMembre
                            communityId={communityId}
                            eventId={vue.event.id}
                            slotId={slot.id}
                            slotLabel={slot.label}
                            autoriseDetail={slot.allowsDetail}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {vue.isAdmin ? (
                    <div className="border-t border-bordure px-4 py-3">
                      <AjouterPoste
                        communityId={communityId}
                        eventId={vue.event.id}
                        planId={plan.id}
                        suggestions={SUGGESTED_EXTRA_ROLES}
                      />
                    </div>
                  ) : null}
                </section>
              ))
            )}
          </CardBody>
        </Card>
      ))}

      {vue.isAdmin ? (
        <Alerte ton="info" titre="Affectations multiples">
          Un poste accueille plusieurs personnes, et une personne peut tenir
          plusieurs postes compatibles sur un meme creneau. Les doublons exacts
          sont refuses et les incompatibilites d&apos;instruments declenchent une
          alerte.
        </Alerte>
      ) : null}
    </div>
  );
}
