import { test, expect } from '@playwright/test';

test.describe('Smoke E2E — strona i panel', () => {
  test('strona główna ładuje się w widoku komputer i telefon bez błędów JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Okna i drzwi');
    await expect(page.locator('header.bar')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#menuButton').click();
    await expect(page.locator('#site-menu')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('podstrona kategorii zawiera okruszki i pasek kategorii', async ({ page }) => {
    await page.goto('/kategorie/okna-pcv/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText('Okna PCV');
    await expect(page.locator('.breadcrumbs')).toContainText('Oferta');
    await expect(page.locator('.cat-quick-nav .is-active')).toHaveText('Okna PCV');
  });
});
