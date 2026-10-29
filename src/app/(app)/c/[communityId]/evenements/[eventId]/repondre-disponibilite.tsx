"use client";

import { useActionState, useState } from "react";
import { actionRepondreDisponibilite } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { formatDateLong } from "@/lib/time";
import type { AvailabilityDisplayState } from "@/domain/types";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Badge, Textarea } from "@/components/ui/primitives";
import { BadgeDisponibilite } from "@/components/app/status-badges";

interface EquipeChoix {
  teamId: string;
  name: string;
  surToutLEvenement: boolean;
  jEnFaisPartie: boolean;
}

interface CreneauChoix {
  /** null quand l'occurrence est l'evenement lui-meme. */
  id: string | null;
  label: string;
  heure: string;
  etat: AvailabilityDisplayState;
  /** Equipes qui servent sur ce moment-la. */
  equipes: EquipeChoix[];
}

/**
 * Reponse rapide aux disponibilites.
 *
 * La reponse porte sur un moment, pas sur une equipe : c'est un fait de
 * calendrier, et c'est elle qui permet a un admin de recruter quelqu'un qui
 * n'est encore dans aucune equipe. Mais la lecture, elle, se fait par
 * equipe : chaque moment annonce qui y sert, les equipes du lecteur sont
 * mises en avant, et un raccourci selectionne d'un coup les moments de son
 * equipe.
 *
 * Quand l'evenement n'a pas de sous-evenement, il n'y a rien a cocher : la
 * reponse porte sur l'evenement et les deux boutons suffisent.
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

  const aRepondre = (c: CreneauChoix) =>
    c.etat === "a_renseigner" || c.etat === "a_reconfirmer";

  // Equipes du lecteur sur cet evenement, dans l'ordre d'apparition.
  const mesEquipes = creneaux
    .flatMap((c) => c.equipes.filter((e) => e.jEnFaisPartie))
    .filter(
      (equipe, index, toutes) =>
        toutes.findIndex((e) => e.teamId === equipe.teamId) === index,
    );

  const creneauxDe = (teamId: string) =>
    creneaux.flatMap((c) =>
      c.id !== null && c.equipes.some((e) => e.teamId === teamId) ? [c.id] : [],
    );

  /*
   * Preselection : les moments ou l'equipe du lecteur sert et ou il n'a pas
   * encore repondu. Sans equipe, tout ce qui reste a renseigner.
   */
  const [selection, setSelection] = useState<string[]>(() => {
    const manquants = creneaux.filter(aRepondre);
    const miens = manquants.filter((c) =>
      c.equipes.some((e) => e.jEnFaisPartie),
    );
    const retenus = miens.length > 0 ? miens : manquants;
    return retenus.flatMap((c) => (c.id === null ? [] : [c.id]));
  });

  const basculer = (id: string) =>
    setSelection((courant) =>
      courant.includes(id) ? courant.filter((x) => x !== id) : [...courant, id],
    );

  const tous = creneaux.flatMap((c) => (c.id === null ? [] : [c.id]));
  const tousSelectionnes =
    tous.length > 0 && tous.every((id) => selection.includes(id));
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
        <div className="text-sm text-nuit-doux">
          <p>
            {creneaux[0]!.heure} - votre reponse porte sur tout
            l&apos;evenement.{" "}
            <BadgeDisponibilite etat={creneaux[0]!.etat} />
          </p>
          {creneaux[0]!.equipes.length > 0 ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span>Y servent :</span>
              {creneaux[0]!.equipes.map((equipe) => (
                <Badge
                  key={equipe.teamId}
                  ton={equipe.jEnFaisPartie ? "accent" : "neutre"}
                >
                  {equipe.name}
                  {equipe.jEnFaisPartie ? " - vous" : ""}
                </Badge>
              ))}
            </p>
          ) : null}
        </div>
      ) : (
        <fieldset>
          <legend className="text-sm font-medium">Sous-evenements concernes</legend>

          <div className="mt-2 flex flex-wrap gap-2">
            {mesEquipes.map((equipe) => (
              <button
                key={equipe.teamId}
                type="button"
                onClick={() => setSelection(creneauxDe(equipe.teamId))}
                className="min-h-9 rounded-full bg-accent-pale px-3 text-sm text-accent-fort"
              >
                Les moments de {equipe.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelection(tousSelectionnes ? [] : tous)}
              className="min-h-9 rounded-full bg-ivoire-fonce px-3 text-sm"
            >
              {tousSelectionnes ? "Tout deselectionner" : "Tout selectionner"}
            </button>
          </div>

          {mesEquipes.length > 0 ? (
            <p className="mt-2 text-xs text-nuit-doux">
              Les moments ou votre equipe sert sont deja coches. Vous pouvez
              repondre pour les autres aussi : un admin peut avoir besoin de
              vous ailleurs.
            </p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {creneaux.map((creneau) => {
              if (creneau.id === null) return null;
              const coche = selection.includes(creneau.id);
              return (
                <li key={creneau.id}>
                  <label
                    className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-doux)] border px-3 py-2 ${
                      coche ? "border-accent bg-accent-pale" : "border-bordure"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={() => basculer(creneau.id!)}
                      className="mt-1 size-5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{creneau.label}</span>
                      <span className="block text-sm text-nuit-doux">
                        {creneau.heure}
                      </span>
                      {creneau.equipes.length > 0 ? (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {creneau.equipes.map((equipe) => (
                            <Badge
                              key={equipe.teamId}
                              ton={equipe.jEnFaisPartie ? "accent" : "neutre"}
                              titre={
                                equipe.surToutLEvenement
                                  ? "Cette equipe sert sur toute la duree de l'evenement"
                                  : undefined
                              }
                            >
                              {equipe.name}
                              {equipe.jEnFaisPartie ? " - vous" : ""}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="mt-1 block text-xs text-nuit-tres-doux">
                          Aucune equipe rattachee pour l&apos;instant.
                        </span>
                      )}
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
