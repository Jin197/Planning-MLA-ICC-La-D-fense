import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { listCatalogue } from "@/server/services/communities";
import { requireSession } from "@/server/auth/context";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  Input,
} from "@/components/ui/primitives";
import { BadgeType } from "@/components/app/status-badges";
import { BlocDemande } from "./demande";

export const metadata: Metadata = { title: "Communautes" };

export default async function PageCommunautes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const recherche = params.q ?? "";
  const entrees = await listCatalogue(recherche);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Communautes</h1>
          <p className="mt-1 max-w-prose text-sm text-nuit-doux">
            Le catalogue affiche seulement ce qui sert a choisir : nom, type,
            description et responsable. Les plannings, les equipes et les
            echanges restent prives.
          </p>
        </div>
        {session.profile.onboardingChoice === "responsable" ? (
          <Link
            href="/communautes/nouvelle"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-doux)] bg-accent px-4 py-2 text-sur-accent"
          >
            Creer une communaute
          </Link>
        ) : (
          <Link
            href="/profil"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4 py-2 text-sm"
          >
            Je suis responsable de ministere
          </Link>
        )}
      </header>

      <Card>
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="q" className="block text-sm font-medium">
                Rechercher
              </label>
              <Input
                id="q"
                name="q"
                defaultValue={recherche}
                placeholder="Nom, type ou description"
                className="mt-1.5"
              />
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4"
            >
              <Search aria-hidden="true" className="size-4" />
              Rechercher
            </button>
          </form>
        </CardBody>
      </Card>

      {entrees.length === 0 ? (
        <EtatVide
          titre="Aucune communaute trouvee"
          description={
            recherche
              ? "Essayez un autre terme de recherche."
              : "Aucune communaute n'a encore ete creee dans cet espace."
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {entrees.map((entree) => (
            <Card as="li" key={entree.id} className="flex flex-col">
              <CardHeader
                niveau={2}
                titre={entree.name}
                sousTitre={`Responsable affiche : ${entree.displayedLeaderName}`}
                actions={<BadgeType type={entree.type} autre={entree.otherLabel} />}
              />
              <CardBody className="flex flex-1 flex-col gap-4">
                <p className="text-sm text-nuit-doux">
                  {entree.description || "Pas de description."}
                </p>
                <p className="text-xs text-nuit-tres-doux">
                  {entree.memberCount} membre(s) actif(s)
                </p>

                <div className="mt-auto">
                  {entree.relation.kind === "membre" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge ton="dispo">
                        {entree.relation.role === "admin" ? "Admin" : "Membre"}
                      </Badge>
                      <Link
                        href={`/c/${entree.id}/planning`}
                        className="inline-flex min-h-11 items-center rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4 text-sm"
                      >
                        Ouvrir le planning
                      </Link>
                    </div>
                  ) : entree.relation.kind === "demande" &&
                    entree.relation.status === "en_attente" ? (
                    <BlocDemande
                      mode="annuler"
                      communityId={entree.id}
                      requestId={entree.relation.requestId}
                    />
                  ) : (
                    <>
                      {entree.relation.kind === "demande" &&
                      entree.relation.status === "refusee" ? (
                        <Alerte ton="attention" titre="Demande precedente refusee" className="mb-3">
                          Vous pouvez en soumettre une nouvelle.
                        </Alerte>
                      ) : null}
                      <BlocDemande mode="demander" communityId={entree.id} />
                    </>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
