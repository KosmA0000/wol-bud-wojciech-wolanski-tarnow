// Emulacja backups.php: lista, kopia ręczna i przywracanie kopii w piaskownicy. Celowo bez usuwania kopii.
import { HttpError, sendJson, handleMethod, readBody, parseJsonObject } from './http-util.js';
import { requireCsrf } from './api-auth.js';
import { ensureOriginal, createSnapshot, listBackups } from './backup-store.js';
import { restoreSnapshot } from './backup-restore.js';

/**
 * GET → {backups}; POST {action:'create', label?} | {action:'restore', id}.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ siteRoot: string, privateDir: string, session: { csrfToken: string }, log: (e: string, d?: object) => void }} ctx
 */
export async function handleBackups(req, res, ctx) {
  if (handleMethod(req, res, ['GET', 'POST'], 'GET lub POST')) return;
  if (req.method === 'GET') {
    ensureOriginal(ctx.siteRoot, ctx.privateDir);
    sendJson(res, 200, { backups: listBackups(ctx.privateDir) });
    return;
  }
  requireCsrf(req, ctx.session);
  const body = parseJsonObject(await readBody(req, 32 * 1024, 'Żądanie jest zbyt duże.'),
    'Oczekiwano obiektu JSON z polem action.');
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (action === 'create') {
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'Kopia ręczna';
    const created = createSnapshot(ctx.siteRoot, ctx.privateDir, 'manual', label);
    ctx.log('backup_created', { id: created.id });
    sendJson(res, 200, { created, backups: listBackups(ctx.privateDir) });
    return;
  }
  if (action === 'restore') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) throw new HttpError(400, 'Podaj identyfikator kopii zapasowej (pole id) do przywrócenia.');
    const result = restoreSnapshot(ctx.siteRoot, ctx.privateDir, id);
    ctx.log('backup_restored', result);
    sendJson(res, 200, { ...result, backups: listBackups(ctx.privateDir) });
    return;
  }
  throw new HttpError(400, 'Nieobsługiwana akcja. Dozwolone wartości: create, restore.');
}
