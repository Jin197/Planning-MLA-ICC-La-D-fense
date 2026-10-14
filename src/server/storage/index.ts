import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { existsSync } from "node:fs";

/**
 * Espace de stockage prive des visuels.
 *
 * Deux implementations derriere un meme contrat, comme pour les donnees :
 *  - `local` ecrit sous `.data/assets/`, en dehors de `public/`, donc aucun
 *    fichier n'est servi directement par le serveur de fichiers statiques ;
 *  - `supabase` utiliserait un bucket prive.
 *
 * Dans les deux cas, un visuel ne s'obtient que par une route qui verifie
 * l'adhesion du demandeur.
 */
export interface StoragePort {
  readonly kind: "local" | "supabase";
  /** Ecrit le contenu et renvoie le chemin de stockage. */
  write(path: string, contenu: Uint8Array): Promise<string>;
  read(path: string): Promise<Uint8Array | null>;
  remove(path: string): Promise<void>;
}

/**
 * Dossier de stockage. `DIAPASON_ASSETS_DIR` permet aux tests d'ecrire
 * ailleurs que dans le dossier de travail.
 */
function racine(): string {
  return (
    process.env.DIAPASON_ASSETS_DIR ?? join(process.cwd(), ".data", "assets")
  );
}

/**
 * Empeche toute sortie du dossier de stockage : un chemin venant d'une
 * requete ne doit jamais permettre de lire ailleurs sur le disque.
 */
function cheminSur(path: string): string | null {
  const base = racine();
  const complet = normalize(join(base, path));
  if (complet !== base && !complet.startsWith(base + sep)) return null;
  return complet;
}

/*
 * Les chemins sont calcules a l'execution et confines a `.data/assets/` par
 * `cheminSur`. Les commentaires `turbopackIgnore` evitent que l'analyse
 * statique trace tout le projet comme dependance du build.
 */
const localStorage: StoragePort = {
  kind: "local",
  async write(path, contenu) {
    const complet = cheminSur(path);
    if (!complet) throw new Error("Chemin de stockage refuse.");
    await mkdir(dirname(complet), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ complet, contenu);
    return path;
  },
  async read(path) {
    const complet = cheminSur(path);
    if (!complet || !existsSync(/* turbopackIgnore: true */ complet)) return null;
    return new Uint8Array(await readFile(/* turbopackIgnore: true */ complet));
  },
  async remove(path) {
    const complet = cheminSur(path);
    if (!complet || !existsSync(/* turbopackIgnore: true */ complet)) return;
    await unlink(/* turbopackIgnore: true */ complet);
  },
};

export function getStorage(): StoragePort {
  // L'implementation Supabase Storage n'est pas branchee : voir les limites
  // documentees dans le README.
  return localStorage;
}
