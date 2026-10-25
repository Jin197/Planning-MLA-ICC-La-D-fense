import "server-only";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ConstraintError,
  PRIMARY_KEYS,
  type Equality,
  type QueryOptions,
  type TableName,
  type Tables,
  type Tx,
} from "../port";

/**
 * Magasin de la demonstration locale : toutes les tables en memoire, avec un
 * instantane JSON sur disque pour survivre au redemarrage du serveur de
 * developpement. Les ecritures passent par un verrou unique, ce qui donne des
 * transactions reelles (serialisees, annulees en cas d'erreur) dans un
 * processus unique.
 *
 * Ce n'est pas une base de production : voir `src/server/data/supabase` et
 * `supabase/migrations` pour le chemin heberge.
 */

export type Snapshot = { [K in TableName]: Tables[K][] };

const TABLE_NAMES = Object.keys(PRIMARY_KEYS) as TableName[];

export function emptySnapshot(): Snapshot {
  const snap = {} as Snapshot;
  for (const t of TABLE_NAMES) {
    (snap[t] as unknown[]) = [];
  }
  return snap;
}

/**
 * Emplacement de l'instantane. `DIAPASON_DEMO_FILE` permet aux tests de
 * travailler sur un fichier a part, et `DIAPASON_DEMO_PERSIST=0` de rester
 * entierement en memoire.
 */
function dataFile(): string {
  return (
    process.env.DIAPASON_DEMO_FILE ??
    join(process.cwd(), ".data", "diapason-demo.json")
  );
}

function persistenceEnabled(): boolean {
  return process.env.DIAPASON_DEMO_PERSIST !== "0";
}

interface DemoGlobal {
  snapshot: Snapshot | null;
  queue: Promise<unknown>;
  dirty: boolean;
}

const g = globalThis as unknown as { __diapasonDemo?: DemoGlobal };

function state(): DemoGlobal {
  g.__diapasonDemo ??= { snapshot: null, queue: Promise.resolve(), dirty: false };
  return g.__diapasonDemo;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function persistPath(): string {
  return dataFile();
}

function loadFromDisk(): Snapshot | null {
  const file = dataFile();
  // Chemin calcule a l'execution : l'instantane de demonstration vit dans
  // `.data/`, en dehors du code deploye.
  if (!persistenceEnabled() || !existsSync(/* turbopackIgnore: true */ file)) {
    return null;
  }
  try {
    const raw = readFileSync(/* turbopackIgnore: true */ file, "utf8");
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    const snap = emptySnapshot();
    for (const t of TABLE_NAMES) {
      const rows = parsed[t];
      if (Array.isArray(rows)) {
        (snap[t] as unknown[]) = rows as unknown[];
      }
    }
    return snap;
  } catch {
    return null;
  }
}

function saveToDisk(snapshot: Snapshot): void {
  if (!persistenceEnabled()) return;
  const file = dataFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");
}

/** Remplace entierement le contenu : utilise par les graines et les tests. */
export function replaceSnapshot(snapshot: Snapshot, persist = true): void {
  state().snapshot = snapshot;
  if (persist) saveToDisk(snapshot);
}

export function currentSnapshot(): Snapshot {
  const s = state();
  if (!s.snapshot) {
    s.snapshot = loadFromDisk() ?? emptySnapshot();
  }
  return s.snapshot;
}

export function hasData(): boolean {
  return currentSnapshot().profiles.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Filtrage                                                                   */
/* -------------------------------------------------------------------------- */

function matches<T extends object>(row: T, options?: QueryOptions<T>): boolean {
  if (!options) return true;
  if (options.where) {
    for (const [k, v] of Object.entries(options.where)) {
      if (v === undefined) continue;
      if ((row as Record<string, unknown>)[k] !== v) return false;
    }
  }
  if (options.whereIn) {
    for (const [k, values] of Object.entries(options.whereIn)) {
      if (!Array.isArray(values)) continue;
      if (!values.includes((row as Record<string, unknown>)[k])) return false;
    }
  }
  return true;
}

function applyQuery<T extends object>(
  rows: readonly T[],
  options?: QueryOptions<T>,
): T[] {
  let out = rows.filter((r) => matches(r, options));
  const order = options?.orderBy;
  if (order) {
    const dir = order.direction === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string, unknown>)[order.column];
      const bv = (b as Record<string, unknown>)[order.column];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (av < bv ? -1 : 1) * dir;
    });
  }
  const offset = options?.offset ?? 0;
  const limit = options?.limit;
  return limit === undefined
    ? out.slice(offset)
    : out.slice(offset, offset + limit);
}

