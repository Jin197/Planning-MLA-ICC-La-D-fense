"use server";

import { revalidatePath } from "next/cache";
import {
  markAllRead,
  markNotificationRead,
  updatePreferences,
} from "@/server/services/notifications";
import {
  booleen,
  echec,
  succes,
  texte,
  type FormState,
} from "@/lib/form";
import type { SubscriptionScope } from "@/domain/types";

export async function actionMarquerToutLu(): Promise<void> {
  await markAllRead();
  revalidatePath("/notifications");
  revalidatePath("/accueil");
}

export async function actionMarquerLue(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const result = await markNotificationRead(texte(data, "notificationId"));
  if (!result.ok) return echec(result.message);
  revalidatePath("/notifications");
  revalidatePath("/accueil");
  return succes("Notification marquee comme lue.");
}

export async function actionPreferences(
  _etat: FormState,
  data: FormData,
): Promise<FormState> {
  const portee = texte(data, "portee") as SubscriptionScope;
  const rappels = texte(data, "rappels")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);

  const result = await updatePreferences({
    emailImmediate: booleen(data, "emailImmediate"),
    digestDiscussion: booleen(data, "digestDiscussion"),
    subscriptionScope:
      portee === "mes_evenements" ? "mes_evenements" : "toute_la_communaute",
    reminderOffsetsHours: rappels.length > 0 ? rappels : [48, 24],
  });

  if (!result.ok) return echec(result.message);
  revalidatePath("/notifications");
  return succes("Preferences enregistrees.");
}
