"use client";

import { useActionState } from "react";
import { actionVerification } from "../actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Champ, Input } from "@/components/ui/primitives";

export function FormulaireVerification({ jeton }: { jeton: string }) {
  const [etat, action] = useActionState(actionVerification, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Verification impossible">
          {etat.message}
        </Alerte>
      ) : null}
      <Champ
        label="Jeton de verification"
        htmlFor="jeton"
        requis
        aide="Colle ici le jeton recu."
      >
        <Input id="jeton" name="jeton" required defaultValue={jeton} />
      </Champ>
      <SubmitButton libelleEnCours="Verification..." pleineLargeur>
        Verifier mon email
      </SubmitButton>
    </form>
  );
}
