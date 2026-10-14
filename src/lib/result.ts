/**
 * Resultat explicite pour les operations metier : evite de confondre une
 * erreur attendue (droits, conflit, validation) avec une exception technique.
 */
export type Ok<T> = { ok: true; value: T };
export type Err<C extends string = string> = {
  ok: false;
  code: C;
  message: string;
  details?: unknown;
};
export type Result<T, C extends string = string> = Ok<T> | Err<C>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<C extends string>(
  code: C,
  message: string,
  details?: unknown,
): Err<C> {
  return details === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, details };
}

export function isOk<T, C extends string>(r: Result<T, C>): r is Ok<T> {
  return r.ok;
}

/** Deballe un resultat ou leve. Reserve aux endroits ou l'echec est un bug. */
export function unwrap<T, C extends string>(r: Result<T, C>): T {
  if (r.ok) return r.value;
  throw new Error(`${r.code}: ${r.message}`);
}
