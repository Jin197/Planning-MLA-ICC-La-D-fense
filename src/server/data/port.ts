import type {
  AccountSecret,
  Assignment,
  AuditLog,
  Availability,
  AvailabilityReason,
  Community,
  CommunityMembership,
  DressCode,
  Event,
  EventAsset,
  EventMessage,
  EventPlan,
  EventRoleSlot,
  EventSession,
  EventTeam,
  EventTeamMember,
  ImportJob,
  ImportRow,
  ImportedPerson,
  JoinRequest,
  MembershipSkill,
  MessageReadCursor,
  Notification,
  NotificationPreference,
  OutboxEntry,
  PlanningTemplate,
  Profile,
  Rehearsal,
  RehearsalAvailability,
  RehearsalAvailabilityReason,
  RehearsalTeam,
  SetlistItem,
  Skill,
  Song,
  TemplateField,
} from "@/domain/types";

/**
 * Contrat de donnees partage. L'adaptateur de demonstration et l'adaptateur
 * Supabase implementent les memes operations, ce qui evite de melanger des
 * donnees fictives et des comptes reels dans le code metier.
 *
 * Les regles d'autorisation ne vivent pas ici : elles sont appliquees dans
 * `src/server/services`, et re-imposees en base par RLS pour l'adaptateur
 * Supabase.
 */
export interface Tables {
  profiles: Profile;
  account_secrets: AccountSecret;
  communities: Community;
  community_memberships: CommunityMembership;
  join_requests: JoinRequest;
  skills: Skill;
  membership_skills: MembershipSkill;
  planning_templates: PlanningTemplate;
  template_fields: TemplateField;
  events: Event;
  event_sessions: EventSession;
  event_teams: EventTeam;
  event_team_members: EventTeamMember;
  event_plans: EventPlan;
  event_role_slots: EventRoleSlot;
  assignments: Assignment;
  availabilities: Availability;
  availability_reasons: AvailabilityReason;
  rehearsals: Rehearsal;
  rehearsal_teams: RehearsalTeam;
  rehearsal_availabilities: RehearsalAvailability;
  rehearsal_availability_reasons: RehearsalAvailabilityReason;
  songs: Song;
  setlist_items: SetlistItem;
  dress_codes: DressCode;
  event_assets: EventAsset;
  event_messages: EventMessage;
  message_read_cursors: MessageReadCursor;
  notifications: Notification;
  notification_preferences: NotificationPreference;
  notification_outbox: OutboxEntry;
  audit_logs: AuditLog;
  import_jobs: ImportJob;
  import_rows: ImportRow;
  imported_people: ImportedPerson;
}

export type TableName = keyof Tables;

/** Colonne identifiante de chaque table. */
export const PRIMARY_KEYS: { [K in TableName]: keyof Tables[K] & string } = {
  profiles: "id",
  account_secrets: "userId",
  communities: "id",
  community_memberships: "id",
  join_requests: "id",
  skills: "id",
  membership_skills: "id",
  planning_templates: "id",
  template_fields: "id",
  events: "id",
  event_sessions: "id",
  event_teams: "id",
  event_team_members: "id",
  event_plans: "id",
  event_role_slots: "id",
  assignments: "id",
  availabilities: "id",
  availability_reasons: "id",
  rehearsals: "id",
  rehearsal_teams: "id",
  rehearsal_availabilities: "id",
  rehearsal_availability_reasons: "id",
  songs: "id",
  setlist_items: "id",
  dress_codes: "id",
  event_assets: "id",
  event_messages: "id",
  message_read_cursors: "id",
  notifications: "id",
  notification_preferences: "userId",
  notification_outbox: "id",
  audit_logs: "id",
  import_jobs: "id",
  import_rows: "id",
  imported_people: "id",
};

export type Equality<T> = Partial<{ [K in keyof T]: T[K] }>;

export interface QueryOptions<T> {
  /** Egalites combinees en ET. */
  where?: Equality<T>;
  /** Appartenance a un ensemble, pour charger un lot d'enfants. */
  whereIn?: { [K in keyof T]?: readonly T[K][] };
  orderBy?: { column: keyof T & string; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

/**
 * Operations atomiques critiques. Elles ne sont pas de simples mises a jour
 * de colonnes : cote Supabase ce sont des fonctions SQL `security definer`,
 * cote demonstration les memes regles en TypeScript sous verrou.
 */
export interface RpcMap {
  create_community_with_admin: {
    args: {
      userId: string;
      name: string;
      type: string;
      otherLabel: string | null;
      description: string;
      displayedLeaderName: string;
      timezone: string;
    };
    result: { communityId: string; membershipId: string; templateId: string };
  };
  accept_join_request: {
    args: { actorUserId: string; requestId: string; note: string | null };
    result: { membershipId: string };
  };
  change_membership_role: {
    args: {
      actorUserId: string;
      membershipId: string;
      role: "admin" | "membre";
    };
    result: { membershipId: string };
  };
  revoke_membership: {
    args: { actorUserId: string; membershipId: string };
    result: { membershipId: string; assignmentsToReplace: number };
  };
  publish_event: {
    args: {
      actorUserId: string;
      eventId: string;
      expectedVersion: number;
      acceptExceptions: boolean;
    };
    result: { eventId: string; version: number; publishedVersion: number };
  };
}

export type RpcName = keyof RpcMap;

export interface Tx {
  select<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<Tables[K][]>;
  selectOne<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<Tables[K] | null>;
  count<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<number>;
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>;
  insertMany<K extends TableName>(
    table: K,
    rows: readonly Tables[K][],
  ): Promise<Tables[K][]>;
  update<K extends TableName>(
    table: K,
    id: string,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K]>;
  /** Mise a jour conditionnelle : sert au verrouillage optimiste. */
  updateWhere<K extends TableName>(
    table: K,
    where: Equality<Tables[K]>,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K][]>;
  remove<K extends TableName>(table: K, id: string): Promise<void>;
  removeWhere<K extends TableName>(
    table: K,
    where: Equality<Tables[K]>,
  ): Promise<number>;
}

export interface DataAdapter {
  readonly kind: "demo" | "supabase";
  /** Lecture simple, sans verrou. */
  read<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Ecriture transactionnelle. En cas d'exception, aucune ecriture n'est
   * conservee. Les operations concurrentes sont serialisees.
   */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  rpc<N extends RpcName>(
    name: N,
    args: RpcMap[N]["args"],
  ): Promise<RpcMap[N]["result"]>;
}

/** Erreur de concurrence : deux admins ont modifie la meme version. */
export class VersionConflictError extends Error {
  constructor(
    message = "Cette ressource a ete modifiee entre-temps.",
    readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "VersionConflictError";
  }
}

/** Violation d'une contrainte metier verifiee en base. */
export class ConstraintError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConstraintError";
  }
}
