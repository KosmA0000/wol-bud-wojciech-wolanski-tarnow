const { test, expect } = require('@playwright/test');

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

test('szkic przeżywa odświeżenie, a publikacja zmienia publiczny tekst i kolejność', async ({ page, context }) => {
  const pages = mockPages(context);
  await pages.configure();
  const publicPage = await context.newPage();
  await publicPage.goto(pagePath);
  await page.goto(editorPath);
  await editOffer(page);
  await page.getByRole('button', { name: 'Przenieś wyżej' }).press('Enter');
  await expect(page.locator('#movement')).toHaveText('Oferta · pozycja 1 z 3.');
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
  expect(pages.branch().order).toEqual(['oferta', 'ofirmie', 'opinie']);
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
  await expect(page.getByRole('button', { name: 'Oferta', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Przenieś niżej' })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Przenieś wyżej' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await readOrder(page.frameLocator('iframe'))).toEqual(originalOrder);
});

test('przeciągnięcie pokazuje dostępne miejsca i przenosi sekcję', async ({ page }) => {
  await page.goto(editorPath);
  const grip = page.locator('#sections li').nth(1).locator('.grip');
  await grip.hover();
  await page.mouse.down();
  const point = await grip.boundingBox();
  await page.mouse.move(point.x + point.width / 2 + 12, point.y + point.height / 2, { steps: 5 });
  const slot = page.locator('#sections .slot[data-before=ofirmie]');
  await expect(slot).toHaveText('Upuść przed sekcją „O firmie”');
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
  const grip = preview.locator('#ofirmie .editor-handle');
  const slot = preview.locator('#opinie > .editor-slot[data-before=opinie]');
  await grip.hover();
  const point = await grip.boundingBox();
  await page.mouse.down();
  await page.mouse.move(point.x + point.width / 2 + 12, point.y + point.height / 2, { steps: 5 });
  await expect(slot).toHaveText('Upuść przed sekcją „Opinie”');
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
  const fields = await page.locator('iframe').evaluate((frame) => structuredClone(frame.contentWindow.wolbudHome.home.original.fields));
  fields.oferta.heading = long;
  await page.route('**/assets/home-content.json*', (route) => route.fulfill({
    json: { version: 1, revision: '0a0a0000-0000-0000-0000-000000000000', order: originalOrder, fields },
  }));
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(pagePath + '#oferta');
  await expect(page.locator('#oferta h2')).toHaveText(long);
  expect(await page.locator('#oferta h2').evaluate(fits)).toBe(true);
});
