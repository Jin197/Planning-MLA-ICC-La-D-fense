"use client";

import { useActionState } from "react";
import { actionProfil } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Champ,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export function FormulaireProfil({
  profil,
}: {
  profil: {
    firstName: string;
    lastName: string;
    declaredMinistry: string;
    description: string;
    onboardingChoice: "responsable" | "membre";
  };
}) {
  const [etat, action] = useActionState(actionProfil, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      {etat.status !== "repos" ? (
        <Alerte ton={etat.status === "succes" ? "succes" : "erreur"}>
          {etat.message}
        </Alerte>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prenom" htmlFor="prenom" requis>
          <Input id="prenom" name="prenom" required defaultValue={profil.firstName} />
        </Champ>
        <Champ label="Nom" htmlFor="nom" requis>
          <Input id="nom" name="nom" required defaultValue={profil.lastName} />
        </Champ>
      </div>

      <Champ label="Ministere declare" htmlFor="ministere">
        <Input
          id="ministere"
          name="ministere"
          defaultValue={profil.declaredMinistry}
        />
      </Champ>

      <Champ label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={profil.description}
        />
      </Champ>

      <Champ
        label="Es-tu responsable de ministere ou membre ?"
        htmlFor="choix"
        aide="Ce choix oriente votre accueil. Il ne modifie aucun role dans vos communautes."
      >
        <Select id="choix" name="choix" defaultValue={profil.onboardingChoice}>
          <option value="membre">Membre</option>
          <option value="responsable">Responsable</option>
        </Select>
      </Champ>

      <SubmitButton libelleEnCours="Enregistrement...">
        Enregistrer mon profil
      </SubmitButton>
    </form>
  );
}
