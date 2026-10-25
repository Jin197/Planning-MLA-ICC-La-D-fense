"use client";

import { useActionState } from "react";
import { Plus, Users } from "lucide-react";
import {
  actionCreerCompetence,
  actionCreerEquipe,
  actionMembresEquipe,
} from "../membres/actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Input,
} from "@/components/ui/primitives";

export function GestionEquipes({
  communityId,
  equipes,
  membres,
  competences,
}: {
  communityId: string;
  equipes: { id: string; name: string }[];
  membres: { membershipId: string; nom: string; equipes: string[] }[];
  competences: string[];
}) {
  const [etatEquipe, actionEquipe] = useActionState(actionCreerEquipe, ETAT_INITIAL);
  const [etatMembres, actionMembres] = useActionState(
    actionMembresEquipe,
    ETAT_INITIAL,
  );
  const [etatCompetence, actionCompetence] = useActionState(
    actionCreerCompetence,
    ETAT_INITIAL,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          titre="Equipes"
          sousTitre="Un plan est prepare par equipe et par creneau."
        />
        <CardBody className="space-y-5">
          {etatEquipe.status !== "repos" ? (
            <Alerte ton={etatEquipe.status === "succes" ? "succes" : "erreur"}>
              {etatEquipe.message}
            </Alerte>
          ) : null}
          {etatMembres.status !== "repos" ? (
            <Alerte ton={etatMembres.status === "succes" ? "succes" : "erreur"}>
              {etatMembres.message}
            </Alerte>
          ) : null}

          <ul className="space-y-4">
            {equipes.map((equipe) => (
              <li
                key={equipe.id}
                className="rounded-[var(--radius-doux)] bg-ivoire-fonce/60 p-3"
              >
                <p className="flex items-center gap-2 font-medium">
                  <Users aria-hidden="true" className="size-4" />
                  {equipe.name}
                </p>
                <form action={actionMembres} className="mt-3 space-y-3">
                  <input type="hidden" name="communityId" value={communityId} />
                  <input type="hidden" name="teamId" value={equipe.id} />
                  <fieldset>
                    <legend className="text-xs font-medium text-nuit-doux">
                      Participants
                    </legend>
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {membres.map((membre) => (
                        <li key={membre.membershipId}>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="membershipIds"
                              value={membre.membershipId}
                              defaultChecked={membre.equipes.includes(equipe.name)}
                              className="size-5"
                            />
                            {membre.nom}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                  <SubmitButton
                    variante="secondaire"
                    taille="compact"
                    libelleEnCours="Enregistrement..."
                  >
                    Enregistrer cette equipe
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>

          <form action={actionEquipe} className="flex flex-wrap items-end gap-3 border-t border-bordure pt-4">
            <input type="hidden" name="communityId" value={communityId} />
            <div className="min-w-0 flex-1">
              <label htmlFor="nom-equipe" className="block text-xs font-medium text-nuit-doux">
                Nouvelle equipe
              </label>
              <Input
                id="nom-equipe"
                name="nom"
                required
                className="mt-1"
                placeholder="Equipe 3, EJP, Mass Choir..."
              />
            </div>
            <SubmitButton taille="compact" libelleEnCours="Creation...">
              <Plus aria-hidden="true" className="size-4" />
              Creer
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre="Competences"
          sousTitre="Elles aident au choix dans le selecteur de membres. Elles ne constituent pas une preuve de qualification."
        />
        <CardBody className="space-y-4">
          {etatCompetence.status !== "repos" ? (
            <Alerte ton={etatCompetence.status === "succes" ? "succes" : "erreur"}>
              {etatCompetence.message}
            </Alerte>
          ) : null}

          <ul className="flex flex-wrap gap-2">
            {competences.map((competence) => (
              <li key={competence}>
                <Badge ton="indigo">{competence}</Badge>
              </li>
            ))}
          </ul>

          <form action={actionCompetence} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="communityId" value={communityId} />
            <div className="min-w-0 flex-1">
              <label
                htmlFor="label-competence"
                className="block text-xs font-medium text-nuit-doux"
              >
                Nouvelle competence
              </label>
              <Input
                id="label-competence"
                name="label"
                required
                className="mt-1"
                placeholder="Guitare basse, Captation..."
              />
            </div>
            <SubmitButton taille="compact" libelleEnCours="Ajout...">
              <Plus aria-hidden="true" className="size-4" />
              Ajouter
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
