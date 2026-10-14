"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  changeMemberRole,
  createSkill,
  createTeam,
  revokeMember,
  setMemberSkills,
  setTeamMembers,
} from "@/server/services/communities";
import { echec, liste, succes, texte, type FormState } from "@/lib/form";

function rafraichir(communityId: string): void {
  revalidatePath(`/c/${communityId}/membres`);
  revalidatePath(`/c/${communityId}/planning`);
}

export async function actionChangerRole(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const role = texte(data, "role") === "admin" ? "admin" : "membre";
  const result = await changeMemberRole(communityId, texte(data, "membershipId"), role);
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  return succes(
    role === "admin"
      ? "Cette personne est maintenant admin de cette communaute."
      : "Cette personne est maintenant membre.",
  );
}

export async function actionRetirerMembre(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await revokeMember(communityId, texte(data, "membershipId"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  // La personne retiree quitte la liste des membres actifs : son formulaire
  // est demonte. La confirmation passe donc par la page.
  redirect(
    `/c/${communityId}/membres?retire=1&remplacer=${result.value.assignmentsToReplace}`,
  );
}

export async function actionCompetences(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await setMemberSkills(
    communityId,
    texte(data, "membershipId"),
    liste(data, "skillIds"),
  );
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  return succes(
    "Competences enregistrees. Elles aident au choix mais ne constituent pas une preuve de qualification.",
  );
}

export async function actionCreerCompetence(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await createSkill(communityId, texte(data, "label"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  return succes("Competence ajoutee.");
}

export async function actionCreerEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await createTeam(communityId, texte(data, "nom"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  revalidatePath(`/c/${communityId}/parametres`);
  return succes("Equipe creee.");
}

export async function actionMembresEquipe(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await setTeamMembers(
    communityId,
    texte(data, "teamId"),
    liste(data, "membershipIds"),
  );
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  revalidatePath(`/c/${communityId}/parametres`);
  return succes(`${result.value.count} personne(s) dans cette equipe.`);
}
