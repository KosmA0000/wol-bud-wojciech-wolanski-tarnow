// Katalog przepisów AI: jedno polecenie klienta = cały łańcuch powiązanych zmian.
// Każdy moduł eksportuje { tools: [{ name, description, parameters }], run(name, args, ctx) }.
// ctx (budowany w editor.js, buildRecipeCtx) — patrz README.md.
import * as inspect from './inspect.js?v=turbo25';
import * as addOffer from './add-offer.js?v=turbo25';
import * as rename from './rename.js?v=turbo25';
import * as contact from './contact.js?v=turbo25';
import * as remove from './remove.js?v=turbo25';
import * as addTile from './add-tile.js?v=turbo25';
import * as analog from './analog.js?v=turbo25';
import * as knowledge from './knowledge.js?v=turbo25';
import * as blocks from './blocks.js?v=turbo25';
import * as pages from './pages.js?v=turbo25';
import * as offerMove from './offer-move.js?v=turbo25';
import * as tiles from './tiles.js?v=turbo25';
import * as groupJoin from './group-join.js?v=turbo25';
import * as repair from './repair.js?v=turbo25';
import { checkConsistency } from './consistency.js?v=turbo25';

export const getSiteKnowledgeText = knowledge.getSiteKnowledgeText;

const MODULES = [inspect, analog, knowledge, blocks, addOffer, pages, rename, contact, offerMove, remove, addTile, tiles, groupJoin, repair];

const UNDO_TOOL = {
  name: 'cofnij_cala_operacje',
  description:
    'Cofa w całości ostatnią operację z przepisu (wszystkie strony, menu i kafelki, które zmieniła). Użyj, gdy klient mówi „cofnij”, „nie tak”, „przywróć”.',
  parameters: { type: 'object', properties: {} },
};

// Ta sama nazwa narzędzia w kilku modułach: wygrywa moduł późniejszy w MODULES (np. blocks.js przejmuje dodaj_blok z knowledge.js).
const TOOL_OWNER = new Map();
const TOOL_DECL = new Map();
for (const m of MODULES) for (const t of m.tools || []) {
  TOOL_OWNER.set(t.name, m);
  TOOL_DECL.delete(t.name);
  TOOL_DECL.set(t.name, t);
}

export const RECIPE_TOOLS = [...TOOL_DECL.values(), UNDO_TOOL];

export function isRecipeTool(name) {
  return name === UNDO_TOOL.name || TOOL_OWNER.has(name);
}

// Stos operacji do cofania: [{ name, pages: Map(path -> {existed, html}), globals }]
const undoStack = [];

function recordingCtx(ctx, op) {
  const remember = async (path) => {
    if (op.pages.has(path)) return;
    const html = await ctx.readPage(path);
    op.pages.set(path, { existed: Boolean(html), html: html || '' });
  };
  return {
    ...ctx,
    writePage: async (path, html, opts) => {
      await remember(path);
      return ctx.writePage(path, html, opts);
    },
    deletePage: async (path) => {
      await remember(path);
      return ctx.deletePage(path);
    },
    setGlobals: async (g) => {
      if (!op.globals) op.globals = ctx.getGlobals();
      return ctx.setGlobals(g);
    },
  };
}

async function undoLast(ctx) {
  const op = undoStack.pop();
  if (!op) return { ok: false, error: 'Nie ma operacji do cofnięcia.' };
  const restored = [];
  for (const [path, prev] of op.pages) {
    if (prev.existed) await ctx.writePage(path, prev.html);
    else await ctx.deletePage(path);
    restored.push(path);
  }
  if (op.globals) await ctx.setGlobals(op.globals);
  knowledge.invalidateKnowledge();
  await ctx.reloadCurrent?.();
  return { ok: true, undone: op.name, restoredPages: restored, restoredMenu: Boolean(op.globals) };
}

export async function runRecipe(name, args, ctx) {
  if (name === UNDO_TOOL.name) return undoLast(ctx);
  const mod = TOOL_OWNER.get(name);
  if (!mod) return { ok: false, error: `Nieznany przepis: ${name}` };
  const op = { name, pages: new Map(), globals: null };
  let result;
  try {
    result = await mod.run(name, args || {}, recordingCtx(ctx, op));
  } catch (e) {
    result = { ok: false, error: e?.message || String(e) };
  }
  if (op.pages.size || op.globals) {
    knowledge.invalidateKnowledge();
    undoStack.push(op);
    if (undoStack.length > 20) undoStack.shift();
    await ctx.reloadCurrent?.();
    // Spójność: wynik musi spełniać reguły grup strony (rodzaj, budowa i obecność celu każdego elementu grupy).
    if (result && typeof result === 'object') {
      try {
        const changed = [...op.pages.keys()];
        result.niespojnosci = await checkConsistency(ctx, { pages: changed });
        if (result.niespojnosci.length) {
          result.uwaga =
            'Wynik łamie reguły strony: ' +
            result.niespojnosci.slice(0, 5).map((p) => p.message).join(' ') +
            (result.niespojnosci.length > 5 ? ` (i ${result.niespojnosci.length - 5} więcej)` : '') +
            ' Napraw przed zakończeniem (fix).';
        }
      } catch (e) {
        result.niespojnosci = [];
        result.uwagaSprawdzenia = `Nie udało się sprawdzić spójności: ${e?.message || e}`;
      }
    }
  }
  return result;
}
