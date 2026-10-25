"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignMember,
  listCandidates,
  removeAssignment,
  selfAssign,
  setAssignmentState,
  type CandidateView,
} from "@/server/services/assignments";
import {
  answerAvailability,
  answerRehearsalAvailability,
} from "@/server/services/availability";
import {
  addSession,
  addSlotToPlan,
  changeEventState,
  duplicateEvent,
  updateEvent,
  updateSessionSchedule,
  updateSlot,
} from "@/server/services/events";
import {
  addTeam,
  attachTeam,
  detachTeam,
  removeTeam,
  renameTeam,
  setTeamMembers,
} from "@/server/services/event-teams";
import {
  addSetlistItem,
  copySetlist,
  moveSetlistItem,
  removeSetlistItem,
} from "@/server/services/songs";
import {
  removeMoodboard,
  uploadMoodboard,
  upsertDressCode,
} from "@/server/services/dresscode";
import {
  editMessage,
  markThreadRead,
  moderateMessage,
  pinMessage,
  postMessage,
} from "@/server/services/messages";
import { toggleEventMute } from "@/server/services/notifications";
import type { AssignmentState, EventState } from "@/domain/types";
import {
  booleen,
  echec,
  liste,
  nombre,
  succes,
  texte,
  texteOuNull,
  type FormState,
} from "@/lib/form";

function rafraichir(communityId: string, eventId: string): void {
  revalidatePath(`/c/${communityId}/evenements/${eventId}`);
  revalidatePath(`/c/${communityId}/planning`);
  revalidatePath("/accueil");
}

/* -------------------------------------------------------------------------- */
/* Disponibilites                                                             */
/* -------------------------------------------------------------------------- */