/* -------------------------------------------------------------------------- */
/* Contraintes reproduisant celles de la base                                 */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

function assertConstraints(
  snapshot: Snapshot,
  table: TableName,
  row: Row,
  selfId: string | null,
): void {
  const rows = snapshot[table] as unknown as Row[];
  const pk = PRIMARY_KEYS[table] as string;
  const others = rows.filter((r) => r[pk] !== (selfId ?? row[pk]));

  const unique = (
    code: string,
    message: string,
    keys: string[],
    predicate: (r: Row) => boolean = () => true,
  ) => {
    if (!predicate(row)) return;
    const clash = others.some(
      (r) => predicate(r) && keys.every((k) => r[k] === row[k]),
    );
    if (clash) throw new ConstraintError(code, message);
  };

  switch (table) {
    case "profiles":
      unique(
        "profiles_email_unique",
        "Un compte existe deja avec cet email.",
        ["email"],
      );
      break;

    case "community_memberships":
      unique(
        "membership_unique",
        "Cette personne a deja une adhesion dans cette communaute.",
        ["communityId", "userId"],
      );
      break;

    case "join_requests":
      unique(
        "join_request_single_pending",
        "Une demande est deja en attente pour cette communaute.",
        ["communityId", "userId"],
        (r) => r.status === "en_attente",
      );
      break;

    // Une reponse par membre et par occurrence : par sous-evenement quand
    // l'evenement en a, sinon une seule pour l'evenement.
    case "availabilities":
      unique(
        "availability_unique_par_sous_evenement",
        "Une reponse existe deja pour ce membre et ce sous-evenement.",
        ["sessionId", "membershipId"],
        (r) => r.sessionId !== null,
      );
      unique(
        "availability_unique_par_evenement",
        "Une reponse existe deja pour ce membre sur cet evenement.",
        ["eventId", "membershipId"],
        (r) => r.sessionId === null,
      );
      break;

    case "rehearsal_availabilities":
      unique(
        "rehearsal_availability_unique",
        "Une reponse existe deja pour ce membre et cette repetition.",
        ["rehearsalId", "membershipId"],
      );
      break;

    // Un rattachement par equipe et par sous-evenement, et au plus un
    // rattachement « tout l'evenement » par equipe.
    case "event_plans":
      unique(
        "plan_unique_par_equipe_et_sous_evenement",
        "Cette equipe est deja rattachee a ce sous-evenement.",
        ["sessionId", "teamId"],
        (r) => r.sessionId !== null,
      );
      unique(
        "plan_unique_par_equipe_sur_evenement",
        "Cette equipe est deja rattachee a tout l'evenement.",
        ["teamId"],
        (r) => r.sessionId === null,
      );
      break;

    case "event_teams":
      unique(
        "event_team_name_unique",
        "Une equipe porte deja ce nom dans cet evenement.",
        ["eventId", "name"],
      );
      break;

    case "event_team_members":
      unique(
        "event_team_member_unique",
        "Cette personne est deja dans cette equipe.",
        ["teamId", "membershipId"],
      );
      break;

    case "assignments":
      unique(
        "assignment_no_active_duplicate",
        "Cette personne est deja affectee a ce poste.",
        ["slotId", "membershipId"],
        (r) => r.state !== "retiree",
      );
      break;

    case "events": {
      if (
        new Date(String(row.endsAt)).getTime() <=
        new Date(String(row.startsAt)).getTime()
      ) {
        throw new ConstraintError(
          "event_end_after_start",
          "La fin de l'evenement doit suivre son debut.",
        );
      }
      break;
    }

    case "event_sessions": {
      if (
        new Date(String(row.endsAt)).getTime() <=
        new Date(String(row.startsAt)).getTime()
      ) {
        throw new ConstraintError(
          "session_end_after_start",
          "La fin d'un sous-evenement doit suivre son debut.",
        );
      }
      break;
    }

    case "rehearsals": {
      if (
        new Date(String(row.endsAt)).getTime() <=
        new Date(String(row.startsAt)).getTime()
      ) {
        throw new ConstraintError(
          "rehearsal_end_after_start",
          "La fin d'une repetition doit suivre son debut.",
        );
      }
      break;
    }

    case "event_role_slots": {
      if (typeof row.minRequired === "number" && row.minRequired < 0) {
        throw new ConstraintError(
          "slot_min_required_non_negative",
          "L'effectif minimum ne peut pas etre negatif.",
        );
      }
      break;
    }

    case "template_fields": {
      if (typeof row.minRequired === "number" && row.minRequired < 0) {
        throw new ConstraintError(
          "field_min_required_non_negative",
          "L'effectif minimum ne peut pas etre negatif.",
        );
      }
      if (row.kind !== "poste" && row.assignable === true) {
        throw new ConstraintError(
          "field_assignable_only_poste",
          "Seul un champ de type poste peut recevoir des affectations.",
        );
      }
      break;
    }

    case "notification_outbox":
      unique(
        "outbox_idempotency_unique",
        "Cette notification logique est deja enregistree.",
        ["idempotencyKey"],
      );
      break;

    case "message_read_cursors":
      unique(
        "read_cursor_unique",
        "Un curseur de lecture existe deja.",
        ["eventId", "userId"],
      );
      break;

    case "membership_skills":
      unique(
        "membership_skill_unique",
        "Cette competence est deja associee.",
        ["membershipId", "skillId"],
      );
      break;

    default:
      break;
  }

  /**
   * Coherence inter-communaute : un enfant ne peut pas pointer vers un parent
   * d'une autre communaute. Reproduit les cles composites de la base.
   */
  assertCommunityCoherence(snapshot, table, row);
}

