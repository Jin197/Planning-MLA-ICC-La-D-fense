"use client";

import { useActionState } from "react";
import { actionRepondreRepetition } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import type { AvailabilityDisplayState } from "@/domain/types";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Input } from "@/components/ui/primitives";
import { BadgeDisponibilite } from "@/components/app/status-badges";

export function RepondreRepetition({
  communityId,
  eventId,
  rehearsalId,
  etatActuel,
}: {
  communityId: string;
  eventId: string;
  rehearsalId: string;
  etatActuel: AvailabilityDisplayState;
}) {
  const [etat, action] = useActionState(actionRepondreRepetition, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="rehearsalId" value={rehearsalId} />

      {etat.status === "succes" ? (
        <Alerte ton="succes">{etat.message}</Alerte>
      ) : null}
      {etat.status === "erreur" ? (
        <Alerte ton="erreur">{etat.message}</Alerte>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-nuit-doux">Ma reponse :</span>
        <BadgeDisponibilite etat={etatActuel} />
      </div>

      <div>
        <label
          htmlFor={`motif-rep-${rehearsalId}`}
          className="block text-xs font-medium text-nuit-doux"
        >
          Motif (facultatif, prive)
        </label>
        <Input id={`motif-rep-${rehearsalId}`} name="motif" className="mt-1" />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="reponse"
          value="disponible"
          taille="compact"
          libelleEnCours="Enregistrement..."
        >
          Disponible
        </SubmitButton>
        <SubmitButton
          name="reponse"
          value="indisponible"
          variante="secondaire"
          taille="compact"
          libelleEnCours="Enregistrement..."
        >
          Indisponible
        </SubmitButton>
      </div>
    </form>
  );
}
