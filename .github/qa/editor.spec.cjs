const { test, expect } = require('@playwright/test');
const { resolve } = require('node:path');
const catalog = require('../../assets/page-catalog.json');

const pagePath = '/index.html';
const editorPath = '/panel/';
const api = 'https://api.github.com/repos/**/contents/assets/home-content.json*';
const originalOrder = ['ofirmie', 'oferta', 'opinie'];
const originalTitle = 'Czego szukasz?';
const newTitle = 'Okna, drzwi i bramy do Twojego domu';
const readOrder = (scope) => scope.locator('main > :is(#ofirmie,#oferta,#opinie)')
  .evaluateAll((items) => items.map((item) => item.id));
const heading = (page) => page.frameLocator('iframe').getByRole('textbox', { name: 'Nagłówek · Oferta' });

function mockPages(context) {
  let live = { version: 1, revision: 'original' };
  let git = live;
  let fail = false;
  const configure = async () => {
    await context.route('**/assets/home-content.json*', (route) => route.fulfill({ json: live }));
    await context.route(api, async (route) => {
      const method = route.request().method();
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, PUT, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
      };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (method === 'GET') {
        return route.fulfill({
          headers,
          json: { sha: git.revision, content: Buffer.from(JSON.stringify(git)).toString('base64') },
        });
      }
      if (fail) return route.fulfill({ status: 503, headers, json: {} });
      const request = route.request().postDataJSON();
      expect(request.sha).toBe(git.revision);
      expect(request.branch).toBe('main');
      git = JSON.parse(Buffer.from(request.content, 'base64').toString('utf8'));
      await route.fulfill({ headers, json: {} });
    });
  };
  return {
    configure,
    deploy: () => { live = git; },
    fail: (value) => { fail = value; },
    branch: () => git,
  };
}

async function editOffer(page, text = newTitle) {
  await page.getByRole('button', { name: 'Oferta', exact: true }).click();
  await heading(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(text);
  await expect(heading(page)).toHaveText(text);
}

async function publish(page) {
  await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByLabel('Klucz publikacji').fill('test-key');
    await dialog.getByRole('button', { name: 'Połącz i opublikuj' }).click();
  }
}

