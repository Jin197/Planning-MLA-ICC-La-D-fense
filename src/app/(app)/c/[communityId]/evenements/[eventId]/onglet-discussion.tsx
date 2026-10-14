import type { ThreadPage } from "@/server/services/messages";
import { Card, CardBody, CardHeader, EtatVide } from "@/components/ui/primitives";
import { FilDiscussion } from "./fil-discussion";

export function OngletDiscussion({
  communityId,
  eventId,
  fil,
  estAdmin,
}: {
  communityId: string;
  eventId: string;
  fil: ThreadPage;
  estAdmin: boolean;
}) {
  return (
    <Card>
      <CardHeader
        titre="Discussion"
        sousTitre={
          fil.canWrite
            ? "Les messages sont conserves en base : ils restent lisibles apres reconnexion."
            : "Fil en lecture seule."
        }
      />
      <CardBody>
        {fil.messages.length === 0 && !fil.canWrite ? (
          <EtatVide titre="Aucun message" />
        ) : (
          <FilDiscussion
            communityId={communityId}
            eventId={eventId}
            fil={fil}
            estAdmin={estAdmin}
          />
        )}
      </CardBody>
    </Card>
  );
}
