import "server-only";
import ExcelJS from "exceljs";
import {
  extractYearEvidence,
  parseAssignmentCell,
  parseDateHeader,
  parseRehearsalCell,
  suggestYear,
  type DateHeader,
  type ParsedRehearsal,
} from "@/domain/import-parsing";
import { parseAvailabilityToken } from "@/domain/availability";

/**
 * Lecture du classeur PLANNING MLA. Cette etape ne touche jamais les donnees
 * metier : elle produit une analyse, avec la feuille et la cellule d'origine
 * conservees pour chaque information.
 */

export const FEUILLES_CONNUES = [
  "PLANNING MLA",
  "LISTE CHANTS",
  "DRESS CODE",
  "PLANNING MLA EJP",
  "historique",
] as const;

export interface CelluleSource {
  sheet: string;
  cell: string;
}

export interface PersonneLue extends CelluleSource {
  lastName: string;
  firstName: string;
  rawSkills: string;
  /** Groupe lu dans la feuille, ex. « VOCALISTES », « EJP », « Mixte ». */
  group: string | null;
  issues: string[];
}

export interface ColonneDate extends CelluleSource {
  header: string;
  parsed: DateHeader;
}

export interface DisponibiliteLue extends CelluleSource {
  personRef: string;
  columnKey: string;
  raw: string;
  token: ReturnType<typeof parseAvailabilityToken>;
}

export interface AffectationLue extends CelluleSource {
  columnKey: string;
  teamLabel: string;
  roleLabel: string;
  raw: string;
  parsed: ReturnType<typeof parseAssignmentCell>;
}

export interface RepetitionLue extends CelluleSource {
  columnKey: string;
  teamLabel: string;
  parsed: ParsedRehearsal[];
}

export interface DressCodeLu extends CelluleSource {
  columnKey: string;
  theme: string;
  mood: string;
  colors: string;
  materials: string;
}

export interface ChantLu extends CelluleSource {
  groupLabel: string;
  sequence: string;
  title: string;
  links: string[];
  columnKey: string;
}

export interface AnalyseClasseur {
  sheetsDetected: string[];
  sheetsManquantes: string[];
  yearEvidence: { year: number; evidence: string; count: number } | null;
  personnes: PersonneLue[];
  colonnes: ColonneDate[];
  disponibilites: DisponibiliteLue[];
  affectations: AffectationLue[];
  repetitions: RepetitionLue[];
  dressCodes: DressCodeLu[];
  chants: ChantLu[];
  /** Journees presentes a la fois dans le planning et dans l'historique. */
  doublonsPlanningHistorique: { columnKey: string; sheets: string[] }[];
  anomalies: { sheet: string; cell: string; message: string }[];
  images: { sheet: string; count: number }[];
}

type Cell = ExcelJS.Cell;

function texteCellule(cell: Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((part) => part.text).join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String(v.result ?? "");
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
  }
  return String(v);
}

function valeurBrute(cell: Cell | undefined): string | Date | null {
  if (!cell) return null;
  if (cell.value instanceof Date) return cell.value;
  const t = texteCellule(cell);
  return t === "" ? null : t;
}

function liensCellule(cell: Cell | undefined): string[] {
  if (!cell) return [];
  const liens: string[] = [];
  const v = cell.value;
  if (v && typeof v === "object" && "hyperlink" in v && typeof v.hyperlink === "string") {
    liens.push(v.hyperlink);
  }
  for (const match of texteCellule(cell).matchAll(/https?:\/\/\S+/g)) {
    liens.push(match[0]);
  }
  return [...new Set(liens)];
}

const EN_TETES_ANNUAIRE = ["nom", "prenom", "pupitre"];

/** Reconnait la ligne d'en-tete de l'annuaire d'une feuille. */
function trouverLigneEntete(sheet: ExcelJS.Worksheet): number | null {
  for (let row = 1; row <= Math.min(10, sheet.rowCount); row += 1) {
    const valeurs: string[] = [];
    for (let col = 1; col <= Math.min(8, sheet.columnCount); col += 1) {
      valeurs.push(
        texteCellule(sheet.getCell(row, col))
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, ""),
      );
    }
    const trouves = EN_TETES_ANNUAIRE.filter((attendu) =>
      valeurs.some((v) => v.includes(attendu)),
    );
    if (trouves.length >= 2) return row;
  }
  return null;
}

