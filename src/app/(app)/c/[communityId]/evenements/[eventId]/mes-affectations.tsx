"use client";

import { useActionState } from "react";
import { actionEtatAffectation } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import type { EventDetail } from "@/server/services/events";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  Input,
} from "@/components/ui/primitives";
import { BadgeAffectation } from "@/components/app/status-badges";

/**
 * Mes affectations sur cet evenement. Le membre confirme ou signale un
 * empechement ; il ne modifie ni le poste, ni le nom d'une autre personne.
 */
export function MesAffectations({
  communityId,
  vue,
}: {
  communityId: string;
  vue: EventDetail;
}) {
  const [etat, action] = useActionState(actionEtatAffectation, ETAT_INITIAL);

  const miennes = vue.sessions.flatMap(({ session, plans }) =>
    plans.flatMap((plan) =>
      plan.slots.flatMap((slot) =>
        slot.assignments
          .filter((a) => a.isMine)
          .map((a) => ({
            assignmentId: a.id,
            etat: a.state,
            poste: slot.label,
            detail: a.detail,
            equipe: plan.teamName,
            creneau: session.label,
          })),
      ),
    ),
  );

  if (!vue.canSeePlan) {
    return (
      <Card>
        <CardHeader titre="Mes affectations" />
        <CardBody>
          <EtatVide
            titre="Pas encore publiees"
            description="Les affectations en preparation restent reservees aux admins jusqu'a la publication du planning."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        titre="Mes affectations"
        sousTitre="Confirmez votre participation ou signalez un empechement."
      />
      <CardBody className="space-y-4">
        {etat.status === "succes" ? (
          <Alerte ton="succes">{etat.message}</Alerte>
        ) : null}
        {etat.status === "erreur" ? (
          <Alerte ton="erreur">{etat.message}</Alerte>
        ) : null}

        {miennes.length === 0 ? (
          <EtatVide titre="Aucune affectation pour vous sur cet evenement" />
        ) : (
          <ul className="space-y-3">
            {miennes.map((affectation) => (
              <li
                key={affectation.assignmentId}
                className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {affectation.poste}
                      {affectation.detail ? (
                        <span className="font-normal text-nuit-doux">
                          {" "}
                          ({affectation.detail})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-nuit-doux">
                      {affectation.creneau} - {affectation.equipe}
                    </p>
                  </div>
                  <BadgeAffectation etat={affectation.etat} />
                </div>

                {affectation.etat !== "retiree" ? (
                  <form action={action} className="mt-3 space-y-2">
                    <input type="hidden" name="communityId" value={communityId} />
                    <input type="hidden" name="eventId" value={vue.event.id} />
                    <input
                      type="hidden"
                      name="assignmentId"
                      value={affectation.assignmentId}
                    />
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`note-${affectation.assignmentId}`}
                          className="block text-xs font-medium text-nuit-doux"
                        >
                          Note pour les admins (facultatif)
                        </label>
                        <Input
                          id={`note-${affectation.assignmentId}`}
                          name="note"
                          className="mt-1"
                          placeholder="Je serai la a 8h45"
                        />
                      </div>
                      {affectation.etat !== "confirmee" ? (
                        <SubmitButton
                          name="cible"
                          value="confirmee"
                          taille="compact"
                          libelleEnCours="Envoi..."
                        >
                          Je confirme
                        </SubmitButton>
                      ) : null}
                      {affectation.etat !== "a_remplacer" ? (
                        <SubmitButton
                          name="cible"
                          value="a_remplacer"
                          variante="secondaire"
                          taille="compact"
                          libelleEnCours="Envoi..."
                        >
                          Signaler un empechement
                        </SubmitButton>
                      ) : null}
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
