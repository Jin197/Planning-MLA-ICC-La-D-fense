import type { IsoInstant } from "@/lib/time";

export type Id = string;

/* -------------------------------------------------------------------------- */
/* Comptes et profils                                                          */
/* -------------------------------------------------------------------------- */

/** Choix d'accueil : orientation de l'interface, jamais un droit. */
export type OnboardingChoice = "responsable" | "membre";

export interface Profile {
  id: Id;
  email: string;
  firstName: string;
  lastName: string;
  /** Ministere declare librement : information de profil, aucune adhesion. */
  declaredMinistry: string;
  description: string | null;
  onboardingChoice: OnboardingChoice;
  emailVerifiedAt: IsoInstant | null;
  createdAt: IsoInstant;
}

/** Donnees de compte privees, separees du profil partageable. */
export interface AccountSecret {
  userId: Id;
  passwordHash: string;
  passwordSalt: string;
  emailVerificationToken: string | null;
  passwordResetToken: string | null;
  passwordResetExpiresAt: IsoInstant | null;
  failedAttempts: number;
  lockedUntil: IsoInstant | null;
}

/** Vue d'un profil telle qu'elle peut circuler dans une communaute. */
export interface SharedProfile {
  userId: Id;
  firstName: string;
  lastName: string;
  initials: string;
}

/* -------------------------------------------------------------------------- */
/* Communautes, adhesions, equipes                                             */
/* -------------------------------------------------------------------------- */

export const COMMUNITY_TYPES = [
  "MLA",
  "ACCUEIL",
  "SONORISATION",
  "INTEGRATION",
  "AUTRE",
] as const;
export type CommunityType = (typeof COMMUNITY_TYPES)[number];

export interface Community {
  id: Id;
  slug: string;
  name: string;
  type: CommunityType;
  /** Libelle complementaire, uniquement pour le type AUTRE. */
  otherLabel: string | null;
  description: string;
  /** Nom d'affichage du responsable : pas un compte, pas une permission. */
  displayedLeaderName: string;
  createdBy: Id;
  timezone: string;
  createdAt: IsoInstant;
}

export type MembershipRole = "admin" | "membre";
export type MembershipStatus = "active" | "revoked";

export interface CommunityMembership {
  id: Id;
  communityId: Id;
  userId: Id;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: IsoInstant;
  revokedAt: IsoInstant | null;
}

export type JoinRequestStatus =
  | "en_attente"
  | "acceptee"
  | "refusee"
  | "annulee";

export interface JoinRequest {
  id: Id;
  communityId: Id;
  userId: Id;
  message: string | null;
  status: JoinRequestStatus;
  decidedBy: Id | null;
  decidedAt: IsoInstant | null;
  decisionNote: string | null;
  createdAt: IsoInstant;
}

export interface Skill {
  id: Id;
  communityId: Id;
  label: string;
}

export interface MembershipSkill {
  id: Id;
  communityId: Id;
  membershipId: Id;
  skillId: Id;
}

/*
 * Les equipes ne vivent pas ici : elles appartiennent a un evenement et sont
 * declarees plus bas, avec lui. Une communaute n'a donc pas de liste
 * d'equipes durables, et rien ne se reporte d'un evenement au suivant.
 */

/* -------------------------------------------------------------------------- */
/* Modeles de planning                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Type de donnee d'un champ de modele. Seul `poste` recoit un selecteur de
 * membres : les metadonnees, le dress-code et les rendez-vous n'en sont pas.
 */
export type TemplateFieldKind =
  | "texte"
  | "texte_long"
  | "lieu"
  | "creneau_horaire"
  | "dress_code"
  | "repetition_lieu"
  | "repetition_horaire"
  | "poste";

