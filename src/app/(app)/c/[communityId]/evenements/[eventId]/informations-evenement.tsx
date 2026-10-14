"use client";

import { useActionState, useState } from "react";
import { PencilLine } from "lucide-react";
import { actionModifierEvenement } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
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
 * Correction du nom et de la description.
 *
 * Une correction de ce genre ne touche ni les disponibilites, ni les
 * confirmations : seules les modifications d'horaire declenchent une
 * reconfirmation.
 */
export function InformationsEvenement({
  communityId,
  eventId,
  version,
  titre,
  description,
}: {
  communityId: string;
  eventId: string;
  version: number;
  titre: string;
  description: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(actionModifierEvenement, ETAT_INITIAL);

  return (
    <Card>
      <CardHeader
        titre="Informations de l'evenement"
        sousTitre="Corriger le nom ou la description ne remet aucune reponse a zero."
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
