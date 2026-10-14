import { deaccent } from "@/lib/ids";

/**
 * Analyseurs du classeur, ecrits comme fonctions pures pour etre testables.
 * Aucune valeur n'est inventee : ce qui n'est pas etaye devient une anomalie
 * a trancher par l'admin.
 */

const JOURS_COURTS: Record<string, number> = {
  dim: 0,
  lun: 1,
  mar: 2,
  mer: 3,
  jeu: 4,
  ven: 5,
  sam: 6,
};

const JOURS_LONGS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const MOIS_LONGS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const norm = (raw: string) => deaccent(raw).toLowerCase().replace(/\s+/g, " ").trim();

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface DateHeader {
  /** AAAA-MM-JJ, uniquement si l'annee est etayee ou fournie. */
  date: string | null;
  /** Jour et mois lus, meme sans annee. */
  day: number | null;
  month: number | null;
  /** Jour de semaine annonce dans l'en-tete, ex. « DIM ». */
  declaredWeekday: number | null;
  /** Libelle complementaire : « BAPTEMES (9h-13h) », « PENTECOTE »... */
  note: string | null;
  /** Vrai si la cellule portait une vraie date Excel. */
  fromExcelDate: boolean;
  issues: string[];
}

/**
 * Lit un en-tete de colonne de date. Formats rencontres :
 * « DIM 18/10 », « SAM 07/03\nBAPTEMES (9h-13h) », « 24/05\nPENTECOTE »,
 * « 13/09 », ou une vraie date Excel.
 */
export function parseDateHeader(
  raw: string | Date | null | undefined,
  assumedYear: number | null,
): DateHeader {
  const base: DateHeader = {
    date: null,
    day: null,
    month: null,
    declaredWeekday: null,
    note: null,
    fromExcelDate: false,
    issues: [],
  };

  if (raw === null || raw === undefined) {
    return { ...base, issues: ["En-tete vide."] };
  }

  if (raw instanceof Date) {
    const date = `${raw.getUTCFullYear()}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`;
    return {
      ...base,
      date,
      day: raw.getUTCDate(),
      month: raw.getUTCMonth() + 1,
      fromExcelDate: true,
    };
  }

  const texte = String(raw);
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const premiere = lignes[0] ?? "";
  const note = lignes.slice(1).join(" ") || null;

  const n = norm(premiere);
  const jourCourt = /^([a-z]{3})\b/.exec(n)?.[1];
  const declaredWeekday =
    jourCourt !== undefined && jourCourt in JOURS_COURTS
      ? JOURS_COURTS[jourCourt]!
      : null;

  // jj/mm ou jj/mm/aaaa
  const avecAnnee = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(premiere);
  const sansAnnee = /(\d{1,2})\/(\d{1,2})(?!\/)/.exec(premiere);

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  if (avecAnnee) {
    day = Number(avecAnnee[1]);
    month = Number(avecAnnee[2]);
    const brut = Number(avecAnnee[3]);
    year = brut < 100 ? 2000 + brut : brut;
  } else if (sansAnnee) {
    day = Number(sansAnnee[1]);
    month = Number(sansAnnee[2]);
    year = assumedYear;
  } else {
    return {
      ...base,
      note,
      declaredWeekday,
      issues: [`Aucune date reconnue dans « ${texte.replace(/\s+/g, " ")} ».`],
    };
  }

  const issues: string[] = [];
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    issues.push(`Jour invalide : ${day}.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    issues.push(`Mois invalide : ${month}.`);
  }
  if (year === null) {
    issues.push(
      "Annee absente de l'en-tete : elle doit etre proposee puis validee.",
    );
  }

  const date =
    year !== null && issues.length === 0
      ? `${year}-${pad(month!)}-${pad(day!)}`
      : null;

  // Controle de coherence entre la date et le jour de semaine annonce.
  if (date !== null && declaredWeekday !== null) {
    const reel = weekdayOf(date);
    if (reel !== declaredWeekday) {
      issues.push(
        `Incoherence : l'en-tete annonce un jour different du ${date}. A verifier.`,
      );
    }
  }

  return { date, day, month, declaredWeekday, note, fromExcelDate: false, issues };
}

