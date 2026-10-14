"use client";

import { useActionState } from "react";
import { actionReinitialisation } from "../actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Champ, Input } from "@/components/ui/primitives";

export function FormulaireReinitialisation({ jeton }: { jeton: string }) {
  const [etat, action] = useActionState(actionReinitialisation, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      {etat.status === "erreur" ? (
        <Alerte ton="erreur">{etat.message}</Alerte>
      ) : null}
      <Champ label="Jeton" htmlFor="jeton" requis>
        <Input id="jeton" name="jeton" required defaultValue={etat.valeurs?.jeton ?? jeton} />
      </Champ>
      <Champ
        label="Nouveau mot de passe"
        htmlFor="motDePasse"
        requis
        aide="Au moins 10 caracteres, une lettre et un chiffre."
      >
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Champ>
      <Champ label="Confirmer" htmlFor="confirmation" requis>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </Champ>
      <SubmitButton pleineLargeur libelleEnCours="Enregistrement...">
        Enregistrer le nouveau mot de passe
      </SubmitButton>
    </form>
  );
}
