const { test, expect } = require('@playwright/test');

const editorPath = '/panel/';

// Tiny valid 2x2 PNG image (base64) for testing browser WebP upload/compression
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQzwAEjDAGNgGAJgMRAcX6J5QAAAAASUVORK5CYII=';

function mockGitHubAtomics(context, initialManifest) {
  let headSha = '1111111111111111111111111111111111111111';
  let baseTreeSha = '2222222222222222222222222222222222222222';
  let liveManifest = initialManifest;
  let gitManifest = initialManifest;
  const blobs = new Map();
  let lastTree = null;
  let lastCommit = null;
  let blobSeq = 0;

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, accept',
  };

  async function install() {
    await context.route('**/assets/cms-manifest.json*', async (route) => {
      if (liveManifest) {
        return route.fulfill({ status: 200, json: liveManifest });
      }
      return route.continue();
    });

    await context.route('https://api.github.com/repos/**', async (route) => {
      const req = route.request();
      const method = req.method();
      const url = req.url();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });

      const auth = req.headers()['authorization'] || '';
      if (!auth.includes('test-pat-123')) {
        return route.fulfill({ status: 401, headers: corsHeaders, json: { message: 'Bad credentials' } });
      }

      if (method === 'GET' && url.includes('/git/ref/heads/main')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: { object: { sha: headSha } },
        });
      }

      if (method === 'GET' && url.includes('/git/commits/')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: { sha: headSha, tree: { sha: baseTreeSha } },
        });
      }

      if (method === 'GET' && url.includes('/contents/assets/cms-manifest.json')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          json: {
            sha: 'manifest-sha',
            content: Buffer.from(JSON.stringify(gitManifest)).toString('base64'),
          },
        });
      }

      if (method === 'POST' && url.endsWith('/git/blobs')) {
        const body = req.postDataJSON();
        const sha = `blob-${++blobSeq}`;
        blobs.set(sha, body);
        return route.fulfill({ status: 201, headers: corsHeaders, json: { sha } });
      }

      if (method === 'POST' && url.endsWith('/git/trees')) {
        const body = req.postDataJSON();
        lastTree = body;
        const manifestEntry = body.tree.find((t) => t.path === 'assets/cms-manifest.json');
        if (manifestEntry && blobs.has(manifestEntry.sha)) {
          const b = blobs.get(manifestEntry.sha);
          const raw = b.encoding === 'base64'
            ? Buffer.from(b.content, 'base64').toString('utf8')
            : b.content;
          gitManifest = JSON.parse(raw);
        }
        return route.fulfill({ status: 201, headers: corsHeaders, json: { sha: 'new-tree-sha' } });
      }

      if (method === 'POST' && url.endsWith('/git/commits')) {
        lastCommit = req.postDataJSON();
        return route.fulfill({ status: 201, headers: corsHeaders, json: { sha: 'new-commit-sha' } });
      }

      if (method === 'PATCH' && url.includes('/git/refs/heads/main')) {
        headSha = 'new-commit-sha';
        return route.fulfill({ status: 200, headers: corsHeaders, json: { object: { sha: headSha } } });
      }

      return route.fulfill({ status: 404, headers: corsHeaders, json: { message: 'Unhandled mock route: ' + url } });
    });
  }

  function getPublishedFile(repoPath) {
    if (!lastTree) return null;
    const entry = lastTree.tree.find((t) => t.path === repoPath);
    if (!entry || !entry.sha) return null;
    return blobs.get(entry.sha) || null;
  }

  return {
    install,
    deploy: () => {
      liveManifest = gitManifest;
    },
    getLastTree: () => lastTree,
    getLastCommit: () => lastCommit,
    getPublishedFile,
  };
}

async function waitForPreviewReady(page) {
  await expect(page.locator('#stage-loading')).toBeHidden({ timeout: 15000 });
  await expect.poll(() => page.locator('#structure-tree .tree-section').count(), { timeout: 15000 }).toBeGreaterThan(0);
}

async function switchToAdvancedMode(page) {
  const isSimple = await page.evaluate(() => document.body.classList.contains('is-simple-mode'));
  if (!isSimple) return;
  await page.locator('#btn-more-menu').click();
  await page.locator('#more-toggle-mode').click();
  await expect(page.locator('#structure-tree .tree-section').first()).toBeVisible({ timeout: 10000 });
}

