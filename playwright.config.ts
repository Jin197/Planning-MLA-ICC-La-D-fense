import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours au navigateur. Ils tournent sur l'adaptateur de demonstration,
 * avec un fichier de donnees separe pour ne pas ecraser celui du
 * developpement.
 *
 * Navigateur : par defaut Microsoft Edge deja installe sur la machine
 * (`channel: "msedge"`), ce qui evite un telechargement. Sur un poste qui
 * atteint le CDN Playwright, `npx playwright install chromium` puis
 * `DIAPASON_E2E_CHANNEL=""` utilisent le Chromium embarque.
 */
const canal = process.env.DIAPASON_E2E_CHANNEL ?? "msedge";
const navigateur = canal === "" ? {} : { channel: canal };
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3100",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "ordinateur",
      use: {
        ...devices["Desktop Chrome"],
        ...navigateur,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // Verification du parcours mobile a 390 px.
      name: "mobile",
      use: { ...devices["Pixel 5"], ...navigateur },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/connexion",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DIAPASON_DATA_ADAPTER: "demo",
      DIAPASON_DEMO_FILE: ".data/diapason-e2e.json",
      DIAPASON_SESSION_SECRET: "secret-de-test-uniquement-pour-playwright",
      // Ouvre la route de remise a zero, pour que chaque test reparte d'un
      // jeu de donnees propre. Jamais positionne ailleurs.
      DIAPASON_ALLOW_TEST_RESET: "1",
    },
  },
});
