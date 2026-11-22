import { readFile } from 'node:fs/promises';

const ENV_PATH = 'C:\\Users\\User\\OpenBot\\Shared\\wolbud\\.env.local';
const TARGETS = ['gemini-4-hydrogen', 'gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

let raw;
try {
  raw = await readFile(ENV_PATH, 'utf8');
} catch {
  console.log('brak danych: brak pliku .env.local');
  process.exit(0);
}

const env = {};
const allKeyStates = [];
for (const rawLine of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^(?:export\s+)?([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
  if (m) {
    const val = m[2].replace(/^['"]|['"]$/g, '').trim();
    env[m[1]] = val;
    allKeyStates.push(`${m[1]}=${val ? '(ustawiony)' : '(pusty)'}`);
  }
}
console.log(`Zmienne w .env.local (bez wartości): ${allKeyStates.join(', ') || '(brak wpisów KEY=VAL)'}`);

const gemKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GEMINI_API_KEY || '';
if (!gemKey) {
  console.log('brak danych: brak klucza Gemini API w .env.local');
  process.exit(0);
}

const all = [];
let pageToken = '';
for (let i = 0; i < 10; i++) {
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
  url.searchParams.set('pageSize', '200');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  url.searchParams.set('key', gemKey);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`Błąd API Gemini: HTTP ${res.status} (${data?.error?.message || 'brak szczegółów'})`);
    process.exit(1);
  }
  for (const m of data.models || []) all.push(String(m.name || '').replace(/^models\//, ''));
  if (!data.nextPageToken) break;
  pageToken = data.nextPageToken;
}

console.log(`Liczba modeli zwróconych przez Gemini API: ${all.length}`);
for (const t of TARGETS) console.log(`  ${t}: ${all.includes(t) ? 'ISTNIEJE' : 'BRAK'}`);
const interesting = all.filter((n) => /gemini-(2\.5|3|4)|hydrogen|neon/i.test(n));
console.log(`Modele Gemini 2.5/3/4+: ${interesting.join(', ') || '(brak)'}`);
