import "server-only";
import { newId, slugify } from "@/lib/ids";
import { localToUtc, type LocalDateTimeInput } from "@/lib/time";
import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import { eventWindow } from "@/domain/events";
import { buildTemplate } from "@/domain/template";
import { copyTemplateIntoPlan } from "@/domain/template";
import type {
  Assignment,
  AvailabilityAnswer,
  Community,
  CommunityMembership,
  CommunityType,
  Event,
  EventSession,
  EventState,
  Id,
  Profile,
  EventTeam,
  Rehearsal,
} from "@/domain/types";
import { hashPassword } from "../../auth/password";
import { emptySnapshot, type Snapshot } from "./store";

/**
 * Donnees fictives de demonstration.
 *
 * Aucune identite, aucun motif et aucune donnee personnelle du classeur
 * source ne sont reproduits ici : ces personnes sont inventees. Le jeu couvre
 * le MLA, l'equipe EJP, l'Accueil et la Sonorisation, plusieurs competences
 * par personne, un chevauchement entre deux ministeres et un evenement
 * archive.
 */

const TZ = "Europe/Paris";
export const DEMO_PASSWORD = "diapason2026";

const at = (date: string, time: string): string =>
  localToUtc({ date, time } satisfies LocalDateTimeInput, TZ);

/* -------------------------------------------------------------------------- */
/* Dates du jeu                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Les dates ne sont pas ecrites en dur : elles sont calculees a
 * l'installation, autour d'une ancre encore a venir.
 *
 * Un jeu de demonstration date finit par expirer : passe ses dates, plus
 * aucune collecte n'est ouverte, les limites de reponse sont depassees, et
 * l'application se montre vide alors qu'elle fonctionne.
 *
 * L'ancre est le dernier dimanche d'octobre, parce que la nuit precedente est
 * celle du passage a l'heure d'hiver en Europe/Paris : la demonstration garde
 * ainsi sa repetition de 23:00 a 01:30 cette nuit-la, qui doit durer 2 h 30.
 */
function dernierDimancheDOctobre(annee: number): Date {
  // getUTCDay() du 31 octobre donne le nombre de jours a retirer.
  const trenteEtUn = new Date(Date.UTC(annee, 9, 31));
  return new Date(Date.UTC(annee, 9, 31 - trenteEtUn.getUTCDay()));
}

export function ancreDemo(aujourdhui = new Date()): Date {
  const annee = aujourdhui.getUTCFullYear();
  const candidat = dernierDimancheDOctobre(annee);
  // Trois semaines de marge : la limite de reponse et la repetition la plus
  // ancienne restent elles aussi dans le futur.
  const marge = 21 * 86400000;
  return candidat.getTime() - aujourdhui.getTime() > marge
    ? candidat
    : dernierDimancheDOctobre(annee + 1);
}

/** Jour calendaire (AAAA-MM-JJ) decale de `jours` par rapport a l'ancre. */
const jourDecale = (ancre: Date, jours: number): string =>
  new Date(ancre.getTime() + jours * 86400000).toISOString().slice(0, 10);

/** « 31 octobre », pour nommer les evenements d'apres leur date reelle. */
const libelleJour = (date: string): string =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(new Date(`${date}T12:00:00.000Z`));

interface PersonSeed {
  firstName: string;
  lastName: string;
  email: string;
  ministry: string;
  choice: "responsable" | "membre";
  /** Competences, par libelle, dans la communaute MLA. */
  mlaSkills?: string[];
  description?: string;
}

const PEOPLE: PersonSeed[] = [
  {
    firstName: "Noa",
    lastName: "Bertrand",
    email: "noa.bertrand@exemple.test",
    ministry: "Ministere de louange et d'adoration",
    choice: "responsable",
    mlaSkills: ["LEAD", "Soprano"],
    description: "Referente planning du MLA sur le site de demonstration.",
  },
  {
    firstName: "Elias",
    lastName: "Marchand",
    email: "elias.marchand@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Piano", "Batterie", "Tenor"],
    description: "Joue piano et batterie, chante tenor.",
  },
  {
    firstName: "Maelys",
    lastName: "Fontaine",
    email: "maelys.fontaine@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Alto"],
  },
  {
    firstName: "Tobias",
    lastName: "Reverdy",
    email: "tobias.reverdy@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Basse", "Guitare"],
  },
  {
    firstName: "Soline",
    lastName: "Carvalho",
    email: "soline.carvalho@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Soprano", "Mezzo-soprano"],
  },
  {
    firstName: "Ruben",
    lastName: "Dossou",
    email: "ruben.dossou@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Batterie"],
  },
  {
    firstName: "Ines",
    lastName: "Valadier",
    email: "ines.valadier@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Alto", "LEAD"],
  },
  {
    firstName: "Gaspard",
    lastName: "Nguema",
    email: "gaspard.nguema@exemple.test",
    ministry: "MLA et Sonorisation",
    choice: "membre",
    mlaSkills: ["Piano"],
    description: "Aussi membre de la Sonorisation : attention aux chevauchements.",
  },
  {
    firstName: "Liora",
    lastName: "Mendy",
    email: "liora.mendy@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Tenor"],
  },
  {
    firstName: "Camille",
    lastName: "Aubriot",
    email: "camille.aubriot@exemple.test",
    ministry: "MLA",
    choice: "membre",
    mlaSkills: ["Alto", "Soprano"],
  },
  {
    firstName: "Sarah",
    lastName: "Lemoine",
    email: "sarah.lemoine@exemple.test",
    ministry: "Accueil",
    choice: "responsable",
  },
  {
    firstName: "Victor",
    lastName: "Pelletier",
    email: "victor.pelletier@exemple.test",
    ministry: "Sonorisation",
    choice: "responsable",
  },
  {
    firstName: "Anaelle",
    lastName: "Rakoto",
    email: "anaelle.rakoto@exemple.test",
    ministry: "Integration",
    choice: "membre",
    description: "Compte sans adhesion : sert a montrer le catalogue et la demande.",
  },
];

