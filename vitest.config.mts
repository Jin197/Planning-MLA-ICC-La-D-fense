import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` leve une erreur des qu'il est importe hors contexte
      // serveur React. Dans les tests, on le remplace par un module vide,
      // ce que fait aussi Next pour un composant serveur.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "next/headers": fileURLToPath(
        new URL("./tests/stubs/next-headers.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: false,
    testTimeout: 20000,
    // Les tests partagent un magasin en memoire par processus : un fichier a
    // la fois evite qu'ils se marchent dessus.
    fileParallelism: false,
  },
});
