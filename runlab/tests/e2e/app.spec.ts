import { create, expect, openWithStart, shownKm, test } from "./fixtures";

test("un bouton : crée une boucle dans la fourchette, l'exporte en GPX et l'enregistre", async ({ page }) => {
  await openWithStart(page);
  await expect(page.getByText("10 km", { exact: true })).toBeVisible();
  await create(page);
  const km = await shownKm(page);
  expect(km).toBeGreaterThanOrEqual(10);
  expect(km).toBeLessThanOrEqual(10.5);
  await expect(page.getByText("Conseillé")).toBeVisible();
  await expect(page.getByText(/D\+ \d+ m · ≈ /)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter en GPX" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^boucle-10-km.*\.gpx$/);

  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Parcours enregistré")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog.getByText(/^Boucle 10 km/)).toBeVisible();
  // On retrouve le parcours après rechargement, puis on le supprime.
  await page.reload();
  await page.getByRole("button", { name: "Menu" }).click();
  await dialog.getByRole("button", { name: /^Supprimer Boucle 10 km/ }).click();
  await expect(dialog.getByText("Touche l'étoile d'un parcours pour le retrouver ici.")).toBeVisible();
});

test("distance, aller-retour et plusieurs tours depuis le menu", async ({ page }) => {
  await openWithStart(page);
  await page.getByRole("button", { name: "Moins de kilomètres" }).click();
  await page.getByRole("button", { name: "Moins de kilomètres" }).click();
  await expect(page.getByText("8 km", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "Aller-retour" }).click();
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("button", { name: "Aller-retour · Route" })).toBeVisible();
  await create(page);
  await expect(page.getByText("Aller-retour", { exact: true })).toBeVisible();
  let km = await shownKm(page);
  expect(km).toBeGreaterThanOrEqual(8);
  expect(km).toBeLessThanOrEqual(8.4);

  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "Boucle" }).click();
  await page.getByRole("radio", { name: "2 tours" }).click();
  await page.getByRole("button", { name: "Fermer" }).click();
  await create(page);
  await expect(page.getByText(/^2 tours de/)).toBeVisible();
  km = await shownKm(page);
  expect(km).toBeGreaterThanOrEqual(8);
  expect(km).toBeLessThanOrEqual(8.4);
});

test("mode record : traversées de route affichées", async ({ page }) => {
  await openWithStart(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("switch", { name: "Idéal pour un record" }).click();
  await page.getByRole("button", { name: "Fermer" }).click();
  await create(page);
  await expect(page.getByText(/\d+ traversées? de route/)).toBeVisible();
});

test("propositions : un glissement passe à la suivante", async ({ page }) => {
  await openWithStart(page);
  await create(page);
  await expect(page.getByText(/^Parcours 1 \/ [23]$/)).toBeVisible();
  const card = page.getByText(/^Parcours 1 \//).locator("xpath=ancestor::div[2]");
  const box = (await card.boundingBox())!;
  await card.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: box.x + 300, clientY: box.y + 50 }] });
  await card.dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: box.x + 100, clientY: box.y + 50 }] });
  await expect(page.getByText(/^Parcours 2 \/ [23]$/)).toBeVisible();
});

test("recherche d'adresse rapide, au clavier", async ({ page }) => {
  await openWithStart(page);
  const input = page.getByRole("textbox", { name: "Chercher un départ" });
  await input.click();
  await page.keyboard.type("av est 70");
  await expect(page.getByRole("option").first()).toContainText("Avenue Est 70", { timeout: 5_000 });
  await page.keyboard.press("Enter");
  await expect(page.getByText("Départ : Avenue Est 70")).toBeVisible();
});

test("départ choisi en touchant la carte", async ({ page }) => {
  await openWithStart(page);
  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 40, box.y + 250);
  await expect(page.getByText(/Départ : (Avenue Est|Rue Nord)/)).toBeVisible();
  await create(page);
});

test("erreur claire quand aucune voie n'est praticable", async ({ page, context }) => {
  // Les fausses tuiles n'ont de rues qu'autour de Lyon.
  await context.setGeolocation({ latitude: 44.5, longitude: 4.8 });
  await page.goto("/");
  await page.getByRole("button", { name: "Créer mon parcours" }).click();
  await expect(page.getByRole("alert")).toContainText("Aucune rue ni chemin praticable près du départ");
});

test("rien ne déborde horizontalement sur iPhone", async ({ page }) => {
  await openWithStart(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