export async function actionRepondreDisponibilite(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  // Liste vide : l'evenement n'a pas de sous-evenement, la reponse porte
  // sur lui. Le service le verifie et refuse une liste vide s'il en a.
  const sessionIds = liste(data, "sessionIds");
  const reponse = texte(data, "reponse");

  if (reponse !== "disponible" && reponse !== "indisponible") {
    return echec("Choisissez « Disponible » ou « Indisponible ».");
  }

  const result = await answerAvailability(communityId, {
    eventId,
    sessionIds,
    answer: reponse,
    reason: texteOuNull(data, "motif"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    `Reponse enregistree (${result.value.saved}). Le motif reste visible par vous et les admins uniquement.`,
  );
}

export async function actionRepondreRepetition(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const reponse = texte(data, "reponse");
  if (reponse !== "disponible" && reponse !== "indisponible") {
    return echec("Choisissez une reponse.");
  }
  const result = await answerRehearsalAvailability(communityId, {
    rehearsalId: texte(data, "rehearsalId"),
    answer: reponse,
    reason: texteOuNull(data, "motif"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Reponse enregistree pour cette repetition.");
}

/* -------------------------------------------------------------------------- */
/* Affectations                                                               */
/* -------------------------------------------------------------------------- */

export async function chargerCandidats(
  communityId: string,
  slotId: string,
  options: { tous: boolean; recherche: string },
): Promise<{ ok: true; candidats: CandidateView[] } | { ok: false; message: string }> {
  const result = await listCandidates(communityId, slotId, {
    includeAll: options.tous,
    search: options.recherche,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, candidats: result.value.candidates };
}

export async function actionAffecter(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await assignMember(communityId, {
    slotId: texte(data, "slotId"),
    membershipId: texte(data, "membershipId"),
    detail: texteOuNull(data, "detail"),
    exceptionReason: texteOuNull(data, "motifAdministratif"),
    acceptExceptions: booleen(data, "accepterExceptions"),
  });

  if (!result.ok) {
    return echec(result.message, {
      valeurs: {
        slotId: texte(data, "slotId"),
        membershipId: texte(data, "membershipId"),
        detail: texte(data, "detail"),
        code: result.code,
      },
    });
  }
  rafraichir(communityId, eventId);
  return succes(
    result.value.exceptions.length > 0
      ? "Affectation enregistree avec exception. La personne est informee et doit confirmer. Sa disponibilite declaree n'a pas ete modifiee."
      : "Affectation enregistree. La personne est informee et doit confirmer.",
  );
}

export async function actionEtatAffectation(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const cible = texte(data, "cible") as AssignmentState;
  const result = await setAssignmentState(
    communityId,
    texte(data, "assignmentId"),
    cible,
    texteOuNull(data, "note"),
  );
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    cible === "confirmee"
      ? "Participation confirmee."
      : cible === "a_remplacer"
        ? "Empechement signale. Les admins sont prevenus et l'affectation est marquee a remplacer."
        : "Affectation mise a jour.",
  );
}

/**
 * Un membre prend lui-meme un poste ouvert. Les regles — disponibilite
 * declaree, poste encore ouvert, pas de chevauchement — sont verifiees par le
 * service : il n'y a ici aucun admin pour accepter une exception.
 */
export async function actionSePositionner(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await selfAssign(communityId, {
    slotId: texte(data, "slotId"),
    detail: texteOuNull(data, "detail"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    "Vous etes positionne sur ce poste. Les admins en sont informes ; vous pouvez encore signaler un empechement.",
  );
}

export async function actionRetirerAffectation(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await removeAssignment(communityId, texte(data, "assignmentId"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Affectation retiree. L'historique est conserve.");
}

/* -------------------------------------------------------------------------- */
/* Postes du plan                                                             */
/* -------------------------------------------------------------------------- */

export async function actionModifierPoste(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const patch: {
    label?: string;
    minRequired?: number;
    enabled?: boolean;
  } = {};
  if (data.has("label")) patch.label = texte(data, "label");
  if (data.has("minRequired")) patch.minRequired = nombre(data, "minRequired");
  if (data.has("enabled")) patch.enabled = booleen(data, "enabled");

  const result = await updateSlot(communityId, texte(data, "slotId"), patch);
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Poste mis a jour pour cet evenement.");
}

export async function actionAjouterPoste(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await addSlotToPlan(communityId, texte(data, "planId"), {
    label: texte(data, "label"),
    minRequired: nombre(data, "minRequired"),
    allowsDetail: booleen(data, "allowsDetail"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Poste ajoute a ce plan.");
}

/* -------------------------------------------------------------------------- */
/* Cycle de vie                                                               */
/* -------------------------------------------------------------------------- */

export async function actionChangerEtat(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const cible = texte(data, "cible") as EventState;
  const result = await changeEventState(communityId, eventId, cible, {
    expectedVersion: nombre(data, "version"),
    reason: texteOuNull(data, "motif"),
    acceptExceptions: booleen(data, "accepterExceptions"),
  });
  if (!result.ok) {
    return echec(result.message, { valeurs: { code: result.code } });
  }
  rafraichir(communityId, eventId);
  const messages: Record<string, string> = {
    collecte: "Collecte ouverte. Les membres actifs peuvent repondre.",
    publie: "Planning publie. Les membres actifs en sont informes.",
    annule: "Evenement annule. Les personnes concernees sont prevenues.",
    archive: "Evenement archive. Il reste consultable en lecture seule.",
    brouillon: "Evenement repasse en brouillon, visible des admins seulement.",
  };
  return succes(messages[cible] ?? "Etat mis a jour.");
}

export async function actionModifierEvenement(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const dateDebut = texte(data, "dateDebut");
  const result = await updateEvent(communityId, eventId, {
    expectedVersion: nombre(data, "version"),
    title: texte(data, "titre"),
    description: texte(data, "description"),
    locationName: texte(data, "lieu"),
    locationAddress: texte(data, "adresse"),
    ...(dateDebut === ""
      ? {}
      : {
          start: { date: dateDebut, time: texte(data, "heureDebut") },
          // La fin peut tomber le lendemain.
          end: {
            date: texte(data, "dateFin") || dateDebut,
            time: texte(data, "heureFin"),
          },
          clearProvisional: true,
        }),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Informations enregistrees. Les reponses des membres sont intactes.");
}

export async function actionModifierCreneau(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await updateSessionSchedule(communityId, texte(data, "sessionId"), {
    expectedVersion: nombre(data, "version"),
    label: texte(data, "label"),
    start: { date: texte(data, "dateDebut"), time: texte(data, "heureDebut") },
    end: { date: texte(data, "dateFin"), time: texte(data, "heureFin") },
    locationName: texte(data, "lieu"),
    locationAddress: texte(data, "adresse"),
    clearProvisional: true,
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    result.value.reconfirmations > 0
      ? `Sous-evenement mis a jour. ${result.value.reconfirmations} reponse(s) passent a « a reconfirmer » et les personnes concernees sont prevenues.`
      : "Sous-evenement mis a jour.",
  );
}

/**
 * Ajoute un sous-evenement a un evenement deja cree, par exemple un
 * cinquieme culte decide en cours de route. Les equipes cochees y sont
 * rattachees, avec les postes du modele.
 */
export async function actionAjouterCreneau(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const dateDebut = texte(data, "dateDebut");
  const heureDebut = texte(data, "heureDebut");
  const heureFin = texte(data, "heureFin");

  if (dateDebut === "" || heureDebut === "" || heureFin === "") {
    return echec("Indiquez une date, une heure de debut et une heure de fin.");
  }

  const result = await addSession(communityId, eventId, {
    expectedVersion: nombre(data, "version"),
    label: texte(data, "label"),
    start: { date: dateDebut, time: heureDebut },
    // La date de fin peut etre celle du lendemain.
    end: { date: texte(data, "dateFin") || dateDebut, time: heureFin },
    locationName: texte(data, "lieu"),
    locationAddress: texte(data, "adresse"),
    teamIds: liste(data, "teamIds"),
  });

  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    "Sous-evenement ajoute. Les membres peuvent y repondre, et les equipes rattachees y ont leurs postes.",
  );
}

/* -------------------------------------------------------------------------- */
/* Equipes de l'evenement                                                     */
/* -------------------------------------------------------------------------- */

export async function actionCreerEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await addTeam(communityId, eventId, {
    name: texte(data, "nom"),
    membershipIds: liste(data, "membres"),
    sessionIds: liste(data, "sessionIds"),
    // Aucun poste coche : l'equipe reprend tout le modele.
    templateFieldIds: liste(data, "postes"),
    expectedVersion: nombre(data, "version"),
  });
  if (!result.ok) {
    return echec(result.message, { valeurs: { nom: texte(data, "nom") } });
  }
  rafraichir(communityId, eventId);
  return succes(
    "Equipe creee dans cet evenement, avec les postes du modele sur chaque rattachement.",
  );
}

export async function actionRenommerEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await renameTeam(communityId, texte(data, "teamId"), {
    name: texte(data, "nom"),
    expectedVersion: nombre(data, "version"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Equipe renommee.");
}

export async function actionSupprimerEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await removeTeam(communityId, texte(data, "teamId"), {
    expectedVersion: nombre(data, "version"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    result.value.assignmentsRemoved > 0
      ? `Equipe supprimee, avec ${result.value.assignmentsRemoved} affectation(s) qui en dependaient.`
      : "Equipe supprimee.",
  );
}

export async function actionEffectifEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await setTeamMembers(communityId, texte(data, "teamId"), {
    membershipIds: liste(data, "membres"),
    expectedVersion: nombre(data, "version"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    `Effectif enregistre : ${result.value.members} personne(s). Elles apparaissent en tete du choix des candidats.`,
  );
}

/** Rattache une equipe a un sous-evenement, ou a tout l'evenement. */
export async function actionRattacherEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const sessionId = texte(data, "sessionId");
  const result = await attachTeam(communityId, texte(data, "teamId"), {
    sessionId: sessionId === "" ? null : sessionId,
    expectedVersion: nombre(data, "version"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    sessionId === ""
      ? "Equipe rattachee a toute la duree de l'evenement, avec les postes du modele."
      : "Equipe rattachee a ce sous-evenement, avec les postes du modele.",
  );
}

export async function actionDetacherEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await detachTeam(communityId, texte(data, "planId"), {
    expectedVersion: nombre(data, "version"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    result.value.assignmentsRemoved > 0
      ? `Rattachement retire, avec ${result.value.assignmentsRemoved} affectation(s).`
      : "Rattachement retire.",
  );
}

export async function actionDupliquer(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await duplicateEvent(communityId, eventId, {
    title: texteOuNull(data, "titre") ?? undefined,
    dayShiftDays: nombre(data, "decalage", 7),
    includeSetlist: booleen(data, "chants"),
    includeDressCode: booleen(data, "dressCode"),
    includeRehearsals: booleen(data, "repetitions"),
    includeAssignments: booleen(data, "affectations"),
  });
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/planning`);
  redirect(`/c/${communityId}/evenements/${result.value.eventId}`);
}

/* -------------------------------------------------------------------------- */
/* Chants et dress-code                                                       */
/* -------------------------------------------------------------------------- */

export async function actionAjouterChant(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const sessionId = texte(data, "sessionId");
  const result = await addSetlistItem(communityId, {
    eventId,
    sessionId: sessionId === "" ? null : sessionId,
    sequence: texte(data, "sequence"),
    songId: texteOuNull(data, "songId"),
    freeTitle: texteOuNull(data, "titreLibre"),
    links: liste(data, "liens"),
    notes: texteOuNull(data, "notes"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Chant ajoute a la liste.");
}

export async function actionRetirerChant(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await removeSetlistItem(communityId, texte(data, "itemId"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Chant retire.");
}

export async function actionDeplacerChant(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const direction = texte(data, "direction") === "haut" ? "haut" : "bas";
  const result = await moveSetlistItem(communityId, texte(data, "itemId"), direction);
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(`Chant deplace en position ${result.value.order}.`);
}

export async function actionCopierListeChants(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await copySetlist(communityId, eventId, {
    source: texte(data, "sourceSessionId") || null,
    cible: texte(data, "cibleSessionId") || null,
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    `${result.value.copied} chant(s) copie(s). Les deux listes sont desormais independantes.`,
  );
}

export async function actionEnregistrerDressCode(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await upsertDressCode(communityId, {
    eventId,
    teamId: texteOuNull(data, "teamId"),
    theme: texte(data, "theme"),
    mood: texte(data, "mood"),
    colors: texte(data, "couleurs")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== ""),
    materials: texte(data, "matieres"),
    instruction: texte(data, "consigne"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Dress-code enregistre.");
}

export async function actionAjouterVisuel(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const fichier = data.get("visuel");
  const alt = texte(data, "alt");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return echec("Choisissez une image.", { valeurs: { alt } });
  }
  if (alt === "") {
    return echec(
      "Le texte alternatif est requis : il decrit le visuel pour qui ne le voit pas.",
      { valeurs: { alt } },
    );
  }

  const result = await uploadMoodboard(communityId, {
    eventId,
    dressCodeId: texteOuNull(data, "dressCodeId"),
    filename: fichier.name,
    alt,
    contenu: new Uint8Array(await fichier.arrayBuffer()),
  });

  if (!result.ok) return echec(result.message, { valeurs: { alt } });
  rafraichir(communityId, eventId);
  return succes("Visuel ajoute au moodboard, dans l'espace prive.");
}

export async function actionRetirerVisuel(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await removeMoodboard(communityId, texte(data, "assetId"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes("Visuel retire.");
}

/* -------------------------------------------------------------------------- */
/* Discussion                                                                 */
/* -------------------------------------------------------------------------- */

export async function actionEnvoyerMessage(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const corps = texte(data, "corps");
  const result = await postMessage(communityId, eventId, {
    body: corps,
    mentions: liste(data, "mentions"),
  });
  if (!result.ok) {
    return echec(result.message, { valeurs: { corps } });
  }
  revalidatePath(`/c/${communityId}/evenements/${eventId}`);
  return succes("Message envoye.");
}

/** L'edition est limitee a l'auteur du message : le service le reverifie. */
export async function actionModifierMessage(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const corps = texte(data, "corps");
  const result = await editMessage(communityId, texte(data, "messageId"), corps);
  if (!result.ok) return echec(result.message, { valeurs: { corps } });
  revalidatePath(`/c/${communityId}/evenements/${eventId}`);
  return succes("Message modifie.");
}

export async function actionMarquerLu(
  communityId: string,
  eventId: string,
): Promise<void> {
  await markThreadRead(communityId, eventId);
  revalidatePath(`/c/${communityId}/evenements/${eventId}`);
}

export async function actionEpingler(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await pinMessage(
    communityId,
    texte(data, "messageId"),
    booleen(data, "epingle"),
  );
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/evenements/${eventId}`);
  return succes("Annonce mise a jour.");
}

export async function actionModerer(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await moderateMessage(
    communityId,
    texte(data, "messageId"),
    texte(data, "note"),
  );
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/evenements/${eventId}`);
  return succes("Message modere. Une trace est conservee dans le journal.");
}

export async function actionSourdine(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const eventId = texte(data, "eventId");
  const result = await toggleEventMute(eventId, booleen(data, "sourdine"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId, eventId);
  return succes(
    result.value.muted
      ? "Notifications de cet evenement en sourdine."
      : "Notifications de cet evenement reactivees.",
  );
}
