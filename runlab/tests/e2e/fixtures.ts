import { test as base, expect } from "@playwright/test";

/**
 * Chaque page utilise les fausses tuiles locales, et aucun service extérieur n'est
 * contacté (le fond de carte bascule sur un fond neutre).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { RUNLAB_CONFIG: unknown }).RUNLAB_CONFIG = {
        sources: { tiles: "http://localhost:4010/tiles.json", terrain: "http://localhost:4010/terrain/{z}/{x}/{y}.png" },
      };
    });
    await page.route(/^https:\/\//, (route) => route.abort());
    await use(page);
  },
});

export { expect };

/** Ouvre l'application et attend le départ (position GPS nommée d'après la carte). */
export async function openWithStart(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByText(/Départ : (Avenue Est|Rue Nord)/)).toBeVisible({ timeout: 20_000 });
}

/** Crée un parcours et attend les propositions. */
export async function create(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Créer mon parcours" }).click();
  await expect(page.getByRole("button", { name: "Courir" })).toBeVisible({ timeout: 30_000 });
}

/** Distance affichée (km). */
export async function shownKm(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.getByText(/^\d+,\d+ km$/).first().innerText();
  return Number(text.replace(" km", "").replace(",", "."));
}