interface Ctx {
  snap: Snapshot;
  profileByEmail: Map<string, Profile>;
  now: string;
}

function addCommunity(
  ctx: Ctx,
  input: {
    name: string;
    type: CommunityType;
    description: string;
    leaderEmail: string;
    skillLabels: string[];
  },
): { community: Community; templateId: Id; fieldIds: Id[] } {
  const leader = ctx.profileByEmail.get(input.leaderEmail)!;
  const community: Community = {
    id: newId(),
    slug: slugify(input.name),
    name: input.name,
    type: input.type,
    otherLabel: null,
    description: input.description,
    displayedLeaderName: `${leader.firstName} ${leader.lastName}`,
    createdBy: leader.id,
    timezone: TZ,
    createdAt: ctx.now,
  };
  ctx.snap.communities.push(community);

  const { template, fields } = buildTemplate(community.id, input.type, ctx.now);
  ctx.snap.planning_templates.push(template);
  ctx.snap.template_fields.push(...fields);

  ctx.snap.skills.push(
    ...input.skillLabels.map((label) => ({
      id: newId(),
      communityId: community.id,
      label,
    })),
  );

  return {
    community,
    templateId: template.id,
    fieldIds: fields.map((f) => f.id),
  };
}

function addMembership(
  ctx: Ctx,
  communityId: Id,
  email: string,
  role: "admin" | "membre",
): CommunityMembership {
  const profile = ctx.profileByEmail.get(email)!;
  const membership: CommunityMembership = {
    id: newId(),
    communityId,
    userId: profile.id,
    role,
    status: "active",
    joinedAt: ctx.now,
    revokedAt: null,
  };
  ctx.snap.community_memberships.push(membership);
  return membership;
}

/**
 * Cree un evenement de demonstration : son horaire propre, ses eventuels
 * sous-evenements, et ses equipes — qui n'existent que pour lui.
 *
 * `plan(sessionId, nomEquipe)` rend le plan correspondant, avec `null` pour
 * une equipe rattachee a toute la duree de l'evenement.
 */
