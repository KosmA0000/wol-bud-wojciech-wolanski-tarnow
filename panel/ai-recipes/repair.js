// Przepis AI: sprawdza spójność wskazanej strony lub całej witryny i naprawia wykryte braki
// (najczęściej wywołując dolacz_do_grupy w ramach jednej atomowej operacji możliwej do cofnięcia).

import { loadSite } from './knowledge.js?v=turbo33';
import { run as runGroupJoin, getConsistency, resolvePageInList } from './group-join.js?v=turbo33';

export const tools = [
  {
    name: 'napraw_spojnosc',
    description:
      'Sprawdza spójność wybranej strony lub całej witryny względem reguł grup (np. brakujący pasek kategorii, panel boczny albo brak obecności na innych stronach) i automatycznie naprawia wszystkie wykryte braki. Całą naprawę można cofnąć jednym poleceniem „cofnij”.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description:
            'Opcjonalna nazwa lub ścieżka strony do sprawdzenia i naprawy. Brak = sprawdza i naprawia całą witrynę.',
        },
      },
    },
  },
];

export async function run(name, args = {}, ctx) {
  if (name !== 'napraw_spojnosc') {
    return { ok: false, error: `Nieznany przepis: ${name}` };
  }

  const rawStrona = String(args.strona || '').trim();
  let filterPages = [];

  if (rawStrona) {
    const activePages = (await loadSite(ctx)).filter(
      (p) => p.kind !== 'przekierowanie' && !p.path.startsWith('panel/')
    );
    const resolved = resolvePageInList(rawStrona, activePages);
    if (!resolved) {
      return { ok: false, error: `Nie znaleziono strony „${rawStrona}”.` };
    }
    if (resolved.ambiguous) {
      return {
        ok: false,
        needsAnswer: `Znalazłem kilka stron pasujących do „${rawStrona}”. Którą sprawdzić i naprawić?`,
        options: resolved.ambiguous.map((p) => `${p.label} (${p.path})`),
      };
    }
    filterPages = [resolved.page.path];
  }

  const { checkConsistency } = await getConsistency();
  const checkOpts = () => (filterPages.length ? { pages: filterPages } : {});

  let problems = await checkConsistency(ctx, checkOpts());
  if (!problems.length) {
    return {
      ok: true,
      fixed: 0,
      remaining: [],
      changedPages: [],
      summary: rawStrona
        ? `Strona „${filterPages[0]}” jest w pełni spójna z regułami witryny — nie znaleziono żadnych braków.`
        : 'Cała witryna jest w pełni spójna z regułami grup — nie znaleziono żadnych braków.',
    };
  }

  const changedPages = new Set();
  const applied = [];
  const seenFixKeys = new Set();

  for (let pass = 0; pass < 3 && problems.length > 0; pass++) {
    let progress = false;
    const uniqueFixes = new Map();

    for (const pr of problems) {
      if (!pr.fix || !pr.fix.tool || pr.code === 'cel-nie-istnieje') continue;
      const fixKey = `${pr.fix.tool}|${pr.fix.args?.strona || ''}|${pr.fix.args?.grupa || ''}`;
      if (seenFixKeys.has(fixKey) || uniqueFixes.has(fixKey)) continue;
      uniqueFixes.set(fixKey, { fixKey, fix: pr.fix });
    }

    if (!uniqueFixes.size) break;

    for (const { fixKey, fix } of uniqueFixes.values()) {
      seenFixKeys.add(fixKey);
      if (fix.tool === 'dolacz_do_grupy') {
        const res = await runGroupJoin('dolacz_do_grupy', fix.args || {}, ctx);
        if (res?.ok) {
          for (const cp of res.changedPages || []) {
            changedPages.add(cp);
            if (filterPages.length && !filterPages.includes(cp)) {
              filterPages.push(cp);
            }
          }
          applied.push(`${fix.args?.strona || ''} → ${fix.args?.grupa || ''}`);
          if ((res.changedPages || []).length > 0) progress = true;
        }
      }
    }

    problems = await checkConsistency(ctx, checkOpts());
    if (!progress) break;
  }

  const changedList = Array.from(changedPages);
  if (problems.length === 0) {
    return {
      ok: true,
      fixed: applied.length,
      remaining: [],
      changedPages: changedList,
      summary: `Gotowe: naprawiłem spójność (${applied.length} operacji, zaktualizowałem ${changedList.length} stron). Witryna spełnia teraz wszystkie reguły grup. Polecenie „cofnij” przywraca całą naprawę.`,
    };
  }

  return {
    ok: false,
    fixed: applied.length,
    remaining: problems,
    changedPages: changedList,
    summary: `Wykonałem ${applied.length} napraw (${changedList.length} stron), ale pozostało ${problems.length} niespójności wymagających ręcznej decyzji: ${problems
      .slice(0, 3)
      .map((p) => p.message)
      .join(' ')}`,
  };
}
