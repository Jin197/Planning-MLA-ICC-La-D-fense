import { execFileSync } from "node:child_process";

/**
 * Installe un jeu de donnees fictif propre avant les parcours au navigateur,
 * dans un fichier distinct de celui du developpement.
 *
 * Le seed est lance dans un processus separe : les modules serveur sont
 * marques `server-only` et refusent d'etre charges dans le processus de
 * Playwright, comme ils refuseraient de l'etre dans un composant client.
 */
export default function globalSetup(): void {
  const fichier = process.env.DIAPASON_DEMO_FILE ?? ".data/diapason-e2e.json";
  execFileSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/seed-demo.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, DIAPASON_DEMO_FILE: fichier },
    },
  );
}
