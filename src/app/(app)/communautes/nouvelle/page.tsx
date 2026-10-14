import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth/context";
import { Alerte, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { FormulaireCommunaute } from "./formulaire";

export const metadata: Metadata = { title: "Creer une communaute" };

export default async function PageNouvelleCommunaute() {
  const session = await requireSession();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold sm:text-3xl">Creer une communaute</h1>
        <p className="mt-1 text-sm text-nuit-doux">
          Vous en devenez admin. Le modele de planning correspondant est installe
          automatiquement.
        </p>
      </header>

      {!session.viewer.emailVerified ? (
        <Alerte ton="attention" titre="Email a verifier">
          <p>
            La creation d&apos;une communaute demande un email verifie.{" "}
            <Link href="/verification-email" className="underline">
              Verifier mon email
            </Link>
            .
          </p>
        </Alerte>
      ) : null}

      <Card>
        <CardHeader
          titre="Informations"
          sousTitre="Le nom du responsable est un nom d'affichage : il n'accorde aucun droit a un autre compte."
        />
        <CardBody>
          <FormulaireCommunaute
            nomResponsable={`${session.profile.firstName} ${session.profile.lastName}`}
            desactive={!session.viewer.emailVerified}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader titre="Ce qui est installe" />
        <CardBody className="space-y-2 text-sm text-nuit-doux">
          <p>
            <strong className="text-nuit">MLA</strong> : nom, horaire, lieu,
            description, LEAD, Tenor, Alto, Soprano, Pupitre double, Piano,
            Batterie, Basse, Guitare, dress-code, charge des paroles, Mass Choir,
            danse et bannieres, referent planning, referent dress-code, lieu et
            heure de repetition.
          </p>
          <p>
            <strong className="text-nuit">
              Accueil, Sonorisation, Integration, Autre
            </strong>{" "}
            : Star 1 a Star 4, plus les informations generales et la repetition.
            Vous pourrez ajouter Star 5 et suivants.
          </p>
          <p>
            Tous les libelles sont renommables, reordonnables, et leur effectif
            minimum est reglable. Un poste facultatif peut rester vide sans rendre
            le planning incomplet.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
