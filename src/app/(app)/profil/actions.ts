"use server";

import { revalidatePath } from "next/cache";
import { updateProfile } from "@/server/services/accounts";
import { requireSession } from "@/server/auth/context";
import { estTheme } from "@/domain/theme";
import { writeTheme } from "@/server/theme";
import {
  echec,
  succes,
  texte,
  texteOuNull,
  type FormState,
} from "@/lib/form";
import type { OnboardingChoice } from "@/domain/types";

/**
 * Apparence de l'interface. C'est une preference d'appareil, stockee dans un
 * cookie : la meme personne peut vouloir le sombre sur son telephone et le
 * clair sur l'ordinateur du studio.
 */
export async function actionTheme(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const choix = texte(data, "theme");
  if (!estTheme(choix)) return echec("Choisissez une apparence.");
  await writeTheme(choix);
  // Toute l'application change d'apparence : la racine doit etre re-rendue.
  revalidatePath("/", "layout");
  return succes(
    choix === "sombre"
      ? "Apparence sombre appliquee."
      : "Apparence claire appliquee.",
  );
}

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