test('panel uruchamia się w ultra-prostym trybie bez błędów konsoli i wykrywa wszystkie sekcje strony głównej', async ({ page }) => {
  const errors = [];
  const missingUrls = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400) missingUrls.push(`${res.status()} ${res.url()}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(editorPath);
  await waitForPreviewReady(page);

  // Domyślnie startuje w Trybie prostym: brak przytłaczających paneli bocznych
  await expect(page.locator('body')).toHaveClass(/is-simple-mode/);
  await expect(page.locator('#panel-left')).not.toHaveClass(/is-drawer-open/);
  await expect(page.locator('#panel-right')).not.toHaveClass(/is-drawer-open/);
  await expect(page.locator('#btn-simple-add-block')).toBeVisible();
  await expect(page.locator('#btn-ai')).toBeVisible();
  await expect(page.locator('#btn-support')).toBeVisible();
  await expect(page.locator('#btn-more-menu')).toBeVisible();

  await page.screenshot({
    path: 'C:/Users/User/.gemini/antigravity/brain/e1d1ce88-716c-4509-8216-9e610c21d5c5/scratch/panel-simple-default.png',
  });

  // Kliknięcie elementu na stronie wysuwa prosty inspektor, a ✕ go zamyka
  const preview = page.frameLocator('#preview');
  await expect(preview.locator('#oferta h2')).toHaveText('Czego szukasz?');
  await preview.locator('#oferta h2').click();
  await expect(page.locator('#panel-right')).toHaveClass(/is-drawer-open/);
  await page.locator('#btn-close-inspector').click();
  await expect(page.locator('#panel-right')).not.toHaveClass(/is-drawer-open/);

  // Interaktywna nawigacja po stronie jak na normalnej witrynie: MENU strony -> Usługi -> tryb Przeglądaj -> powrót na stronę główną
  await preview.locator('#menuButton').click();
  await expect(preview.locator('#site-menu')).toBeVisible();
  await preview.locator('#site-menu a', { hasText: 'Usługi' }).click();
  await waitForPreviewReady(page);
  await expect(page.locator('#topbar-page-path')).toHaveText('uslugi/index.html');

  await page.locator('#btn-mode-browse').click();
  await expect(preview.locator('body')).toHaveClass(/cms-browse-mode/);
  await preview.locator('a.brand').click();
  await waitForPreviewReady(page);
  await expect(page.locator('#topbar-page-path')).toHaveText('index.html');
  await page.locator('#btn-mode-edit').click();

  // Przełączenie na tryb zaawansowany pokazuje wszystkie sekcje w drzewie
  await switchToAdvancedMode(page);
  const sectionCount = await page.locator('#structure-tree .tree-section').count();
  expect(sectionCount).toBeGreaterThanOrEqual(7); // Hero, O firmie, Oferta, Opinie, Realizacje, Partnerzy, Kontakt

  expect(missingUrls).toEqual([]);
  expect(errors).toEqual([]);
});

test('edycja tekstu, dodawanie kafelków, podłączanie linku, nowe sekcje, Undo/Redo i trwałość szkicu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(editorPath);
  await waitForPreviewReady(page);
  await switchToAdvancedMode(page);
  const preview = page.frameLocator('#preview');

  // 1. Kliknij sekcję Oferta w strukturze i sprawdź inspektor
  const offerTreeBtn = page.locator('#structure-tree .tree-section-btn', { hasText: /Oferta|Czego szukasz/i }).first();
  await offerTreeBtn.click();
  await expect(page.locator('#inspector-body')).toContainText('Kafelki oferty');

  // 2. Dodaj nowy kafelek oferty z Inspektora
  const initialCards = await preview.locator('.home-catalog-grid .home-cat-card').count();
  await page.locator('#inspector-body button', { hasText: /Dodaj.*Kafelki oferty/i }).click();
  await expect(preview.locator('.home-catalog-grid .home-cat-card')).toHaveCount(initialCards + 1);

  // 3. Zmień tytuł nowego kafelka i podłącz link do podstrony Usługi w Inspektorze
  const titleInput = page.locator('#inspector-body input[type="text"]').first();
  await titleInput.fill('Pergole i zadaszenia');
  await titleInput.dispatchEvent('input');
  await expect(preview.locator('.home-catalog-grid .home-cat-card').last().locator('h3')).toHaveText('Pergole i zadaszenia');

  // Podepnij podstronę Usługi z wyszukiwalnego selektora podstron w Inspektorze
  const pageSearchInput = page.locator('#inspector-body input[type="search"]').first();
  await expect(pageSearchInput).toBeVisible();
  await pageSearchInput.click();
  await pageSearchInput.fill('Usługi');
  await page.locator('#inspector-body .page-picker-option', { hasText: 'uslugi/index.html' }).first().click();
  await expect(preview.locator('.home-catalog-grid .home-cat-card').last()).toHaveAttribute('href', 'uslugi/index.html');

  // 4. Dodaj nowy kafelek usługi
  await offerTreeBtn.click();
  const initialServices = await preview.locator('.home-services-grid .home-service-item').count();
  await page.locator('#inspector-body button', { hasText: /Dodaj.*Kafelki usług/i }).click();
  await expect(preview.locator('.home-services-grid .home-service-item')).toHaveCount(initialServices + 1);

  // 5. Dodaj całą nową sekcję z zakładki "Dodaj blok" (np. FAQ)
  await page.locator('.sidebar-tab[data-tab="blocks"]').click();
  const initialSections = await page.locator('#structure-tree .tree-section').count();
  await page.locator('#blocks-catalog button', { hasText: /FAQ|Pytania/i }).first().click();
  await page.locator('.sidebar-tab[data-tab="structure"]').click();
  await expect(page.locator('#structure-tree .tree-section')).toHaveCount(initialSections + 1);

  // 6. Test Undo / Redo
  await page.locator('#btn-undo').click();
  await expect(page.locator('#structure-tree .tree-section')).toHaveCount(initialSections);
  await page.locator('#btn-redo').click();
  await expect(page.locator('#structure-tree .tree-section')).toHaveCount(initialSections + 1);

  // 7. Przesuń sekcję Oferta wyżej (przed O firmie)
  await page.locator('#structure-tree .tree-section', { hasText: /Oferta|Czego szukasz/i }).first().locator('button[title*="wyżej"], button[aria-label*="wyżej"]').first().click();
  const orderAfterMove = await preview.locator('main > section').evaluateAll((els) => els.map((e) => e.id).filter(Boolean));
  expect(orderAfterMove.indexOf('oferta')).toBeLessThan(orderAfterMove.indexOf('ofirmie'));

  // 8. Zapisz szkic i przeładuj stronę — sprawdź trwałość w IndexedDB
  await page.locator('#btn-save-draft').click();
  await expect(page.locator('#draft-counter-badge')).toContainText(/1 zmian|Zapisano|szkic/i);
  await page.reload();
  await waitForPreviewReady(page);
  await expect(preview.locator('.home-catalog-grid .home-cat-card')).toHaveCount(initialCards + 1);
  await expect(preview.locator('.home-catalog-grid .home-cat-card').last().locator('h3')).toHaveText('Pergole i zadaszenia');
  await expect(preview.locator('.home-catalog-grid .home-cat-card').last()).toHaveAttribute('href', 'uslugi/index.html');

  expect(errors).toEqual([]);
});

test('przełączanie podstron, tworzenie nowej podstrony, upload WebP, ustawienia globalne i atomowa publikacja GitHub', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // Fetch initial real manifest from local server first
  const res = await page.request.get('/assets/cms-manifest.json');
  const initialManifest = await res.json();
  expect(initialManifest.pages.length).toBeGreaterThan(50);

  const gh = mockGitHubAtomics(context, initialManifest);
  await gh.install();

  await page.goto(editorPath);
  await waitForPreviewReady(page);
  await switchToAdvancedMode(page);
  const preview = page.frameLocator('#preview');

  // 1. Przełącz na podstronę Usługi i edytuj tekst
  await page.locator('.sidebar-tab[data-tab="pages"]').click();
  await page.locator('#pages-search').fill('Usługi');
  await page.locator('#pages-list button', { hasText: 'uslugi/index.html' }).first().click();
  await waitForPreviewReady(page);
  await expect(page.locator('#topbar-page-path')).toHaveText('uslugi/index.html');
  await expect(preview.locator('h1')).toContainText('Usługi');

  // Dodaj nową usługę lub zduplikuj pierwszą kartę usługi
  const serviceCardsBefore = await preview.locator('.service-card').count();
  await page.locator('#structure-tree .tree-section').nth(1).locator('button[title*="Duplikuj"], button[aria-label*="Duplikuj"]').first().click();
  await expect(preview.locator('.service-card')).toHaveCount(serviceCardsBefore + 1);
  await page.locator('#btn-save-draft').click();

  // 2. Utwórz całkiem nową podstronę z szablonu Promocja
  await page.locator('.sidebar-tab[data-tab="pages"]').click();
  await page.locator('#btn-open-new-page').click();
  await expect(page.locator('#new-page-dialog')).toBeVisible();
  await page.locator('#np-heading').fill('Promocja Jesień 2026');
  await page.locator('#np-lead').fill('Specjalny rabat na okna energooszczędne i ciepły montaż.');
  await page.locator('#np-add-to-menu').check();
  await expect(page.locator('#np-url-preview')).toContainText('promocja-jesien-2026/index.html');
  await page.locator('#new-page-form button[type="submit"]').click();
  await waitForPreviewReady(page);
  await expect(page.locator('#topbar-page-path')).toContainText('promocja-jesien-2026/index.html');
  await expect(preview.locator('h1')).toHaveText('Promocja Jesień 2026');

  // 3. Wgraj zdjęcie w Menedżerze Mediów (automatyczna kompresja WebP)
  await page.locator('#btn-media').click();
  await expect(page.locator('#media-dialog')).toBeVisible();
  await page.locator('#media-folders button[data-folder="montage"]').click();
  await expect(page.locator('#media-grid .media-card').first()).toBeVisible();

  await page.locator('#media-upload-input').setInputFiles({
    name: 'Zółte Okno Testowe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await page.locator('#media-folders button[data-folder="uploads"]').click();
  await expect(page.locator('#media-grid .media-badge-pending')).toBeVisible({ timeout: 10000 });
  await page.locator('#media-dialog [data-close-dialog]').first().click();

  // 4. Ustawienia globalne (telefon)
  await page.locator('#btn-globals').click();
  await expect(page.locator('#globals-dialog')).toBeVisible();
  await page.locator('#gl-phone-display').fill('534 091 999');
  await page.locator('#globals-form button[type="submit"]').click();
  await expect(page.locator('#globals-dialog')).toBeHidden();
  await expect(preview.locator('header.bar a.phone')).toContainText('534 091 999');

  // 5. Widok mobilny bez przepełnienia poziomego
  await page.locator('.vp-btn[data-viewport="mobile"]').click();
  await expect(page.locator('#stage-viewport')).toHaveClass(/view-mobile/);

  // 6. Atomowa publikacja przez GitHub Git Data API
  await page.locator('#btn-publish').click();
  await expect(page.locator('#publish-dialog')).toBeVisible();
  await page.locator('#pub-credential').fill('test-pat-123');
  await page.locator('#publish-form button[type="submit"]').click();

  // Poczekaj na wysłanie drzewa do mock GitHuba, potem symuluj wdrożenie GitHub Pages
  await expect.poll(() => gh.getLastTree() !== null, { timeout: 15000 }).toBe(true);
  gh.deploy();
  await expect(page.locator('#publish-dialog')).toBeHidden({ timeout: 15000 });

  // Sprawdź czy w JEDNYM atomic commicie wysłano zmodyfikowaną stronę, nową stronę, obrazek WebP, globals i manifest!
  const treePaths = gh.getLastTree().tree.map((t) => t.path);
  expect(treePaths).toContain('uslugi/index.html');
  expect(treePaths.some((p) => p.endsWith('promocja-jesien-2026/index.html'))).toBe(true);
  expect(treePaths.some((p) => p.startsWith('img/uploads/') && p.endsWith('.webp'))).toBe(true);
  expect(treePaths).toContain('assets/site-globals.json');
  expect(treePaths).toContain('assets/cms-manifest.json');

  // KRYTYCZNE: opublikowany HTML musi być w 100% czysty (zero artefaktów edytora!)
  const publishedUslugi = gh.getPublishedFile('uslugi/index.html');
  expect(publishedUslugi).toBeTruthy();
  const uslugiHtml = publishedUslugi.content;
  expect(uslugiHtml).toContain('<!doctype html>');
  expect(uslugiHtml).not.toContain('data-cms-uid');
  expect(uslugiHtml).not.toContain('data-cms-ui');
  expect(uslugiHtml).not.toContain('contenteditable');
  expect(uslugiHtml).not.toContain('wolbud-preview');

  expect(errors).toEqual([]);
});

test('Asystent AI wykonuje wieloetapowe polecenia narzędziami (nowa strona, galeria zdjęć, menu i zapis szkicu)', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  let geminiCallCount = 0;
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    geminiCallCount += 1;
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers });
    }

    if (geminiCallCount === 1) {
      return route.fulfill({
        status: 200,
        headers,
        json: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'get_page_structure', args: {} } }],
              },
            },
          ],
        },
      });
    }

    if (geminiCallCount === 2) {
      return route.fulfill({
        status: 200,
        headers,
        json: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'create_page',
                      args: {
                        templateId: 'promo',
                        heading: 'Promocja Wiosna 2027',
                        lead: 'Rabat na okna PCV i ciepły montaż.',
                        folder: 'promocje',
                        slug: 'promocja-wiosna-2027',
                        addToMenu: true,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    }

    if (geminiCallCount === 3) {
      return route.fulfill({
        status: 200,
        headers,
        json: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'add_section',
                      args: { templateId: 'photo-gallery' },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    }

    return route.fulfill({
      status: 200,
      headers,
      json: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Gotowe! Utworzyłem podstronę **Promocja Wiosna 2027**, dodałem ją do Menu głównego oraz wstawiłem **Galerię zdjęć**. Zmiany czekają w szkicu — kliknij **Opublikuj**, gdy będą gotowe.',
                },
              ],
            },
          },
        ],
      },
    });
  });

  await page.goto(editorPath);
  await waitForPreviewReady(page);
  const preview = page.frameLocator('#preview');

  // 1. Otwórz Asystenta AI i skonfiguruj klucz Gemini
  await page.locator('#btn-ai').click();
  await expect(page.locator('#ai-drawer')).toBeVisible();
  await expect(page.locator('#ai-setup-banner')).toBeVisible();
  await page.locator('#ai-setup-btn').click();
  await expect(page.locator('#ai-settings-dialog')).toBeVisible();
  await page.locator('#ai-provider').selectOption('gemini');
  await page.locator('#ai-api-key').fill('AIza-test-demo-key');
  await page.locator('#ai-settings-form button[type="submit"]').click();
  await expect(page.locator('#ai-settings-dialog')).toBeHidden();
  await expect(page.locator('#ai-setup-banner')).toBeHidden();

  // 2. Wyślij wieloetapowe polecenie
  await page.locator('#ai-input').fill('Utwórz podstronę Promocja Wiosna 2027, dodaj ją do menu i wstaw tam galerię zdjęć.');
  await page.locator('#ai-send').click();

  // 3. Sprawdź, czy AI wykonało wszystkie narzędzia i zwróciło finalną odpowiedź
  await expect(page.locator('#ai-messages .ai-msg--assistant .ai-msg-bubble').last()).toContainText('Gotowe!', { timeout: 15000 });
  await expect(page.locator('#ai-messages .ai-tool-pill.is-done')).toHaveCount(3);
  expect(geminiCallCount).toBe(4);

  // 4. Zweryfikuj realne zmiany na stronie w podglądzie!
  await expect(page.locator('#topbar-page-path')).toHaveText('promocje/promocja-wiosna-2027/index.html');
  await expect(preview.locator('h1')).toHaveText('Promocja Wiosna 2027');
  await expect(preview.locator('.realization-grid .realization-photo')).toHaveCount(3);
  await expect(preview.locator('#site-menu a', { hasText: 'Promocja Wiosna 2027' })).toHaveCount(1);

  // Zapisz zrzut ekranu z otwartym Asystentem AI do weryfikacji wizualnej
  await page.screenshot({
    path: 'C:/Users/User/.gemini/antigravity/brain/e1d1ce88-716c-4509-8216-9e610c21d5c5/scratch/panel-ai-drawer.png',
  });

  // 5. Przetestuj 1-klikowe cofnięcie ORAZ przywrócenie całej zmiany wykonanej przez AI!
  const aiUndoBtn = page.locator('#ai-messages .ai-undo-turn-btn').last();
  await expect(aiUndoBtn).toBeVisible();
  await aiUndoBtn.click();
  await expect(aiUndoBtn).toContainText(/Przywróć/i);
  await expect(page.locator('#topbar-page-path')).toHaveText('index.html', { timeout: 10000 });
  await expect(preview.locator('#site-menu a', { hasText: 'Promocja Wiosna 2027' })).toHaveCount(0);

  // Przywróć z powrotem jednym kliknięciem (Redo AI!)
  await aiUndoBtn.click();
  await expect(aiUndoBtn).toContainText(/Cofnij/i);
  await expect(page.locator('#topbar-page-path')).toHaveText('promocje/promocja-wiosna-2027/index.html', { timeout: 10000 });
  await expect(preview.locator('#site-menu a', { hasText: 'Promocja Wiosna 2027' })).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('Bezpieczeństwo, kopie zapasowe (oryginał), Pomoc/telefon, guardrails AI, nowe narzędzia i spokojny UX', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };

  // Mock GitHub commits list for backups modal
  await context.route('https://api.github.com/repos/**/commits*', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    return route.fulfill({
      status: 200,
      headers: corsHeaders,
      json: [
        {
          sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          commit: {
            message: 'Aktualizacja strony WOL-BUD (3 plików)',
            committer: { date: '2026-11-20T15:00:00Z' },
          },
        },
      ],
    });
  });

  // Mock Gemini to test BOTH malicious blocked tool calls AND new safe tools
  let aiCall = 0;
  let capturedToolResponses = [];
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    aiCall += 1;

    const reqBody = route.request().postDataJSON();
    if (Array.isArray(reqBody?.contents)) {
      const last = reqBody.contents[reqBody.contents.length - 1];
      if (last?.parts) {
        for (const p of last.parts) {
          if (p.functionResponse) capturedToolResponses.push(p.functionResponse);
        }
      }
    }

    if (aiCall === 1) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { functionCall: { name: 'get_page_structure', args: {} } },
                  { functionCall: { name: 'list_backups', args: {} } },
                ],
              },
            },
          ],
        },
      });
    }

    if (aiCall === 2) {
      // Złośliwe próby (muszą zostać zablokowane przez AiGuardrailTracker!) + bezpieczne nowe narzędzia
      const structResp = capturedToolResponses.find((r) => r.name === 'get_page_structure');
      const sections = structResp?.response?.sections || structResp?.response?.result?.sections || [];
      const targetUid = sections[1]?.uid || sections[0]?.uid || 'sec-1';
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        json: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  // 1. Próba wstrzyknięcia javascript:alert(1) — ZABLOKOWANA
                  { functionCall: { name: 'update_element_link', args: { uid: targetUid, href: 'javascript:alert(1)' } } },
                  // 2. Próba usunięcia chronionej strony głównej — ZABLOKOWANA
                  { functionCall: { name: 'delete_page', args: { pagePath: 'index.html' } } },
                  // 3. Bezpieczna zmiana stylu sekcji — DOZWOLONA
                  { functionCall: { name: 'update_section_style', args: { uid: targetUid, tone: 'accent', align: 'center', spacing: 'spacious' } } },
                  // 4. Bezpieczne ustawienie kotwicy #id — DOZWOLONA
                  { functionCall: { name: 'update_section_id', args: { uid: targetUid, sectionId: 'test-kotwica' } } },
                ],
              },
            },
          ],
        },
      });
    }

    return route.fulfill({
      status: 200,
      headers: corsHeaders,
      json: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'Sprawdziłem kopie zapasowe oraz zastosowałem bezpieczny styl i kotwicę `#test-kotwica`. Niebezpieczne operacje zostały zablokowane przez zabezpieczenia panelu.',
                },
              ],
            },
          },
        ],
      },
    });
  });

  await page.goto(editorPath);
  await waitForPreviewReady(page);
  await switchToAdvancedMode(page);
  const preview = page.frameLocator('#preview');

  // 1. Sprawdź spokojny UX: przycisk Kopie, Pomoc, karta bezpieczeństwa w Inspektorze i zwinięte Opcje zaawansowane
  await expect(page.locator('#btn-backups')).toBeVisible();
  await expect(page.locator('#btn-support')).toBeVisible();
  await expect(page.locator('#inspector-body .safety-quick-card')).toBeVisible();
  const advDetails = page.locator('#inspector-body details.inspector-advanced').first();
  await expect(advDetails).toBeVisible();
  await expect(advDetails).not.toHaveAttribute('open', '');

  await page.screenshot({
    path: 'C:/Users/User/.gemini/antigravity/brain/e1d1ce88-716c-4509-8216-9e610c21d5c5/scratch/panel-calm-home.png',
  });

  // 2. Otwórz Kopie zapasowe — musi być przypięty nieusuwalny oryginał!
  await page.locator('#btn-backups').click();
  await expect(page.locator('#backups-dialog')).toBeVisible();
  await expect(page.locator('#backups-list .backup-card--original')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#backups-list .backup-badge-immutable')).toContainText(/Nieusuwalny/i);
  await page.screenshot({
    path: 'C:/Users/User/.gemini/antigravity/brain/e1d1ce88-716c-4509-8216-9e610c21d5c5/scratch/panel-backups-modal.png',
  });
  await page.locator('#backups-dialog [data-close-dialog]').first().click();

  // 3. Otwórz Pomoc / Zadzwoń do twórcy — musi mieć link tel: i raport diagnostyczny
  await page.locator('#btn-support').click();
  await expect(page.locator('#support-dialog')).toBeVisible();
  await expect(page.locator('#support-call-link')).toHaveAttribute('href', /^tel:/);
  await page.screenshot({
    path: 'C:/Users/User/.gemini/antigravity/brain/e1d1ce88-716c-4509-8216-9e610c21d5c5/scratch/panel-support-modal.png',
  });
  await page.locator('#support-dialog [data-close-dialog]').first().click();

  // 4. Przetestuj Guardrails AI + nowe narzędzia przez UI Asystenta AI
  await page.locator('#btn-ai').click();
  await page.locator('#ai-setup-btn').click();
  await page.locator('#ai-provider').selectOption('gemini');
  await page.locator('#ai-api-key').fill('AIza-test-security-key');
  await page.locator('#ai-settings-form button[type="submit"]').click();

  await page.locator('#ai-input').fill('Test zabezpieczeń i nowych narzędzi');
  await page.locator('#ai-send').click();
  await expect(page.locator('#ai-messages')).toContainText('test-kotwica', { timeout: 15000 });

  // Zweryfikuj odpowiedzi z narzędzi przekazane z powrotem do modelu
  const getRes = (name) => {
    const found = capturedToolResponses.find((r) => r.name === name);
    return found?.response?.result || found?.response || null;
  };
  const linkResp = getRes('update_element_link');
  const delResp = getRes('delete_page');
  const styleResp = getRes('update_section_style');
  const idResp = getRes('update_section_id');
  const backupsResp = getRes('list_backups');

  expect(linkResp?.ok).toBe(false);
  expect(linkResp?.blockedBySecurity).toBe(true);
  expect(delResp?.ok).toBe(false);
  expect(delResp?.blockedBySecurity).toBe(true);
  expect(styleResp?.ok).toBe(true);
  expect(idResp?.ok).toBe(true);
  expect(backupsResp?.ok).toBe(true);

  // Zweryfikuj klasy stylu i ID na żywo w podglądzie iframe!
  await expect(preview.locator('#test-kotwica')).toHaveCount(1);
  await expect(preview.locator('#test-kotwica')).toHaveClass(/cms-tone-accent/);
  await expect(preview.locator('#test-kotwica')).toHaveClass(/cms-align-center/);
  await expect(preview.locator('#test-kotwica')).toHaveClass(/cms-space-spacious/);

  // 5. Zweryfikuj pre-publish SecurityError w przeglądarce dla HTML zawierającego <script>
  const prePublishBlocked = await page.evaluate(async () => {
    const mod = await import('/panel/publish.js');
    try {
      await mod.publishChanges({
        files: [{ path: 'index.html', content: '<!doctype html><html><body><script>alert(1)</script></body></html>', encoding: 'utf-8' }],
        deletions: [],
        expectedRevision: 'x',
        nextRevision: 'y',
        commitMessage: 'test',
        credential: 'dummy',
      });
      return { blocked: false };
    } catch (err) {
      return { blocked: true, name: err.name, message: err.message };
    }
  });
  expect(prePublishBlocked.blocked).toBe(true);
  expect(prePublishBlocked.name).toBe('SecurityError');

  expect(errors).toEqual([]);
});
