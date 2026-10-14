"use client";

import { useActionState, useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import {
  actionModifierPoste,
  actionRetirerAffectation,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alerte, Input } from "@/components/ui/primitives";

/** Reglage d'un poste pour cet evenement : libelle, effectif, activation. */
export function ReglagesPoste({
  communityId,
  eventId,
  slotId,
  label,
  minRequired,
  enabled,
}: {
  communityId: string;
  eventId: string;
  slotId: string;
  label: string;
  minRequired: number;
  enabled: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(actionModifierPoste, ETAT_INITIAL);

  return (
    <div>
      <Button
        variante="discret"
        taille="compact"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
      >
        <Settings2 aria-hidden="true" className="size-4" />
        Reglages
      </Button>

      {ouvert ? (
        <form
          action={action}
          className="mt-2 space-y-3 rounded-[var(--radius-doux)] border border-bordure p-3"
        >
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="slotId" value={slotId} />

          {etat.status === "succes" ? (
            <Alerte ton="succes">{etat.message}</Alerte>
          ) : null}
          {etat.status === "erreur" ? (
            <Alerte ton="erreur">{etat.message}</Alerte>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`label-${slotId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Libelle du poste
              </label>
              <Input
                id={`label-${slotId}`}
                name="label"
                defaultValue={label}
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor={`min-${slotId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Effectif minimum (0 = facultatif)
              </label>
              <Input
                id={`min-${slotId}`}
                name="minRequired"
                type="number"
                min={0}
                max={40}
                defaultValue={minRequired}
                className="mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              className="size-5"
            />
            Poste utilise pour cet evenement
          </label>
          <p className="text-xs text-nuit-doux">
            Un poste decoche n&apos;est pas compte comme incomplet.
          </p>

          <SubmitButton taille="compact" libelleEnCours="Enregistrement...">
            Enregistrer ce poste
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/** Retrait d'une affectation par un admin. L'historique est conserve. */
export function BoutonRetirerAffectation({
  communityId,
  eventId,
  assignmentId,
  nom,
}: {
  communityId: string;
  eventId: string;
  assignmentId: string;
  nom: string;
}) {
  const [etat, action] = useActionState(actionRetirerAffectation, ETAT_INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <SubmitButton
        variante="discret"
        taille="compact"
        libelleEnCours="Retrait..."
        aria-label={`Retirer ${nom} de ce poste`}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Retirer
      </SubmitButton>
      {etat.status === "erreur" ? (
        <p className="mt-1 text-xs text-indispo-texte">{etat.message}</p>
      ) : null}
    </form>
  );
}
