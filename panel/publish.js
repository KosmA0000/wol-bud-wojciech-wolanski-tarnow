import { readPublished } from '../assets/home-content.js';
import { config } from './config.js';

export class AccessError extends Error {}
const mismatch = 'Opublikowana treść zmieniła się w trakcie edycji. Zapisz szkic, odśwież panel i sprawdź zmiany przed ponowieniem.';
const timeout = () => AbortSignal.timeout(12000);
const githubAuth = (credential) => ({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + credential });
const hostingAuth = (credential) => 'Basic ' + btoa('editor:' + credential);

function checkAccess(response) {
  if ([401, 403, 404].includes(response.status)) {
    throw new AccessError(config.mode === 'hosting'
      ? 'Brak dostępu. Sprawdź hasło administratora.'
      : 'Brak dostępu. Sprawdź klucz GitHub i uprawnienia do repozytorium.');
  }
}

export async function verifyAccess(credential) {
  const response = config.mode === 'hosting'
    ? await fetch('./api.php', {
        headers: { Authorization: hostingAuth(credential) }, cache: 'no-store', signal: timeout(),
      })
    : await fetch('https://api.github.com/repos/' + config.repository, {
        headers: githubAuth(credential), cache: 'no-store', signal: timeout(),
      });
  checkAccess(response);
  if (!response.ok) throw new Error('Nie udało się sprawdzić dostępu. Spróbuj ponownie.');
  if (config.mode === 'github' && !(await response.json()).permissions?.push) {
    throw new AccessError('Konto połączone z kluczem GitHub potrzebuje prawa zapisu w repozytorium.');
  }
}

export async function sendPublication(candidate, expected, pending, credential) {
  const allowed = [expected, pending].filter(Boolean);
  if (config.mode === 'hosting') {
    const response = await fetch('./api.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: hostingAuth(credential) },
      body: JSON.stringify({ candidate, allowed }),
      signal: timeout(),
    });
    checkAccess(response);
    if (response.status === 409) throw new Error(mismatch);
    if (!response.ok) throw new Error('Hosting nie zapisał publikacji. Spróbuj ponownie.');
    return;
  }

  const url = new URL('https://api.github.com/repos/' + config.repository + '/contents/assets/home-content.json');
  const headers = githubAuth(credential);
  const current = await fetch(url.href + '?ref=' + encodeURIComponent(config.branch), {
    headers, cache: 'no-store', signal: timeout(),
  });
  checkAccess(current);
  if (!current.ok) throw new Error('GitHub nie udostępnił aktualnej wersji. Spróbuj ponownie.');
  const blob = await current.json();
  const raw = Uint8Array.from(atob(blob.content), (char) => char.charCodeAt(0));
  if (!allowed.includes(JSON.parse(new TextDecoder().decode(raw)).revision)) throw new Error(mismatch);

  const json = JSON.stringify(candidate, null, 2) + '\n';
  const content = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Publikacja treści strony głównej', branch: config.branch, content, sha: blob.sha }),
    signal: timeout(),
  });
  checkAccess(response);
  if ([409, 422].includes(response.status)) throw new Error(mismatch);
  if (!response.ok) throw new Error('GitHub nie zapisał publikacji. Spróbuj ponownie.');
}

export async function waitForPublication(original, revision) {
  const limit = Date.now() + (config.mode === 'hosting' ? 18000 : 125000);
  do {
    try {
      const visible = await readPublished(original, { fresh: true, signal: AbortSignal.timeout(5000) });
      if (visible.revision === revision) return visible;
    } catch {
      // A temporarily unreachable public page cannot confirm publication.
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  } while (Date.now() < limit);
  throw new Error('Brak potwierdzenia na stronie publicznej. Szkic jest dostępny. Sprawdź stronę publiczną lub ponów publikację.');
}