interface DispositionAnnuaire {
  headerRow: number;
  lastNameCol: number;
  firstNameCol: number;
  skillCol: number;
  firstDateCol: number;
}

function lireDisposition(sheet: ExcelJS.Worksheet): DispositionAnnuaire | null {
  const headerRow = trouverLigneEntete(sheet);
  if (headerRow === null) return null;

  let lastNameCol = 0;
  let firstNameCol = 0;
  let skillCol = 0;
  for (let col = 1; col <= Math.min(10, sheet.columnCount); col += 1) {
    const v = texteCellule(sheet.getCell(headerRow, col))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    if (v.includes("nom") && !v.includes("prenom") && lastNameCol === 0) lastNameCol = col;
    if (v.includes("prenom") && firstNameCol === 0) firstNameCol = col;
    if ((v.includes("pupitre") || v.includes("instrument")) && skillCol === 0) {
      skillCol = col;
    }
  }
  if (lastNameCol === 0 || firstNameCol === 0) return null;

  const firstDateCol = Math.max(lastNameCol, firstNameCol, skillCol) + 1;
  return { headerRow, lastNameCol, firstNameCol, skillCol, firstDateCol };
}

/** Libelles de blocs d'equipe dans le classeur. */
const MARQUEURS_EQUIPE = [
  "equipe 1",
  "equipe 2",
  "equipe speciale",
  "equipe culte des jeunes",
  "equipe",
];

const MARQUEURS_GROUPE = ["vocalistes", "instrumentistes"];

/**
 * Vocabulaire des pupitres et instruments du classeur. Il sert uniquement a
 * reperer une valeur inattendue dans la colonne « Pupitre / instrument », par
 * exemple un prenom saisi par erreur. Une valeur inconnue devient une
 * anomalie a verifier, jamais une correction automatique.
 */
const PUPITRES_CONNUS = [
  "lead",
  "tenor",
  "alto",
  "mezzo",
  "mezzo-soprano",
  "soprano",
  "choriste",
  "piano",
  "clavier",
  "batterie",
  "basse",
  "guitare",
  "percussions",
  "cuivres",
  "saxophone",
  "trompette",
  "violon",
  "pupitre double",
];

function pupitreReconnu(valeur: string): boolean {
  const parties = sansAccents(valeur)
    .split(/[/,+]|\s+et\s+/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parties.length === 0) return true;
  return parties.every((partie) =>
    PUPITRES_CONNUS.some((connu) => partie === connu || partie.includes(connu)),
  );
}

function sansAccents(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export async function analyserClasseur(
  buffer: ArrayBuffer,
  options: { assumedYear?: number | null } = {},
): Promise<AnalyseClasseur> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const noms = workbook.worksheets.map((s) => s.name);
  const sheetsDetected = noms.filter((n) =>
    FEUILLES_CONNUES.some((connue) => sansAccents(connue) === sansAccents(n)),
  );
  const sheetsManquantes = FEUILLES_CONNUES.filter(
    (connue) => !noms.some((n) => sansAccents(n) === sansAccents(connue)),
  );

  // Recherche de l'annee : toute cellule texte peut la contenir.
  const textesPourAnnee: string[] = [];
  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const t = texteCellule(cell);
        if (/20\d{2}/.test(t)) textesPourAnnee.push(t);
      });
    });
  }
  const yearEvidence = suggestYear(extractYearEvidence(textesPourAnnee));
  const assumedYear = options.assumedYear ?? yearEvidence?.year ?? null;

  const analyse: AnalyseClasseur = {
    sheetsDetected,
    sheetsManquantes: [...sheetsManquantes],
    yearEvidence,
    personnes: [],
    colonnes: [],
    disponibilites: [],
    affectations: [],
    repetitions: [],
    dressCodes: [],
    chants: [],
    doublonsPlanningHistorique: [],
    anomalies: [],
    images: workbook.worksheets.map((s) => ({
      sheet: s.name,
      count: s.getImages().length,
    })),
  };

  for (const sheet of workbook.worksheets) {
    const nom = sansAccents(sheet.name);
    if (nom.includes("liste chants")) {
      lireFeuilleChants(sheet, analyse, assumedYear);
      continue;
    }
    if (nom.includes("dress code")) {
      lireFeuilleDressCode(sheet, analyse, assumedYear);
      continue;
    }
    // PLANNING MLA, PLANNING MLA EJP et historique partagent la meme forme.
    lireFeuillePlanning(sheet, analyse, assumedYear);
  }

  // Doublons entre le planning courant et l'historique.
  const parSheet = new Map<string, Set<string>>();
  for (const colonne of analyse.colonnes) {
    const cle = colonne.parsed.date ?? `${colonne.parsed.day}/${colonne.parsed.month}`;
    if (cle === "null/null") continue;
    const existant = parSheet.get(cle) ?? new Set<string>();
    existant.add(colonne.sheet);
    parSheet.set(cle, existant);
  }
  for (const [cle, feuilles] of parSheet) {
    const liste = [...feuilles];
    const planning = liste.some((f) => sansAccents(f).startsWith("planning"));
    const historique = liste.some((f) => sansAccents(f).includes("historique"));
    if (planning && historique) {
      analyse.doublonsPlanningHistorique.push({ columnKey: cle, sheets: liste });
    }
  }

  return analyse;
}

