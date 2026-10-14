import { describe, expect, it } from "vitest";
import {
  buildTemplate,
  canHardDeleteField,
  copyTemplateIntoPlan,
  diffTemplateAgainstPlan,
  SUGGESTED_EXTRA_ROLES,
} from "@/domain/template";

/** Critere 5 : tous les champs MLA existent des la creation. */
describe("modele MLA", () => {
  const { template, fields } = buildTemplate("A", "MLA");

  it("contient les metadonnees de l'evenement", () => {
    const labels = fields.map((f) => f.label);
    expect(labels).toContain("Nom de l'evenement");
    expect(labels).toContain("Heure de l'evenement");
    expect(labels).toContain("Lieu de l'evenement");
    expect(labels).toContain("Description");
  });

  it("contient tous les postes du classeur", () => {
    const labels = fields.filter((f) => f.assignable).map((f) => f.label);
    for (const expected of [
      "LEAD",
      "Tenor",
      "Alto",
      "Soprano",
      "Pupitre double",
      "Piano",
      "Batterie",
      "Basse",
      "Guitare",
      "Charge des paroles",
      "Mass Choir",
      "Danse / bannieres",
      "Referent Planning",
      "Referent dress-code",
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it("contient le dress-code et la repetition, qui ne sont pas des postes", () => {
    const dress = fields.find((f) => f.label === "Dress-code");
    const lieu = fields.find((f) => f.label === "Lieu de la repetition");
    const heure = fields.find((f) => f.label === "Heure de la repetition");
    expect(dress?.assignable).toBe(false);
    expect(lieu?.assignable).toBe(false);
    expect(heure?.assignable).toBe(false);
  });

  it("ne donne un selecteur de membres qu'aux postes", () => {
    for (const field of fields) {
      expect(field.assignable).toBe(field.kind === "poste");
    }
  });

  it("accepte plusieurs personnes par poste", () => {
    expect(fields.filter((f) => f.assignable).every((f) => f.multiple)).toBe(true);
  });

  it("permet une precision sur le pupitre double", () => {
    expect(fields.find((f) => f.label === "Pupitre double")?.allowsDetail).toBe(true);
  });

  it("propose les roles supplementaires du classeur a l'ajout", () => {
    expect(SUGGESTED_EXTRA_ROLES).toContain("Referent Coordination");
    expect(SUGGESTED_EXTRA_ROLES).toContain("Co-lead");
    expect(SUGGESTED_EXTRA_ROLES).toContain("Alto 1");
    expect(SUGGESTED_EXTRA_ROLES).toContain("Alto 2");
  });

  it("part de la version 1", () => {
    expect(template.version).toBe(1);
  });
});

describe("modeles des autres types", () => {
  for (const type of ["ACCUEIL", "SONORISATION", "INTEGRATION", "AUTRE"] as const) {
    it(`${type} recoit Star 1 a Star 4`, () => {
      const { fields } = buildTemplate("A", type);
      const labels = fields.filter((f) => f.assignable).map((f) => f.label);
      expect(labels).toContain("Star 1");
      expect(labels).toContain("Star 2");
      expect(labels).toContain("Star 3");
      expect(labels).toContain("Star 4");
    });
  }

  it("conserve les informations generales et la repetition", () => {
    const { fields } = buildTemplate("A", "ACCUEIL");
    const labels = fields.map((f) => f.label);
    expect(labels).toContain("Nom de l'evenement");
    expect(labels).toContain("Lieu de la repetition");
  });
});

describe("copie du modele dans un plan", () => {
  const { fields } = buildTemplate("A", "MLA");
  const slots = copyTemplateIntoPlan(fields, { communityId: "A", planId: "p1" });

  it("ne copie que les postes affectables", () => {
    expect(slots).toHaveLength(fields.filter((f) => f.assignable).length);
  });

  it("conserve l'identifiant stable du champ d'origine", () => {
    for (const s of slots) {
      expect(fields.some((f) => f.id === s.templateFieldId)).toBe(true);
    }
  });

  it("prend un instantane du libelle et de l'effectif", () => {
    const lead = slots.find((s) => s.label === "LEAD");
    expect(lead?.minRequired).toBe(1);
    expect(lead?.enabled).toBe(true);
  });
});

/** Critere 12 : un changement de modele n'altere pas les plans existants. */
describe("evolution du modele", () => {
  const { fields } = buildTemplate("A", "MLA");
  const slots = copyTemplateIntoPlan(fields, { communityId: "A", planId: "p1" });

  it("renommer un champ ne touche pas le poste deja copie", () => {
    const renamed = fields.map((f) =>
      f.label === "LEAD" ? { ...f, label: "LEAD principal" } : f,
    );
    expect(slots.find((s) => s.label === "LEAD")).toBeDefined();
    const diff = diffTemplateAgainstPlan(renamed, slots);
    expect(diff).toContainEqual({
      kind: "renomme",
      label: "LEAD principal",
      before: "LEAD",
      after: "LEAD principal",
    });
  });

  it("l'apercu signale les ajouts et les retraits", () => {
    const withExtra = [
      ...fields,
      {
        ...fields[4]!,
        id: "nouveau",
        label: "Referent Coordination",
      },
    ];
    const diff = diffTemplateAgainstPlan(withExtra, slots);
    expect(diff).toContainEqual({ kind: "ajoute", label: "Referent Coordination" });

    const withoutGuitare = fields.filter((f) => f.label !== "Guitare");
    const diff2 = diffTemplateAgainstPlan(withoutGuitare, slots);
    expect(diff2).toContainEqual({ kind: "retire", label: "Guitare" });
  });

  it("un role utilise dans l'historique n'est pas supprimable", () => {
    expect(canHardDeleteField(0)).toBe(true);
    expect(canHardDeleteField(3)).toBe(false);
  });

  it("un champ archive n'est plus copie dans les nouveaux plans", () => {
    const archived = fields.map((f) =>
      f.label === "Guitare" ? { ...f, archivedAt: "2026-10-01T00:00:00.000Z" } : f,
    );
    const next = copyTemplateIntoPlan(archived, { communityId: "A", planId: "p2" });
    expect(next.some((s) => s.label === "Guitare")).toBe(false);
  });
});
