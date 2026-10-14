"use client";

import { useActionState } from "react";
import { Check, CheckCheck } from "lucide-react";
import {
  actionMarquerLue,
  actionMarquerToutLu,
  actionPreferences,
} from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import type { NotificationPreference } from "@/domain/types";
import { SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  Champ,
  Input,
  Select,
} from "@/components/ui/primitives";

export function MarquerToutLu() {
  return (
    <form action={actionMarquerToutLu}>
      <SubmitButton variante="secondaire" taille="compact" libelleEnCours="...">
        <CheckCheck aria-hidden="true" className="size-4" />
        Tout marquer comme lu
      </SubmitButton>
    </form>
  );
}

export function MarquerLue({
  notificationId,
  titre,
}: {
  notificationId: string;
  titre: string;
}) {
  const [, action] = useActionState(actionMarquerLue, ETAT_INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="notificationId" value={notificationId} />
      <SubmitButton
        variante="discret"
        taille="compact"
        libelleEnCours="..."
        aria-label={`Marquer « ${titre} » comme lue`}
      >
        <Check aria-hidden="true" className="size-4" />
        Marquer lue
      </SubmitButton>
    </form>
  );
}

export function PreferencesNotifications({
  preferences,
}: {
  preferences: NotificationPreference;
}) {
  const [etat, action] = useActionState(actionPreferences, ETAT_INITIAL);

  return (
    <Card>
      <CardHeader
        titre="Mes preferences"
        sousTitre="Notification immediate, regroupement des emails de discussion, portee d'abonnement et rappels."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          {etat.status !== "repos" ? (
            <Alerte ton={etat.status === "succes" ? "succes" : "erreur"}>
              {etat.message}
            </Alerte>
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="emailImmediate"
              defaultChecked={preferences.emailImmediate}
              className="mt-1 size-5"
            />
            <span>
              Recevoir les emails immediatement. Les affectations et les
              annulations ne sont jamais regroupees.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="digestDiscussion"
              defaultChecked={preferences.digestDiscussion}
              className="mt-1 size-5"
            />
            <span>Regrouper les emails de discussion en un envoi periodique.</span>
          </label>

          <Champ
            label="Portee d'abonnement"
            htmlFor="portee"
            aide="« Seulement mes evenements » limite les messages aux evenements ou vous etes affecte."
          >
            <Select
              id="portee"
              name="portee"
              defaultValue={preferences.subscriptionScope}
            >
              <option value="toute_la_communaute">
                Tous les evenements de mes communautes
              </option>
              <option value="mes_evenements">Seulement mes evenements</option>
            </Select>
          </Champ>

          <Champ
            label="Rappels, en heures avant le debut"
            htmlFor="rappels"
            aide="Separez par des virgules. Par defaut 48 et 24. Un rappel dont l'echeance est passee n'est pas envoye."
          >
            <Input
              id="rappels"
              name="rappels"
              defaultValue={preferences.reminderOffsetsHours.join(", ")}
              placeholder="48, 24"
            />
          </Champ>

          {preferences.mutedEventIds.length > 0 ? (
            <p className="text-sm text-nuit-doux">
              {preferences.mutedEventIds.length} evenement(s) en sourdine. La
              sourdine se regle depuis chaque evenement.
            </p>
          ) : null}

          <SubmitButton libelleEnCours="Enregistrement...">
            Enregistrer mes preferences
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
