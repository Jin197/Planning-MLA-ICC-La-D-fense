import type { Metadata } from "next";
import { getCommunityContext } from "@/server/auth/context";
import {
  listMembers,
  listSkills,
  listTeams,
  getCommunity,
} from "@/server/services/communities";
import {
  Alerte,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EtatVide,
  Input,
} from "@/components/ui/primitives";
import { GestionMembre } from "./gestion-membre";

export const metadata: Metadata = { title: "Membres" };

export default async function PageMembres({
  params,
  searchParams,
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<{ q?: string; retire?: string; remplacer?: string }>;
}) {
  const { communityId } = await params;
  const query = await searchParams;
  const recherche = (query.q ?? "").trim().toLowerCase();
  const aRemplacer = Number(query.remplacer ?? 0);

  const ctx = await getCommunityContext(communityId);
  const estAdmin = ctx.membership?.role === "admin";

  const [community, membres, competences, equipes] = await Promise.all([
    getCommunity(communityId),
    listMembers(communityId),
    listSkills(communityId),
    listTeams(communityId),
  ]);

  const actifs = membres.filter((m) => m.status === "active");
  const retires = membres.filter((m) => m.status === "revoked");
  const filtres = actifs.filter((m) =>
    recherche === ""
      ? true
      : `${m.firstName} ${m.lastName} ${m.skills.join(" ")}`
          .toLowerCase()
          .includes(recherche),
  );

  const admins = actifs.filter((m) => m.role === "admin");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-nuit-doux">{community?.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">Membres</h1>
        <p className="mt-1 text-sm text-nuit-doux">
          {actifs.length} membre(s) actif(s), dont {admins.length} admin(s).
        </p>
      </header>

      <Card>
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="q" className="block text-sm font-medium">
                Rechercher par nom ou competence
              </label>
              <Input id="q" name="q" defaultValue={query.q ?? ""} className="mt-1.5" />
            </div>
            <button
              type="submit"
              className="min-h-11 rounded-[var(--radius-doux)] border border-bordure-forte px-4"
            >
              Rechercher
            </button>
          </form>
        </CardBody>
      </Card>

      {query.retire ? (
        <Alerte ton="succes" titre="Acces revoque">
          {aRemplacer > 0
            ? `${aRemplacer} affectation(s) future(s) sont signalees a remplacer. Les archives et l'historique sont conserves.`
            : "Les archives et l'historique de cette personne sont conserves."}
        </Alerte>
      ) : null}

      {estAdmin ? (
        <Alerte ton="info" titre="Gestion des roles">
          Vous pouvez promouvoir ou retrograder un membre. La communaute doit
          toujours conserver au moins un admin actif.
        </Alerte>
      ) : null}

      {filtres.length === 0 ? (
        <EtatVide
          titre="Aucun membre trouve"
          description={recherche ? "Essayez un autre terme." : undefined}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtres.map((membre) => (
            <Card as="li" key={membre.membershipId}>
              <CardBody className="space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar initiales={membre.initials} nom={`${membre.firstName} ${membre.lastName}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {membre.firstName} {membre.lastName}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge ton={membre.role === "admin" ? "indigo" : "neutre"}>
                        {membre.role === "admin" ? "Admin" : "Membre"}
                      </Badge>
                      {membre.teams.map((equipe) => (
                        <Badge key={equipe} ton="or">
                          {equipe}
                        </Badge>
                      ))}
                    </div>
                    {membre.skills.length > 0 ? (
                      <p className="mt-2 text-sm text-nuit-doux">
                        Competences : {membre.skills.join(", ")}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-nuit-tres-doux">
                        Aucune competence declaree.
                      </p>
                    )}
                  </div>
                </div>

                {estAdmin ? (
                  <GestionMembre
                    communityId={communityId}
                    membershipId={membre.membershipId}
                    nom={`${membre.firstName} ${membre.lastName}`}
                    role={membre.role}
                    competences={competences.map((c) => ({
                      id: c.id,
                      label: c.label,
                      active: membre.skills.includes(c.label),
                    }))}
                    estDernierAdmin={membre.role === "admin" && admins.length === 1}
                  />
                ) : null}
              </CardBody>
            </Card>
          ))}
        </ul>
      )}

      {retires.length > 0 && estAdmin ? (
        <Card>
          <CardHeader
            titre="Acces revoques"
            sousTitre="Leur historique est conserve : rien n'est efface sans politique explicite."
          />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {retires.map((membre) => (
                <li key={membre.membershipId} className="flex items-center gap-2">
                  <Avatar
                    initiales={membre.initials}
                    nom={`${membre.firstName} ${membre.lastName}`}
                    taille="petit"
                  />
                  {membre.firstName} {membre.lastName}
                  <Badge ton="neutre">Revoque</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          titre="Equipes"
          sousTitre="Une equipe regroupe des personnes pour l'organisation des plans."
        />
        <CardBody>
          <ul className="flex flex-wrap gap-2">
            {equipes.map((equipe) => (
              <li key={equipe.id}>
                <Badge ton="or">{equipe.name}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
