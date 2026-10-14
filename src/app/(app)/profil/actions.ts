"use server";

import { revalidatePath } from "next/cache";
import { updateProfile } from "@/server/services/accounts";
import { requireSession } from "@/server/auth/context";
import {
  echec,
  succes,
  texte,
  texteOuNull,
  type FormState,
} from "@/lib/form";
import type { OnboardingChoice } from "@/domain/types";

export async function actionProfil(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const prenom = texte(data, "prenom");
  const nom = texte(data, "nom");
  if (prenom === "" || nom === "") {
    return echec("Le prenom et le nom sont requis.");
  }
  const choix = texte(data, "choix") as OnboardingChoice;

  await updateProfile(session.viewer.userId, {
    firstName: prenom,
    lastName: nom,
    declaredMinistry: texte(data, "ministere"),
    description: texteOuNull(data, "description"),
    onboardingChoice: choix === "responsable" ? "responsable" : "membre",
  });

  revalidatePath("/profil");
  revalidatePath("/accueil");
  revalidatePath("/communautes");
  return succes(
    "Profil enregistre. Vos roles dans les communautes sont inchanges.",
  );
}
