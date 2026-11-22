// Katalog przepisów AI: jedno polecenie klienta = cały łańcuch powiązanych zmian.
// Każdy moduł eksportuje { tools: [{ name, description, parameters }], run(name, args, ctx) }.
// ctx (budowany w editor.js, buildRecipeCtx) — patrz README.md.
import * as inspect from './inspect.js?v=turbo3';
import * as addOffer from './add-offer.js?v=turbo3';
import * as rename from './rename.js?v=turbo3';
import * as contact from './contact.js?v=turbo3';
import * as remove from './remove.js?v=turbo3';
import * as addTile from './add-tile.js?v=turbo3';
import * as analog from './analog.js?v=turbo3';
import * as knowledge from './knowledge.js?v=turbo5';
import * as blocks from './blocks.js?v=turbo5';
import * as pages from './pages.js?v=turbo5';
import * as offerMove from './offer-move.js?v=turbo5';
import * as tiles from './tiles.js?v=turbo5';

export const getSiteKnowledgeText = knowledge.getSiteKnowledgeText;

const MODULES = [inspect, analog, knowledge, blocks, addOffer, pages, rename, contact, offerMove, remove, addTile, tiles];

const UNDO_TOOL = {
  name: 'cofnij_cala_operacje',
  description:
    'Cofa w całości ostatnią operację z przepisu (wszystkie strony, menu i kafelki, które zmieniła). Użyj, gdy klient mówi „cofnij”, „nie tak”, „przywróć”.',
  parameters: { type: 'object', properties: {} },
};

export const RECIPE_TOOLS = [...MODULES.flatMap((m) => m.tools || []), UNDO_TOOL];

const TOOL_OWNER = new Map();
for (const m of MODULES) for (const t of m.tools || []) TOOL_OWNER.set(t.name, m);

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
  }
  return result;
}
