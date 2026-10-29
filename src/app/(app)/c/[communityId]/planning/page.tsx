import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus, Printer, Download } from "lucide-react";
import { loadVuePlanning } from "@/server/services/planning-views";
import { getCommunity } from "@/server/services/communities";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  FiletSignature,
} from "@/components/ui/primitives";
import { VueAgenda } from "./vue-agenda";
import { VueCalendrier } from "./vue-calendrier";
import { VueTableau } from "./vue-tableau";
import { SelecteurVue } from "./selecteur-vue";

export const metadata: Metadata = { title: "Planning" };

type Vue = "agenda" | "calendrier" | "tableau";

export default async function PagePlanning({
  params,
  searchParams,
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<{ vue?: string; creee?: string; archives?: string }>;
}) {
  const { communityId } = await params;
  const query = await searchParams;
  const vue: Vue =
    query.vue === "calendrier" || query.vue === "tableau"
      ? query.vue
      : "agenda";
  const inclureArchives = query.archives === "1";

  const [community, planning] = await Promise.all([
    getCommunity(communityId),
    loadVuePlanning(communityId, { inclureArchives }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-nuit-doux">{community?.name}</p>
          <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">Planning</h1>
          <div className="mt-3">
            <FiletSignature />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sans-impression">
          {planning.estAdmin ? (
            <Link
              href={`/c/${communityId}/evenements/nouveau`}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-accent px-4 py-2 text-sur-accent"
            >
              <CalendarPlus aria-hidden="true" className="size-4" />
              Nouvel evenement
            </Link>
          ) : null}
          <a
            href={`/api/c/${communityId}/exports/affectations.csv`}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4 py-2 text-sm"
          >
            <Download aria-hidden="true" className="size-4" />
            Export CSV
          </a>
          <a
            href="/api/moi/calendrier.ics"
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4 py-2 text-sm"
          >
            <Printer aria-hidden="true" className="size-4" />
            Mon calendrier (.ics)
          </a>
        </div>
      </header>

      {query.creee ? (
        <Alerte ton="succes" titre="Communaute creee">
          Vous en etes admin. Le modele de planning est installe : creez votre
          premier evenement pour commencer.
        </Alerte>
      ) : null}

      <SelecteurVue
        communityId={communityId}
        vue={vue}
        inclureArchives={inclureArchives}
      />

      {planning.evenements.length === 0 ? (
        <Card>
          <CardBody>
            <EtatVide
              titre="Aucun evenement pour le moment"
              description={
                planning.estAdmin
                  ? "Creez un evenement, ajoutez ses creneaux et ouvrez la collecte des disponibilites."
                  : "Les evenements apparaitront ici des que les admins auront ouvert la collecte."
              }
              action={
                planning.estAdmin ? (
                  <Link
                    href={`/c/${communityId}/evenements/nouveau`}
                    className="inline-flex min-h-11 items-center rounded-[var(--radius-doux)] bg-accent px-4 py-2 text-sur-accent"
                  >
                    Creer un evenement
                  </Link>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : vue === "agenda" ? (
        <VueAgenda planning={planning} />
      ) : vue === "calendrier" ? (
        <VueCalendrier planning={planning} />
      ) : (
        <Card>
          <CardHeader
            titre="Tableau des disponibilites"
            sousTitre="Vue calculee sur les memes donnees que l'agenda. Les motifs prives ne sont visibles que par leur auteur et les admins."
          />
          <CardBody>
            <VueTableau planning={planning} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
