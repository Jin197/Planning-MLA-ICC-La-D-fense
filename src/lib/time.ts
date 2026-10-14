import { TZDate } from "@date-fns/tz";

/**
 * Regle de stockage : tout instant est conserve en UTC (chaine ISO avec Z)
 * accompagne du fuseau IANA de la communaute. L'affichage est recalcule, ce
 * qui rend corrects une repetition de 22h a 00h30 et les changements d'heure.
 */
export const DEFAULT_TIMEZONE = "Europe/Paris";

export type IsoInstant = string;

/** Champs d'un formulaire date + heure locale (<input type="datetime-local">). */
export interface LocalDateTimeInput {
  /** AAAA-MM-JJ */
  date: string;
  /** HH:MM en 24 h */
  time: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidLocalDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

export function isValidLocalTime(time: string): boolean {
  return TIME_RE.test(time);
}

/**
 * Convertit une date + heure exprimee dans `timeZone` vers un instant UTC.
 * TZDate applique l'offset reel de ce jour-la (CET ou CEST).
 */
export function localToUtc(
  input: LocalDateTimeInput,
  timeZone: string,
): IsoInstant {
  if (!isValidLocalDate(input.date)) {
    throw new Error(`Date locale invalide : ${input.date}`);
  }
  if (!isValidLocalTime(input.time)) {
    throw new Error(`Heure locale invalide : ${input.time}`);
  }
  const [y, m, d] = input.date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = input.time.split(":").map(Number) as [number, number];
  const zoned = new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone);
  return new Date(zoned.getTime()).toISOString();
}

/** Decompose un instant UTC en date + heure locales du fuseau donne. */
export function utcToLocal(
  instant: IsoInstant,
  timeZone: string,
): LocalDateTimeInput {
  const z = new TZDate(new Date(instant), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`,
    time: `${pad(z.getHours())}:${pad(z.getMinutes())}`,
  };
}

/** Jour calendaire local (AAAA-MM-JJ) d'un instant : regroupe les creneaux. */
export function localDayKey(instant: IsoInstant, timeZone: string): string {
  return utcToLocal(instant, timeZone).date;
}

/** Duree reelle en minutes entre deux instants, changements d'heure inclus. */
export function durationMinutes(start: IsoInstant, end: IsoInstant): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
}

export function addMinutes(instant: IsoInstant, minutes: number): IsoInstant {
  return new Date(new Date(instant).getTime() + minutes * 60000).toISOString();
}

export function addHours(instant: IsoInstant, hours: number): IsoInstant {
  return addMinutes(instant, hours * 60);
}

/** Deux intervalles [start, end) se chevauchent-ils ? */
export function overlaps(
  a: { startsAt: IsoInstant; endsAt: IsoInstant },
  b: { startsAt: IsoInstant; endsAt: IsoInstant },
): boolean {
  return (
    new Date(a.startsAt).getTime() < new Date(b.endsAt).getTime() &&
    new Date(b.startsAt).getTime() < new Date(a.endsAt).getTime()
  );
}

const WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
] as const;

/** Jour de la semaine local, 0 = dimanche. Sert aux controles d'import. */
export function localWeekday(instant: IsoInstant, timeZone: string): number {
  return new TZDate(new Date(instant), timeZone).getDay();
}

export function localWeekdayName(instant: IsoInstant, timeZone: string): string {
  return WEEKDAYS[localWeekday(instant, timeZone)] ?? "";
}

export function localMonthName(instant: IsoInstant, timeZone: string): string {
  const z = new TZDate(new Date(instant), timeZone);
  return MONTHS[z.getMonth()] ?? "";
}

/**
 * Libelles d'affichage en francais, 24 h. Utilise Intl pour rester correct
 * quelle que soit la locale du serveur.
 */
export function formatDateLong(instant: IsoInstant, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(instant));
}

export function formatDateShort(instant: IsoInstant, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

export function formatTime(instant: IsoInstant, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(instant));
}

/**
 * Plage lisible. Quand la fin tombe le lendemain, la date de fin est repetee :
 * « vendredi 25 septembre 2026, 22:00 - samedi 26, 00:30 ».
 */
export function formatRange(
  startsAt: IsoInstant,
  endsAt: IsoInstant,
  timeZone: string,
): string {
  const sameDay =
    localDayKey(startsAt, timeZone) === localDayKey(endsAt, timeZone);
  const start = `${formatDateLong(startsAt, timeZone)}, ${formatTime(startsAt, timeZone)}`;
  if (sameDay) return `${start} - ${formatTime(endsAt, timeZone)}`;
  return `${start} - ${formatDateLong(endsAt, timeZone)}, ${formatTime(endsAt, timeZone)}`;
}

export function formatDurationHuman(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function nowIso(): IsoInstant {
  return new Date().toISOString();
}

export function isBefore(a: IsoInstant, b: IsoInstant): boolean {
  return new Date(a).getTime() < new Date(b).getTime();
}
