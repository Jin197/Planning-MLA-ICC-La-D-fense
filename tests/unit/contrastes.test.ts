import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifie les contrastes reellement presents dans la feuille de style.
 *
 * Les valeurs annoncees dans `docs/design-system.md` ne sont pas prises pour
 * acquises : elles sont recalculees ici depuis `globals.css`. Si une couleur
 * est modifiee et casse un seuil, ce test echoue.
 *
 * Seuils WCAG 2.2 niveau AA retenus :
 *  - 4,5:1 pour le texte normal (critere 1.4.3) ;
 *  - 3:1 pour les composants d'interface et les bordures de champs, qui ne
 *    sont pas du texte (critere 1.4.11).
 */

const CSS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/** Luminance relative d'une couleur hexadecimale, selon la formule WCAG. */
function luminance(hex: string): number {
  const valeur = hex.replace("#", "");
  const canaux = [0, 2, 4].map((debut) => {
    const octet = Number.parseInt(valeur.slice(debut, debut + 2), 16) / 255;
    return octet <= 0.03928 ? octet / 12.92 : ((octet + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2];
}

export function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const clair = Math.max(la, lb);
  const sombre = Math.min(la, lb);
  return (clair + 0.05) / (sombre + 0.05);
}

/**
 * Extrait la valeur d'un jeton dans un bloc donne. Le bloc clair est celui de
 * `@theme`, le bloc sombre celui de `:root[data-theme="dark"]`.
 */
function jeton(bloc: "clair" | "sombre", nom: string): string {
  const debut =
    bloc === "clair" ? CSS.indexOf("@theme {") : CSS.indexOf('[data-theme="dark"] {');
  expect(debut, `bloc ${bloc} introuvable`).toBeGreaterThan(-1);
  const fin = CSS.indexOf("\n}", debut);
  const contenu = CSS.slice(debut, fin);
  const trouve = new RegExp(`--color-${nom}:\\s*(#[0-9a-fA-F]{6})`).exec(contenu);
  expect(trouve, `jeton --color-${nom} absent du bloc ${bloc}`).not.toBeNull();
  return trouve![1]!;
}

const PALETTES = ["clair", "sombre"] as const;

describe("couleurs de texte", () => {
  for (const palette of PALETTES) {
    describe(`palette ${palette}`, () => {
      const page = () => jeton(palette, "ivoire");
      const carte = () => jeton(palette, "surface");

      it("le texte principal depasse 7:1 sur la page et sur les cartes", () => {
        const texte = jeton(palette, "nuit");
        expect(contraste(texte, page())).toBeGreaterThanOrEqual(7);
        expect(contraste(texte, carte())).toBeGreaterThanOrEqual(7);
      });

      it("le texte secondaire depasse 4,5:1", () => {
        const texte = jeton(palette, "nuit-doux");
        expect(contraste(texte, page())).toBeGreaterThanOrEqual(4.5);
        expect(contraste(texte, carte())).toBeGreaterThanOrEqual(4.5);
      });

      it("les mentions discretes depassent 4,5:1", () => {
        const texte = jeton(palette, "nuit-tres-doux");
        expect(contraste(texte, page())).toBeGreaterThanOrEqual(4.5);
        expect(contraste(texte, carte())).toBeGreaterThanOrEqual(4.5);
      });

      it("l'accent depasse 4,5:1 en texte", () => {
        const accent = jeton(palette, "indigo-accent");
        expect(contraste(accent, page())).toBeGreaterThanOrEqual(4.5);
        expect(contraste(accent, carte())).toBeGreaterThanOrEqual(4.5);
      });

      it("le texte pose sur un aplat d'accent depasse 4,5:1", () => {
        expect(
          contraste(jeton(palette, "sur-accent"), jeton(palette, "indigo-accent")),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it("l'or depasse 4,5:1 en texte", () => {
        const or = jeton(palette, "or");
        expect(contraste(or, page())).toBeGreaterThanOrEqual(4.5);
        expect(contraste(or, carte())).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

describe("couples d'etat", () => {
  const ETATS = ["dispo", "indispo", "attente", "alerte"] as const;

  for (const palette of PALETTES) {
    for (const etat of ETATS) {
      it(`${etat} depasse 4,5:1 en palette ${palette}`, () => {
        expect(
          contraste(jeton(palette, `${etat}-texte`), jeton(palette, `${etat}-fond`)),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("bordures", () => {
  for (const palette of PALETTES) {
    it(`la bordure des champs depasse 3:1 sur les cartes en palette ${palette}`, () => {
      // Critere 1.4.11 : une bordure de champ doit se distinguer de son fond.
      expect(
        contraste(jeton(palette, "bordure-forte"), jeton(palette, "surface")),
      ).toBeGreaterThanOrEqual(3);
    });

    it(`les bords de cadre sont achromatiques en palette ${palette}`, () => {
      // « Achromatique » signifie que les trois canaux sont egaux : le bord
      // ne porte aucune teinte, seulement une valeur de gris.
      for (const nom of ["bordure", "bordure-forte"]) {
        const valeur = jeton(palette, nom).replace("#", "");
        const [r, v, b] = [0, 2, 4].map((d) =>
          Number.parseInt(valeur.slice(d, d + 2), 16),
        ) as [number, number, number];
        expect(r, `--color-${nom} doit etre gris`).toBe(v);
        expect(v, `--color-${nom} doit etre gris`).toBe(b);
      }
    });
  }
});
