"use client";

import { useActionState } from "react";
import { Archive } from "lucide-react";
import { actionArchiverChant, actionCreerChant } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Champ, Input, Textarea } from "@/components/ui/primitives";

/** Archivage d'un chant du repertoire. */
export function BoutonArchiverChant({
  communityId,
  songId,
  titre,
}: {
  communityId: string;
  songId: string;
  titre: string;
}) {
  const [etat, action] = useActionState(actionArchiverChant, ETAT_INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="songId" value={songId} />
      <SubmitButton
        variante="discret"
        taille="compact"
        libelleEnCours="..."
        aria-label={`Archiver « ${titre} »`}
      >
        <Archive aria-hidden="true" className="size-4" />
        Archiver
      </SubmitButton>
      {etat.status === "erreur" ? (
        <p className="mt-1 text-xs text-indispo-texte">{etat.message}</p>
      ) : null}
    </form>
  );
}

export function FormulaireChant({ communityId }: { communityId: string }) {
  const [etat, action] = useActionState(actionCreerChant, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="communityId" value={communityId} />

      {etat.status === "succes" ? (
        <Alerte ton="succes">{etat.message}</Alerte>
      ) : null}
      {etat.status === "erreur" ? (
        <Alerte ton="erreur">{etat.message}</Alerte>
      ) : null}

      <Champ label="Titre" htmlFor="titre" requis>
        <Input id="titre" name="titre" required />
      </Champ>

      <div className="grid gap-4 sm:grid-cols-3">
        <Champ label="Tonalite" htmlFor="tonalite">
          <Input id="tonalite" name="tonalite" placeholder="La mineur" />
        </Champ>
        <Champ label="Tempo (bpm)" htmlFor="tempo">
          <Input id="tempo" name="tempo" type="number" min={30} max={300} />
        </Champ>
        <Champ label="Lead habituel" htmlFor="lead">
          <Input id="lead" name="lead" />
        </Champ>
      </div>

      <Champ
        label="Lien utile"
        htmlFor="liens"
        aide="Adresse https complete. Elle sera presentee comme ressource externe."
      >
        <Input id="liens" name="liens" type="url" placeholder="https://..." />
      </Champ>

      <Champ label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Champ>

      <SubmitButton libelleEnCours="Ajout...">Ajouter au repertoire</SubmitButton>
    </form>
  );
}
