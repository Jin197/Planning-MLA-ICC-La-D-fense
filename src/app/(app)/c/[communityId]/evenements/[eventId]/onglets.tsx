import Link from "next/link";
import { cn } from "@/lib/cn";

const ONGLETS = [
  { id: "apercu", label: "Vue d'ensemble" },
  { id: "equipes", label: "Equipes et postes" },
  { id: "repetitions", label: "Repetitions" },
  { id: "chants", label: "Chants" },
  { id: "dress-code", label: "Dress-code" },
  { id: "discussion", label: "Discussion" },
] as const;

/**
 * Onglets sous forme de liens : chaque section a son URL, navigable au
 * clavier et partageable.
 */
export function OngletsEvenement({
  communityId,
  eventId,
  actif,
  messagesNonLus,
}: {
  communityId: string;
  eventId: string;
  actif: string;
  messagesNonLus: number;
}) {
  return (
    <nav aria-label="Sections de l'evenement" className="sans-impression">
      <div className="grille-defilante border-b border-bordure">
        <ul className="flex min-w-max gap-1 pb-px">
          {ONGLETS.map((onglet) => {
            const estActif = actif === onglet.id;
            return (
              <li key={onglet.id}>
                <Link
                  href={`/c/${communityId}/evenements/${eventId}?onglet=${onglet.id}`}
                  aria-current={estActif ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm",
                    estActif
                      ? "border-indigo-accent font-medium text-indigo-fonce"
                      : "border-transparent text-nuit-doux hover:text-nuit",
                  )}
                >
                  {onglet.label}
                  {onglet.id === "discussion" && messagesNonLus > 0 ? (
                    <span className="rounded-full bg-indigo-accent px-1.5 text-xs font-semibold text-sur-accent">
                      {messagesNonLus}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
