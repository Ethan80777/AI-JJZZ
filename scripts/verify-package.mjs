import { normalizeArchivePath, nativeArchivePath } from './package-path.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
try {
  const asar = require('@electron/asar');
  const root = process.argv[2] || 'release/linux-unpacked';
  const resources = fs.existsSync(path.join(root, 'Contents/Resources'))
    ? path.join(root, 'Contents/Resources') : path.join(root, 'resources');
  const archive = path.join(resources, 'app.asar');
  const files = asar.listPackage(archive).map(normalizeArchivePath);
  for (const file of ['/out/main/index.js', '/out/preload/index.js', '/out/renderer/index.html']) {
    assert(files.includes(file), file + ' missing; archive entries: ' + files.filter(f => f.includes('out')).slice(0, 12).join(', '));
    assert(asar.extractFile(archive, nativeArchivePath(file, path)).equals(fs.readFileSync(file.slice(1))), file + ' differs from current build');
  }
  assert(fs.existsSync(path.join(resources, 'app.asar.unpacked/node_modules/better-sqlite3/prebuilds')), 'SQLite binaries missing');
  assert(fs.existsSync(path.join(resources, 'app.asar.unpacked/node_modules/ffprobe-static/bin')), 'ffprobe binaries missing');
  console.log('Verified main, preload, renderer, SQLite and ffprobe in ' + root);
} catch (error) {
  const message = String(error.message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.error('::error title=Package verification::' + message);
  process.exitCode = 1;
}