/** Annee etayee par une cellule, ex. « Vendredi 04/09/2026 - 19h-23h ». */
export function extractYearEvidence(
  textes: readonly string[],
): { year: number; evidence: string }[] {
  const trouvees: { year: number; evidence: string }[] = [];
  for (const texte of textes) {
    for (const match of texte.matchAll(/\b(20\d{2})\b/g)) {
      trouvees.push({
        year: Number(match[1]),
        evidence: texte.replace(/\s+/g, " ").trim().slice(0, 120),
      });
    }
  }
  return trouvees;
}

/** Annee la plus etayee parmi les preuves trouvees. */
export function suggestYear(
  evidences: readonly { year: number; evidence: string }[],
): { year: number; evidence: string; count: number } | null {
  if (evidences.length === 0) return null;
  const comptes = new Map<number, { count: number; evidence: string }>();
  for (const e of evidences) {
    const courant = comptes.get(e.year);
    comptes.set(e.year, {
      count: (courant?.count ?? 0) + 1,
      evidence: courant?.evidence ?? e.evidence,
    });
  }
  const trie = [...comptes.entries()].sort((a, b) => b[1].count - a[1].count);
  const [year, info] = trie[0]!;
  return { year, evidence: info.evidence, count: info.count };
}

export interface ParsedRehearsal {
  /** AAAA-MM-JJ si la date est etayee. */
  date: string | null;
  /** Jour du mois seul, quand le mois vient du contexte. */
  dayOnly: number | null;
  startTime: string | null;
  endTime: string | null;
  /** Vrai si la fin tombe apres minuit. */
  crossesMidnight: boolean;
  locationName: string;
  room: string;
  address: string;
  raw: string;
  issues: string[];
}

const HEURE = String.raw`(\d{1,2})\s*h\s*(\d{2})?`;

function lireHeure(h: string, m?: string): string {
  return `${pad(Number(h))}:${pad(Number(m ?? 0))}`;
}

/**
 * Lit une cellule de repetition. Le classeur mele date, heures, studio et
 * adresse dans un texte libre, parfois sur plusieurs lignes et plusieurs
 * rendez-vous.
 */
