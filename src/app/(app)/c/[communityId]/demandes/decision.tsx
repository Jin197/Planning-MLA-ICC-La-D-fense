"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { actionDecision } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Input } from "@/components/ui/primitives";

export function DecisionAdhesion({
  communityId,
  requestId,
}: {
  communityId: string;
  requestId: string;
}) {
  const [etat, action] = useActionState(actionDecision, ETAT_INITIAL);

  if (etat.status === "succes") {
    return <Alerte ton="succes">{etat.message}</Alerte>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="requestId" value={requestId} />

      {etat.status === "erreur" ? (
        <Alerte ton="erreur">{etat.message}</Alerte>
      ) : null}

      <div>
        <label
          htmlFor={`note-${requestId}`}
          className="block text-sm font-medium"
        >
          Note de decision
          <span className="ml-2 text-xs font-normal text-nuit-tres-doux">
            facultatif
          </span>
        </label>
        <Input id={`note-${requestId}`} name="note" className="mt-1.5" />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="decision"
          value="accepter"
          libelleEnCours="Traitement..."
        >
          <Check aria-hidden="true" className="size-4" />
          Accepter
        </SubmitButton>
        <SubmitButton
          name="decision"
          value="refuser"
          variante="secondaire"
          libelleEnCours="Traitement..."
        >
          <X aria-hidden="true" className="size-4" />
          Refuser
        </SubmitButton>
      </div>
    </form>
  );
}
