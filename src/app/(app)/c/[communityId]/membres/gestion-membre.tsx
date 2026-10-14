"use client";

import { useActionState, useState } from "react";
import { ShieldCheck, Sliders, UserMinus } from "lucide-react";
import {
  actionChangerRole,
  actionCompetences,
  actionRetirerMembre,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alerte } from "@/components/ui/primitives";

export function GestionMembre({
  communityId,
  membershipId,
  nom,
  role,
  competences,
  estDernierAdmin,
}: {
  communityId: string;
  membershipId: string;
  nom: string;
  role: "admin" | "membre";
  competences: { id: string; label: string; active: boolean }[];
  estDernierAdmin: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etatRole, actionRole] = useActionState(actionChangerRole, ETAT_INITIAL);
  const [etatRetrait, actionRetrait] = useActionState(
    actionRetirerMembre,
    ETAT_INITIAL,
  );
  const [etatSkills, actionSkills] = useActionState(actionCompetences, ETAT_INITIAL);

  return (
    <div className="space-y-3 border-t border-bordure pt-3">
      {etatRole.status !== "repos" ? (
        <Alerte ton={etatRole.status === "succes" ? "succes" : "erreur"}>
          {etatRole.message}
        </Alerte>
      ) : null}
      {etatRetrait.status !== "repos" ? (
        <Alerte ton={etatRetrait.status === "succes" ? "succes" : "erreur"}>
          {etatRetrait.message}
        </Alerte>
      ) : null}
      {etatSkills.status !== "repos" ? (
        <Alerte ton={etatSkills.status === "succes" ? "succes" : "erreur"}>
          {etatSkills.message}
        </Alerte>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={actionRole}>
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <input
            type="hidden"
            name="role"
            value={role === "admin" ? "membre" : "admin"}
          />
          <SubmitButton
            variante="secondaire"
            taille="compact"
            libelleEnCours="..."
            disabled={role === "admin" && estDernierAdmin}
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            {role === "admin" ? "Retrograder en membre" : "Nommer admin"}
          </SubmitButton>
        </form>

        <Button
          variante="secondaire"
          taille="compact"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
        >
          <Sliders aria-hidden="true" className="size-4" />
          Competences
        </Button>

        <form action={actionRetrait}>
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <SubmitButton
            variante="danger"
            taille="compact"
            libelleEnCours="..."
            disabled={role === "admin" && estDernierAdmin}
            aria-label={`Retirer ${nom} de la communaute`}
          >
            <UserMinus aria-hidden="true" className="size-4" />
            Retirer
          </SubmitButton>
        </form>
      </div>

      {role === "admin" && estDernierAdmin ? (
        <p className="text-xs text-nuit-doux">
          Dernier admin actif : la retrogradation et le retrait sont bloques.
        </p>
      ) : null}

      {ouvert ? (
        <form action={actionSkills} className="space-y-3">
          <input type="hidden" name="communityId" value={communityId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <fieldset>
            <legend className="text-sm font-medium">
              Competences de {nom}
            </legend>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {competences.map((competence) => (
                <li key={competence.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="skillIds"
                      value={competence.id}
                      defaultChecked={competence.active}
                      className="size-5"
                    />
                    {competence.label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <SubmitButton taille="compact" libelleEnCours="Enregistrement...">
            Enregistrer les competences
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
