import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout : l'application construite (`npm run build`) servie en local,
 * branchée sur de fausses tuiles (tests/e2e/mock-tiles.mjs). Aucun accès réseau.
 * Variable PW_CHROMIUM_PATH : chemin d'un Chromium déjà installé (facultatif).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: { executablePath, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] },
    acceptDownloads: true,
  },
  projects: [
    {
      name: "iphone",
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
        geolocation: { latitude: 45.764, longitude: 4.8357, accuracy: 12 },
        permissions: ["geolocation"],
      },
    },
  ],
  webServer: [
    { command: "node tests/e2e/mock-tiles.mjs 4010", port: 4010, reuseExistingServer: true },
    { command: "npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
  ],
});
