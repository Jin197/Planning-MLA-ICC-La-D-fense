"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelJoinRequest,
  createCommunity,
  requestJoin,
} from "@/server/services/communities";
import { COMMUNITY_TYPES, type CommunityType } from "@/domain/types";
import {
  echec,
  succes,
  texte,
  texteOuNull,
  valeursDe,
  type FormState,
} from "@/lib/form";

export async function actionCreerCommunaute(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const valeurs = valeursDe(data, ["nom", "type", "autreLibelle", "description", "responsable"]);
  const nom = texte(data, "nom");
  const type = texte(data, "type") as CommunityType;

  const champs: Record<string, string> = {};
  if (nom === "") champs.nom = "Indiquez un nom.";
  if (!COMMUNITY_TYPES.includes(type)) champs.type = "Choisissez un type.";
  if (type === "AUTRE" && texte(data, "autreLibelle") === "") {
    champs.autreLibelle = "Precisez le type pour « Autre ».";
  }
  if (Object.keys(champs).length > 0) {
    return echec("Quelques champs doivent etre corriges.", { champs, valeurs });
  }

  const result = await createCommunity({
    name: nom,
    type,
    otherLabel: texteOuNull(data, "autreLibelle"),
    description: texte(data, "description"),
    displayedLeaderName: texte(data, "responsable"),
  });

  if (!result.ok) return echec(result.message, { valeurs });
  redirect(`/c/${result.value.communityId}/planning?creee=1`);
}

export async function actionDemanderAdhesion(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await requestJoin(communityId, texteOuNull(data, "message"));
  if (!result.ok) return echec(result.message);
  revalidatePath("/communautes");
  return succes(
    "Demande envoyee. Les admins de la communaute vont la traiter. Vous n'avez pas encore acces au contenu prive.",
  );
}

export async function actionAnnulerDemande(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const requestId = texte(data, "requestId");
  const result = await cancelJoinRequest(requestId);
  if (!result.ok) return echec(result.message);
  revalidatePath("/communautes");
  return succes("Demande annulee.");
}
