import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  durationMinutes,
  formatRange,
  formatTime,
  localDayKey,
  localToUtc,
  localWeekdayName,
  overlaps,
  utcToLocal,
} from "@/lib/time";

/**
 * Critere 15 : les repetitions qui franchissent minuit et les changements
 * d'heure Europe/Paris doivent donner des durees correctes.
 */
describe("conversion heure locale / UTC", () => {
  it("stocke une heure d'ete parisienne avec le bon decalage", () => {
    const utc = localToUtc({ date: "2026-07-15", time: "19:00" }, DEFAULT_TIMEZONE);
    expect(utc).toBe("2026-07-15T17:00:00.000Z");
  });

  it("stocke une heure d'hiver parisienne avec le bon decalage", () => {
    const utc = localToUtc({ date: "2026-01-15", time: "19:00" }, DEFAULT_TIMEZONE);
    expect(utc).toBe("2026-01-15T18:00:00.000Z");
  });

  it("fait l'aller-retour sans perte", () => {
    const local = { date: "2026-10-23", time: "22:00" };
    const utc = localToUtc(local, DEFAULT_TIMEZONE);
    expect(utcToLocal(utc, DEFAULT_TIMEZONE)).toEqual(local);
  });

  it("refuse une date ou une heure invalide", () => {
    expect(() => localToUtc({ date: "2026-02-30", time: "10:00" }, DEFAULT_TIMEZONE)).toThrow();
    expect(() => localToUtc({ date: "2026-02-10", time: "25:00" }, DEFAULT_TIMEZONE)).toThrow();
  });
});

describe("repetition qui franchit minuit", () => {
  const start = localToUtc({ date: "2026-10-23", time: "22:00" }, DEFAULT_TIMEZONE);
  const end = localToUtc({ date: "2026-10-24", time: "00:30" }, DEFAULT_TIMEZONE);

  it("dure 2 h 30 et non une duree negative", () => {
    expect(durationMinutes(start, end)).toBe(150);
  });

  it("appartient a deux journees locales distinctes", () => {
    expect(localDayKey(start, DEFAULT_TIMEZONE)).toBe("2026-10-23");
    expect(localDayKey(end, DEFAULT_TIMEZONE)).toBe("2026-10-24");
  });

  it("affiche la date de fin quand elle change", () => {
    const text = formatRange(start, end, DEFAULT_TIMEZONE);
    expect(text).toContain("22:00");
    expect(text).toContain("00:30");
    expect(text).toContain("24 octobre");
  });
});

describe("changement d'heure Europe/Paris", () => {
  it("compte 3 h reelles pour une repetition de 23h a 01h30 la nuit du passage a l'heure d'hiver", () => {
    // Dans la nuit du 24 au 25 octobre 2026, 03:00 CEST devient 02:00 CET.
    const start = localToUtc({ date: "2026-10-24", time: "23:00" }, DEFAULT_TIMEZONE);
    const end = localToUtc({ date: "2026-10-25", time: "01:30" }, DEFAULT_TIMEZONE);
    expect(durationMinutes(start, end)).toBe(150);
    expect(formatTime(start, DEFAULT_TIMEZONE)).toBe("23:00");
    expect(formatTime(end, DEFAULT_TIMEZONE)).toBe("01:30");
  });

  it("compte 1 h reelle pour 01h30 a 03h30 la nuit du passage a l'heure d'ete", () => {
    // Le 29 mars 2026, 02:00 CET devient 03:00 CEST : l'heure 02:00 n'existe pas.
    const start = localToUtc({ date: "2026-03-29", time: "01:30" }, DEFAULT_TIMEZONE);
    const end = localToUtc({ date: "2026-03-29", time: "03:30" }, DEFAULT_TIMEZONE);
    expect(durationMinutes(start, end)).toBe(60);
  });

  it("garde le bon jour de semaine", () => {
    const sunday = localToUtc({ date: "2026-10-18", time: "09:00" }, DEFAULT_TIMEZONE);
    expect(localWeekdayName(sunday, DEFAULT_TIMEZONE)).toBe("dimanche");
  });
});

describe("chevauchements", () => {
  const session = (start: string, end: string) => ({
    startsAt: localToUtc({ date: "2026-10-18", time: start }, DEFAULT_TIMEZONE),
    endsAt: localToUtc({ date: "2026-10-18", time: end }, DEFAULT_TIMEZONE),
  });

  it("deux cultes successifs ne se chevauchent pas", () => {
    expect(overlaps(session("09:00", "10:45"), session("11:00", "12:45"))).toBe(false);
  });

  it("deux cultes qui se touchent exactement ne se chevauchent pas", () => {
    expect(overlaps(session("09:00", "11:00"), session("11:00", "12:45"))).toBe(false);
  });

  it("un recouvrement reel est detecte", () => {
    expect(overlaps(session("09:00", "10:45"), session("10:30", "12:00"))).toBe(true);
  });
});