function lireFeuillePlanning(
  sheet: ExcelJS.Worksheet,
  analyse: AnalyseClasseur,
  assumedYear: number | null,
): void {
  const disposition = lireDisposition(sheet);
  if (!disposition) {
    analyse.anomalies.push({
      sheet: sheet.name,
      cell: "A1",
      message:
        "Aucune ligne d'en-tete « NOM / PRENOM / Pupitre » reconnue : feuille ignoree.",
    });
    return;
  }

  const { headerRow, lastNameCol, firstNameCol, skillCol, firstDateCol } = disposition;

  // Colonnes de dates.
  const colonnes: ColonneDate[] = [];
  for (let col = firstDateCol; col <= sheet.columnCount; col += 1) {
    const cell = sheet.getCell(headerRow, col);
    const brut = valeurBrute(cell);
    if (brut === null) continue;
    const parsed = parseDateHeader(brut, assumedYear);
    const colonne: ColonneDate = {
      sheet: sheet.name,
      cell: cell.address,
      header: typeof brut === "string" ? brut.replace(/\s+/g, " ").trim() : brut.toISOString(),
      parsed,
    };
    colonnes.push(colonne);
    analyse.colonnes.push(colonne);
    for (const issue of parsed.issues) {
      analyse.anomalies.push({ sheet: sheet.name, cell: cell.address, message: issue });
    }
  }

  // Annuaire et disponibilites.
  let groupeCourant: string | null = null;
  let ligneBlocEquipe: number | null = null;

  for (let row = headerRow + 1; row <= sheet.rowCount; row += 1) {
    const premiere = texteCellule(sheet.getCell(row, 1));
    const marqueur = sansAccents(premiere);

    if (MARQUEURS_GROUPE.some((m) => marqueur === m)) {
      groupeCourant = premiere.trim();
      continue;
    }
    if (marqueur !== "" && MARQUEURS_EQUIPE.some((m) => marqueur.startsWith(m))) {
      ligneBlocEquipe = row;
    }

    // Bloc d'equipe : la colonne des libelles de poste est juste avant les dates.
    if (ligneBlocEquipe !== null) {
      lireLigneEquipe(sheet, row, ligneBlocEquipe, firstDateCol, colonnes, analyse);
      continue;
    }

    const lastName = texteCellule(sheet.getCell(row, lastNameCol)).trim();
    const firstName = texteCellule(sheet.getCell(row, firstNameCol)).trim();
    if (lastName === "" && firstName === "") continue;

    const rawSkills =
      skillCol > 0 ? texteCellule(sheet.getCell(row, skillCol)).trim() : "";
    const issues: string[] = [];
    if (firstName === "") issues.push("Prenom absent.");
    if (lastName === "") issues.push("Nom absent.");
    if (rawSkills !== "" && !pupitreReconnu(rawSkills)) {
      // Cas reel du classeur : un prenom saisi dans la colonne instrument.
      issues.push(
        `La colonne pupitre contient « ${rawSkills} », qui ne correspond a aucun pupitre ni instrument connu : a verifier.`,
      );
    }

    const personne: PersonneLue = {
      sheet: sheet.name,
      cell: sheet.getCell(row, lastNameCol).address,
      lastName,
      firstName,
      rawSkills,
      group: groupeCourant,
      issues,
    };
    analyse.personnes.push(personne);
    for (const issue of issues) {
      analyse.anomalies.push({ sheet: sheet.name, cell: personne.cell, message: issue });
    }

    for (const colonne of colonnes) {
      const col = sheet.getCell(colonne.cell).col;
      const cell = sheet.getCell(row, Number(col));
      const raw = texteCellule(cell).trim();
      if (raw === "") continue;
      const token = parseAvailabilityToken(raw);
      analyse.disponibilites.push({
        sheet: sheet.name,
        cell: cell.address,
        personRef: `${lastName} ${firstName}`.trim(),
        columnKey: colonne.parsed.date ?? colonne.header,
        raw,
        token,
      });
      if (token.kind === "inconnu") {
        analyse.anomalies.push({
          sheet: sheet.name,
          cell: cell.address,
          message: `Valeur de disponibilite non reconnue : « ${raw} ».`,
        });
      }
    }
  }
}

