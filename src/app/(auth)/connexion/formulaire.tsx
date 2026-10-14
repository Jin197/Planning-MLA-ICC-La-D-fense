"use client";

import { useActionState } from "react";
import { actionConnexion } from "../actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Champ, Input } from "@/components/ui/primitives";

export function FormulaireConnexion() {
  const [etat, action] = useActionState(actionConnexion, ETAT_INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Connexion impossible">
          {etat.message}
        </Alerte>
      ) : null}

      <Champ label="Email" htmlFor="email" requis>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={etat.valeurs?.email ?? ""}
        />
      </Champ>

      <Champ label="Mot de passe" htmlFor="motDePasse" requis>
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
        />
      </Champ>

      <SubmitButton pleineLargeur libelleEnCours="Connexion...">
        Se connecter
      </SubmitButton>
    </form>
  );
}
