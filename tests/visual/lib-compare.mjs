import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export async function comparePngBuffers(baseBuf, currBuf, diffOutPath = null) {
  if (Buffer.isBuffer(baseBuf) && Buffer.isBuffer(currBuf) && baseBuf.equals(currBuf)) {
    return { ok: true, diffPixels: 0, reason: 'OK (0 px)' };
  }
  const basePng = PNG.sync.read(baseBuf);
  const currPng = PNG.sync.read(currBuf);
  if (basePng.width !== currPng.width || basePng.height !== currPng.height) {
    return {
      ok: false,
      diffPixels: -1,
      reason: `Różne wymiary: baza ${basePng.width}x${basePng.height}, aktualny ${currPng.width}x${currPng.height}`,
    };
  }
  const diff = new PNG({ width: basePng.width, height: basePng.height });
  const diffPixels = pixelmatch(basePng.data, currPng.data, diff.data, basePng.width, basePng.height, {
    threshold: 0.02,
    includeAA: true,
  });
  if (diffPixels > 0 && diffOutPath) {
    await mkdir(dirname(diffOutPath), { recursive: true });
    await writeFile(diffOutPath, PNG.sync.write(diff));
  }
  return {
    ok: diffPixels === 0,
    diffPixels,
    width: basePng.width,
    height: basePng.height,
    reason: diffPixels === 0 ? 'OK (0 px)' : `Różnica ${diffPixels} px`,
  };
}

export async function comparePngFiles(basePath, currPath, diffOutPath = null) {
  const [a, b] = await Promise.all([readFile(basePath), readFile(currPath)]);
  return comparePngBuffers(a, b, diffOutPath);
}
