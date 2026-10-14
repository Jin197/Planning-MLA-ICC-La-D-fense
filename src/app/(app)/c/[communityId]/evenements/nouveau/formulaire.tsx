"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { actionCreerEvenement } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Champ,
  Input,
  Separateur,
  Textarea,
} from "@/components/ui/primitives";

interface LigneCreneau {
  cle: number;
  label: string;
  dateDebut: string;
  heureDebut: string;
  dateFin: string;
  heureFin: string;
}

interface LigneRepetition {
  cle: number;
  label: string;
  dateDebut: string;
  heureDebut: string;
  dateFin: string;
  heureFin: string;
}

let compteur = 0;
const prochaineCle = () => {
  compteur += 1;
  return compteur;
};

/** Quatre cultes, modele habituel du dimanche MLA. */
const MODELE_DIMANCHE: Omit<LigneCreneau, "cle">[] = [
  { label: "Culte 1", dateDebut: "", heureDebut: "09:00", dateFin: "", heureFin: "10:45" },
  { label: "Culte 2", dateDebut: "", heureDebut: "11:00", dateFin: "", heureFin: "12:45" },
  { label: "Culte 3", dateDebut: "", heureDebut: "15:00", dateFin: "", heureFin: "16:45" },
  { label: "Culte 4", dateDebut: "", heureDebut: "17:00", dateFin: "", heureFin: "18:45" },
];

