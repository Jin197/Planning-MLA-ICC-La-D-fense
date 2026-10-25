"use client";

import { useActionState, useState } from "react";
import { actionRepondreDisponibilite } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { formatDateLong } from "@/lib/time";
import type { AvailabilityDisplayState } from "@/domain/types";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Textarea } from "@/components/ui/primitives";
import { BadgeDisponibilite } from "@/components/app/status-badges";

interface CreneauChoix {
  /** null quand l'occurrence est l'evenement lui-meme. */
  id: string | null;
  label: string;
  heure: string;
  etat: AvailabilityDisplayState;
}

/**
 * Reponse rapide : selection multiple de sous-evenements, puis une reponse
 * unique. Une reponse est enregistree par sous-evenement coche, jamais une
 * reponse de journee.
 *
 * Quand l'evenement n'a pas de sous-evenement, il n'y a rien a cocher : la
 * reponse porte sur l'evenement, et les deux boutons suffisent.
 */
export function RepondreDisponibilite({
  communityId,
  eventId,
  creneaux,
  deadline,
  timezone,
}: {
  communityId: string;
  eventId: string;
  creneaux: CreneauChoix[];
  deadline: string | null;
  timezone: string;
}) {
  const [etat, action] = useActionState(actionRepondreDisponibilite, ETAT_INITIAL);
  const surEvenement = creneaux.length === 1 && creneaux[0]!.id === null;
  const [selection, setSelection] = useState<string[]>(
    creneaux
      .filter((c) => c.etat === "a_renseigner" || c.etat === "a_reconfirmer")
      .flatMap((c) => (c.id === null ? [] : [c.id])),
  );

  const basculer = (id: string) =>
    setSelection((courant) =>
      courant.includes(id) ? courant.filter((x) => x !== id) : [...courant, id],
    );

  const tousSelectionnes = selection.length === creneaux.length;
  const peutRepondre = surEvenement || selection.length > 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      {selection.map((id) => (
        <input key={id} type="hidden" name="sessionIds" value={id} />
      ))}

      {etat.status === "succes" ? (
        <Alerte ton="succes" titre="Reponse enregistree">
          {etat.message}
        </Alerte>
      ) : null}
      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Reponse non enregistree">
          {etat.message}
        </Alerte>
      ) : null}

      {surEvenement ? (
        <p className="text-sm text-nuit-doux">
          {creneaux[0]!.heure} - votre reponse porte sur tout
          l&apos;evenement.{" "}
          <BadgeDisponibilite etat={creneaux[0]!.etat} />
        </p>
      ) : (
        <fieldset>
          <legend className="text-sm font-medium">Sous-evenements concernes</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setSelection(
                  tousSelectionnes
                    ? []
                    : creneaux.flatMap((c) => (c.id === null ? [] : [c.id])),
                )
              }
              className="min-h-9 rounded-full bg-ivoire-fonce/60-forte px-3 text-sm"
            >
              {tousSelectionnes ? "Tout deselectionner" : "Tout selectionner"}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {creneaux.map((creneau) => {
              if (creneau.id === null) return null;
              const coche = selection.includes(creneau.id);
              return (
                <li key={creneau.id}>
                  <label
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-doux)] border px-3 py-2 ${
                      coche ? "border-indigo-accent bg-indigo-clair" : "border-bordure"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={() => basculer(creneau.id!)}
                      className="size-5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{creneau.label}</span>
                      <span className="block text-sm text-nuit-doux">
                        {creneau.heure}
                      </span>
                    </span>
                    <BadgeDisponibilite etat={creneau.etat} />
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <div>
        <label htmlFor="motif" className="block text-sm font-medium">
          Motif
          <span className="ml-2 text-xs font-normal text-nuit-tres-doux">
            facultatif, prive
          </span>
        </label>
        <Textarea
          id="motif"
          name="motif"
          rows={2}
          className="mt-1.5"
          placeholder="Visible uniquement par vous et les admins de cette communaute."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="reponse"
          value="disponible"
          libelleEnCours="Enregistrement..."
          disabled={!peutRepondre}
        >
          Je suis disponible
        </SubmitButton>
        <SubmitButton
          name="reponse"
          value="indisponible"
          variante="secondaire"
          libelleEnCours="Enregistrement..."
          disabled={!peutRepondre}
        >
          Je suis indisponible
        </SubmitButton>
      </div>

      {!peutRepondre ? (
        <p className="text-xs text-nuit-doux">
          Cochez au moins un sous-evenement pour repondre.
        </p>
      ) : null}

      {deadline ? (
        <p className="text-xs text-alerte-texte">
          Reponses attendues avant le {formatDateLong(deadline, timezone)}.
        </p>
      ) : null}
    </form>
  );
}
