"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { actionAjouterPoste } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alerte, Input, Select } from "@/components/ui/primitives";

/**
 * Ajout d'un poste a ce plan : Referent Coordination, Co-lead, Alto 1, Star 5
 * ou un libelle libre. Le modele de la communaute n'est pas modifie.
 */
export function AjouterPoste({
  communityId,
  eventId,
  planId,
  suggestions,
}: {
  communityId: string;
  eventId: string;
  planId: string;
  suggestions: readonly string[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(actionAjouterPoste, ETAT_INITIAL);
  const [libelle, setLibelle] = useState("");

  return (
    <div>
      <Button
        variante="secondaire"
        taille="compact"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
      >
        <Plus aria-hidden="true" className="size-4" />
        Ajouter un poste
      </Button>

      {etat.status === "succes" ? (
        <Alerte ton="succes" className="mt-2">
          {etat.message}
        </Alerte>
      ) : null}

      {ouvert ? (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="planId" value={planId} />

          {etat.status === "erreur" ? (
            <Alerte ton="erreur">{etat.message}</Alerte>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor={`suggestion-${planId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Poste suggere
              </label>
              <Select
                id={`suggestion-${planId}`}
                className="mt-1"
                value=""
                onChange={(event) => setLibelle(event.target.value)}
              >
                <option value="">Choisir ou saisir ci-dessous</option>
                {suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion}>
                    {suggestion}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label
                htmlFor={`min-nouveau-${planId}`}
                className="block text-xs font-medium text-nuit-doux"
              >
                Effectif minimum
              </label>
              <Input
                id={`min-nouveau-${planId}`}
                name="minRequired"
                type="number"
                min={0}
                max={40}
                defaultValue={0}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`libelle-${planId}`}
              className="block text-xs font-medium text-nuit-doux"
            >
              Libelle du poste
            </label>
            <Input
              id={`libelle-${planId}`}
              name="label"
              required
              value={libelle}
              onChange={(event) => setLibelle(event.target.value)}
              className="mt-1"
              placeholder="Referent Coordination, Star 5, Alto 2..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowsDetail" className="size-5" />
            Demander une precision (pupitre tenu, groupe accompagne...)
          </label>

          <SubmitButton taille="compact" libelleEnCours="Ajout...">
            Ajouter ce poste
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
