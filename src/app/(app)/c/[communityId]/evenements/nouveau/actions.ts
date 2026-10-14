"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createEvent, type RehearsalDraft, type SessionDraft } from "@/server/services/events";
import {
  booleen,
  echec,
  liste,
  texte,
  texteOuNull,
  valeursDe,
  type FormState,
} from "@/lib/form";

/**
 * Creation d'un evenement. Le formulaire est progressif : les creneaux et les
 * repetitions sont saisis en lignes repetables, avec date ET heure.
 */
export async function actionCreerEvenement(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const valeurs = valeursDe(data, ["titre", "description"]);

  const titre = texte(data, "titre");
  if (titre === "") {
    return echec("Le nom de l'evenement est requis.", {
      champs: { titre: "Indiquez un nom." },
      valeurs,
    });
  }

  // Les creneaux arrivent en colonnes paralleles : un index par ligne.
  const labels = data.getAll("creneauLabel").map(String);
  const datesDebut = data.getAll("creneauDateDebut").map(String);
  const heuresDebut = data.getAll("creneauHeureDebut").map(String);
  const datesFin = data.getAll("creneauDateFin").map(String);
  const heuresFin = data.getAll("creneauHeureFin").map(String);
  const lieux = data.getAll("creneauLieu").map(String);
  const adresses = data.getAll("creneauAdresse").map(String);

  const sessions: SessionDraft[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const label = (labels[index] ?? "").trim();
    const dateDebut = (datesDebut[index] ?? "").trim();
    const heureDebut = (heuresDebut[index] ?? "").trim();
    if (label === "" && dateDebut === "" && heureDebut === "") continue;
    if (dateDebut === "" || heureDebut === "") {
      return echec(
        `Le creneau « ${label || index + 1} » a besoin d'une date et d'une heure de debut.`,
        { valeurs },
      );
    }
    const dateFin = (datesFin[index] ?? "").trim() || dateDebut;
    const heureFin = (heuresFin[index] ?? "").trim();
    if (heureFin === "") {
      return echec(
        `Le creneau « ${label || index + 1} » a besoin d'une heure de fin.`,
        { valeurs },
      );
    }
    sessions.push({
      label,
      start: { date: dateDebut, time: heureDebut },
      end: { date: dateFin, time: heureFin },
      locationName: (lieux[index] ?? "").trim(),
      locationAddress: (adresses[index] ?? "").trim(),
      scheduleProvisional: false,
    });
  }

  if (sessions.length === 0) {
    return echec("Ajoutez au moins un creneau date.", { valeurs });
  }

  const teamIds = liste(data, "teamIds");
  if (teamIds.length === 0) {
    return echec("Choisissez au moins une equipe a preparer.", { valeurs });
  }

  // Repetitions
  const repLabels = data.getAll("repetitionLabel").map(String);
  const repDatesDebut = data.getAll("repetitionDateDebut").map(String);
  const repHeuresDebut = data.getAll("repetitionHeureDebut").map(String);
  const repDatesFin = data.getAll("repetitionDateFin").map(String);
  const repHeuresFin = data.getAll("repetitionHeureFin").map(String);
  const repLieux = data.getAll("repetitionLieu").map(String);
  const repAdresses = data.getAll("repetitionAdresse").map(String);
  const repSalles = data.getAll("repetitionSalle").map(String);

  const rehearsals: RehearsalDraft[] = [];
  for (let index = 0; index < repLabels.length; index += 1) {
    const dateDebut = (repDatesDebut[index] ?? "").trim();
    const heureDebut = (repHeuresDebut[index] ?? "").trim();
    if (dateDebut === "" || heureDebut === "") continue;
    const heureFin = (repHeuresFin[index] ?? "").trim();
    if (heureFin === "") {
      return echec("Chaque repetition a besoin d'une heure de fin.", { valeurs });
    }
    rehearsals.push({
      label: (repLabels[index] ?? "").trim() || "Repetition",
      start: { date: dateDebut, time: heureDebut },
      // Une repetition qui se termine apres minuit a une date de fin differente.
      end: { date: (repDatesFin[index] ?? "").trim() || dateDebut, time: heureFin },
      locationName: (repLieux[index] ?? "").trim(),
      locationAddress: (repAdresses[index] ?? "").trim(),
      room: (repSalles[index] ?? "").trim(),
      teamIds,
    });
  }

  const limiteDate = texte(data, "limiteDate");
  const limiteHeure = texte(data, "limiteHeure");

  const result = await createEvent(communityId, {
    title: titre,
    description: texteOuNull(data, "description") ?? "",
    sessions,
    teamIds,
    rehearsals,
    responseDeadline:
      limiteDate !== "" && limiteHeure !== ""
        ? { date: limiteDate, time: limiteHeure }
        : null,
    openCollection: booleen(data, "ouvrirCollecte"),
  });

  if (!result.ok) return echec(result.message, { valeurs });
  revalidatePath(`/c/${communityId}/planning`);
  redirect(`/c/${communityId}/evenements/${result.value.eventId}`);
}
