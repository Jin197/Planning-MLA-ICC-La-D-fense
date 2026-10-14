"use client";

import Link from "next/link";
import { useActionState } from "react";
import { actionInscription } from "../actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Champ,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export function FormulaireInscription() {
  const [etat, action] = useActionState(actionInscription, ETAT_INITIAL);

  if (etat.status === "succes") {
    return (
      <div className="space-y-4">
        <Alerte ton="succes" titre="Compte cree">
          {etat.message}
        </Alerte>
        {etat.extra?.jeton ? (
          <div className="rounded-[var(--radius-doux)] border border-bordure bg-ivoire-fonce p-4 text-sm">
            <p className="font-medium">Verification de l&apos;email</p>
            <p className="mt-1 break-all text-nuit-doux">
              Jeton : <code>{etat.extra.jeton}</code>
            </p>
            <Link
              href={`/verification-email?jeton=${encodeURIComponent(etat.extra.jeton)}`}
              className="mt-3 inline-block text-indigo-accent underline"
            >
              Verifier mon email maintenant
            </Link>
          </div>
        ) : (
          <Link href="/verification-email" className="text-indigo-accent underline">
            Saisir mon jeton de verification
          </Link>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Inscription incomplete">
          {etat.message}
        </Alerte>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prenom" htmlFor="prenom" requis erreur={etat.champs?.prenom}>
          <Input
            id="prenom"
            name="prenom"
            autoComplete="given-name"
            required
            defaultValue={etat.valeurs?.prenom ?? ""}
          />
        </Champ>
        <Champ label="Nom" htmlFor="nom" requis erreur={etat.champs?.nom}>
          <Input
            id="nom"
            name="nom"
            autoComplete="family-name"
            required
            defaultValue={etat.valeurs?.nom ?? ""}
          />
        </Champ>
      </div>

      <Champ
        label="Email"
        htmlFor="email"
        requis
        aide="Sert d'identifiant de connexion."
        erreur={etat.champs?.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={etat.valeurs?.email ?? ""}
        />
      </Champ>

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ
          label="Mot de passe"
          htmlFor="motDePasse"
          requis
          aide="Au moins 10 caracteres, une lettre et un chiffre."
        >
          <Input
            id="motDePasse"
            name="motDePasse"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Champ>
        <Champ
          label="Confirmer le mot de passe"
          htmlFor="confirmation"
          requis
          erreur={etat.champs?.confirmation}
        >
          <Input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
          />
        </Champ>
      </div>

      <Champ
        label="Ministere declare"
        htmlFor="ministere"
        requis
        aide="Information de profil. Elle n'accorde aucune adhesion ni aucun droit."
      >
        <Input
          id="ministere"
          name="ministere"
          required
          placeholder="Ministere de louange et d'adoration"
          defaultValue={etat.valeurs?.ministere ?? ""}
        />
      </Champ>

      <Champ label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Pupitre, instruments, experience..."
          defaultValue={etat.valeurs?.description ?? ""}
        />
      </Champ>

      <Champ
        label="Es-tu responsable de ministere ou membre ?"
        htmlFor="choix"
        requis
        aide="Ce choix oriente votre accueil. Il ne donne aucun droit sur une communaute : seul un admin peut vous nommer admin de la sienne."
        erreur={etat.champs?.choix}
      >
        <Select
          id="choix"
          name="choix"
          required
          defaultValue={etat.valeurs?.choix ?? "membre"}
        >
          <option value="membre">Membre</option>
          <option value="responsable">Responsable</option>
        </Select>
      </Champ>

      <SubmitButton pleineLargeur libelleEnCours="Creation du compte...">
        Creer mon compte
      </SubmitButton>
    </form>
  );
}
