"use client";

import { useActionState, useState } from "react";
import { PencilLine } from "lucide-react";
import { actionModifierEvenement } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { utcToLocal } from "@/lib/time";
import type { Event } from "@/domain/types";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  Champ,
  Input,
  Textarea,
} from "@/components/ui/primitives";

/**
 * Nom, description, horaire et lieu de l'evenement.
 *
 * Corriger le nom ou la description ne touche ni les disponibilites ni les
 * confirmations. Deplacer l'horaire, en revanche, demande une
 * reconfirmation — et seulement lorsque l'evenement porte lui-meme les
 * reponses, c'est-a-dire s'il n'a pas de sous-evenement.
 */
export function InformationsEvenement({
  communityId,
  eventId,
  version,
  titre,
  description,
  evenement,
}: {
  communityId: string;
  eventId: string;
  version: number;
  titre: string;
  description: string;
  evenement: Event;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(actionModifierEvenement, ETAT_INITIAL);

  return (
    <Card>
      <CardHeader
        titre="Informations de l'evenement"
        sousTitre="Corriger le nom ou la description ne remet aucune reponse a zero. Deplacer l'horaire demande une reconfirmation."
        actions={
          <Button
            variante="secondaire"
            taille="compact"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
          >
            <PencilLine aria-hidden="true" className="size-4" />
            {ouvert ? "Masquer" : "Modifier"}
          </Button>
        }
      />
      {ouvert ? (
        <CardBody>
          <form action={action} className="space-y-4">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="version" value={version} />

            {etat.status === "succes" ? (
              <Alerte ton="succes">{etat.message}</Alerte>
            ) : null}
            {etat.status === "erreur" ? (
              <Alerte ton="erreur" titre="Modification refusee">
                {etat.message}
              </Alerte>
            ) : null}

            <Champ label="Nom de l'evenement" htmlFor="titre-evenement" requis>
              <Input
                id="titre-evenement"
                name="titre"
                required
                defaultValue={titre}
              />
            </Champ>

            <Champ label="Description" htmlFor="description-evenement">
              <Textarea
                id="description-evenement"
                name="description"
                rows={4}
                defaultValue={description}
              />
            </Champ>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Date de debut" htmlFor="evenement-dd" requis>
                <Input
                  id="evenement-dd"
                  name="dateDebut"
                  type="date"
                  required
                  defaultValue={utcToLocal(evenement.startsAt, evenement.timezone).date}
                />
              </Champ>
              <Champ label="Heure de debut" htmlFor="evenement-hd" requis>
                <Input
                  id="evenement-hd"
                  name="heureDebut"
                  type="time"
                  required
                  defaultValue={utcToLocal(evenement.startsAt, evenement.timezone).time}
                />
              </Champ>
              <Champ
                label="Date de fin"
                htmlFor="evenement-df"
                aide="A renseigner seulement s'il se termine le lendemain."
              >
                <Input
                  id="evenement-df"
                  name="dateFin"
                  type="date"
                  defaultValue={utcToLocal(evenement.endsAt, evenement.timezone).date}
                />
              </Champ>
              <Champ label="Heure de fin" htmlFor="evenement-hf" requis>
                <Input
                  id="evenement-hf"
                  name="heureFin"
                  type="time"
                  required
                  defaultValue={utcToLocal(evenement.endsAt, evenement.timezone).time}
                />
              </Champ>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Lieu" htmlFor="evenement-lieu">
                <Input
                  id="evenement-lieu"
                  name="lieu"
                  defaultValue={evenement.locationName}
                />
              </Champ>
              <Champ label="Adresse" htmlFor="evenement-adresse">
                <Input
                  id="evenement-adresse"
                  name="adresse"
                  defaultValue={evenement.locationAddress}
                />
              </Champ>
            </div>

            <SubmitButton libelleEnCours="Enregistrement...">
              Enregistrer les informations
            </SubmitButton>
            <p className="text-xs text-nuit-doux">
              Version actuelle : {version}. Si un autre admin modifie
              l&apos;evenement entre-temps, l&apos;enregistrement est refuse
              plutot que d&apos;ecraser son travail.
            </p>
          </form>
        </CardBody>
      ) : null}
    </Card>
  );
}