const PARENT_REFS: Partial<
  Record<TableName, { column: string; parent: TableName }[]>
> = {
  event_sessions: [{ column: "eventId", parent: "events" }],
  event_teams: [{ column: "eventId", parent: "events" }],
  event_team_members: [
    { column: "teamId", parent: "event_teams" },
    { column: "membershipId", parent: "community_memberships" },
  ],
  event_plans: [
    { column: "eventId", parent: "events" },
    { column: "sessionId", parent: "event_sessions" },
    { column: "teamId", parent: "event_teams" },
  ],
  event_role_slots: [{ column: "planId", parent: "event_plans" }],
  assignments: [
    { column: "planId", parent: "event_plans" },
    { column: "slotId", parent: "event_role_slots" },
    { column: "membershipId", parent: "community_memberships" },
  ],
  availabilities: [
    { column: "eventId", parent: "events" },
    { column: "sessionId", parent: "event_sessions" },
    { column: "membershipId", parent: "community_memberships" },
  ],
  availability_reasons: [{ column: "availabilityId", parent: "availabilities" }],
  rehearsals: [{ column: "eventId", parent: "events" }],
  rehearsal_teams: [
    { column: "rehearsalId", parent: "rehearsals" },
    { column: "teamId", parent: "event_teams" },
  ],
  rehearsal_availabilities: [
    { column: "rehearsalId", parent: "rehearsals" },
    { column: "membershipId", parent: "community_memberships" },
  ],
  setlist_items: [
    { column: "eventId", parent: "events" },
    { column: "sessionId", parent: "event_sessions" },
  ],
  dress_codes: [{ column: "eventId", parent: "events" }],
  event_assets: [{ column: "eventId", parent: "events" }],
  event_messages: [{ column: "eventId", parent: "events" }],
  membership_skills: [
    { column: "membershipId", parent: "community_memberships" },
    { column: "skillId", parent: "skills" },
  ],
  template_fields: [{ column: "templateId", parent: "planning_templates" }],
};

