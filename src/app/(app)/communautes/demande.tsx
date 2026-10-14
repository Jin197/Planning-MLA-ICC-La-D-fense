"use client";

import { useActionState } from "react";
import { actionAnnulerDemande, actionDemanderAdhesion } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Badge, Textarea } from "@/components/ui/primitives";

export function BlocDemande({
  mode,
  communityId,
  requestId,
}: {
  mode: "demander" | "annuler";
  communityId: string;
  requestId?: string;
}) {
  const [etat, action] = useActionState(
    mode === "demander" ? actionDemanderAdhesion : actionAnnulerDemande,
    ETAT_INITIAL,
  );

  if (etat.status === "succes") {
    return <Alerte ton="succes">{etat.message}</Alerte>;
  }

  if (mode === "annuler") {
    return (
      <form action={action} className="space-y-2">
        <input type="hidden" name="requestId" value={requestId} />
        {etat.status === "erreur" ? <Alerte ton="erreur">{etat.message}</Alerte> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge ton="attente">Demande en attente</Badge>
          <SubmitButton variante="secondaire" taille="compact" libelleEnCours="Annulation...">
            Annuler ma demande
          </SubmitButton>
        </div>
        <p className="text-xs text-nuit-doux">
          En attendant la decision, vous n&apos;avez acces qu&apos;a cette fiche.
        </p>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="communityId" value={communityId} />
      {etat.status === "erreur" ? <Alerte ton="erreur">{etat.message}</Alerte> : null}
      <label htmlFor={`message-${communityId}`} className="block text-sm font-medium">
        Message pour les admins
        <span className="ml-2 text-xs font-normal text-nuit-tres-doux">facultatif</span>
      </label>
      <Textarea
        id={`message-${communityId}`}
        name="message"
        rows={2}
        placeholder="Votre pupitre, vos instruments..."
      />
      <SubmitButton libelleEnCours="Envoi...">Demander a rejoindre</SubmitButton>
    </form>
  );
}
