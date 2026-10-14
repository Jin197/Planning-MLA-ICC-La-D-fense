"use client";

import { useActionState } from "react";
import { BellOff, Bell } from "lucide-react";
import { actionSourdine } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { SubmitButton } from "@/components/ui/button";

export function BoutonSourdine({
  communityId,
  eventId,
  enSourdine,
}: {
  communityId: string;
  eventId: string;
  enSourdine: boolean;
}) {
  const [, action] = useActionState(actionSourdine, ETAT_INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sourdine" value={enSourdine ? "false" : "on"} />
      <SubmitButton variante="secondaire" taille="compact" libelleEnCours="...">
        {enSourdine ? (
          <>
            <Bell aria-hidden="true" className="size-4" />
            Reactiver les notifications
          </>
        ) : (
          <>
            <BellOff aria-hidden="true" className="size-4" />
            Mettre en sourdine
          </>
        )}
      </SubmitButton>
    </form>
  );
}
