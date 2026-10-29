"use client";

import { useActionState } from "react";
import { Hand } from "lucide-react";
import { actionSePositionner } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Badge, EtatVide, Input } from "@/components/ui/primitives";
import type { OccurrenceView } from "@/server/services/events";

/**
 * Postes ouverts d'une occurrence, et bouton pour s'y placer.
 *
 * Seuls les postes ou il manque quelqu'un sont proposes, et seulement a qui
 * s'est declare disponible : c'est la disponibilite qui commande. Pendant la
 * collecte, la composition en preparation reste invisible — on voit ce qui
 * manque, pas qui est deja place.
 */
export function SePositionner({
  communityId,
  eventId,
  titre,
  postesOuverts,
  mesPostes,
  disponible,
  raisonIndisponible,
}: {
  communityId: string;
  eventId: string;
  titre: string;
  postesOuverts: OccurrenceView["postesOuverts"];
  mesPostes: OccurrenceView["mesPostes"];
  /** La disponibilite declaree permet-elle de se positionner ici ? */
  disponible: boolean;
  raisonIndisponible: string;
}) {
  const [etat, action] = useActionState(actionSePositionner, ETAT_INITIAL);
  const cle = titre.replace(/\W+/g, "-").toLowerCase();

  return (
    <section
      aria-labelledby={`postes-${cle}`}
      className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
    >
      <h3 id={`postes-${cle}`} className="text-sm font-semibold">
        {titre}
      </h3>

      {mesPostes.length > 0 ? (
        <p className="mt-2 text-sm text-nuit-doux">
          Vous tenez deja :{" "}
          {mesPostes.map((poste) => (
            <Badge key={poste.assignmentId} ton="accent" className="mr-1">
              {poste.label} - {poste.teamName}
            </Badge>
          ))}
        </p>
      ) : null}

      {etat.status !== "repos" ? (
        <Alerte
          ton={etat.status === "succes" ? "succes" : "erreur"}
          className="mt-3"
        >
          {etat.message}
        </Alerte>
      ) : null}

      {!disponible ? (
        <p className="mt-2 text-sm text-nuit-doux">{raisonIndisponible}</p>
      ) : postesOuverts.length === 0 ? (
        <EtatVide
          titre="Aucun poste ouvert ici"
          description="Tous les postes attendus sont pourvus. Un admin peut vous y ajouter malgre tout."
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {postesOuverts.map((poste) => (
            <li key={poste.slotId}>
              <form
                action={action}
                className="flex flex-wrap items-end justify-between gap-2 rounded-[var(--radius-doux)] bg-surface px-3 py-2"
              >
                <input type="hidden" name="communityId" value={communityId} />
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="slotId" value={poste.slotId} />

                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {poste.label}
                    <span className="ml-2 font-normal text-nuit-doux">
                      {poste.teamName}
                    </span>
                  </p>
                  <p className="text-xs text-nuit-doux">
                    {poste.manquants > 0
                      ? `${poste.manquants} personne(s) manquante(s)`
                      : "Poste facultatif encore libre"}
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {poste.allowsDetail ? (
                    <div>
                      <label
                        htmlFor={`detail-${poste.slotId}`}
                        className="block text-xs font-medium text-nuit-doux"
                      >
                        Precision
                      </label>
                      <Input
                        id={`detail-${poste.slotId}`}
                        name="detail"
                        className="mt-1 w-40"
                        placeholder="alto, soprano..."
                      />
                    </div>
                  ) : null}
                  <SubmitButton taille="compact" libelleEnCours="Enregistrement...">
                    <Hand aria-hidden="true" className="size-4" />
                    Je prends ce poste
                  </SubmitButton>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