export function parseRehearsalCell(
  raw: string | null | undefined,
  context: { assumedYear: number | null; month: number | null },
): ParsedRehearsal[] {
  if (!raw) return [];
  const texte = String(raw);
  if (norm(texte) === "n/a") return [];

  // Un rendez-vous par segment contenant une plage horaire.
  const segments = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  // Les lignes d'adresse ou de studio servent de contexte commun.
  const studio = segments.find((s) => /studio|fgo|salle|estudio|wacked/i.test(s));
  const adresse = segments.find((s) => /\d{5}|rue|boulevard|avenue|bd /i.test(s));
  const salle = /(?:studio|salle)\s*(?:numero|n°|no)?\s*([0-9]+)/i.exec(texte)?.[1];

  const sorties: ParsedRehearsal[] = [];
  const plageRe = new RegExp(`${HEURE}\\s*(?:-|a|à)\\s*${HEURE}`, "gi");

  for (const segment of segments) {
    plageRe.lastIndex = 0;
    const plage = plageRe.exec(segment);
    if (!plage) continue;

    const startTime = lireHeure(plage[1]!, plage[2]);
    const endTime = lireHeure(plage[3]!, plage[4]);
    const crossesMidnight = endTime <= startTime;

    const issues: string[] = [];
    let date: string | null = null;
    let dayOnly: number | null = null;

    const complete = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(segment);
    const jourMois = /(\d{1,2})\/(\d{1,2})(?!\/)/.exec(segment);
    const jourSeul = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(?:le\s+)?(\d{1,2})\b/i.exec(
      deaccent(segment),
    );
    const jourMoisLong = /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/i.exec(
      deaccent(segment),
    );

    if (complete) {
      const brut = Number(complete[3]);
      const annee = brut < 100 ? 2000 + brut : brut;
      date = `${annee}-${pad(Number(complete[2]))}-${pad(Number(complete[1]))}`;
    } else if (jourMois && context.assumedYear !== null) {
      date = `${context.assumedYear}-${pad(Number(jourMois[2]))}-${pad(Number(jourMois[1]))}`;
      issues.push("Annee deduite du contexte : a valider.");
    } else if (jourMoisLong && context.assumedYear !== null) {
      const mois = MOIS_LONGS[jourMoisLong[2]!.toLowerCase()];
      if (mois) {
        date = `${context.assumedYear}-${pad(mois)}-${pad(Number(jourMoisLong[1]))}`;
        issues.push("Annee deduite du contexte : a valider.");
      }
    } else if (jourSeul) {
      dayOnly = Number(jourSeul[1]);
      if (context.assumedYear !== null && context.month !== null) {
        date = `${context.assumedYear}-${pad(context.month)}-${pad(dayOnly)}`;
        issues.push(
          "Jour seul : mois et annee deduits du contexte de la colonne, a valider.",
        );
      } else {
        issues.push("Jour seul sans mois ni annee : date a saisir.");
      }
    } else {
      issues.push("Aucune date reconnue pour cette repetition.");
    }

    // Verifie le jour de semaine annonce s'il est present.
    const jourNomme = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.exec(
      deaccent(segment),
    )?.[1];
    if (date !== null && jourNomme) {
      const attendu = JOURS_LONGS[jourNomme.toLowerCase()];
      if (attendu !== undefined && weekdayOf(date) !== attendu) {
        issues.push(
          `Incoherence entre « ${jourNomme} » et la date ${date}. A verifier.`,
        );
      }
    }

    sorties.push({
      date,
      dayOnly,
      startTime,
      endTime,
      crossesMidnight,
      locationName: (studio ?? "").replace(/\s+/g, " ").trim(),
      room: salle ? `Studio ${salle}` : "",
      address: (adresse ?? "").replace(/\s+/g, " ").trim(),
      raw: segment.replace(/\s+/g, " ").trim(),
      issues,
    });
  }

  if (sorties.length === 0) {
    return [
      {
        date: null,
        dayOnly: null,
        startTime: null,
        endTime: null,
        crossesMidnight: false,
        locationName: "",
        room: "",
        address: "",
        raw: texte.replace(/\s+/g, " ").trim(),
        issues: ["Aucune plage horaire reconnue : a saisir manuellement."],
      },
    ];
  }

  return sorties;
}

export interface ParsedAssignmentCell {
  /** Prenoms ou noms lus, dans l'ordre. */
  names: string[];
  /** Precision entre parentheses, ex. « (alto) ». */
  detail: string | null;
  /** Repartition par creneau, ex. « Culte 1 : Ariane ». */
  perSession: { sessionHint: string; names: string[] }[];
  /** « N/A » : poste non applicable, et surement pas une personne. */
  notApplicable: boolean;
  issues: string[];
}

/**
 * Lit une cellule d'affectation. Cas rencontres :
 * « Ariane », « Crepin/Yael », « Culte 1 : Ariane\nCulte 2 : Crepin »,
 * « Flora (alto) », « Marianne\nCo-lead : Amanda », « N/A »,
 * « Jessica\nAngelica\nNahomie » (Mass Choir).
 */
