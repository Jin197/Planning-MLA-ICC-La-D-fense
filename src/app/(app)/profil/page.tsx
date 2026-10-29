import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/server/auth/context";
import { loadNavigation } from "@/server/services/navigation";
import { isDemoMode } from "@/server/data";
import {
  Alerte,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
} from "@/components/ui/primitives";
import { readTheme } from "@/server/theme";
import { Apparence } from "./apparence";
import { FormulaireProfil } from "./formulaire";

export const metadata: Metadata = { title: "Mon profil" };

export default async function PageProfil() {
  const session = await requireSession();
  const nav = await loadNavigation();
  const theme = await readTheme();

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar
          initiales={`${session.profile.firstName.charAt(0)}${session.profile.lastName.charAt(0)}`.toUpperCase()}
          nom={`${session.profile.firstName} ${session.profile.lastName}`}
        />
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {session.profile.firstName} {session.profile.lastName}
          </h1>
          <p className="text-sm text-nuit-doux">{session.profile.email}</p>
        </div>
      </header>

      {!session.viewer.emailVerified ? (
        <Alerte ton="attention" titre="Email non verifie">
          <p>
            <Link href="/verification-email" className="underline">
              Verifier mon email
            </Link>{" "}
            pour pouvoir creer une communaute.
          </p>
        </Alerte>
      ) : null}

      <Card>
        <CardHeader
          titre="Mes informations"
          sousTitre="Le ministere declare est une information de profil. Le choix d'accueil n'affecte pas vos roles dans les communautes."
        />
        <CardBody>
          <FormulaireProfil
            profil={{
              firstName: session.profile.firstName,
              lastName: session.profile.lastName,
              declaredMinistry: session.profile.declaredMinistry,
              description: session.profile.description ?? "",
              onboardingChoice: session.profile.onboardingChoice,
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titre="Mes communautes"
          sousTitre="Votre role est propre a chaque communaute."
        />
        <CardBody>
          {nav.communities.length === 0 ? (
            <p className="text-sm text-nuit-doux">
              Aucune adhesion.{" "}
              <Link href="/communautes" className="text-accent underline">
                Parcourir le catalogue
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {nav.communities.map((communaute) => (
                <li
                  key={communaute.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-doux)] bg-ivoire-fonce/60 px-3 py-2"
                >
                  <Link
                    href={`/c/${communaute.id}/planning`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {communaute.name}
                  </Link>
                  <Badge ton={communaute.role === "admin" ? "accent" : "neutre"}>
                    {communaute.role === "admin" ? "Admin" : "Membre"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Apparence actuel={theme} />

      <Card>
        <CardHeader titre="Securite du compte" />
        <CardBody className="space-y-3 text-sm">
          <p>
            Email de connexion :{" "}
            <strong className="font-medium">{session.profile.email}</strong>
          </p>
          <p>
            <Link href="/mot-de-passe-oublie" className="text-accent underline">
              Changer mon mot de passe
            </Link>{" "}
            par le parcours de reinitialisation.
          </p>
          <p className="text-nuit-doux">
            Les tentatives de connexion sont limitees. Un compte est
            temporairement verrouille apres plusieurs echecs.
          </p>
          <form action="/api/deconnexion" method="post">
            <button
              type="submit"
              className="min-h-11 rounded-[var(--radius-doux)] bg-ivoire-fonce/60-forte px-4 text-sm"
            >
              Se deconnecter
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader titre="Mes exports" />
        <CardBody className="space-y-2 text-sm">
          <p>
            <a href="/api/moi/calendrier.ics" className="text-accent underline">
              Telecharger mon calendrier personnel (.ics)
            </a>
          </p>
          <p className="text-nuit-doux">
            Ce fichier ne contient que vos propres affectations et repetitions,
            sans motif prive.
          </p>
        </CardBody>
      </Card>

      {isDemoMode() ? (
        <Alerte ton="info" titre="Mode demonstration">
          <p>
            Cette instance utilise l&apos;adaptateur local avec des donnees
            fictives. Les jetons de verification et la file d&apos;emails sont
            visibles dans la{" "}
            <Link href="/dev/boite-mail" className="underline">
              boite de developpement
            </Link>
            .
          </p>
        </Alerte>
      ) : null}
    </div>
  );
}