test('można wejść, edytować i zapisać szkic bez logowania', async ({ page, context }) => {
  const githubRequests = [];
  context.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/')) githubRequests.push(request.url());
  });
  await page.goto(editorPath);
  await editOffer(page);
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(page.locator('#draft-status')).toContainText('Szkic zapisany');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(githubRequests).toEqual([]);
  await page.getByRole('button', { name: 'Opublikuj', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('szkic przeżywa odświeżenie, a publikacja zmienia publiczny tekst i kolejność', async ({ page, context }) => {
  const pages = mockPages(context);
  await pages.configure();
  const publicPage = await context.newPage();
  await publicPage.goto(pagePath);
  await page.goto(editorPath);
  await editOffer(page);
  await page.getByRole('button', { name: 'Przenieś wyżej' }).press('Enter');
  await expect(page.locator('#movement')).toContainText('Oferta · pozycja 2 z 6');
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await expect(page.locator('#draft-status')).toContainText('Szkic zapisany');
  await page.reload();
  await expect(heading(page)).toHaveText(newTitle);
  await expect.poll(() => readOrder(page.frameLocator('iframe'))).toEqual(['oferta', 'ofirmie', 'opinie']);
  await expect(publicPage.locator('#oferta h2')).toHaveText(originalTitle);
  expect(await readOrder(publicPage)).toEqual(originalOrder);

  await publish(page);
  await expect(page.locator('#live-status')).toContainText('Czekam');
  await publicPage.reload();
  await expect(publicPage.locator('#oferta h2')).toHaveText(originalTitle);
  expect(await readOrder(publicPage)).toEqual(originalOrder);
  expect(pages.branch().order.filter((id) => originalOrder.includes(id))).toEqual(['oferta', 'ofirmie', 'opinie']);
  pages.deploy();
  await expect(page.locator('#live-status')).toContainText('Opublikowano');
  await publicPage.reload();
  await expect(publicPage.locator('#oferta h2')).toHaveText(newTitle);
  expect(await readOrder(publicPage)).toEqual(['oferta', 'ofirmie', 'opinie']);
});

test('błąd zapisu zachowuje edycję i pozwala ponowić zapis', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (fail && key.endsWith(':home-draft')) {
        fail = false;
        throw new DOMException('Brak miejsca', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.goto(editorPath);
  await editOffer(page);
  const save = page.getByRole('button', { name: 'Zapisz szkic' });
  await save.click();
  await expect(page.locator('#draft-status')).toContainText('Zapis nie powiódł się');
  await expect(heading(page)).toHaveText(newTitle);
  await save.click();
  await page.reload();
  await expect(heading(page)).toHaveText(newTitle);
});

test('błąd publikacji zachowuje podgląd i wersję publiczną oraz pozwala ponowić', async ({ page, context }) => {
  const pages = mockPages(context);
  await pages.configure();
  pages.fail(true);
  await page.goto(editorPath);
  await editOffer(page);
  await publish(page);
  await expect(page.locator('#live-status')).toContainText('GitHub nie zapisał');
  await expect(heading(page)).toHaveText(newTitle);
  const publicPage = await context.newPage();
  await publicPage.goto(pagePath);
  await expect(publicPage.locator('#oferta h2')).toHaveText(originalTitle);
  expect(await readOrder(publicPage)).toEqual(originalOrder);
  pages.fail(false);
  await publish(page);
  await expect(page.locator('#live-status')).toContainText('Czekam');
  pages.deploy();
  await expect(page.locator('#live-status')).toContainText('Opublikowano');
  await publicPage.reload();
  await expect(publicPage.locator('#oferta h2')).toHaveText(newTitle);
});

test('klawiatura przesuwa sekcję w obie strony i zachowuje fokus', async ({ page }) => {
  await page.goto(editorPath);
  await page.getByRole('button', { name: 'Oferta', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Przenieś niżej' }).press('Space');
  await expect.poll(() => readOrder(page.frameLocator('iframe'))).toEqual(['ofirmie', 'opinie', 'oferta']);
  await expect(page.getByRole('button', { name: 'Przenieś niżej' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Przenieś wyżej' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await readOrder(page.frameLocator('iframe'))).toEqual(originalOrder);
});

test('przeciągnięcie pokazuje dostępne miejsca i przenosi sekcję', async ({ page }) => {
  await page.goto(editorPath);
  const grip = page.locator('#sections li').filter({ has: page.getByRole('button', { name: 'Oferta', exact: true }) }).locator('.grip');
  await grip.hover();
  await page.mouse.down();
  const point = await grip.boundingBox();
  await page.mouse.move(point.x + point.width / 2 + 12, point.y + point.height / 2, { steps: 5 });
  const slot = page.locator('#sections .slot[data-before=ofirmie]');
  await expect(slot).toHaveText('Upuść przed „O firmie”');
  await expect(page.locator('#sections .slot[data-before=oferta]')).not.toHaveClass(/is-valid/);
  const target = await slot.boundingBox();
  const x = target.x + target.width / 2;
  const y = target.y + target.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.move(x + 1, y);
  await page.mouse.up();
  await expect.poll(() => readOrder(page.frameLocator('iframe'))).toEqual(['oferta', 'ofirmie', 'opinie']);
  await expect(slot).not.toHaveClass(/is-valid/);
});

test('sekcję można chwycić i upuścić bezpośrednio na stronie w podglądzie', async ({ page }) => {
  await page.goto(editorPath);
  const preview = page.frameLocator('iframe');
  const grip = preview.locator('#ofirmie > .editor-handle');
  const slot = preview.locator('#opinie > .editor-slot[data-before=opinie]');
  await grip.hover();
  const point = await grip.boundingBox();
  await page.mouse.down();
  await page.mouse.move(point.x + point.width / 2 + 12, point.y + point.height / 2, { steps: 5 });
  await expect(slot).toHaveText('Upuść przed „Opinie”');
  await slot.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    view.scrollBy({ top: element.getBoundingClientRect().top - 160, behavior: 'instant' });
  });
  const target = await slot.boundingBox();
  const x = target.x + target.width / 2;
  const y = target.y + target.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.move(x + 1, y);
  await page.mouse.up();
  await expect.poll(() => readOrder(preview)).toEqual(['oferta', 'ofirmie', 'opinie']);
});

test('dłuższy nagłówek mieści się w podglądzie telefonicznym i w publicznym układzie telefonu', async ({ page }) => {
  await page.goto(editorPath);
  const long = 'Okna, drzwi i bramy garażowe dopasowane do Twojego domu, montowane przez ekipę Wol‑Bud z Tarnowa';
  await editOffer(page, long);
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Telefon', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const fits = (el) => {
    const doc = el.ownerDocument.documentElement;
    const bounds = el.getBoundingClientRect();
    const lines = document.createRange();
    lines.selectNodeContents(el);
    const rects = [...lines.getClientRects()];
    return doc.clientWidth <= 390 && doc.scrollWidth === doc.clientWidth && bounds.left >= 0 &&
      bounds.right <= doc.clientWidth && rects.length > 1 &&
      rects.every((rect) => rect.left >= 0 && rect.right <= doc.clientWidth);
  };
  await expect.poll(() => heading(page).evaluate(fits)).toBe(true);
  const mobileDraft = await page.locator('iframe').evaluate((frame) => {
    const { original, legacyKeys } = frame.contentWindow.wolbudHome.home;
    return { ...original, texts: { [legacyKeys.oferta.heading]: '' } };
  });
  mobileDraft.texts['oferta:heading'] = long;
  mobileDraft.revision = '0a0a0000-0000-0000-0000-000000000000';
  await page.route('**/assets/home-content.json*', (route) => route.fulfill({
    json: mobileDraft,
  }));
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(pagePath + '#oferta');
  await expect(page.locator('#oferta h2')).toHaveText(long);
  expect(await page.locator('#oferta h2').evaluate(fits)).toBe(true);
});

test('kafelek z własnym zdjęciem może zawierać kolejny klocek i zostać opublikowany', async ({ page, context }) => {
  test.setTimeout(60000);
  const pages = mockPages(context);
  await pages.configure();
  await page.goto(editorPath + '?sekcja=oferta');
  const preview = page.frameLocator('iframe');
  const root = preview.locator('#oferta .home-cat-card').first();
  await root.locator('.home-cat-thumb').click();
  await page.getByRole('button', { name: 'Dodaj w środku', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Rodzaj elementu').selectOption('product');
  await form.getByLabel('Nazwa', { exact: true }).fill('Okno testowe z dębu');
  await form.getByLabel('Opis', { exact: true }).fill('Opis produktu dodany przez klienta.');
  await form.getByLabel('Zdjęcie z komputera').setInputFiles(resolve(__dirname, '../../img/wolbud-logo.webp'));
  await form.getByRole('button', { name: 'Dodaj', exact: true }).click();
  const added = preview.locator('.home-nested-grid .home-featured-product').filter({ hasText: 'Okno testowe z dębu' });
  await expect(added).toBeVisible();
  await expect(added.locator('img')).toHaveAttribute('src', /^data:image\//);
  await page.getByRole('button', { name: 'Dodaj w środku', exact: true }).click();
  await form.getByLabel('Rodzaj elementu').selectOption('review');
  await form.getByLabel('Podpis lub źródło opinii').fill('Opinia testowa');
  await form.getByLabel('Treść opinii').fill('Własna treść opinii klienta.');
  await form.getByLabel('Ocena').selectOption('4');
  await form.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(preview.locator('.home-nested-grid blockquote').filter({ hasText: 'Własna treść opinii klienta.' })).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await page.reload();
  await expect(added).toBeVisible();
  await publish(page);
  await expect(page.locator('#live-status')).toContainText('Czekam');
  pages.deploy();
  await expect(page.locator('#live-status')).toContainText('Opublikowano');
  const publicPage = await context.newPage();
  await publicPage.goto(pagePath);
  const publicProduct = publicPage.locator('.home-nested-grid .home-featured-product').filter({ hasText: 'Okno testowe z dębu' });
  await expect(publicProduct).toBeAttached();
  await publicPage.locator('.home-nested-drawer').first().locator(':scope > summary').click();
  await expect(publicProduct).toBeVisible();
  await publicPage.locator('.home-nested-drawer').nth(1).locator(':scope > summary').click();
  await expect(publicPage.getByText('Własna treść opinii klienta.', { exact: true })).toBeVisible();
});

test('panel otwiera podstrony, edytuje ich treść i utrzymuje niezależne szkice', async ({ page }) => {
  await page.goto(editorPath);
  await expect(page.locator('#page-list option')).toHaveCount(catalog.length);
  await page.getByLabel('Znajdź stronę').fill('kontakt');
  await page.getByLabel('Strona do edycji').selectOption('kontakt/index.html');
  await page.getByRole('button', { name: 'Otwórz w panelu' }).click();
  const title = page.frameLocator('iframe').locator('.subpage-head h1 .home-copy-field');
  await title.fill('Zapraszamy do salonów Wol-Bud');
  await page.getByRole('button', { name: 'Dodaj sekcję', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Rodzaj elementu').selectOption('section-text');
  await form.getByLabel('Nazwa', { exact: true }).fill('Umów wizytę');
  await form.getByLabel('Opis', { exact: true }).fill('Zadzwoń przed przyjazdem.');
  await form.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('.home-added-section h2')).toContainText('Umów wizytę');
  await page.getByRole('button', { name: 'Zapisz szkic' }).click();
  await page.reload();
  await expect(title).toHaveText('Zapraszamy do salonów Wol-Bud');
  await page.goto(editorPath + '?sekcja=oferta');
  await expect(heading(page)).toHaveText(originalTitle);
});