export interface PlanningTemplate {
  id: Id;
  communityId: Id;
  name: string;
  version: number;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface TemplateField {
  id: Id;
  communityId: Id;
  templateId: Id;
  kind: TemplateFieldKind;
  label: string;
  order: number;
  /** Vrai seulement pour kind === "poste". */
  assignable: boolean;
  /** Effectif minimum attendu ; 0 = poste facultatif. */
  minRequired: number;
  /** Plusieurs personnes possibles sur ce poste. */
  multiple: boolean;
  /** Une precision libre est attendue, ex. le pupitre tenu. */
  allowsDetail: boolean;
  required: boolean;
  archivedAt: IsoInstant | null;
}

/* -------------------------------------------------------------------------- */
/* Evenements, sous-evenements, equipes, plans, postes, affectations           */
/* -------------------------------------------------------------------------- */

export const EVENT_STATES = [
  "brouillon",
  "collecte",
  "publie",
  "annule",
  "archive",
] as const;
export type EventState = (typeof EVENT_STATES)[number];

/**
 * Evenement. L'admin le nomme librement — culte du dimanche, anniversaire,
 * convention — et le decrit. Il porte toujours son propre horaire : c'est
 * celui auquel les membres repondent quand l'evenement n'a aucun
 * sous-evenement, et la fenetre d'ensemble quand il en a.
 */
export interface Event {
  id: Id;
  communityId: Id;
  title: string;
  description: string;
  state: EventState;
  timezone: string;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  locationName: string;
  locationAddress: string;
  /**
   * Horaire encore a definir : l'import peut creer un evenement sans heure
   * fiable. Bloque la publication jusqu'a confirmation.
   */
  scheduleProvisional: boolean;
  /** Incrementee a chaque modification : detecte les ecritures concurrentes. */
  version: number;
  /** Numero de version du planning publie, pour les notifications ciblees. */
  publishedVersion: number;
  responseDeadline: IsoInstant | null;
  publishedAt: IsoInstant | null;
  cancelledAt: IsoInstant | null;
  cancelReason: string | null;
  archivedAt: IsoInstant | null;
  createdBy: Id;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/**
 * Sous-evenement : facultatif. Un evenement peut n'en avoir aucun, ou en
 * avoir autant que necessaire (« Culte 1 », « Culte 2 »...). Chacun a son
 * propre horaire et son propre lieu.
 */
export interface EventSession {
  id: Id;
  communityId: Id;
  eventId: Id;
  /** Ex. « Culte 1 », « Culte EJP ». */
  label: string;
  /** Rang dans la journee : permet de lire « Cultes 1 & 2 ». */
  ordinal: number;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  locationName: string;
  locationAddress: string;
  /**
   * Horaire encore a definir : l'import peut creer un sous-evenement sans
   * heure fiable. Bloque la publication jusqu'a confirmation.
   */
  scheduleProvisional: boolean;
}

/**
 * Equipe creee dans un evenement, en nombre libre. Elle n'existe que pour
 * lui : son effectif est saisi la et ne se reporte pas sur l'evenement
 * suivant.
 */
export interface EventTeam {
  id: Id;
  communityId: Id;
  eventId: Id;
  name: string;
  order: number;
}

export interface EventTeamMember {
  id: Id;
  communityId: Id;
  teamId: Id;
  membershipId: Id;
}

/**
 * Rattachement d'une equipe, et feuille de postes correspondante.
 *
 * `sessionId` porte le choix de l'admin : un sous-evenement precis, ou
 * `null` pour « toute la duree de l'evenement ». Une equipe presente sur
 * deux sous-evenements a donc deux plans, ce qui permet d'y affecter des
 * personnes differentes.
 */
export interface EventPlan {
  id: Id;
  communityId: Id;
  eventId: Id;
  sessionId: Id | null;
  teamId: Id;
  /** Version du modele copiee a la creation du plan. */
  templateVersion: number;
  createdAt: IsoInstant;
}

/** Poste copie du modele dans un plan, avec instantane des libelles. */
export interface EventRoleSlot {
  id: Id;
  communityId: Id;
  planId: Id;
  /** Identifiant stable du champ de modele d'origine. */
  templateFieldId: Id;
  label: string;
  order: number;
  minRequired: number;
  multiple: boolean;
  allowsDetail: boolean;
  /** Poste volontairement non utilise pour cet evenement. */
  enabled: boolean;
}

export const ASSIGNMENT_STATES = [
  "a_confirmer",
  "confirmee",
  "a_remplacer",
  "retiree",
] as const;
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];

export type ExceptionKind =
  | "sans_reponse"
  | "indisponible"
  | "hors_competence"
  | "conflit";

export interface AssignmentException {
  kind: ExceptionKind;
  reason: string;
  byUserId: Id;
  at: IsoInstant;
}

export interface Assignment {
  id: Id;
  communityId: Id;
  planId: Id;
  slotId: Id;
  membershipId: Id;
  state: AssignmentState;
  /** Precision libre, ex. « (alto) » ou « Culte 2 ». */
  detail: string | null;
  exceptions: AssignmentException[];
  memberNote: string | null;
  createdBy: Id;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Disponibilites                                                              */
/* -------------------------------------------------------------------------- */

export type AvailabilityAnswer = "disponible" | "indisponible";

/** Etat affiche : l'absence de reponse n'est jamais convertie. */
export type AvailabilityDisplayState =
  | "disponible"
  | "indisponible"
  | "a_renseigner"
  | "a_reconfirmer";

/**
 * Reponse de disponibilite. Elle porte sur un sous-evenement quand
 * l'evenement en a, et sur l'evenement lui-meme sinon : `sessionId` vaut
 * alors `null`. Jamais sur une journee entiere.
 */
export interface Availability {
  id: Id;
  communityId: Id;
  eventId: Id;
  sessionId: Id | null;
  membershipId: Id;
  answer: AvailabilityAnswer;
  /** Les horaires ont change apres la reponse. */
  needsReconfirmation: boolean;
  answeredAt: IsoInstant;
  updatedAt: IsoInstant;
}

/**
 * Motif prive. Ressource separee : la confidentialite est imposee en base
 * (RLS distincte) et pas seulement dans l'interface.
 */
export interface AvailabilityReason {
  id: Id;
  communityId: Id;
  availabilityId: Id;
  authorUserId: Id;
  text: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Repetitions                                                                 */
/* -------------------------------------------------------------------------- */

export interface Rehearsal {
  id: Id;
  communityId: Id;
  eventId: Id;
  label: string;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  locationName: string;
  locationAddress: string;
  room: string;
  attendanceExpected: boolean;
}

export interface RehearsalTeam {
  id: Id;
  communityId: Id;
  rehearsalId: Id;
  teamId: Id;
}

export interface RehearsalAvailability {
  id: Id;
  communityId: Id;
  rehearsalId: Id;
  membershipId: Id;
  answer: AvailabilityAnswer;
  needsReconfirmation: boolean;
  answeredAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface RehearsalAvailabilityReason {
  id: Id;
  communityId: Id;
  rehearsalAvailabilityId: Id;
  authorUserId: Id;
  text: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Chants                                                                      */
/* -------------------------------------------------------------------------- */

export interface Song {
  id: Id;
  communityId: Id;
  title: string;
  /** Complements facultatifs. */
  songKey: string | null;
  tempo: number | null;
  defaultLead: string | null;
  links: string[];
  notes: string | null;
  archivedAt: IsoInstant | null;
  createdAt: IsoInstant;
}

export interface SetlistItem {
  id: Id;
  communityId: Id;
  eventId: Id;
  /** null = liste commune a l'evenement, sans sous-evenement. */
  sessionId: Id | null;
  /** Ex. « Chant 1 », « Sainte Cene », « Offrandes ». */
  sequence: string;
  order: number;
  songId: Id | null;
  /** Titre libre quand le chant n'est pas encore au repertoire. */
  freeTitle: string | null;
  links: string[];
  notes: string | null;
}

/* -------------------------------------------------------------------------- */
/* Dress-code et ressources                                                    */
/* -------------------------------------------------------------------------- */

export interface DressCode {
  id: Id;
  communityId: Id;
  eventId: Id;
  /** null = consigne commune a l'evenement. */
  teamId: Id | null;
  theme: string;
  mood: string;
  colors: string[];
  materials: string;
  instruction: string;
  updatedAt: IsoInstant;
}

export interface EventAsset {
  id: Id;
  communityId: Id;
  eventId: Id;
  dressCodeId: Id | null;
  /** Chemin dans l'espace de stockage prive. */
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Texte alternatif obligatoire. */
  alt: string;
  uploadedBy: Id;
  createdAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Messagerie                                                                  */
/* -------------------------------------------------------------------------- */

export interface EventMessage {
  id: Id;
  communityId: Id;
  eventId: Id;
  authorUserId: Id;
  body: string;
  /** userId mentionnes, membres actifs uniquement. */
  mentions: Id[];
  pinned: boolean;
  createdAt: IsoInstant;
  editedAt: IsoInstant | null;
  moderatedBy: Id | null;
  moderationNote: string | null;
  deletedAt: IsoInstant | null;
}

export interface MessageReadCursor {
  id: Id;
  communityId: Id;
  eventId: Id;
  userId: Id;
  lastReadAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_KINDS = [
  "adhesion_demandee",
  "adhesion_acceptee",
  "adhesion_refusee",
  "collecte_ouverte",
  "planning_publie",
  "affectation_nouvelle",
  "affectation_a_remplacer",
  "modification_importante",
  "evenement_annule",
  "rappel",
  "message_nouveau",
  "positionnement",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Les notifications d'organisation ne se melangent pas aux discussions. */
export function isDiscussionKind(kind: NotificationKind): boolean {
  return kind === "message_nouveau";
}

export interface Notification {
  id: Id;
  userId: Id;
  communityId: Id | null;
  eventId: Id | null;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Lien interne vers la ressource concernee. */
  href: string | null;
  createdAt: IsoInstant;
  readAt: IsoInstant | null;
}

export type SubscriptionScope = "toute_la_communaute" | "mes_evenements";

export interface NotificationPreference {
  userId: Id;
  /** Email immediat pour les notifications d'organisation. */
  emailImmediate: boolean;
  /** Regrouper les emails de discussion en un envoi periodique. */
  digestDiscussion: boolean;
  subscriptionScope: SubscriptionScope;
  mutedEventIds: Id[];
  /** Rappels avant le debut, en heures. Par defaut 48 et 24. */
  reminderOffsetsHours: number[];
}

export type OutboxState =
  | "enregistre"
  | "pris_en_charge"
  | "livre"
  | "echec"
  | "abandonne";

export interface OutboxEntry {
  id: Id;
  /** Deux reprises de la meme notification logique partagent cette cle. */
  idempotencyKey: string;
  kind: NotificationKind;
  recipientUserId: Id;
  communityId: Id | null;
  eventId: Id | null;
  subject: string;
  body: string;
  state: OutboxState;
  attempts: number;
  scheduledFor: IsoInstant;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface AuditLog {
  id: Id;
  communityId: Id | null;
  actorUserId: Id;
  action: string;
  targetType: string;
  targetId: Id | null;
  metadata: Record<string, unknown>;
  at: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

export type ImportJobState =
  | "charge"
  | "analyse"
  | "previsualise"
  | "valide"
  | "importe"
  | "echec";

export interface ImportJob {
  id: Id;
  communityId: Id;
  createdBy: Id;
  filename: string;
  state: ImportJobState;
  /** Annee proposee pour les feuilles sans annee, a valider par l'admin. */
  assumedYear: number | null;
  yearEvidence: string | null;
  /** Deduire « indisponible » pour les creneaux non cites : choix admin. */
  inferMissingAsUnavailable: boolean;
  summary: ImportSummary | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ImportSummary {
  sheetsDetected: string[];
  people: number;
  days: number;
  sessions: number;
  availabilities: number;
  assignments: number;
  songs: number;
  dressCodes: number;
  rehearsals: number;
  issues: number;
}

export type ImportRowKind =
  | "personne"
  | "disponibilite"
  | "affectation"
  | "chant"
  | "dress_code"
  | "repetition"
  | "creneau"
  | "anomalie";

export interface ImportRow {
  id: Id;
  jobId: Id;
  communityId: Id;
  kind: ImportRowKind;
  /** Provenance exacte conservee pour controler les anomalies. */
  sheet: string;
  cell: string;
  rawValue: string;
  parsed: Record<string, unknown>;
  issues: string[];
  /** Exclue de l'import apres revue. */
  skipped: boolean;
}

export type ImportedPersonStatus =
  | "a_rapprocher"
  | "lie"
  | "nouveau"
  | "ignore";

/**
 * Fiche importee provisoire : le classeur ne fournit pas d'email, donc aucun
 * compte n'est cree et aucune adhesion n'est deduite d'une egalite de nom.
 */
export interface ImportedPerson {
  id: Id;
  jobId: Id;
  communityId: Id;
  lastName: string;
  firstName: string;
  rawSkills: string;
  sourceCells: string[];
  suggestedMembershipId: Id | null;
  suggestionScore: number | null;
  linkedMembershipId: Id | null;
  status: ImportedPersonStatus;
}
