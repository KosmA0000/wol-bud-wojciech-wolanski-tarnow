// Emulacja api.php: publikacja paczki plików do piaskownicy (nigdy do źródła strony).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, sendJson, handleMethod, readBody, parseJsonObject } from './http-util.js';
import { requireCsrf } from './api-auth.js';
import { preparePublish, MANIFEST_PATH } from './publish-prepare.js';
import { ensureOriginal, createSnapshot } from './backup-store.js';
import { writeFileAtomic, deleteFileSafe } from './fs-write.js';

export const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

/** @param {string} siteRoot @returns {string|null} */
function currentRevision(siteRoot) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(siteRoot, ...MANIFEST_PATH.split('/')), 'utf8'));
    return typeof m?.revision === 'string' && m.revision !== '' ? m.revision : null;
  } catch {
    return null;
  }
}

/**
 * Zapisuje przygotowaną paczkę synchronicznie (jedno żądanie naraz, bez przeplotu w pętli zdarzeń).
 * @param {ReturnType<typeof preparePublish>} plan
 * @param {{ siteRoot: string, privateDir: string }} ctx
 */
export function applyPublish(plan, ctx) {
  const current = currentRevision(ctx.siteRoot);
  if (plan.expectedRevision !== null && current !== null && current !== plan.expectedRevision) {
    throw new HttpError(409, 'Na stronie opublikowano nowsze zmiany z innego okna. Odśwież panel przed publikacją.');
  }
  ensureOriginal(ctx.siteRoot, ctx.privateDir);
  const backup = createSnapshot(ctx.siteRoot, ctx.privateDir, 'auto', 'Automatyczna kopia przed publikacją');
  let written = 0;
  for (const f of plan.files) {
    writeFileAtomic(ctx.siteRoot, f.path, f.bytes);
    written += 1;
  }
  let deleted = 0;
  for (const rel of plan.deletions) {
    if (deleteFileSafe(ctx.siteRoot, rel)) deleted += 1;
  }
  if (plan.manifest) {
    writeFileAtomic(ctx.siteRoot, MANIFEST_PATH, plan.manifest);
    written += 1;
  }
  return { revision: plan.nextRevision, written, deleted, backupId: backup.id };
}

/**
 * POST /panel/api.php
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ siteRoot: string, privateDir: string, session: { csrfToken: string }, log: (e: string, d?: object) => void }} ctx
 */
export async function handlePublish(req, res, ctx) {
  if (handleMethod(req, res, ['POST'], 'POST')) return;
  requireCsrf(req, ctx.session);
  const body = await readBody(req, MAX_REQUEST_BYTES, 'Żądanie przekracza maksymalny limit rozmiaru (25 MB).');
  const plan = preparePublish(parseJsonObject(body, 'Oczekiwano obiektu JSON z danymi publikacji.'));
  const result = applyPublish(plan, ctx);
  ctx.log('publish_ok', { ...result, files: plan.files.map((f) => f.path), deletions: plan.deletions });
  sendJson(res, 200, result);
}
