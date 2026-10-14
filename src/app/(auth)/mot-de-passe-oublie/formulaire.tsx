"use client";

import Link from "next/link";
import { useActionState } from "react";
import { actionDemandeReinitialisation } from "../actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Champ, Input } from "@/components/ui/primitives";

export function FormulaireOubli() {
  const [etat, action] = useActionState(actionDemandeReinitialisation, ETAT_INITIAL);

  return (
    <div className="space-y-4">
      {etat.status === "succes" ? (
        <Alerte ton="info" titre="Demande enregistree">
          <p>{etat.message}</p>
          {etat.extra?.jeton ? (
            <p className="mt-2 break-all">
              <Link
                href={`/reinitialiser?jeton=${encodeURIComponent(etat.extra.jeton)}`}
                className="underline"
              >
                Definir un nouveau mot de passe
              </Link>
            </p>
          ) : null}
        </Alerte>
      ) : null}

      {etat.status === "erreur" ? (
        <Alerte ton="erreur">{etat.message}</Alerte>
      ) : null}

      <form action={action} className="space-y-4" noValidate>
        <Champ label="Email" htmlFor="email" requis>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={etat.valeurs?.email ?? ""}
          />
        </Champ>
        <SubmitButton pleineLargeur libelleEnCours="Envoi...">
          Demander la reinitialisation
        </SubmitButton>
      </form>
    </div>
  );
}
