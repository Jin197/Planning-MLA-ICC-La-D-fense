"use server";

import { redirect } from "next/navigation";
import {
  login,
  logout,
  registerAccount,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/server/services/accounts";
import { isDemoMode } from "@/server/data";
import {
  echec,
  succes,
  texte,
  texteOuNull,
  valeursDe,
  type FormState,
} from "@/lib/form";
import type { OnboardingChoice } from "@/domain/types";

const CHAMPS_INSCRIPTION = [
  "prenom",
  "nom",
  "email",
  "ministere",
  "description",
  "choix",
] as const;

export async function actionInscription(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const valeurs = valeursDe(data, CHAMPS_INSCRIPTION);
  const prenom = texte(data, "prenom");
  const nom = texte(data, "nom");
  const email = texte(data, "email");
  const motDePasse = texte(data, "motDePasse");
  const confirmation = texte(data, "confirmation");
  const choix = texte(data, "choix") as OnboardingChoice;

  const champs: Record<string, string> = {};
  if (prenom === "") champs.prenom = "Indiquez votre prenom.";
  if (nom === "") champs.nom = "Indiquez votre nom.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) champs.email = "Email invalide.";
  if (motDePasse !== confirmation) {
    champs.confirmation = "Les deux mots de passe ne correspondent pas.";
  }
  if (choix !== "responsable" && choix !== "membre") {
    champs.choix = "Choisissez une reponse.";
  }
  if (Object.keys(champs).length > 0) {
    return echec("Quelques champs doivent etre corriges.", { champs, valeurs });
  }

  const result = await registerAccount({
    firstName: prenom,
    lastName: nom,
    email,
    password: motDePasse,
    declaredMinistry: texte(data, "ministere"),
    description: texteOuNull(data, "description"),
    onboardingChoice: choix,
  });

  if (!result.ok) {
    return echec(result.message, { valeurs });
  }

  // En demonstration, le lien de verification est affiche au lieu d'un email.
  return succes(
    isDemoMode()
      ? "Compte cree. Aucun fournisseur d'email n'est configure : utilisez le lien de verification ci-dessous."
      : "Compte cree. Un email de verification a ete enregistre pour envoi.",
    isDemoMode() ? { jeton: result.value.verificationToken } : undefined,
  );
}

export async function actionConnexion(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const email = texte(data, "email");
  const motDePasse = texte(data, "motDePasse");
  if (email === "" || motDePasse === "") {
    return echec("Renseignez votre email et votre mot de passe.", {
      valeurs: { email },
    });
  }
  const result = await login(email, motDePasse);
  if (!result.ok) {
    return echec(result.message, { valeurs: { email } });
  }
  redirect(result.value.emailVerified ? "/accueil" : "/verification-email");
}

export async function actionDeconnexion(): Promise<void> {
  await logout();
  redirect("/connexion");
}

export async function actionVerification(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const jeton = texte(data, "jeton");
  if (jeton === "") return echec("Collez le jeton recu.");
  const result = await verifyEmail(jeton);
  if (!result.ok) return echec(result.message);
  redirect("/accueil");
}

export async function actionDemandeReinitialisation(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const email = texte(data, "email");
  if (email === "") return echec("Indiquez votre email.", { valeurs: { email } });
  const { token } = await requestPasswordReset(email);
  // Reponse identique que le compte existe ou non.
  return succes(
    isDemoMode()
      ? "Si un compte existe pour cet email, un jeton a ete genere. En demonstration, il est visible dans la boite de developpement."
      : "Si un compte existe pour cet email, un message de reinitialisation a ete enregistre pour envoi.",
    isDemoMode() && token ? { jeton: token } : undefined,
  );
}

export async function actionReinitialisation(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const jeton = texte(data, "jeton");
  const motDePasse = texte(data, "motDePasse");
  const confirmation = texte(data, "confirmation");
  if (motDePasse !== confirmation) {
    return echec("Les deux mots de passe ne correspondent pas.", {
      valeurs: { jeton },
    });
  }
  const result = await resetPassword(jeton, motDePasse);
  if (!result.ok) return echec(result.message, { valeurs: { jeton } });
  redirect("/connexion?reinitialise=1");
}
