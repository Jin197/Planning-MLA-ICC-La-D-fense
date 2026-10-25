"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Users } from "lucide-react";
import { actionAjouterCreneau, actionAjouterEquipe } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  Champ,
  Input,
  Select,
} from "@/components/ui/primitives";

/**
 * Ajout d'un creneau a un evenement deja cree, et ajout d'une equipe sur un
 * creneau existant. Une journee peut gagner un culte supplementaire, ou une
 * seconde equipe venir renforcer un creneau.
 */
export function AjouterCreneau({
  communityId,
  eventId,
  version,
  equipes,
  creneaux,
}: {
  communityId: string;
  eventId: string;
  version: number;
  equipes: { id: string; name: string }[];
  creneaux: { id: string; label: string; equipesPresentes: string[] }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etatCreneau, actionCreneau] = useActionState(
    actionAjouterCreneau,
    ETAT_INITIAL,
  );
  const [etatEquipe, actionEquipe] = useActionState(
    actionAjouterEquipe,
    ETAT_INITIAL,
  );
  const [creneauChoisi, setCreneauChoisi] = useState(creneaux[0]?.id ?? "");

  const creneauCourant = creneaux.find((c) => c.id === creneauChoisi);
  const equipesAbsentes = equipes.filter(
    (e) => !(creneauCourant?.equipesPresentes ?? []).includes(e.id),
  );

  return (
    <Card>
      <CardHeader
        titre="Completer cet evenement"
        sousTitre="Ajouter un creneau, ou preparer le plan d'une equipe supplementaire."
        actions={
          <Button
            variante="secondaire"
            taille="compact"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            {ouvert ? "Masquer" : "Completer"}
          </Button>
        }
      />
      {ouvert ? (
        <CardBody className="space-y-8">
          <form action={actionCreneau} className="space-y-4">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="version" value={version} />

            <h3 className="text-sm font-semibold">Nouveau creneau</h3>

            {etatCreneau.status !== "repos" ? (
              <Alerte ton={etatCreneau.status === "succes" ? "succes" : "erreur"}>
                {etatCreneau.message}
              </Alerte>
            ) : null}

            <Champ label="Libelle" htmlFor="nouveau-creneau-label" requis>
              <Input
                id="nouveau-creneau-label"
                name="label"
                required
                placeholder="Culte 5, Atelier, Culte EJP..."
              />
            </Champ>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Date de debut" htmlFor="nouveau-creneau-dd" requis>
                <Input id="nouveau-creneau-dd" name="dateDebut" type="date" required />
              </Champ>
              <Champ label="Heure de debut" htmlFor="nouveau-creneau-hd" requis>
                <Input id="nouveau-creneau-hd" name="heureDebut" type="time" required />
              </Champ>
              <Champ
                label="Date de fin"
                htmlFor="nouveau-creneau-df"
                aide="A renseigner seulement si le creneau se termine le lendemain."
              >
                <Input id="nouveau-creneau-df" name="dateFin" type="date" />
              </Champ>
              <Champ label="Heure de fin" htmlFor="nouveau-creneau-hf" requis>
                <Input id="nouveau-creneau-hf" name="heureFin" type="time" required />
              </Champ>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Lieu" htmlFor="nouveau-creneau-lieu">
                <Input id="nouveau-creneau-lieu" name="lieu" />
              </Champ>
              <Champ label="Adresse" htmlFor="nouveau-creneau-adresse">
                <Input id="nouveau-creneau-adresse" name="adresse" />
              </Champ>
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Equipes a preparer</legend>
              <p className="mt-1 text-xs text-nuit-doux">
                Sans selection, les equipes deja presentes sur l&apos;evenement
                sont reprises.
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {equipes.map((equipe) => (
                  <li key={equipe.id}>
                    <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 text-sm">
                      <input
                        type="checkbox"
                        name="teamIds"
                        value={equipe.id}
                        className="size-5"
                      />
                      {equipe.name}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <SubmitButton libelleEnCours="Ajout du creneau...">
              Ajouter ce creneau
            </SubmitButton>
          </form>

          {creneaux.length > 0 && equipes.length > 1 ? (
            <form
              action={actionEquipe}
              className="space-y-4 border-t border-bordure pt-6"
            >
              <input type="hidden" name="communityId" value={communityId} />
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="version" value={version} />

              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users aria-hidden="true" className="size-4" />
                Equipe supplementaire sur un creneau existant
              </h3>

              {etatEquipe.status !== "repos" ? (
                <Alerte ton={etatEquipe.status === "succes" ? "succes" : "erreur"}>
                  {etatEquipe.message}
                </Alerte>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Champ label="Creneau" htmlFor="equipe-creneau" requis>
                  <Select
                    id="equipe-creneau"
                    name="sessionId"
                    required
                    value={creneauChoisi}
                    onChange={(event) => setCreneauChoisi(event.target.value)}
                  >
                    {creneaux.map((creneau) => (
                      <option key={creneau.id} value={creneau.id}>
                        {creneau.label}
                      </option>
                    ))}
                  </Select>
                </Champ>
                <Champ label="Equipe" htmlFor="equipe-ajout" requis>
                  <Select id="equipe-ajout" name="teamId" required>
                    {equipesAbsentes.length === 0 ? (
                      <option value="">Toutes les equipes sont deja presentes</option>
                    ) : (
                      equipesAbsentes.map((equipe) => (
                        <option key={equipe.id} value={equipe.id}>
                          {equipe.name}
                        </option>
                      ))
                    )}
                  </Select>
                </Champ>
              </div>

              <SubmitButton
                variante="secondaire"
                libelleEnCours="Ajout du plan..."
                disabled={equipesAbsentes.length === 0}
              >
                Preparer le plan de cette equipe
              </SubmitButton>
              <p className="text-xs text-nuit-doux">
                Une equipe ne peut avoir qu&apos;un seul plan par creneau.
              </p>
            </form>
          ) : null}
        </CardBody>
      ) : null}
    </Card>
  );
}
