"use client";

import { useActionState } from "react";
import { Moon, Sun } from "lucide-react";
import { actionTheme } from "./actions";
import { ETAT_INITIAL } from "@/lib/form";
import {
  DESCRIPTIONS_THEME,
  LIBELLES_THEME,
  THEMES,
  type Theme,
} from "@/domain/theme";
import { SubmitButton } from "@/components/ui/button";
import { Alerte, Card, CardBody, CardHeader } from "@/components/ui/primitives";

const ICONES: Record<Theme, typeof Moon> = {
  sombre: Moon,
  clair: Sun,
};

/**
 * Choix de l'apparence. Chaque option est un vrai bouton de soumission : le
 * reglage fonctionne au clavier, et sans JavaScript.
 */
export function Apparence({ actuel }: { actuel: Theme }) {
  const [etat, action] = useActionState(actionTheme, ETAT_INITIAL);

  return (
    <Card>
      <CardHeader
        titre="Apparence"
        sousTitre="Reglage propre a cet appareil. Les deux palettes respectent les contrastes du niveau AA."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          {etat.status !== "repos" ? (
            <Alerte ton={etat.status === "succes" ? "succes" : "erreur"}>
              {etat.message}
            </Alerte>
          ) : null}

          <ul className="grid gap-3 sm:grid-cols-2">
            {THEMES.map((theme) => {
              const Icone = ICONES[theme];
              const estActuel = theme === actuel;
              return (
                <li key={theme}>
                  <SubmitButton
                    name="theme"
                    value={theme}
                    variante={estActuel ? "principal" : "secondaire"}
                    pleineLargeur
                    libelleEnCours="Application..."
                    aria-current={estActuel ? "true" : undefined}
                    className="h-auto flex-col items-start gap-1 py-3 text-left"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Icone aria-hidden="true" className="size-4" />
                      {LIBELLES_THEME[theme]}
                      {estActuel ? (
                        <span className="text-xs font-normal opacity-80">
                          (actuel)
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs font-normal opacity-80">
                      {DESCRIPTIONS_THEME[theme]}
                    </span>
                  </SubmitButton>
                </li>
              );
            })}
          </ul>
        </form>
      </CardBody>
    </Card>
  );
}
