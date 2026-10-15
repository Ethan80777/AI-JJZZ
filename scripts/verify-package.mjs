import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const asar=require('@electron/asar');
const root=process.argv[2]||'release/linux-unpacked';
const resources=fs.existsSync(path.join(root,'Contents/Resources'))?path.join(root,'Contents/Resources'):path.join(root,'resources');
const files=asar.listPackage(path.join(resources,'app.asar')).map(name=>name.replaceAll('\\','/'));
for(const file of ['/out/main/index.js','/out/preload/index.js','/out/renderer/index.html']){assert(files.includes(file),file+' missing');assert(asar.extractFile(path.join(resources,'app.asar'),file.slice(1)).equals(fs.readFileSync(file.slice(1))),file+' differs from current build');}
assert(fs.existsSync(path.join(resources,'app.asar.unpacked/node_modules/better-sqlite3/prebuilds')),'SQLite binaries missing');
assert(fs.existsSync(path.join(resources,'app.asar.unpacked/node_modules/ffprobe-static/bin')),'ffprobe binaries missing');
console.log('Verified main, preload, renderer, SQLite and ffprobe in '+root);
