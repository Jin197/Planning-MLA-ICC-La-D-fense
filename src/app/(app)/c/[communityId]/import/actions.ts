"use server";

import { revalidatePath } from "next/cache";
import {
  analyserFichier,
  importerDefinitivement,
  rapprocherPersonne,
  reglerOptionsImport,
} from "@/server/import/service";
import {
  booleen,
  echec,
  nombre,
  succes,
  texte,
  texteOuNull,
  type FormState,
} from "@/lib/form";

export async function actionAnalyser(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const fichier = data.get("fichier");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return echec("Choisissez un classeur .xlsx.");
  }

  const anneeBrute = texte(data, "annee");
  const result = await analyserFichier(
    communityId,
    {
      name: fichier.name,
      type: fichier.type,
      size: fichier.size,
      buffer: await fichier.arrayBuffer(),
    },
    { assumedYear: anneeBrute === "" ? null : nombre(data, "annee") },
  );

  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/import`);
  return succes(
    "Analyse terminee. Rien n'a encore ete ecrit dans le planning : relisez la previsualisation ci-dessous.",
    { jobId: result.value.jobId },
  );
}

export async function actionOptions(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const jobId = texte(data, "jobId");
  const anneeBrute = texte(data, "annee");
  const result = await reglerOptionsImport(communityId, jobId, {
    assumedYear: anneeBrute === "" ? null : nombre(data, "annee"),
    inferMissingAsUnavailable: booleen(data, "deduireIndisponible"),
  });
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/import`);
  return succes("Options enregistrees.");
}

export async function actionRapprocher(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const decision = texte(data, "decision");
  if (decision !== "lier" && decision !== "nouveau" && decision !== "ignorer") {
    return echec("Decision inconnue.");
  }
  const result = await rapprocherPersonne(communityId, {
    jobId: texte(data, "jobId"),
    importedPersonId: texte(data, "importedPersonId"),
    decision,
    membershipId: texteOuNull(data, "membershipId"),
  });
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/import`);
  return succes(
    decision === "lier"
      ? "Personne liee a un compte verifie."
      : decision === "nouveau"
        ? "Fiche conservee comme nouvelle personne a revendiquer."
        : "Fiche ignoree pour cet import.",
  );
}

export async function actionImporter(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const jobId = texte(data, "jobId");
  if (!booleen(data, "confirmation")) {
    return echec(
      "Cochez la confirmation : l'import ecrit alors reellement dans le planning.",
    );
  }
  const result = await importerDefinitivement(communityId, jobId);
  if (!result.ok) return echec(result.message);

  revalidatePath(`/c/${communityId}/import`);
  revalidatePath(`/c/${communityId}/planning`);

  const r = result.value;
  return succes(
    `Import applique : ${r.evenementsCrees} evenement(s) en brouillon a horaire a definir, ${r.equipesCreees} equipe(s), ${r.repetitionsCreees} repetition(s), ${r.affectationsCreees} affectation(s) a confirmer, ${r.disponibilitesCreees} disponibilite(s) a reconfirmer, ${r.chantsCrees} chant(s), ${r.dressCodesCrees} dress-code(s). ${r.rejets.length} ligne(s) rejetee(s) et ${r.evenementsIgnores.length} evenement(s) deja presents ignores.`,
  );
}
