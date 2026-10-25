"use client";

import { useActionState, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { actionAjouterCreneau } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  Champ,
  Input,
} from "@/components/ui/primitives";

/**
 * Ajout d'un sous-evenement a un evenement deja cree : un cinquieme culte
 * decide en cours de route, un atelier qui s'ajoute.
 *
 * Les sous-evenements sont facultatifs. Le premier ajoute deplace la question
 * posee aux membres — elle portait sur l'evenement, elle portera sur lui — et
 * les reponses deja donnees lui sont rattachees : c'est annonce ici.
 */
export function AjouterSousEvenement({
  communityId,
  eventId,
  version,
  equipes,
  premier,
}: {
  communityId: string;
  eventId: string;
  version: number;
  equipes: { id: string; name: string }[];
  premier: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(actionAjouterCreneau, ETAT_INITIAL);

  return (
    <Card>
      <CardHeader
        titre="Ajouter un sous-evenement"
        sousTitre="Culte 1, Culte 2, atelier... Facultatif : un evenement peut rester d'un seul bloc."
        actions={
          <Button
            variante="secondaire"
            taille="compact"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            {ouvert ? "Masquer" : "Ajouter"}
          </Button>
        }
      />
      {ouvert ? (
        <CardBody className="space-y-4">
          <form action={action} className="space-y-4">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="version" value={version} />

            {etat.status !== "repos" ? (
              <Alerte ton={etat.status === "succes" ? "succes" : "erreur"}>
                {etat.message}
              </Alerte>
            ) : null}

            {premier ? (
              <Alerte ton="attention" titre="Premier sous-evenement">
                Les membres repondent aujourd&apos;hui sur l&apos;evenement
                entier. Des ce premier sous-evenement, la question portera sur
                lui : les reponses deja donnees lui sont rattachees, rien
                n&apos;est perdu.
              </Alerte>
            ) : null}

            <Champ label="Libelle" htmlFor="nouveau-creneau-label" requis>
              <Input
                id="nouveau-creneau-label"
                name="label"
                required
                placeholder="Culte 1, Culte EJP, Atelier..."
              />
            </Champ>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Date de debut" htmlFor="nouveau-creneau-dd" requis>
                <Input id="nouveau-creneau-dd" name="dateDebut" type="date" required />
              </Champ>
              <Champ label="Heure de debut" htmlFor="nouveau-creneau-hd" requis>
                <Input id="nouveau-creneau-hd" name="heureDebut" type="time" required />
              </Champ>
              <Champ
                label="Date de fin"
                htmlFor="nouveau-creneau-df"
                aide="A renseigner seulement s'il se termine le lendemain."
              >
                <Input id="nouveau-creneau-df" name="dateFin" type="date" />
              </Champ>
              <Champ label="Heure de fin" htmlFor="nouveau-creneau-hf" requis>
                <Input id="nouveau-creneau-hf" name="heureFin" type="time" required />
              </Champ>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Lieu" htmlFor="nouveau-creneau-lieu">
                <Input id="nouveau-creneau-lieu" name="lieu" />
              </Champ>
              <Champ label="Adresse" htmlFor="nouveau-creneau-adresse">
                <Input id="nouveau-creneau-adresse" name="adresse" />
              </Champ>
            </div>

            {equipes.length > 0 ? (
              <fieldset>
                <legend className="text-sm font-medium">
                  Equipes a rattacher
                </legend>
                <p className="mt-1 text-xs text-nuit-doux">
                  Chaque equipe cochee recoit sa feuille de postes sur ce
                  sous-evenement. Vous pourrez la rattacher plus tard.
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {equipes.map((equipe) => (
                    <li key={equipe.id}>
                      <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 text-sm">
                        <input
                          type="checkbox"
                          name="teamIds"
                          value={equipe.id}
                          className="size-5"
                        />
                        {equipe.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}

            <SubmitButton libelleEnCours="Ajout...">
              Ajouter ce sous-evenement
            </SubmitButton>
          </form>
        </CardBody>
      ) : null}
    </Card>
  );
}
