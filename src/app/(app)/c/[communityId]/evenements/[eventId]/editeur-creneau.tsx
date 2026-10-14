"use client";

import { useActionState, useState } from "react";
import { CalendarClock } from "lucide-react";
import { actionModifierCreneau } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { utcToLocal } from "@/lib/time";
import type { EventSession } from "@/domain/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alerte, Champ, Input } from "@/components/ui/primitives";

/**
 * Edition d'un creneau. Le formulaire demande explicitement une date de debut
 * et une date de fin : une heure seule ne permet pas de planifier une
 * repetition qui se termine apres minuit.
 */
export function EditeurCreneau({
  communityId,
  eventId,
  version,
  session,
  timezone,
}: {
  communityId: string;
  eventId: string;
  version: number;
  session: EventSession;
  timezone: string;
}) {
  const [ouvert, setOuvert] = useState(session.scheduleProvisional);
  const [etat, action] = useActionState(actionModifierCreneau, ETAT_INITIAL);
  const debut = utcToLocal(session.startsAt, timezone);
  const fin = utcToLocal(session.endsAt, timezone);

  return (
    <div>
      <Button
        variante="secondaire"
        taille="compact"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
      >
        <CalendarClock aria-hidden="true" className="size-4" />
        Modifier ce creneau
      </Button>

      {etat.status === "succes" ? (
        <Alerte ton="succes" className="mt-2">
          {etat.message}
        </Alerte>
      ) : null}

      {ouvert ? (
        <form
          action={action}
          className="mt-3 space-y-4 rounded-[var(--radius-doux)] border border-bordure p-3"
        >
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="version" value={version} />

          {etat.status === "erreur" ? (
            <Alerte ton="erreur" titre="Modification refusee">
              {etat.message}
            </Alerte>
          ) : null}

          {session.scheduleProvisional ? (
            <Alerte ton="attention" titre="Horaire a definir">
              Cet horaire vient d&apos;un import ou d&apos;une saisie provisoire.
              Il doit etre fixe avant publication.
            </Alerte>
          ) : null}

          <Champ label="Libelle du creneau" htmlFor={`label-creneau-${session.id}`} requis>
            <Input
              id={`label-creneau-${session.id}`}
              name="label"
              defaultValue={session.label}
              required
            />
          </Champ>

          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Date de debut" htmlFor={`dd-${session.id}`} requis>
              <Input
                id={`dd-${session.id}`}
                name="dateDebut"
                type="date"
                defaultValue={debut.date}
                required
              />
            </Champ>
            <Champ label="Heure de debut" htmlFor={`hd-${session.id}`} requis>
              <Input
                id={`hd-${session.id}`}
                name="heureDebut"
                type="time"
                defaultValue={debut.time}
                required
              />
            </Champ>
            <Champ
              label="Date de fin"
              htmlFor={`df-${session.id}`}
              requis
              aide="Changez la date si le creneau se termine le lendemain."
            >
              <Input
                id={`df-${session.id}`}
                name="dateFin"
                type="date"
                defaultValue={fin.date}
                required
              />
            </Champ>
            <Champ label="Heure de fin" htmlFor={`hf-${session.id}`} requis>
              <Input
                id={`hf-${session.id}`}
                name="heureFin"
                type="time"
                defaultValue={fin.time}
                required
              />
            </Champ>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Lieu" htmlFor={`lieu-${session.id}`}>
              <Input
                id={`lieu-${session.id}`}
                name="lieu"
                defaultValue={session.locationName}
              />
            </Champ>
            <Champ label="Adresse" htmlFor={`adresse-${session.id}`}>
              <Input
                id={`adresse-${session.id}`}
                name="adresse"
                defaultValue={session.locationAddress}
              />
            </Champ>
          </div>

          <p className="text-xs text-nuit-doux">
            Un changement d&apos;horaire important fait passer les reponses
            concernees a « a reconfirmer » et previent les personnes affectees.
            Les reponses initiales sont conservees.
          </p>

          <SubmitButton taille="compact" libelleEnCours="Enregistrement...">
            Enregistrer le creneau
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