function assertCommunityCoherence(
  snapshot: Snapshot,
  table: TableName,
  row: Row,
): void {
  const refs = PARENT_REFS[table];
  if (!refs) return;
  const childCommunity = row.communityId;
  for (const ref of refs) {
    const value = row[ref.column];
    if (value === null || value === undefined) continue;
    const pk = PRIMARY_KEYS[ref.parent] as string;
    const parent = (snapshot[ref.parent] as unknown as Row[]).find(
      (r) => r[pk] === value,
    );
    if (!parent) {
      throw new ConstraintError(
        `${table}_${ref.column}_fk`,
        `Reference introuvable : ${ref.column}.`,
      );
    }
    if (
      childCommunity !== undefined &&
      parent.communityId !== undefined &&
      parent.communityId !== childCommunity
    ) {
      throw new ConstraintError(
        `${table}_${ref.column}_community_mismatch`,
        `Lien incoherent entre communautes sur ${ref.column}.`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Transaction                                                                */
/* -------------------------------------------------------------------------- */

class DemoTx implements Tx {
  constructor(private readonly snapshot: Snapshot) {}

  async select<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<Tables[K][]> {
    return clone(applyQuery(this.snapshot[table], options));
  }

  async selectOne<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<Tables[K] | null> {
    const rows = applyQuery(this.snapshot[table], { ...options, limit: 1 });
    return rows.length > 0 ? clone(rows[0]!) : null;
  }

  async count<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<number> {
    return this.snapshot[table].filter((r) => matches(r, options)).length;
  }

  async insert<K extends TableName>(
    table: K,
    row: Tables[K],
  ): Promise<Tables[K]> {
    const stored = clone(row);
    assertConstraints(this.snapshot, table, stored as unknown as Row, null);
    (this.snapshot[table] as unknown as Row[]).push(stored as unknown as Row);
    return clone(stored);
  }

  async insertMany<K extends TableName>(
    table: K,
    rows: readonly Tables[K][],
  ): Promise<Tables[K][]> {
    const out: Tables[K][] = [];
    for (const r of rows) out.push(await this.insert(table, r));
    return out;
  }

  async update<K extends TableName>(
    table: K,
    id: string,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K]> {
    const pk = PRIMARY_KEYS[table] as string;
    const rows = this.snapshot[table] as unknown as Row[];
    const index = rows.findIndex((r) => r[pk] === id);
    if (index < 0) {
      throw new ConstraintError(
        `${table}_not_found`,
        `Ligne introuvable dans ${table}.`,
      );
    }
    const next = { ...rows[index]!, ...clone(patch) } as Row;
    assertConstraints(this.snapshot, table, next, id);
    rows[index] = next;
    return clone(next) as unknown as Tables[K];
  }

  async updateWhere<K extends TableName>(
    table: K,
    where: Equality<Tables[K]>,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K][]> {
    const pk = PRIMARY_KEYS[table] as string;
    const targets = this.snapshot[table].filter((r) => matches(r, { where }));
    const out: Tables[K][] = [];
    for (const t of targets) {
      const id = (t as unknown as Row)[pk] as string;
      out.push(await this.update(table, id, patch));
    }
    return out;
  }

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    const pk = PRIMARY_KEYS[table] as string;
    const rows = this.snapshot[table] as unknown as Row[];
    const index = rows.findIndex((r) => r[pk] === id);
    if (index >= 0) rows.splice(index, 1);
  }

  async removeWhere<K extends TableName>(
    table: K,
    where: Equality<Tables[K]>,
  ): Promise<number> {
    const rows = this.snapshot[table] as unknown as Row[];
    const keep = rows.filter(
      (r) => !matches(r, { where } as QueryOptions<Row>),
    );
    const removed = rows.length - keep.length;
    (this.snapshot[table] as unknown as Row[]) = keep;
    return removed;
  }
}

/** Lecture sans verrou : vue coherente et immuable du contenu. */
export async function readStore<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return fn(new DemoTx(currentSnapshot()));
}

/**
 * Ecriture serialisee. Travaille sur une copie : une exception laisse le
 * contenu precedent intact, ce qui rend l'operation atomique.
 */
export async function writeStore<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const s = state();
  const run = async (): Promise<T> => {
    const base = currentSnapshot();
    const working = clone(base);
    const result = await fn(new DemoTx(working));
    s.snapshot = working;
    saveToDisk(working);
    return result;
  };
  const chained = s.queue.then(run, run);
  // La file ne doit pas se rompre sur une erreur metier attendue.
  s.queue = chained.then(
    () => undefined,
    () => undefined,
  );
  return chained;
}
