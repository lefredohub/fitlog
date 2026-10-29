import { create, expect, openWithStart, test } from "./fixtures";

test("guidage : consignes, sortie de parcours, recentrage et arrêt", async ({ page, context }) => {
  await openWithStart(page);
  await create(page);
  await page.getByRole("button", { name: "Courir" }).click();
  await page.getByRole("button", { name: "C'est parti" }).click();
  await expect(page.getByText(/^(\d+ m|Maintenant)$/).first()).toBeVisible({ timeout: 10_000 });

  // Position loin du tracé : alerte après deux positions consécutives.
  await context.setGeolocation({ latitude: 45.79, longitude: 4.9, accuracy: 10 });
  await page.waitForTimeout(1200);
  await context.setGeolocation({ latitude: 45.7901, longitude: 4.9001, accuracy: 10 });
  await expect(page.getByText(/Hors parcours/)).toBeVisible({ timeout: 10_000 });

  // Déplacer la carte suspend le suivi ; il reprend seul après quelques secondes.
  const box = (await page.locator(".maplibregl-canvas").last().boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Recentrer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recentrer" })).toBeHidden({ timeout: 12_000 });

  await page.getByRole("button", { name: "Arrêter" }).click();
  await page.getByRole("button", { name: "Arrêter" }).click();
  await expect(page.getByRole("button", { name: "Courir" })).toBeVisible();
});
