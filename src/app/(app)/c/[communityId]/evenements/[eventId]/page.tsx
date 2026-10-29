import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { getEventDetail } from "@/server/services/events";
import { conflictCountForEvent } from "@/server/services/assignments";
import { listSongs } from "@/server/services/songs";
import { readThread } from "@/server/services/messages";
import { getTemplate, listMembers } from "@/server/services/communities";
import { getPreferences } from "@/server/services/notifications";
import { EVENT_STATE_HELP } from "@/domain/events";
import { formatDateLong } from "@/lib/time";
import {
  Alerte,
  Card,
  CardBody,
  CardHeader,
  FiletSignature,
} from "@/components/ui/primitives";
import { BadgeEtatEvenement } from "@/components/app/status-badges";
import { OngletsEvenement } from "./onglets";
import { OngletApercu } from "./onglet-apercu";
import { OngletEquipes } from "./onglet-equipes";
import { OngletRepetitions } from "./onglet-repetitions";
import { OngletChants } from "./onglet-chants";
import { OngletDressCode } from "./onglet-dress-code";
import { OngletDiscussion } from "./onglet-discussion";

export const metadata: Metadata = { title: "Evenement" };

const ONGLETS = [
  "apercu",
  "equipes",
  "repetitions",
  "chants",
  "dress-code",
  "discussion",
] as const;
type Onglet = (typeof ONGLETS)[number];

export default async function PageEvenement({
  params,
  searchParams,
}: {
  params: Promise<{ communityId: string; eventId: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { communityId, eventId } = await params;
  const query = await searchParams;
  const onglet: Onglet = ONGLETS.includes(query.onglet as Onglet)
    ? (query.onglet as Onglet)
    : "apercu";

  const detail = await getEventDetail(communityId, eventId);
  if (!detail.ok) {
    if (detail.code === "evenement_inconnu") notFound();
    return (
      <Alerte ton="attention" titre="Evenement non accessible">
        <p>{detail.message}</p>
        <p className="mt-2">
          <Link href={`/c/${communityId}/planning`} className="underline">
            Retour au planning
          </Link>
        </p>
      </Alerte>
    );
  }

  const vue = detail.value;
  const [conflits, chants, fil, preferences, membres, modele] = await Promise.all([
    vue.isAdmin ? conflictCountForEvent(communityId, eventId) : Promise.resolve(0),
    listSongs(communityId),
    readThread(communityId, eventId),
    getPreferences(),
    // Les equipes se composent parmi les membres actifs de la communaute.
    vue.isAdmin ? listMembers(communityId) : Promise.resolve([]),
    vue.isAdmin ? getTemplate(communityId) : Promise.resolve(null),
  ]);
  const postes = (modele?.fields ?? [])
    .filter((f) => f.assignable && f.archivedAt === null)
    .map((f) => ({ id: f.id, label: f.label, minRequired: f.minRequired }));
  const membresActifs = membres
    .filter((m) => m.status === "active")
    .map((m) => ({
      membershipId: m.membershipId,
      name: `${m.firstName} ${m.lastName}`,
    }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-nuit-doux">
            <Link href={`/c/${communityId}/planning`} className="underline">
              Planning
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{vue.event.title}</h1>
          <p className="mt-1 text-sm text-nuit-doux">
            {formatDateLong(vue.event.startsAt, vue.event.timezone)}
            {vue.sessions.length > 0
              ? ` - ${vue.sessions.length} sous-evenement(s)`
              : ""}
          </p>
          <div className="mt-3">
            <FiletSignature />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BadgeEtatEvenement etat={vue.event.state} />
          <a
            href={`/c/${communityId}/evenements/${eventId}/impression`}
            className="sans-impression inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-3 text-sm"
          >
            <Printer aria-hidden="true" className="size-4" />
            Version imprimable
          </a>
        </div>
      </header>

      <Alerte ton={vue.event.state === "annule" ? "attention" : "info"} titre={`Etat : ${vue.event.state}`}>
        {EVENT_STATE_HELP[vue.event.state]}
        {vue.event.cancelReason ? (
          <p className="mt-1">Motif d&apos;annulation : {vue.event.cancelReason}</p>
        ) : null}
      </Alerte>

      <OngletsEvenement
        communityId={communityId}
        eventId={eventId}
        actif={onglet}
        messagesNonLus={vue.unreadMessages}
      />

      {onglet === "apercu" ? (
        <OngletApercu
          communityId={communityId}
          vue={vue}
          conflits={conflits}
          enSourdine={preferences.mutedEventIds.includes(eventId)}
        />
      ) : null}

      {onglet === "equipes" ? (
        <OngletEquipes
          communityId={communityId}
          vue={vue}
          membres={membresActifs}
          postes={postes}
        />
      ) : null}

      {onglet === "repetitions" ? (
        <OngletRepetitions communityId={communityId} vue={vue} />
      ) : null}

      {onglet === "chants" ? (
        <OngletChants communityId={communityId} vue={vue} chants={chants} />
      ) : null}

      {onglet === "dress-code" ? (
        <OngletDressCode communityId={communityId} vue={vue} />
      ) : null}


      {onglet === "discussion" ? (
        fil.ok ? (
          <OngletDiscussion communityId={communityId} eventId={eventId} fil={fil.value} estAdmin={vue.isAdmin} />
        ) : (
          <Card>
            <CardHeader titre="Discussion" />
            <CardBody>
              <Alerte ton="attention">{fil.message}</Alerte>
            </CardBody>
          </Card>
        )
      ) : null}
    </div>
  );
}
