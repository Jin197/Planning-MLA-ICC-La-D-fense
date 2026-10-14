"use server";

import { revalidatePath } from "next/cache";
import {
  addTemplateField,
  archiveTemplateField,
  updateTemplateField,
} from "@/server/services/communities";
import type { TemplateFieldKind } from "@/domain/types";
import {
  echec,
  nombre,
  succes,
  texte,
  type FormState,
} from "@/lib/form";

function rafraichir(communityId: string): void {
  revalidatePath(`/c/${communityId}/parametres`);
}

export async function actionAjouterChamp(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const kind = (texte(data, "kind") || "poste") as TemplateFieldKind;
  const result = await addTemplateField(communityId, {
    label: texte(data, "label"),
    kind,
    minRequired: nombre(data, "minRequired"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  return succes(
    "Champ ajoute au modele. Il sera copie dans les nouveaux plans ; les plans existants ne sont pas modifies.",
  );
}

export async function actionModifierChamp(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await updateTemplateField(communityId, texte(data, "fieldId"), {
    label: texte(data, "label"),
    minRequired: nombre(data, "minRequired"),
  });
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  return succes(
    "Modele mis a jour. Les plans deja crees conservent leurs libelles et leurs affectations.",
  );
}

export async function actionArchiverChamp(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await archiveTemplateField(communityId, texte(data, "fieldId"));
  if (!result.ok) return echec(result.message);
  rafraichir(communityId);
  return succes(
    result.value.archived
      ? "Champ archive : il est encore utilise dans l'historique, donc conserve."
      : "Champ supprime : il n'etait utilise dans aucun plan.",
  );
}
