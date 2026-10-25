import Link from "next/link";
import { cn } from "@/lib/cn";

const VUES = [
  { id: "agenda", label: "Agenda" },
  { id: "calendrier", label: "Calendrier" },
  { id: "tableau", label: "Tableau" },
] as const;

/**
 * Selecteur de vue. Ce sont de vrais liens : la vue est dans l'URL, donc
 * partageable, et la navigation fonctionne au clavier sans JavaScript.
 */
export function SelecteurVue({
  communityId,
  vue,
  inclureArchives,
}: {
  communityId: string;
  vue: string;
  inclureArchives: boolean;
}) {
  const lien = (id: string, archives: boolean) => {
    const params = new URLSearchParams({ vue: id });
    if (archives) params.set("archives", "1");
    return `/c/${communityId}/planning?${params.toString()}`;
  };

  return (
    <div className="sans-impression flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Vue du planning">
        <ul className="inline-flex rounded-[var(--radius-doux)] bg-ivoire-fonce p-1">
          {VUES.map((v) => (
            <li key={v.id}>
              <Link
                href={lien(v.id, inclureArchives)}
                aria-current={vue === v.id ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-[calc(var(--radius-doux)-2px)] px-3 text-sm",
                  vue === v.id
                    ? "bg-indigo-accent font-medium text-sur-accent"
                    : "text-nuit-doux hover:bg-ivoire-fonce",
                )}
              >
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Link
        href={lien(vue, !inclureArchives)}
        className="text-sm text-indigo-accent underline"
      >
        {inclureArchives ? "Masquer les archives" : "Afficher les archives"}
      </Link>
    </div>
  );
}
