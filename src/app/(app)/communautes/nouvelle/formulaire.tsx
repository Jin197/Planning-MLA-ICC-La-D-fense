"use client";

import { useActionState, useState } from "react";
import { actionCreerCommunaute } from "../actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Champ,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

const TYPES = [
  { value: "MLA", label: "MLA - Ministere de louange et d'adoration" },
  { value: "ACCUEIL", label: "Accueil" },
  { value: "SONORISATION", label: "Sonorisation" },
  { value: "INTEGRATION", label: "Integration" },
  { value: "AUTRE", label: "Autre" },
] as const;

export function FormulaireCommunaute({
  nomResponsable,
  desactive,
}: {
  nomResponsable: string;
  desactive: boolean;
}) {
  const [etat, action] = useActionState(actionCreerCommunaute, ETAT_INITIAL);
  const [type, setType] = useState(etat.valeurs?.type ?? "MLA");

  return (
    <form action={action} className="space-y-5" noValidate>
      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Creation impossible">
          {etat.message}
        </Alerte>
      ) : null}

      <Champ label="Nom de la communaute" htmlFor="nom" requis erreur={etat.champs?.nom}>
        <Input
          id="nom"
          name="nom"
          required
          placeholder="MLA La Defense"
          defaultValue={etat.valeurs?.nom ?? ""}
        />
      </Champ>

      <Champ label="Type" htmlFor="type" requis erreur={etat.champs?.type}>
        <Select
          id="type"
          name="type"
          required
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Champ>

      {type === "AUTRE" ? (
        <Champ
          label="Precision du type"
          htmlFor="autreLibelle"
          requis
          erreur={etat.champs?.autreLibelle}
        >
          <Input
            id="autreLibelle"
            name="autreLibelle"
            required
            placeholder="Media, Securite, Protocole..."
            defaultValue={etat.valeurs?.autreLibelle ?? ""}
          />
        </Champ>
      ) : null}

      <Champ
        label="Description"
        htmlFor="description"
        aide="Visible dans le catalogue public."
      >
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={etat.valeurs?.description ?? ""}
        />
      </Champ>

      <Champ
        label="Nom du responsable"
        htmlFor="responsable"
        aide="Prerempli depuis votre profil. C'est un nom d'affichage : pour donner des droits a quelqu'un d'autre, invitez son compte verifie puis nommez-le admin."
      >
        <Input
          id="responsable"
          name="responsable"
          defaultValue={etat.valeurs?.responsable || nomResponsable}
        />
      </Champ>

      <SubmitButton
        pleineLargeur
        disabled={desactive}
        libelleEnCours="Creation de la communaute..."
      >
        Creer la communaute
      </SubmitButton>
      {desactive ? (
        <p className="text-xs text-nuit-doux">
          Verifiez votre email pour activer ce bouton.
        </p>
      ) : null}
    </form>
  );
}
