"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createEvent,
  type RehearsalDraft,
  type SessionDraft,
  type TeamDraft,
} from "@/server/services/events";
import {
  booleen,
  echec,
  texte,
  texteOuNull,
  valeursDe,
  type FormState,
} from "@/lib/form";

/**
 * Creation d'un evenement.
 *
 * L'admin nomme l'evenement, lui donne son horaire, puis ajoute librement
 * des sous-evenements (zero, un ou plusieurs) et des equipes. Chaque equipe
 * est rattachee soit a des sous-evenements precis, soit a toute la duree de
 * l'evenement.
 *
 * Les lignes repetables arrivent en colonnes paralleles : un index par ligne.
 */
export async function actionCreerEvenement(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const valeurs = valeursDe(data, [
    "titre",
    "description",
    "dateDebut",
    "heureDebut",
    "dateFin",
    "heureFin",
    "lieu",
    "adresse",
  ]);

  const titre = texte(data, "titre");
  if (titre === "") {
    return echec("Le nom de l'evenement est requis.", {
      champs: { titre: "Indiquez un nom." },
      valeurs,
    });
  }

  const dateDebut = texte(data, "dateDebut");
  const heureDebut = texte(data, "heureDebut");
  const heureFin = texte(data, "heureFin");
  if (dateDebut === "" || heureDebut === "" || heureFin === "") {
    return echec(
      "Indiquez la date, l'heure de debut et l'heure de fin de l'evenement.",
      { valeurs },
    );
  }

  /* --- Sous-evenements, facultatifs --------------------------------------- */
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
    const debut = (datesDebut[index] ?? "").trim();
    const heure = (heuresDebut[index] ?? "").trim();
    if (label === "" && debut === "" && heure === "") continue;
    if (debut === "" || heure === "") {
      return echec(
        `Le sous-evenement « ${label || index + 1} » a besoin d'une date et d'une heure de debut.`,
        { valeurs },
      );
    }
    const fin = (heuresFin[index] ?? "").trim();
    if (fin === "") {
      return echec(
        `Le sous-evenement « ${label || index + 1} » a besoin d'une heure de fin.`,
        { valeurs },
      );
    }
    sessions.push({
      label,
      start: { date: debut, time: heure },
      end: { date: (datesFin[index] ?? "").trim() || debut, time: fin },
      locationName: (lieux[index] ?? "").trim(),
      locationAddress: (adresses[index] ?? "").trim(),
      scheduleProvisional: false,
    });
  }

  /* --- Equipes de l'evenement -------------------------------------------- */
  const nomsEquipes = data.getAll("equipeNom").map(String);
  const teams: TeamDraft[] = [];
  for (let index = 0; index < nomsEquipes.length; index += 1) {
    const name = (nomsEquipes[index] ?? "").trim();
    if (name === "") continue;
    teams.push({
      name,
      // Chaque equipe a ses propres champs, nommes par son rang.
      membershipIds: data.getAll(`equipeMembres-${index}`).map(String),
      sessionOrdinals: data
        .getAll(`equipeSousEvenements-${index}`)
        .map((value) => Number(String(value)))
        .filter((ordinal) => Number.isInteger(ordinal) && ordinal > 0),
      // Aucun poste coche : l'equipe reprend tout le modele.
      templateFieldIds: data.getAll(`equipePostes-${index}`).map(String),
    });
  }
  if (teams.length === 0) {
    return echec("Creez au moins une equipe dans cet evenement.", { valeurs });
  }

  const nomsDoublons = teams
    .map((t) => t.name.toLowerCase())
    .filter((nom, index, tous) => tous.indexOf(nom) !== index);
  if (nomsDoublons.length > 0) {
    return echec("Deux equipes portent le meme nom dans cet evenement.", {
      valeurs,
    });
  }

  /* --- Repetitions -------------------------------------------------------- */
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
    const debut = (repDatesDebut[index] ?? "").trim();
    const heure = (repHeuresDebut[index] ?? "").trim();
    if (debut === "" || heure === "") continue;
    const fin = (repHeuresFin[index] ?? "").trim();
    if (fin === "") {
      return echec("Chaque repetition a besoin d'une heure de fin.", { valeurs });
    }
    const equipes = data
      .getAll(`repetitionEquipes-${index}`)
      .map((value) => Number(String(value)))
      .filter((ordinal) => Number.isInteger(ordinal) && ordinal > 0);
    rehearsals.push({
      label: (repLabels[index] ?? "").trim() || "Repetition",
      start: { date: debut, time: heure },
      // Une repetition qui se termine apres minuit a une date de fin differente.
      end: { date: (repDatesFin[index] ?? "").trim() || debut, time: fin },
      locationName: (repLieux[index] ?? "").trim(),
      locationAddress: (repAdresses[index] ?? "").trim(),
      room: (repSalles[index] ?? "").trim(),
      // Sans selection, toutes les equipes de l'evenement sont concernees.
      teamOrdinals:
        equipes.length > 0 ? equipes : teams.map((_, rang) => rang + 1),
    });
  }

  const limiteDate = texte(data, "limiteDate");
  const limiteHeure = texte(data, "limiteHeure");

  const result = await createEvent(communityId, {
    title: titre,
    description: texteOuNull(data, "description") ?? "",
    start: { date: dateDebut, time: heureDebut },
    end: { date: texte(data, "dateFin") || dateDebut, time: heureFin },
    locationName: texte(data, "lieu"),
    locationAddress: texte(data, "adresse"),
    sessions,
    teams,
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
