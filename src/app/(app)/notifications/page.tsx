import Link from "next/link";
import type { Metadata } from "next";
import { listNotifications, getPreferences } from "@/server/services/notifications";
import {
  Alerte,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
} from "@/components/ui/primitives";
import {
  MarquerLue,
  MarquerToutLu,
  PreferencesNotifications,
} from "./formulaires";

export const metadata: Metadata = { title: "Notifications" };

function horodatage(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(iso));
}

export default async function PageNotifications() {
  const [flux, preferences] = await Promise.all([
    listNotifications(),
    getPreferences(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-nuit-doux">
            {flux.unread} non lue(s). Les notifications d&apos;organisation
            restent separees des discussions.
          </p>
        </div>
        <MarquerToutLu />
      </header>

      <Card>
        <CardHeader
          titre="Organisation"
          sousTitre="Adhesions, collecte, publication, affectations, remplacements, modifications, annulations et rappels."
        />
        <CardBody>
          {flux.organisation.length === 0 ? (
            <EtatVide titre="Aucune notification d'organisation" />
          ) : (
            <ul className="divide-y divide-bordure">
              {flux.organisation.map((notification) => (
                <li key={notification.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {notification.title}
                        {notification.readAt === null ? (
                          <Badge ton="indigo" className="ml-2">
                            Non lue
                          </Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-nuit-doux">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-xs text-nuit-tres-doux">
                        {horodatage(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {notification.readAt === null ? (
                        <MarquerLue
                          notificationId={notification.id}
                          titre={notification.title}
                        />
                      ) : null}
                      {notification.href ? (
                        <Link
                          href={notification.href}
                          className="inline-flex min-h-9 items-center rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-3 text-sm"
                        >
                          Ouvrir
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader titre="Discussions" />
        <CardBody>
          {flux.discussions.length === 0 ? (
            <EtatVide titre="Aucun message recent" />
          ) : (
            <ul className="divide-y divide-bordure">
              {flux.discussions.map((notification) => (
                <li key={notification.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm">{notification.body}</p>
                      <p className="mt-1 text-xs text-nuit-tres-doux">
                        {horodatage(notification.createdAt)}
                      </p>
                    </div>
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        className="inline-flex min-h-9 items-center rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-3 text-sm"
                      >
                        Lire
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <PreferencesNotifications preferences={preferences} />

      <Alerte ton="info" titre="Envoi des emails">
        Les emails sont enregistres dans une file transactionnelle puis envoyes
        par un worker. Sans fournisseur configure, ils restent a
        l&apos;etat « enregistre » et aucune interface n&apos;affiche
        « email envoye ».
      </Alerte>
    </div>
  );
}
