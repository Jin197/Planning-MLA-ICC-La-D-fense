"use client";

import { useActionState, useState } from "react";
import { Shirt } from "lucide-react";
import { actionEnregistrerDressCode } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import { Button, SubmitButton } from "@/components/ui/button";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  Champ,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export function EditeurDressCode({
  communityId,
  eventId,
  equipes,
  actuel,
}: {
  communityId: string;
  eventId: string;
  equipes: { id: string; name: string }[];
  actuel: {
    theme: string;
    mood: string;
    colors: string;
    materials: string;
    instruction: string;
  } | null;
}) {
  const [ouvert, setOuvert] = useState(actuel === null);
  const [etat, action] = useActionState(actionEnregistrerDressCode, ETAT_INITIAL);

  return (
    <Card>
      <CardHeader
        titre="Definir le dress-code"
        sousTitre="Reserve aux admins. Une variante par equipe est possible."
        actions={
          <Button
            variante="secondaire"
            taille="compact"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
          >
            <Shirt aria-hidden="true" className="size-4" />
            {ouvert ? "Masquer" : "Modifier"}
          </Button>
        }
      />
      {ouvert ? (
        <CardBody>
          <form action={action} className="space-y-4">
            <input type="hidden" name="communityId" value={communityId} />
            <input type="hidden" name="eventId" value={eventId} />

            {etat.status === "succes" ? (
              <Alerte ton="succes">{etat.message}</Alerte>
            ) : null}
            {etat.status === "erreur" ? (
              <Alerte ton="erreur">{etat.message}</Alerte>
            ) : null}

            <Champ
              label="Equipe concernee"
              htmlFor="teamId"
              aide="Laissez vide pour une consigne commune a tout l'evenement."
            >
              <Select id="teamId" name="teamId">
                <option value="">Consigne commune</option>
                {equipes.map((equipe) => (
                  <option key={equipe.id} value={equipe.id}>
                    {equipe.name}
                  </option>
                ))}
              </Select>
            </Champ>

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Theme" htmlFor="theme">
                <Input
                  id="theme"
                  name="theme"
                  defaultValue={actuel?.theme ?? ""}
                  placeholder="Rentree en elegance"
                />
              </Champ>
              <Champ label="Mood ou ambiance" htmlFor="mood">
                <Input
                  id="mood"
                  name="mood"
                  defaultValue={actuel?.mood ?? ""}
                  placeholder="Chaleureux et sobre"
                />
              </Champ>
            </div>

            <Champ
              label="Couleurs"
              htmlFor="couleurs"
              aide="Separez par des virgules. Les codes hexadecimaux (#1F2A44) affichent une pastille."
            >
              <Input
                id="couleurs"
                name="couleurs"
                defaultValue={actuel?.colors ?? ""}
                placeholder="#5C4033, #E8DCC8, beige"
              />
            </Champ>

            <Champ label="Matieres" htmlFor="matieres">
              <Input
                id="matieres"
                name="matieres"
                defaultValue={actuel?.materials ?? ""}
                placeholder="Laine legere, coton"
              />
            </Champ>

            <Champ label="Consigne" htmlFor="consigne">
              <Textarea
                id="consigne"
                name="consigne"
                rows={4}
                defaultValue={actuel?.instruction ?? ""}
                placeholder="Haut uni ivoire, bas sombre, chaussures fermees."
              />
            </Champ>

            <SubmitButton libelleEnCours="Enregistrement...">
              Enregistrer le dress-code
            </SubmitButton>
          </form>
        </CardBody>
      ) : null}
    </Card>
  );
}
