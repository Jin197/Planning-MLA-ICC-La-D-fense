"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptJoinRequest, refuseJoinRequest } from "@/server/services/communities";
import { echec, texte, texteOuNull, type FormState } from "@/lib/form";

export async function actionDecision(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const requestId = texte(data, "requestId");
  const decision = texte(data, "decision");
  const note = texteOuNull(data, "note");

  const result =
    decision === "accepter"
      ? await acceptJoinRequest(communityId, requestId, note)
      : await refuseJoinRequest(communityId, requestId, note);

  if (!result.ok) return echec(result.message);

  revalidatePath(`/c/${communityId}/demandes`);
  revalidatePath(`/c/${communityId}/membres`);
  revalidatePath("/accueil");

  // La demande traitee quitte la liste : son formulaire est demonte et
  // emporterait le message. La confirmation est donc affichee au niveau de la
  // page, qui reste montee.
  redirect(
    `/c/${communityId}/demandes?traite=${decision === "accepter" ? "acceptee" : "refusee"}`,
  );
}