export function FormulaireEvenement({
  communityId,
  equipes,
}: {
  communityId: string;
  equipes: { id: string; name: string }[];
}) {
  const [etat, action] = useActionState(actionCreerEvenement, ETAT_INITIAL);
  const [creneaux, setCreneaux] = useState<LigneCreneau[]>([
    {
      cle: prochaineCle(),
      label: "Culte 1",
      dateDebut: "",
      heureDebut: "09:00",
      dateFin: "",
      heureFin: "10:45",
    },
  ]);
  const [repetitions, setRepetitions] = useState<LigneRepetition[]>([]);

  const majCreneau = (cle: number, patch: Partial<LigneCreneau>) =>
    setCreneaux((lignes) =>
      lignes.map((l) => (l.cle === cle ? { ...l, ...patch } : l)),
    );

  const majRepetition = (cle: number, patch: Partial<LigneRepetition>) =>
    setRepetitions((lignes) =>
      lignes.map((l) => (l.cle === cle ? { ...l, ...patch } : l)),
    );

  const appliquerModele = () => {
    const dateReference = creneaux[0]?.dateDebut ?? "";
    setCreneaux(
      MODELE_DIMANCHE.map((modele) => ({
        ...modele,
        cle: prochaineCle(),
        dateDebut: dateReference,
        dateFin: dateReference,
      })),
    );
  };

  return (
    <form action={action} className="space-y-8" noValidate>
      <input type="hidden" name="communityId" value={communityId} />

      {etat.status === "erreur" ? (
        <Alerte ton="erreur" titre="Creation impossible">
          {etat.message}
        </Alerte>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">1. Informations generales</h2>
        <Champ
          label="Nom de l'evenement"
          htmlFor="titre"
          requis
          erreur={etat.champs?.titre}
        >
          <Input
            id="titre"
            name="titre"
            required
            placeholder="Cultes du dimanche 25 octobre"
            defaultValue={etat.valeurs?.titre ?? ""}
          />
        </Champ>
        <Champ label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={etat.valeurs?.description ?? ""}
            placeholder="Informations utiles aux equipes."
          />
        </Champ>
      </section>

      <Separateur />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">2. Creneaux dates</h2>
          <Button variante="secondaire" taille="compact" onClick={appliquerModele}>
            Modele : 4 cultes du dimanche
          </Button>
        </div>

        <ul className="space-y-4">
          {creneaux.map((creneau, index) => (
            <li
              key={creneau.cle}
              className="rounded-[var(--radius-doux)] border border-bordure p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Creneau {index + 1}</p>
                {creneaux.length > 1 ? (
                  <Button
                    variante="discret"
                    taille="compact"
                    onClick={() =>
                      setCreneaux((lignes) =>
                        lignes.filter((l) => l.cle !== creneau.cle),
                      )
                    }
                    aria-label={`Retirer le creneau ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Retirer
                  </Button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Champ label="Libelle" htmlFor={`label-${creneau.cle}`} requis>
                  <Input
                    id={`label-${creneau.cle}`}
                    name="creneauLabel"
                    value={creneau.label}
                    onChange={(e) => majCreneau(creneau.cle, { label: e.target.value })}
                    placeholder="Culte 1, Culte EJP..."
                    required
                  />
                </Champ>
                <div />
                <Champ label="Date de debut" htmlFor={`dd-${creneau.cle}`} requis>
                  <Input
                    id={`dd-${creneau.cle}`}
                    name="creneauDateDebut"
                    type="date"
                    value={creneau.dateDebut}
                    onChange={(e) =>
                      majCreneau(creneau.cle, {
                        dateDebut: e.target.value,
                        dateFin: creneau.dateFin || e.target.value,
                      })
                    }
                    required
                  />
                </Champ>
                <Champ label="Heure de debut" htmlFor={`hd-${creneau.cle}`} requis>
                  <Input
                    id={`hd-${creneau.cle}`}
                    name="creneauHeureDebut"
                    type="time"
                    value={creneau.heureDebut}
                    onChange={(e) =>
                      majCreneau(creneau.cle, { heureDebut: e.target.value })
                    }
                    required
                  />
                </Champ>
                <Champ
                  label="Date de fin"
                  htmlFor={`df-${creneau.cle}`}
                  requis
                  aide="A changer si le creneau se termine le lendemain."
                >
                  <Input
                    id={`df-${creneau.cle}`}
                    name="creneauDateFin"
                    type="date"
                    value={creneau.dateFin || creneau.dateDebut}
                    onChange={(e) => majCreneau(creneau.cle, { dateFin: e.target.value })}
                    required
                  />
                </Champ>
                <Champ label="Heure de fin" htmlFor={`hf-${creneau.cle}`} requis>
                  <Input
                    id={`hf-${creneau.cle}`}
                    name="creneauHeureFin"
                    type="time"
                    value={creneau.heureFin}
                    onChange={(e) => majCreneau(creneau.cle, { heureFin: e.target.value })}
                    required
                  />
                </Champ>
                <Champ label="Lieu" htmlFor={`lieu-${creneau.cle}`}>
                  <Input
                    id={`lieu-${creneau.cle}`}
                    name="creneauLieu"
                    placeholder="ICC La Defense"
                  />
                </Champ>
                <Champ label="Adresse" htmlFor={`adresse-${creneau.cle}`}>
                  <Input id={`adresse-${creneau.cle}`} name="creneauAdresse" />
                </Champ>
              </div>
            </li>
          ))}
        </ul>

        <Button
          variante="secondaire"
          onClick={() =>
            setCreneaux((lignes) => [
              ...lignes,
              {
                cle: prochaineCle(),
                label: `Culte ${lignes.length + 1}`,
                dateDebut: lignes[0]?.dateDebut ?? "",
                heureDebut: "",
                dateFin: lignes[0]?.dateDebut ?? "",
                heureFin: "",
              },
            ])
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Ajouter un creneau
        </Button>
      </section>

      <Separateur />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">3. Equipes a preparer</h2>
        <p className="text-sm text-nuit-doux">
          Un plan est cree pour chaque equipe cochee, sur chaque creneau.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {equipes.map((equipe, index) => (
            <li key={equipe.id}>
              <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] border border-bordure px-3 text-sm">
                <input
                  type="checkbox"
                  name="teamIds"
                  value={equipe.id}
                  defaultChecked={index === 0}
                  className="size-5"
                />
                {equipe.name}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <Separateur />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">4. Repetitions (facultatif)</h2>
        <p className="text-sm text-nuit-doux">
          Les repetitions ont leurs propres reponses de disponibilite. Une
          repetition peut se terminer apres minuit : indiquez alors la date de fin
          du lendemain.
        </p>

        <ul className="space-y-4">
          {repetitions.map((repetition, index) => (
            <li
              key={repetition.cle}
              className="rounded-[var(--radius-doux)] border border-bordure p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Repetition {index + 1}</p>
                <Button
                  variante="discret"
                  taille="compact"
                  onClick={() =>
                    setRepetitions((lignes) =>
                      lignes.filter((l) => l.cle !== repetition.cle),
                    )
                  }
                  aria-label={`Retirer la repetition ${index + 1}`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Retirer
                </Button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Champ label="Libelle" htmlFor={`rl-${repetition.cle}`}>
                  <Input
                    id={`rl-${repetition.cle}`}
                    name="repetitionLabel"
                    value={repetition.label}
                    onChange={(e) =>
                      majRepetition(repetition.cle, { label: e.target.value })
                    }
                    placeholder="Repetition generale"
                  />
                </Champ>
                <div />
                <Champ label="Date de debut" htmlFor={`rdd-${repetition.cle}`} requis>
                  <Input
                    id={`rdd-${repetition.cle}`}
                    name="repetitionDateDebut"
                    type="date"
                    value={repetition.dateDebut}
                    onChange={(e) =>
                      majRepetition(repetition.cle, {
                        dateDebut: e.target.value,
                        dateFin: repetition.dateFin || e.target.value,
                      })
                    }
                  />
                </Champ>
                <Champ label="Heure de debut" htmlFor={`rhd-${repetition.cle}`} requis>
                  <Input
                    id={`rhd-${repetition.cle}`}
                    name="repetitionHeureDebut"
                    type="time"
                    value={repetition.heureDebut}
                    onChange={(e) =>
                      majRepetition(repetition.cle, { heureDebut: e.target.value })
                    }
                  />
                </Champ>
                <Champ label="Date de fin" htmlFor={`rdf-${repetition.cle}`} requis>
                  <Input
                    id={`rdf-${repetition.cle}`}
                    name="repetitionDateFin"
                    type="date"
                    value={repetition.dateFin || repetition.dateDebut}
                    onChange={(e) =>
                      majRepetition(repetition.cle, { dateFin: e.target.value })
                    }
                  />
                </Champ>
                <Champ label="Heure de fin" htmlFor={`rhf-${repetition.cle}`} requis>
                  <Input
                    id={`rhf-${repetition.cle}`}
                    name="repetitionHeureFin"
                    type="time"
                    value={repetition.heureFin}
                    onChange={(e) =>
                      majRepetition(repetition.cle, { heureFin: e.target.value })
                    }
                  />
                </Champ>
                <Champ label="Lieu" htmlFor={`rlieu-${repetition.cle}`}>
                  <Input
                    id={`rlieu-${repetition.cle}`}
                    name="repetitionLieu"
                    placeholder="Studio Hyacinthe"
                  />
                </Champ>
                <Champ label="Adresse" htmlFor={`radresse-${repetition.cle}`}>
                  <Input id={`radresse-${repetition.cle}`} name="repetitionAdresse" />
                </Champ>
                <Champ label="Salle ou studio" htmlFor={`rsalle-${repetition.cle}`}>
                  <Input
                    id={`rsalle-${repetition.cle}`}
                    name="repetitionSalle"
                    placeholder="Studio 2"
                  />
                </Champ>
              </div>
            </li>
          ))}
        </ul>

        <Button
          variante="secondaire"
          onClick={() =>
            setRepetitions((lignes) => [
              ...lignes,
              {
                cle: prochaineCle(),
                label: "Repetition",
                dateDebut: "",
                heureDebut: "19:00",
                dateFin: "",
                heureFin: "22:00",
              },
            ])
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Ajouter une repetition
        </Button>
      </section>

      <Separateur />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">5. Collecte des disponibilites</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Limite de reponse - date" htmlFor="limiteDate">
            <Input id="limiteDate" name="limiteDate" type="date" />
          </Champ>
          <Champ label="Limite de reponse - heure" htmlFor="limiteHeure">
            <Input id="limiteHeure" name="limiteHeure" type="time" />
          </Champ>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="ouvrirCollecte"
            defaultChecked
            className="mt-1 size-5"
          />
          <span>
            Ouvrir tout de suite la collecte des disponibilites et prevenir les
            membres actifs. Sinon l&apos;evenement reste en brouillon, visible des
            admins seulement.
          </span>
        </label>
      </section>

      <SubmitButton pleineLargeur libelleEnCours="Creation de l'evenement...">
        Creer l&apos;evenement
      </SubmitButton>
    </form>
  );
}