export function parseAssignmentCell(
  raw: string | null | undefined,
): ParsedAssignmentCell {
  const vide: ParsedAssignmentCell = {
    names: [],
    detail: null,
    perSession: [],
    notApplicable: false,
    issues: [],
  };
  if (!raw) return vide;
  const texte = String(raw).trim();
  if (texte === "") return vide;

  if (norm(texte) === "n/a" || norm(texte) === "na") {
    return {
      ...vide,
      notApplicable: true,
      issues: [
        "« N/A » : poste non applicable apres validation, et non une personne appelee N/A.",
      ],
    };
  }

  const issues: string[] = [];
  const detail = /\(([^)]+)\)/.exec(texte)?.[1]?.trim() ?? null;
  const sansDetail = texte.replace(/\([^)]*\)/g, " ");

  const perSession: ParsedAssignmentCell["perSession"] = [];
  const lignes = sansDetail
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const nomsLibres: string[] = [];
  for (const ligne of lignes) {
    const prefixe = /^(culte\s*\d+|co-?lead|femmes|hommes|referent[^:]*)\s*:\s*(.+)$/i.exec(
      deaccent(ligne),
    );
    if (prefixe) {
      const noms = decouperNoms(ligne.slice(ligne.indexOf(":") + 1));
      perSession.push({ sessionHint: prefixe[1]!.trim(), names: noms });
      continue;
    }
    nomsLibres.push(...decouperNoms(ligne));
  }

  const names = [...new Set(nomsLibres.filter((n) => n !== ""))];
  if (names.length === 0 && perSession.length === 0) {
    issues.push(`Contenu non interprete : « ${texte.replace(/\s+/g, " ")} ».`);
  }
  if (/\*/.test(texte)) {
    issues.push("Marque « * » presente dans la cellule : signification a preciser.");
  }

  return { names, detail, perSession, notApplicable: false, issues };
}

function decouperNoms(fragment: string): string[] {
  return fragment
    .split(/[/+]|,| et /i)
    .map((n) => n.replace(/\*/g, "").trim())
    .filter((n) => n !== "" && !/^n\/?a$/i.test(n));
}

/**
 * Rapprochement approximatif de deux noms. Produit un score, jamais une
 * fusion : l'admin tranche.
 */
export function nameSimilarity(a: string, b: string): number {
  // Les traits d'union deviennent des espaces : « Carine-Linda » et
  // « Carine Linda » designent la meme personne dans le classeur.
  const decouper = (valeur: string) =>
    norm(valeur).replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
  const x = decouper(a);
  const y = decouper(b);
  if (x === "" || y === "") return 0;
  if (x === y) return 1;

  const motsX = new Set(x.split(" ").filter((m) => m.length > 1));
  const motsY = new Set(y.split(" ").filter((m) => m.length > 1));
  const communs = [...motsX].filter((m) => motsY.has(m)).length;
  if (communs > 0) {
    return 0.6 + (0.3 * communs) / Math.max(motsX.size, motsY.size);
  }

  // Distance de Levenshtein normalisee, pour les variantes orthographiques.
  const distance = levenshtein(x, y);
  const longueur = Math.max(x.length, y.length);
  const proximite = 1 - distance / longueur;
  return proximite > 0.75 ? proximite * 0.8 : 0;
}

function levenshtein(a: string, b: string): number {
  const matrice: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i += 1) matrice[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) matrice[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      matrice[i]![j] = Math.min(
        matrice[i - 1]![j]! + 1,
        matrice[i]![j - 1]! + 1,
        matrice[i - 1]![j - 1]! + cout,
      );
    }
  }
  return matrice[a.length]![b.length]!;
}

export interface MatchSuggestion {
  candidateId: string;
  candidateName: string;
  score: number;
}

/**
 * Suggestions de rapprochement. Deux personnes au meme prenom restent
 * distinctes : on propose, on ne fusionne pas.
 */
export function suggestMatches(
  nom: string,
  candidats: readonly { id: string; name: string }[],
  seuil = 0.6,
): MatchSuggestion[] {
  return candidats
    .map((c) => ({
      candidateId: c.id,
      candidateName: c.name,
      score: nameSimilarity(nom, c.name),
    }))
    .filter((s) => s.score >= seuil)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Les sequences de la feuille LISTE CHANTS, ex. « CULTES 1 et 2 ». */
export function parseSongGroupLabel(raw: string): {
  label: string;
  sessionOrdinals: number[];
} {
  const n = norm(raw);
  const chiffres = (n.match(/\d+/g) ?? []).map(Number);
  return {
    label: String(raw).replace(/\s+/g, " ").trim(),
    sessionOrdinals: [...new Set(chiffres)].filter((d) => d > 0 && d <= 12),
  };
}