function lireLigneEquipe(
  sheet: ExcelJS.Worksheet,
  row: number,
  ligneBlocEquipe: number,
  firstDateCol: number,
  colonnes: readonly ColonneDate[],
  analyse: AnalyseClasseur,
): void {
  // Le libelle du poste se trouve dans la colonne juste avant les dates.
  const colLibelle = firstDateCol - 1;
  const roleLabel = texteCellule(sheet.getCell(row, colLibelle)).trim();
  if (roleLabel === "") return;

  const teamLabel =
    texteCellule(sheet.getCell(ligneBlocEquipe, 1)).trim() || "Equipe";
  const estRepetition = sansAccents(roleLabel).startsWith("repetition");
  const estDressCode = sansAccents(roleLabel).startsWith("dress");

  for (const colonne of colonnes) {
    const col = Number(sheet.getCell(colonne.cell).col);
    const cell = sheet.getCell(row, col);
    const raw = texteCellule(cell).trim();
    if (raw === "") continue;

    if (estRepetition) {
      const parsed = parseRehearsalCell(raw, {
        assumedYear: colonne.parsed.date
          ? Number(colonne.parsed.date.slice(0, 4))
          : null,
        month: colonne.parsed.month,
      });
      analyse.repetitions.push({
        sheet: sheet.name,
        cell: cell.address,
        columnKey: colonne.parsed.date ?? colonne.header,
        teamLabel,
        parsed,
      });
      for (const repetition of parsed) {
        for (const issue of repetition.issues) {
          analyse.anomalies.push({
            sheet: sheet.name,
            cell: cell.address,
            message: issue,
          });
        }
      }
      continue;
    }

    if (estDressCode) {
      analyse.dressCodes.push({
        sheet: sheet.name,
        cell: cell.address,
        columnKey: colonne.parsed.date ?? colonne.header,
        theme: raw.replace(/\s+/g, " ").trim(),
        mood: "",
        colors: "",
        materials: "",
      });
      continue;
    }

    const parsed = parseAssignmentCell(raw);
    analyse.affectations.push({
      sheet: sheet.name,
      cell: cell.address,
      columnKey: colonne.parsed.date ?? colonne.header,
      teamLabel,
      roleLabel,
      raw: raw.replace(/\s+/g, " ").trim(),
      parsed,
    });
    for (const issue of parsed.issues) {
      analyse.anomalies.push({
        sheet: sheet.name,
        cell: cell.address,
        message: issue,
      });
    }
  }
}

