"use server";

import { revalidatePath } from "next/cache";
import { archiveSong, createSong } from "@/server/services/songs";
import {
  echec,
  liste,
  nombre,
  succes,
  texte,
  texteOuNull,
  type FormState,
} from "@/lib/form";

export async function actionCreerChant(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const tempoBrut = texte(data, "tempo");
  const result = await createSong(communityId, {
    title: texte(data, "titre"),
    songKey: texteOuNull(data, "tonalite"),
    tempo: tempoBrut === "" ? null : nombre(data, "tempo"),
    defaultLead: texteOuNull(data, "lead"),
    links: liste(data, "liens"),
    notes: texteOuNull(data, "notes"),
  });
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/chants`);
  return succes("Chant ajoute au repertoire.");
}

/**
 * Archive un chant. Il quitte le repertoire propose, mais les listes des
 * evenements passes qui le citent restent intactes.
 */
export async function actionArchiverChant(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const communityId = texte(data, "communityId");
  const result = await archiveSong(communityId, texte(data, "songId"));
  if (!result.ok) return echec(result.message);
  revalidatePath(`/c/${communityId}/chants`);
  return succes(
    "Chant archive. Les listes des evenements qui le citent ne sont pas modifiees.",
  );
}