function addEvent(
  ctx: Ctx,
  input: {
    communityId: Id;
    title: string;
    description: string;
    state: EventState;
    createdByEmail: string;
    /** Horaire propre de l'evenement. Deduit des sous-evenements si omis. */
    date?: string;
    start?: string;
    end?: string;
    location?: string;
    address?: string;
    provisional?: boolean;
    /** Sous-evenements, facultatifs. */
    sessions?: {
      label: string;
      date: string;
      start: string;
      end: string;
      location?: string;
      address?: string;
      provisional?: boolean;
    }[];
    /**
     * Equipes creees dans l'evenement. `sessionOrdinals` vide rattache
     * l'equipe a toute la duree de l'evenement.
     */
    teams: { name: string; memberIds?: Id[]; sessionOrdinals?: number[] }[];
    rehearsals?: {
      label: string;
      startDate: string;
      start: string;
      endDate: string;
      end: string;
      location: string;
      address: string;
      room: string;
      teamNames: string[];
    }[];
    deadline?: { date: string; time: string };
  },
): {
  event: Event;
  sessions: EventSession[];
  teams: EventTeam[];
  plan: (sessionId: Id | null, teamName: string) => Id;
} {
  const creator = ctx.profileByEmail.get(input.createdByEmail)!;
  const sousEvenements = input.sessions ?? [];

  const sessions: EventSession[] = sousEvenements.map((s, i) => ({
    id: newId(),
    communityId: input.communityId,
    eventId: "",
    label: s.label,
    ordinal: i + 1,
    startsAt: at(s.date, s.start),
    endsAt: at(s.date, s.end),
    locationName: s.location ?? "ICC La Defense",
    locationAddress: s.address ?? "Paris La Defense",
    scheduleProvisional: s.provisional ?? false,
  }));

  // Horaire propre de l'evenement : celui annonce, elargi a ses
  // sous-evenements. Sans sous-evenement, c'est le seul horaire.
  const annonce =
    input.date && input.start && input.end
      ? { startsAt: at(input.date, input.start), endsAt: at(input.date, input.end) }
      : {
          startsAt: sessions[0]!.startsAt,
          endsAt: sessions[sessions.length - 1]!.endsAt,
        };
  const fenetre = eventWindow(annonce, sessions);

  const event: Event = {
    id: newId(),
    communityId: input.communityId,
    title: input.title,
    description: input.description,
    state: input.state,
    timezone: TZ,
    startsAt: fenetre.startsAt,
    endsAt: fenetre.endsAt,
    locationName: input.location ?? "ICC La Defense",
    locationAddress: input.address ?? "Paris La Defense",
    scheduleProvisional: input.provisional ?? false,
    version: 1,
    publishedVersion: input.state === "publie" || input.state === "archive" ? 1 : 0,
    responseDeadline: input.deadline
      ? at(input.deadline.date, input.deadline.time)
      : null,
    publishedAt:
      input.state === "publie" || input.state === "archive" ? ctx.now : null,
    cancelledAt: null,
    cancelReason: null,
    archivedAt: input.state === "archive" ? ctx.now : null,
    createdBy: creator.id,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  ctx.snap.events.push(event);

  for (const session of sessions) session.eventId = event.id;
  ctx.snap.event_sessions.push(...sessions);

  const fields = ctx.snap.template_fields.filter(
    (f) => f.communityId === input.communityId,
  );
  const template = ctx.snap.planning_templates.find(
    (t) => t.communityId === input.communityId,
  );

  // Cle « sessionId|evenement:nomEquipe » -> planId, pour poser les
  // affectations ensuite.
  const planIds = new Map<string, Id>();
  const teams: EventTeam[] = [];

  for (const [index, draft] of input.teams.entries()) {
    const team: EventTeam = {
      id: newId(),
      communityId: input.communityId,
      eventId: event.id,
      name: draft.name,
      order: index + 1,
    };
    ctx.snap.event_teams.push(team);
    teams.push(team);

    for (const membershipId of draft.memberIds ?? []) {
      ctx.snap.event_team_members.push({
        id: newId(),
        communityId: input.communityId,
        teamId: team.id,
        membershipId,
      });
    }

    const cibles =
      draft.sessionOrdinals && draft.sessionOrdinals.length > 0
        ? sessions
            .filter((s) => draft.sessionOrdinals!.includes(s.ordinal))
            .map((s) => s.id)
        : sessions.length === 0
          ? [null]
          : sessions.map((s) => s.id);

    for (const sessionId of cibles) {
      const planId = newId();
      planIds.set(`${sessionId ?? "evenement"}:${team.name}`, planId);
      ctx.snap.event_plans.push({
        id: planId,
        communityId: input.communityId,
        eventId: event.id,
        sessionId,
        teamId: team.id,
        templateVersion: template?.version ?? 1,
        createdAt: ctx.now,
      });
      ctx.snap.event_role_slots.push(
        ...copyTemplateIntoPlan(fields, {
          communityId: input.communityId,
          planId,
        }),
      );
    }
  }

  for (const r of input.rehearsals ?? []) {
    const rehearsal: Rehearsal = {
      id: newId(),
      communityId: input.communityId,
      eventId: event.id,
      label: r.label,
      startsAt: at(r.startDate, r.start),
      endsAt: at(r.endDate, r.end),
      locationName: r.location,
      locationAddress: r.address,
      room: r.room,
      attendanceExpected: true,
    };
    ctx.snap.rehearsals.push(rehearsal);
    for (const name of r.teamNames) {
      const team = teams.find((t) => t.name === name);
      if (!team) continue;
      ctx.snap.rehearsal_teams.push({
        id: newId(),
        communityId: input.communityId,
        rehearsalId: rehearsal.id,
        teamId: team.id,
      });
    }
  }

  return {
    event,
    sessions,
    teams,
    plan: (sessionId, teamName) =>
      planIds.get(`${sessionId ?? "evenement"}:${teamName}`)!,
  };
}

/** `sessionId` null : la reponse porte sur l'evenement lui-meme. */
function answer(
  ctx: Ctx,
  communityId: Id,
  eventId: Id,
  sessionId: Id | null,
  membershipId: Id,
  value: AvailabilityAnswer,
  reason?: string,
): void {
  const id = newId();
  ctx.snap.availabilities.push({
    id,
    communityId,
    eventId,
    sessionId,
    membershipId,
    answer: value,
    needsReconfirmation: false,
    answeredAt: ctx.now,
    updatedAt: ctx.now,
  });
  if (reason) {
    const membership = ctx.snap.community_memberships.find(
      (m) => m.id === membershipId,
    )!;
    ctx.snap.availability_reasons.push({
      id: newId(),
      communityId,
      availabilityId: id,
      authorUserId: membership.userId,
      text: reason,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  }
}

function assign(
  ctx: Ctx,
  input: {
    communityId: Id;
    planId: Id;
    slotLabel: string;
    membershipId: Id;
    state?: Assignment["state"];
    detail?: string;
  },
): void {
  const slot = ctx.snap.event_role_slots.find(
    (s) => s.planId === input.planId && s.label === input.slotLabel,
  );
  if (!slot) return;
  const creator = ctx.snap.community_memberships.find(
    (m) => m.communityId === input.communityId && m.role === "admin",
  )!;
  ctx.snap.assignments.push({
    id: newId(),
    communityId: input.communityId,
    planId: input.planId,
    slotId: slot.id,
    membershipId: input.membershipId,
    state: input.state ?? "a_confirmer",
    detail: input.detail ?? null,
    exceptions: [],
    memberNote: null,
    createdBy: creator.userId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });
}

export async function buildSeedSnapshot(): Promise<Snapshot> {
  const snap = emptySnapshot();

  const ancre = ancreDemo();
  const dates = {
    /** Dimanche publie : le planning est complet et visible. */
    publie: jourDecale(ancre, -7),
    /** Dimanche en collecte : les reponses sont ouvertes. */
    collecte: jourDecale(ancre, 0),
    /** Dimanche archive : historique en lecture seule. */
    archive: jourDecale(ancre, -21),
    anniversaire: jourDecale(ancre, 27),
    repetitionGenerale: jourDecale(ancre, -9),
    repetitionNuit: jourDecale(ancre, -2),
    repetitionNuitFin: jourDecale(ancre, -1),
    /** Samedi soir du changement d'heure, et le dimanche qui suit. */
    changementHeure: jourDecale(ancre, -1),
    changementHeureFin: jourDecale(ancre, 0),
    limiteReponse: jourDecale(ancre, -3),
  };

  // Les enregistrements sont ecrits comme s'ils dataient de deux semaines.
  const now = at(jourDecale(ancre, -14), "09:00");
  const ctx: Ctx = { snap, profileByEmail: new Map(), now };

  // Comptes. Mot de passe commun, uniquement pour la demonstration locale.
  const { hash, salt } = await hashPassword(DEMO_PASSWORD);
  for (const person of PEOPLE) {
    const profile: Profile = {
      id: newId(),
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      declaredMinistry: person.ministry,
      description: person.description ?? null,
      onboardingChoice: person.choice,
      emailVerifiedAt: now,
      createdAt: now,
    };
    snap.profiles.push(profile);
    ctx.profileByEmail.set(person.email, profile);
    snap.account_secrets.push({
      userId: profile.id,
      passwordHash: hash,
      passwordSalt: salt,
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    });
    snap.notification_preferences.push({
      userId: profile.id,
      ...DEFAULT_PREFERENCES,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Communautes                                                        */
  /* ------------------------------------------------------------------ */

  const mla = addCommunity(ctx, {
    name: "MLA La Defense (demonstration)",
    type: "MLA",
    description:
      "Ministere de louange et d'adoration du site de La Defense. Jeu de donnees fictif.",
    leaderEmail: "noa.bertrand@exemple.test",
    skillLabels: [
      "LEAD",
      "Tenor",
      "Alto",
      "Mezzo-soprano",
      "Soprano",
      "Piano",
      "Batterie",
      "Basse",
      "Guitare",
    ],
  });

  const accueil = addCommunity(ctx, {
    name: "Accueil La Defense (demonstration)",
    type: "ACCUEIL",
    description: "Equipe d'accueil du dimanche. Jeu de donnees fictif.",
    leaderEmail: "sarah.lemoine@exemple.test",
    skillLabels: ["Accueil", "Orientation", "Placement"],
  });

  const sono = addCommunity(ctx, {
    name: "Sonorisation La Defense (demonstration)",
    type: "SONORISATION",
    description: "Pole technique son. Jeu de donnees fictif.",
    leaderEmail: "victor.pelletier@exemple.test",
    skillLabels: ["Facade", "Retours", "Captation"],
  });

  /* ------------------------------------------------------------------ */
  /* Adhesions                                                          */
  /* ------------------------------------------------------------------ */

  const mlaMembers = new Map<string, CommunityMembership>();
  mlaMembers.set(
    "noa.bertrand@exemple.test",
    addMembership(ctx, mla.community.id, "noa.bertrand@exemple.test", "admin"),
  );
  // Un second admin : permet d'illustrer la protection du dernier admin.
  mlaMembers.set(
    "ines.valadier@exemple.test",
    addMembership(ctx, mla.community.id, "ines.valadier@exemple.test", "admin"),
  );
  for (const email of [
    "elias.marchand@exemple.test",
    "maelys.fontaine@exemple.test",
    "tobias.reverdy@exemple.test",
    "soline.carvalho@exemple.test",
    "ruben.dossou@exemple.test",
    "gaspard.nguema@exemple.test",
    "liora.mendy@exemple.test",
    "camille.aubriot@exemple.test",
  ]) {
    mlaMembers.set(email, addMembership(ctx, mla.community.id, email, "membre"));
  }

  const accueilAdmin = addMembership(
    ctx,
    accueil.community.id,
    "sarah.lemoine@exemple.test",
    "admin",
  );
  const accueilMember = addMembership(
    ctx,
    accueil.community.id,
    "camille.aubriot@exemple.test",
    "membre",
  );

  const sonoAdmin = addMembership(
    ctx,
    sono.community.id,
    "victor.pelletier@exemple.test",
    "admin",
  );
  // Gaspard est dans deux ministeres : sert la detection de chevauchement.
  const sonoGaspard = addMembership(
    ctx,
    sono.community.id,
    "gaspard.nguema@exemple.test",
    "membre",
  );

  // Competences par membre.
  const skillByLabel = new Map(
    snap.skills
      .filter((s) => s.communityId === mla.community.id)
      .map((s) => [s.label, s.id]),
  );
  for (const person of PEOPLE) {
    const membership = mlaMembers.get(person.email);
    if (!membership || !person.mlaSkills) continue;
    for (const label of person.mlaSkills) {
      const skillId = skillByLabel.get(label);
      if (!skillId) continue;
      snap.membership_skills.push({
        id: newId(),
        communityId: mla.community.id,
        membershipId: membership.id,
        skillId,
      });
    }
  }

  /*
   * Compositions habituelles du MLA. Les equipes appartenant a chaque
   * evenement, ces listes ne sont pas des equipes : elles servent de
   * raccourci de saisie, recopie dans chaque evenement de la demonstration
   * comme le ferait un admin.
   */
  const effectif = (...emails: string[]) =>
    emails.flatMap((email) => {
      const membership = mlaMembers.get(email);
      return membership ? [membership.id] : [];
    });

  const EQUIPE_1 = effectif(
    "noa.bertrand@exemple.test",
    "elias.marchand@exemple.test",
    "maelys.fontaine@exemple.test",
    "tobias.reverdy@exemple.test",
    "liora.mendy@exemple.test",
  );
  const EQUIPE_2 = effectif(
    "ines.valadier@exemple.test",
    "soline.carvalho@exemple.test",
    "ruben.dossou@exemple.test",
    "gaspard.nguema@exemple.test",
    "camille.aubriot@exemple.test",
  );
  const EQUIPE_EJP = effectif(
    "camille.aubriot@exemple.test",
    "liora.mendy@exemple.test",
    "gaspard.nguema@exemple.test",
  );

  // Une demande d'adhesion en attente.
  snap.join_requests.push({
    id: newId(),
    communityId: mla.community.id,
    userId: ctx.profileByEmail.get("anaelle.rakoto@exemple.test")!.id,
    message: "Bonjour, je chante alto et je souhaite rejoindre le MLA.",
    status: "en_attente",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: now,
  });

  /* ------------------------------------------------------------------ */
  /* Chants                                                             */
  /* ------------------------------------------------------------------ */

  const songTitles = [
    "Lumiere sur nos pas",
    "Ta fidelite demeure",
    "Souffle nouveau",
    "Au creux de ta main",
    "Rien ne nous separera",
    "Nous t'exaltons",
  ];
  const songIds = songTitles.map((title) => {
    const id = newId();
    snap.songs.push({
      id,
      communityId: mla.community.id,
      title,
      songKey: null,
      tempo: null,
      defaultLead: null,
      links: [],
      notes: null,
      archivedAt: null,
      createdAt: now,
    });
    return id;
  });

  /* ------------------------------------------------------------------ */
  /* Evenements                                                         */
  /* ------------------------------------------------------------------ */

  const sundaySessions = (date: string) => [
    { label: "Culte 1", date, start: "09:00", end: "10:45" },
    { label: "Culte 2", date, start: "11:00", end: "12:45" },
    { label: "Culte 3", date, start: "15:00", end: "16:45" },
    { label: "Culte 4", date, start: "17:00", end: "18:45" },
  ];

  // 1. Dimanche publie, avec affectations et reponses variees.
  const published = addEvent(ctx, {
    communityId: mla.community.id,
    title: `Cultes du dimanche ${libelleJour(dates.publie)}`,
    description:
      "Quatre cultes. Equipe 1 le matin, Equipe 2 l'apres-midi. Donnees fictives.",
    state: "publie",
    createdByEmail: "noa.bertrand@exemple.test",
    sessions: sundaySessions(dates.publie),
    // Equipe 1 sur les deux cultes du matin, Equipe 2 sur ceux de
    // l'apres-midi : le rattachement dit quand chacune sert.
    teams: [
      { name: "Equipe 1", memberIds: EQUIPE_1, sessionOrdinals: [1, 2] },
      { name: "Equipe 2", memberIds: EQUIPE_2, sessionOrdinals: [3, 4] },
    ],
    rehearsals: [
      {
        label: "Repetition generale",
        startDate: dates.repetitionGenerale,
        start: "19:00",
        endDate: dates.repetitionGenerale,
        end: "23:00",
        location: "Studio Hyacinthe",
        address: "12 rue de la Repetition, 92800 Puteaux",
        room: "Studio 2",
        teamNames: ["Equipe 1", "Equipe 2"],
      },
    ],
  });

  const [c1, c2, c3, c4] = published.sessions as [
    EventSession,
    EventSession,
    EventSession,
    EventSession,
  ];

  const m = (email: string) => mlaMembers.get(email)!.id;

  const repond = (
    sessionId: Id | null,
    email: string,
    value: AvailabilityAnswer,
    reason?: string,
  ) =>
    answer(
      ctx,
      mla.community.id,
      published.event.id,
      sessionId,
      m(email),
      value,
      reason,
    );

  // Disponibilites differentes entre le culte 1 et le culte 2.
  repond(c1.id, "maelys.fontaine@exemple.test", "disponible");
  repond(
    c2.id,
    "maelys.fontaine@exemple.test",
    "indisponible",
    "Engagement familial a midi.",
  );
  for (const session of [c3, c4]) {
    repond(session.id, "maelys.fontaine@exemple.test", "disponible");
  }

  for (const email of [
    "noa.bertrand@exemple.test",
    "elias.marchand@exemple.test",
    "tobias.reverdy@exemple.test",
    "liora.mendy@exemple.test",
  ]) {
    for (const session of published.sessions) {
      repond(session.id, email, "disponible");
    }
  }
  for (const email of ["soline.carvalho@exemple.test", "ruben.dossou@exemple.test"]) {
    for (const session of [c3, c4]) {
      repond(session.id, email, "disponible");
    }
  }
  // Camille est indisponible avec un motif prive.
  for (const session of published.sessions) {
    repond(
      session.id,
      "camille.aubriot@exemple.test",
      "indisponible",
      "Deplacement professionnel ce week-end.",
    );
  }
  // Gaspard ne repond que sur l'apres-midi : il sonorise le matin.
  for (const session of [c3, c4]) {
    repond(session.id, "gaspard.nguema@exemple.test", "disponible");
  }

  const plan = published.plan;

  // Culte 1 : Equipe 1. Le LEAD change entre le culte 1 et le culte 2.
  assign(ctx, {
    communityId: mla.community.id,
    planId: plan(c1.id, "Equipe 1"),
    slotLabel: "LEAD",
    membershipId: m("noa.bertrand@exemple.test"),
    state: "confirmee",
  });
  assign(ctx, {
    communityId: mla.community.id,
    planId: plan(c2.id, "Equipe 1"),
    slotLabel: "LEAD",
    membershipId: m("ines.valadier@exemple.test"),
    state: "a_confirmer",
  });
  for (const session of [c1, c2]) {
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 1"),
      slotLabel: "Piano",
      membershipId: m("elias.marchand@exemple.test"),
      state: "confirmee",
    });
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 1"),
      slotLabel: "Basse",
      membershipId: m("tobias.reverdy@exemple.test"),
      state: "confirmee",
    });
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 1"),
      slotLabel: "Tenor",
      membershipId: m("liora.mendy@exemple.test"),
      state: "a_confirmer",
    });
  }
  // Maelys tient l'alto au culte 1 et un pupitre double precise.
  assign(ctx, {
    communityId: mla.community.id,
    planId: plan(c1.id, "Equipe 1"),
    slotLabel: "Alto",
    membershipId: m("maelys.fontaine@exemple.test"),
    state: "confirmee",
  });
  assign(ctx, {
    communityId: mla.community.id,
    planId: plan(c1.id, "Equipe 1"),
    slotLabel: "Pupitre double",
    membershipId: m("soline.carvalho@exemple.test"),
    detail: "soprano",
    state: "a_confirmer",
  });
  // Un remplacement a prevoir sur le culte 2.
  assign(ctx, {
    communityId: mla.community.id,
    planId: plan(c2.id, "Equipe 1"),
    slotLabel: "Alto",
    membershipId: m("maelys.fontaine@exemple.test"),
    state: "a_remplacer",
  });

  // Apres-midi : Equipe 2.
  for (const session of [c3, c4]) {
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 2"),
      slotLabel: "LEAD",
      membershipId: m("ines.valadier@exemple.test"),
      state: "confirmee",
    });
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 2"),
      slotLabel: "Piano",
      membershipId: m("gaspard.nguema@exemple.test"),
      state: "a_confirmer",
    });
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 2"),
      slotLabel: "Batterie",
      membershipId: m("ruben.dossou@exemple.test"),
      state: "confirmee",
    });
    assign(ctx, {
      communityId: mla.community.id,
      planId: plan(session.id, "Equipe 2"),
      slotLabel: "Soprano",
      membershipId: m("soline.carvalho@exemple.test"),
      state: "confirmee",
    });
  }

  // Chants : une liste pour les cultes du matin, une autre l'apres-midi.
  const sequences = ["Chant 1", "Chant 2", "Chant 3", "Sainte Cene", "Offrandes"];
  for (const [index, sessionRef] of [c1, c3].entries()) {
    sequences.forEach((sequence, order) => {
      snap.setlist_items.push({
        id: newId(),
        communityId: mla.community.id,
        eventId: published.event.id,
        sessionId: sessionRef.id,
        sequence,
        order: order + 1,
        songId: songIds[(order + index) % songIds.length] ?? null,
        freeTitle: null,
        links: [],
        notes: null,
      });
    });
  }

  snap.dress_codes.push({
    id: newId(),
    communityId: mla.community.id,
    eventId: published.event.id,
    teamId: null,
    theme: "Automne sobre",
    mood: "Chaleureux et simple",
    colors: ["#5C4033", "#E8DCC8", "#1F2A44"],
    materials: "Laine legere, coton",
    instruction:
      "Haut uni dans les tons ivoire ou brun, bas sombre. Chaussures fermees.",
    updatedAt: now,
  });
  snap.dress_codes.push({
    id: newId(),
    communityId: mla.community.id,
    eventId: published.event.id,
    teamId: published.teams.find((t) => t.name === "Equipe 2")!.id,
    theme: "Automne sobre",
    mood: "Chaleureux et simple",
    colors: ["#1F2A44", "#E8DCC8"],
    materials: "Coton",
    instruction:
      "Variante Equipe 2 : chemise ivoire, pantalon bleu nuit.",
    updatedAt: now,
  });

  // Quelques messages de discussion.
  const messageAuthors = [
    ["noa.bertrand@exemple.test", "Repetition confirmee vendredi 19h, studio 2."],
    ["elias.marchand@exemple.test", "Je serai la des 18h30 pour installer le piano."],
    ["liora.mendy@exemple.test", "Bien note, merci."],
  ] as const;
  messageAuthors.forEach(([email, body], index) => {
    snap.event_messages.push({
      id: newId(),
      communityId: mla.community.id,
      eventId: published.event.id,
      authorUserId: ctx.profileByEmail.get(email)!.id,
      body,
      mentions: [],
      pinned: index === 0,
      createdAt: new Date(new Date(now).getTime() + index * 3600000).toISOString(),
      editedAt: null,
      moderatedBy: null,
      moderationNote: null,
      deletedAt: null,
    });
  });

  // 2. Dimanche suivant, en collecte, avec une repetition qui passe minuit.
  const collecting = addEvent(ctx, {
    communityId: mla.community.id,
    title: `Cultes du dimanche ${libelleJour(dates.collecte)}`,
    description:
      "Collecte des disponibilites ouverte. La repetition du vendredi se termine apres minuit.",
    state: "collecte",
    createdByEmail: "noa.bertrand@exemple.test",
    sessions: sundaySessions(dates.collecte),
    teams: [
      { name: "Equipe 1", memberIds: EQUIPE_1, sessionOrdinals: [1, 2] },
      { name: "Equipe 2", memberIds: EQUIPE_2, sessionOrdinals: [3, 4] },
    ],
    deadline: { date: dates.limiteReponse, time: "20:00" },
    rehearsals: [
      {
        label: "Repetition de nuit",
        startDate: dates.repetitionNuit,
        start: "22:00",
        endDate: dates.repetitionNuitFin,
        end: "00:30",
        location: "Studio Hyacinthe",
        address: "12 rue de la Repetition, 92800 Puteaux",
        room: "Studio 1",
        teamNames: ["Equipe 1"],
      },
      {
        label: "Repetition du changement d'heure",
        startDate: dates.changementHeure,
        start: "23:00",
        endDate: dates.changementHeureFin,
        end: "01:30",
        location: "Studio Hyacinthe",
        address: "12 rue de la Repetition, 92800 Puteaux",
        room: "Studio 3",
        teamNames: ["Equipe 2"],
      },
    ],
  });
  answer(
    ctx,
    mla.community.id,
    collecting.event.id,
    collecting.sessions[0]!.id,
    m("noa.bertrand@exemple.test"),
    "disponible",
  );

  // 3. Culte EJP : un seul sous-evenement, horaire encore provisoire.
  addEvent(ctx, {
    communityId: mla.community.id,
    title: `Culte EJP ${libelleJour(dates.collecte)}`,
    description: "Culte des jeunes. Horaire a confirmer par le pole jeunesse.",
    state: "collecte",
    createdByEmail: "ines.valadier@exemple.test",
    sessions: [
      {
        label: "Culte EJP",
        date: dates.collecte,
        start: "16:00",
        end: "18:00",
        location: "Salle jeunesse",
        provisional: true,
      },
    ],
    teams: [{ name: "EJP", memberIds: EQUIPE_EJP }],
  });

  // 4. Brouillon sans sous-evenement : l'evenement porte lui-meme son
  // horaire, et l'equipe couvre toute sa duree.
  addEvent(ctx, {
    communityId: mla.community.id,
    title: "Soiree speciale anniversaire (brouillon)",
    description:
      "En preparation. Un seul bloc, sans sous-evenement. Visible des admins uniquement.",
    state: "brouillon",
    createdByEmail: "noa.bertrand@exemple.test",
    date: dates.anniversaire,
    start: "18:00",
    end: "21:30",
    location: "Salle des fetes",
    teams: [{ name: "Groupe louange du soir", memberIds: EQUIPE_1 }],
  });

  // 5. Evenement archive : historique en lecture seule.
  const archived = addEvent(ctx, {
    communityId: mla.community.id,
    title: `Cultes du dimanche ${libelleJour(dates.archive)}`,
    description: "Archive. Conserve pour l'historique.",
    state: "archive",
    createdByEmail: "noa.bertrand@exemple.test",
    sessions: sundaySessions(dates.archive),
    teams: [{ name: "Equipe 1", memberIds: EQUIPE_1, sessionOrdinals: [1] }],
  });
  assign(ctx, {
    communityId: mla.community.id,
    planId: archived.plan(archived.sessions[0]!.id, "Equipe 1"),
    slotLabel: "LEAD",
    membershipId: m("noa.bertrand@exemple.test"),
    state: "confirmee",
  });

  /* ------------------------------------------------------------------ */
  /* Accueil et Sonorisation                                            */
  /* ------------------------------------------------------------------ */

  const accueilEvent = addEvent(ctx, {
    communityId: accueil.community.id,
    title: `Accueil du dimanche ${libelleJour(dates.publie)}`,
    description: "Quatre postes Star. Donnees fictives.",
    state: "publie",
    createdByEmail: "sarah.lemoine@exemple.test",
    sessions: [
      { label: "Culte 1", date: dates.publie, start: "08:30", end: "11:00" },
      { label: "Culte 2", date: dates.publie, start: "10:30", end: "13:00" },
    ],
    teams: [
      { name: "Equipe d'accueil", memberIds: [accueilAdmin.id, accueilMember.id] },
    ],
  });
  assign(ctx, {
    communityId: accueil.community.id,
    planId: accueilEvent.plan(accueilEvent.sessions[0]!.id, "Equipe d'accueil"),
    slotLabel: "Star 1",
    membershipId: accueilAdmin.id,
    state: "confirmee",
  });
  assign(ctx, {
    communityId: accueil.community.id,
    planId: accueilEvent.plan(accueilEvent.sessions[0]!.id, "Equipe d'accueil"),
    slotLabel: "Star 2",
    membershipId: accueilMember.id,
    state: "a_confirmer",
  });

  // Sonorisation : chevauche le culte 1 du MLA, pour Gaspard.
  const sonoEvent = addEvent(ctx, {
    communityId: sono.community.id,
    title: `Son du dimanche ${libelleJour(dates.publie)}`,
    description: "Facade et retours. Donnees fictives.",
    state: "publie",
    createdByEmail: "victor.pelletier@exemple.test",
    sessions: [
      { label: "Culte 1", date: dates.publie, start: "08:45", end: "11:00" },
    ],
    teams: [{ name: "Equipe son", memberIds: [sonoAdmin.id, sonoGaspard.id] }],
  });
  assign(ctx, {
    communityId: sono.community.id,
    planId: sonoEvent.plan(sonoEvent.sessions[0]!.id, "Equipe son"),
    slotLabel: "Star 1",
    membershipId: sonoGaspard.id,
    state: "confirmee",
  });
  assign(ctx, {
    communityId: sono.community.id,
    planId: sonoEvent.plan(sonoEvent.sessions[0]!.id, "Equipe son"),
    slotLabel: "Star 2",
    membershipId: sonoAdmin.id,
    state: "confirmee",
  });

  return snap;
}