function lireFeuilleChants(
  sheet: ExcelJS.Worksheet,
  analyse: AnalyseClasseur,
  assumedYear: number | null,
): void {
  // Colonnes de dates : la ligne d'en-tete contient « NOM » puis des dates.
  let headerRow = 0;
  for (let row = 1; row <= Math.min(6, sheet.rowCount); row += 1) {
    const premiere = sansAccents(texteCellule(sheet.getCell(row, 1)));
    if (premiere === "nom") {
      headerRow = row;
      break;
    }
  }
  if (headerRow === 0) headerRow = 2;

  const colonnes: { col: number; key: string }[] = [];
  for (let col = 3; col <= sheet.columnCount; col += 1) {
    const brut = valeurBrute(sheet.getCell(headerRow, col));
    if (brut === null) continue;
    const parsed = parseDateHeader(brut, assumedYear);
    colonnes.push({
      col,
      key: parsed.date ?? String(brut).replace(/\s+/g, " ").trim(),
    });
  }

  let groupeCourant = "";
  for (let row = headerRow + 1; row <= sheet.rowCount; row += 1) {
    const groupe = texteCellule(sheet.getCell(row, 1)).trim();
    if (groupe !== "") groupeCourant = groupe;
    const sequence = texteCellule(sheet.getCell(row, 2)).trim();
    if (sequence === "") continue;
    // Les lignes « Lien » complementent la ligne de chant precedente.
    const estLien = sansAccents(sequence) === "lien";

    for (const colonne of colonnes) {
      const cell = sheet.getCell(row, colonne.col);
      const raw = texteCellule(cell).trim();
      if (raw === "") continue;

      if (estLien) {
        const dernier = analyse.chants[analyse.chants.length - 1];
        if (dernier) {
          dernier.links = [...new Set([...dernier.links, ...liensCellule(cell)])];
        }
        continue;
      }

      analyse.chants.push({
        sheet: sheet.name,
        cell: cell.address,
        groupLabel: groupeCourant,
        sequence,
        title: raw.replace(/\s+/g, " ").trim(),
        links: liensCellule(cell),
        columnKey: colonne.key,
      });
    }
  }
}

function lireFeuilleDressCode(
  sheet: ExcelJS.Worksheet,
  analyse: AnalyseClasseur,
  assumedYear: number | null,
): void {
  // Ligne « DATE » puis une ligne par attribut.
  let dateRow = 0;
  for (let row = 1; row <= Math.min(8, sheet.rowCount); row += 1) {
    if (sansAccents(texteCellule(sheet.getCell(row, 1))) === "date") {
      dateRow = row;
      break;
    }
  }
  if (dateRow === 0) {
    analyse.anomalies.push({
      sheet: sheet.name,
      cell: "A1",
      message: "Ligne « DATE » absente : feuille dress-code ignoree.",
    });
    return;
  }

  const attributs = new Map<string, number>();
  for (let row = dateRow + 1; row <= sheet.rowCount; row += 1) {
    const libelle = sansAccents(texteCellule(sheet.getCell(row, 1)));
    if (libelle !== "") attributs.set(libelle, row);
  }

  for (let col = 2; col <= sheet.columnCount; col += 1) {
    const brut = valeurBrute(sheet.getCell(dateRow, col));
    if (brut === null) continue;
    const parsed = parseDateHeader(brut, assumedYear);
    const lire = (clef: string) => {
      const row = attributs.get(clef);
      return row ? texteCellule(sheet.getCell(row, col)).trim() : "";
    };

    const theme = lire("theme");
    const mood = lire("mood");
    const colors = lire("couleurs");
    const materials = lire("matieres");
    if (theme === "" && mood === "" && colors === "" && materials === "") continue;

    analyse.dressCodes.push({
      sheet: sheet.name,
      cell: sheet.getCell(dateRow, col).address,
      columnKey: parsed.date ?? String(brut).replace(/\s+/g, " ").trim(),
      theme,
      mood,
      colors,
      materials,
    });
    for (const issue of parsed.issues) {
      analyse.anomalies.push({
        sheet: sheet.name,
        cell: sheet.getCell(dateRow, col).address,
        message: issue,
      });
    }
  }

  const images = sheet.getImages();
  if (images.length > 0) {
    analyse.anomalies.push({
      sheet: sheet.name,
      cell: "-",
      message: `${images.length} image(s) de moodboard detectee(s) : l'association a une date doit etre confirmee dans la previsualisation.`,
    });
  }
}
