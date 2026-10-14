import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ConstraintError,
  PRIMARY_KEYS,
  VersionConflictError,
  type DataAdapter,
  type Equality,
  type QueryOptions,
  type RpcMap,
  type RpcName,
  type TableName,
  type Tables,
  type Tx,
} from "../port";

/**
 * Adaptateur Supabase. Il expose exactement le meme contrat que
 * l'adaptateur de demonstration.
 *
 * Deux differences assumees et documentees :
 *  - les colonnes sont en snake_case en base, la conversion est faite ici ;
 *  - une transaction multi-instructions n'existe pas sur l'API REST, donc les
 *    operations qui doivent etre atomiques passent par `rpc`, c'est-a-dire les
 *    fonctions SQL definies dans `supabase/migrations`. `transaction()` ne
 *    promet donc pas l'atomicite sur ce chemin : le code metier critique
 *    appelle `rpc`.
 */

const toSnake = (key: string): string =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const toCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function rowToDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v;
  return out;
}

function rowFromDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out;
}

function mapError(error: { code?: string; message: string }): never {
  if (error.code === "23505" || error.code === "23514") {
    throw new ConstraintError(error.code, error.message);
  }
  if (error.code === "23505") {
    throw new ConstraintError("unique_violation", error.message);
  }
  if (error.code === "40001" || error.message.includes("version")) {
    throw new VersionConflictError(error.message);
  }
  throw new ConstraintError(error.code ?? "db_error", error.message);
}

class SupabaseTx implements Tx {
  constructor(private readonly client: SupabaseClient) {}

  private build<K extends TableName>(table: K, options?: QueryOptions<Tables[K]>) {
    let query = this.client.from(toSnake(table)).select("*");
    if (options?.where) {
      for (const [k, v] of Object.entries(options.where)) {
        if (v === undefined) continue;
        query = v === null ? query.is(toSnake(k), null) : query.eq(toSnake(k), v);
      }
    }
    if (options?.whereIn) {
      for (const [k, values] of Object.entries(options.whereIn)) {
        if (!Array.isArray(values)) continue;
        query = query.in(toSnake(k), values as unknown[]);
      }
    }
    if (options?.orderBy) {
      query = query.order(toSnake(options.orderBy.column), {
        ascending: options.orderBy.direction !== "desc",
      });
    }
    const offset = options?.offset ?? 0;
    if (options?.limit !== undefined) {
      query = query.range(offset, offset + options.limit - 1);
    } else if (offset > 0) {
      query = query.range(offset, offset + 999);
    }
    return query;
  }

  async select<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<Tables[K][]> {
    const { data, error } = await this.build(table, options);
    if (error) mapError(error);
    return (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>)) as unknown as Tables[K][];
  }

  async selectOne<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<Tables[K] | null> {
    const rows = await this.select(table, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async count<K extends TableName>(
    table: K,
    options?: QueryOptions<Tables[K]>,
  ): Promise<number> {
    const rows = await this.select(table, options);
    return rows.length;
  }

  async insert<K extends TableName>(
    table: K,
    row: Tables[K],
  ): Promise<Tables[K]> {
    const { data, error } = await this.client
      .from(toSnake(table))
      .insert(rowToDb(row as unknown as Record<string, unknown>))
      .select("*")
      .single();
    if (error) mapError(error);
    return rowFromDb(data as Record<string, unknown>) as unknown as Tables[K];
  }

  async insertMany<K extends TableName>(
    table: K,
    rows: readonly Tables[K][],
  ): Promise<Tables[K][]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from(toSnake(table))
      .insert(rows.map((r) => rowToDb(r as unknown as Record<string, unknown>)))
      .select("*");
    if (error) mapError(error);
    return (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>)) as unknown as Tables[K][];
  }

  async update<K extends TableName>(
    table: K,
    id: string,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K]> {
    const pk = PRIMARY_KEYS[table] as string;
    const { data, error } = await this.client
      .from(toSnake(table))
      .update(rowToDb(patch as unknown as Record<string, unknown>))
      .eq(toSnake(pk), id)
      .select("*")
      .single();
    if (error) mapError(error);
    return rowFromDb(data as Record<string, unknown>) as unknown as Tables[K];
  }

  async updateWhere<K extends TableName>(
    table: K,
    where: Equality<Tables[K]>,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K][]> {
    let query = this.client
      .from(toSnake(table))
      .update(rowToDb(patch as unknown as Record<string, unknown>));
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      query = v === null ? query.is(toSnake(k), null) : query.eq(toSnake(k), v);
    }
    const { data, error } = await query.select("*");
    if (error) mapError(error);
    return (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>)) as unknown as Tables[K][];
  }

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    const pk = PRIMARY_KEYS[table] as string;
    const { error } = await this.client
      .from(toSnake(table))
      .delete()
      .eq(toSnake(pk), id);
    if (error) mapError(error);
  }

  async removeWhere<K extends TableName>(
    table: K,
    where: Equality<Tables[K]>,
  ): Promise<number> {
    let query = this.client.from(toSnake(table)).delete();
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      query = v === null ? query.is(toSnake(k), null) : query.eq(toSnake(k), v);
    }
    const { data, error } = await query.select("*");
    if (error) mapError(error);
    return (data ?? []).length;
  }
}

export interface SupabaseAdapterOptions {
  url: string;
  /** Cle publishable, utilisee avec la session de l'utilisateur. */
  publishableKey: string;
  /** Jeton d'acces de la session courante, pour que RLS s'applique. */
  accessToken?: string | null;
}

export function createSupabaseAdapter(
  options: SupabaseAdapterOptions,
): DataAdapter {
  const client = createClient(options.url, options.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: options.accessToken
      ? { headers: { Authorization: `Bearer ${options.accessToken}` } }
      : {},
  });

  const tx = new SupabaseTx(client);

  return {
    kind: "supabase",
    async read<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return fn(tx);
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      // Voir la note d'en-tete : l'atomicite reelle passe par `rpc`.
      return fn(tx);
    },
    async rpc<N extends RpcName>(
      name: N,
      args: RpcMap[N]["args"],
    ): Promise<RpcMap[N]["result"]> {
      const { data, error } = await client.rpc(
        name,
        rowToDb(args as Record<string, unknown>),
      );
      if (error) mapError(error);
      return rowFromDb(
        (data ?? {}) as Record<string, unknown>,
      ) as RpcMap[N]["result"];
    },
  };
}
