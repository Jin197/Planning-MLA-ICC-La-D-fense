import { nowIso } from "@/lib/time";
import { newId } from "@/lib/ids";
import type {
  CommunityType,
  EventRoleSlot,
  Id,
  PlanningTemplate,
  TemplateField,
  TemplateFieldKind,
} from "./types";

/**
 * Modeles installes a la creation d'une communaute. Les libelles sont
 * renommables sans changer le type de donnee, et seuls les champs
 * `kind === "poste"` recoivent un selecteur de membres.
 */

interface FieldSeed {
  kind: TemplateFieldKind;
  label: string;
  minRequired?: number;
  multiple?: boolean;
  allowsDetail?: boolean;
  required?: boolean;
}

/** Informations generales communes a tous les types de communaute. */
const GENERAL_FIELDS: FieldSeed[] = [
  { kind: "texte", label: "Nom de l'evenement", required: true },
  { kind: "creneau_horaire", label: "Heure de l'evenement", required: true },
  { kind: "lieu", label: "Lieu de l'evenement" },
  { kind: "texte_long", label: "Description" },
];

const REHEARSAL_FIELDS: FieldSeed[] = [
  { kind: "repetition_lieu", label: "Lieu de la repetition" },
  { kind: "repetition_horaire", label: "Heure de la repetition" },
];

const MLA_FIELDS: FieldSeed[] = [
  ...GENERAL_FIELDS,
  { kind: "poste", label: "LEAD", minRequired: 1 },
  { kind: "poste", label: "Tenor", minRequired: 1 },
  { kind: "poste", label: "Alto", minRequired: 1 },
  { kind: "poste", label: "Soprano", minRequired: 1 },
  {
    kind: "poste",
    label: "Pupitre double",
    minRequired: 0,
    allowsDetail: true,
  },
  { kind: "poste", label: "Piano", minRequired: 1 },
  { kind: "poste", label: "Batterie", minRequired: 1 },
  { kind: "poste", label: "Basse", minRequired: 0 },
  { kind: "poste", label: "Guitare", minRequired: 0 },
  { kind: "dress_code", label: "Dress-code" },
  { kind: "poste", label: "Charge des paroles", minRequired: 0 },
  { kind: "poste", label: "Mass Choir", minRequired: 0 },
  { kind: "poste", label: "Danse / bannieres", minRequired: 0 },
  { kind: "poste", label: "Referent Planning", minRequired: 0 },
  {
    kind: "poste",
    label: "Referent dress-code",
    minRequired: 0,
    allowsDetail: true,
  },
  ...REHEARSAL_FIELDS,
];

const STAR_FIELDS: FieldSeed[] = [
  ...GENERAL_FIELDS,
  { kind: "poste", label: "Star 1", minRequired: 1 },
  { kind: "poste", label: "Star 2", minRequired: 0 },
  { kind: "poste", label: "Star 3", minRequired: 0 },
  { kind: "poste", label: "Star 4", minRequired: 0 },
  { kind: "poste", label: "Referent Planning", minRequired: 0 },
  ...REHEARSAL_FIELDS,
];

/**
 * Postes supplementaires presents dans le classeur : proposes a l'ajout,
 * pas installes par defaut.
 */
export const SUGGESTED_EXTRA_ROLES: readonly string[] = [
  "Referent Coordination",
  "Co-lead",
  "Alto 1",
  "Alto 2",
  "Mezzo-soprano",
  "Choriste",
] as const;

export function seedsForType(type: CommunityType): FieldSeed[] {
  return type === "MLA" ? MLA_FIELDS : STAR_FIELDS;
}

export interface InstalledTemplate {
  template: PlanningTemplate;
  fields: TemplateField[];
}

/** Construit le modele d'une communaute. Appele une seule fois, a la creation. */
export function buildTemplate(
  communityId: Id,
  type: CommunityType,
  at = nowIso(),
): InstalledTemplate {
  const templateId = newId();
  const template: PlanningTemplate = {
    id: templateId,
    communityId,
    name: type === "MLA" ? "Modele MLA" : `Modele ${type}`,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
  const fields = seedsForType(type).map((seed, index) =>
    toField(seed, { communityId, templateId, order: index + 1 }),
  );
  return { template, fields };
}

export function toField(
  seed: FieldSeed,
  ctx: { communityId: Id; templateId: Id; order: number },
): TemplateField {
  const assignable = seed.kind === "poste";
  return {
    id: newId(),
    communityId: ctx.communityId,
    templateId: ctx.templateId,
    kind: seed.kind,
    label: seed.label,
    order: ctx.order,
    assignable,
    minRequired: assignable ? (seed.minRequired ?? 0) : 0,
    multiple: assignable ? (seed.multiple ?? true) : false,
    allowsDetail: seed.allowsDetail ?? false,
    required: seed.required ?? false,
    archivedAt: null,
  };
}

/**
 * Copie les postes du modele dans un plan. Chaque poste garde l'identifiant
 * stable du champ d'origine et un instantane de son libelle : renommer le
 * modele plus tard ne reecrit pas les plans existants.
 */
export function copyTemplateIntoPlan(
  fields: readonly TemplateField[],
  ctx: { communityId: Id; planId: Id },
): EventRoleSlot[] {
  return fields
    .filter((f) => f.assignable && f.archivedAt === null)
    .sort((a, b) => a.order - b.order)
    .map((f) => ({
      id: newId(),
      communityId: ctx.communityId,
      planId: ctx.planId,
      templateFieldId: f.id,
      label: f.label,
      order: f.order,
      minRequired: f.minRequired,
      multiple: f.multiple,
      allowsDetail: f.allowsDetail,
      enabled: true,
    }));
}

/**
 * Un role encore utilise dans l'historique n'est jamais supprime : il est
 * archive, ce qui conserve les affectations passees.
 */
export function canHardDeleteField(usageCount: number): boolean {
  return usageCount === 0;
}

export interface TemplateDiffEntry {
  kind: "ajoute" | "retire" | "renomme" | "effectif" | "ordre";
  label: string;
  before?: string | number;
  after?: string | number;
}

/**
 * Apercu des changements avant d'appliquer un modele a un plan existant.
 * L'operation reste explicite : rien n'est reecrit en silence.
 */
export function diffTemplateAgainstPlan(
  fields: readonly TemplateField[],
  slots: readonly EventRoleSlot[],
): TemplateDiffEntry[] {
  const out: TemplateDiffEntry[] = [];
  const active = fields.filter((f) => f.assignable && f.archivedAt === null);
  const bySlotField = new Map(slots.map((s) => [s.templateFieldId, s]));

  for (const f of active) {
    const slot = bySlotField.get(f.id);
    if (!slot) {
      out.push({ kind: "ajoute", label: f.label });
      continue;
    }
    if (slot.label !== f.label) {
      out.push({
        kind: "renomme",
        label: f.label,
        before: slot.label,
        after: f.label,
      });
    }
    if (slot.minRequired !== f.minRequired) {
      out.push({
        kind: "effectif",
        label: f.label,
        before: slot.minRequired,
        after: f.minRequired,
      });
    }
    if (slot.order !== f.order) {
      out.push({
        kind: "ordre",
        label: f.label,
        before: slot.order,
        after: f.order,
      });
    }
  }

  const activeIds = new Set(active.map((f) => f.id));
  for (const s of slots) {
    if (!activeIds.has(s.templateFieldId)) {
      out.push({ kind: "retire", label: s.label });
    }
  }
  return out;
}
