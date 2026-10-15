import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {normalizeArchivePath} from './package-path.mjs';
test('normalizes native Windows and POSIX archive paths to the same entry',()=>{
 const expected='/out/main/index.js';
 assert.equal(normalizeArchivePath(path.win32.join('/','out','main','index.js')),expected);
 assert.equal(normalizeArchivePath(path.posix.join('/','out','main','index.js')),expected);
});
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {nativeArchivePath} from './package-path.mjs';
test('ASAR Windows lookup receives native separators rather than display separators',()=>{
 const require=createRequire(import.meta.url);
 const file=require.resolve('@electron/asar/lib/filesystem');
 const dependencyRequire=createRequire(file);
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>id==='path'?path.win32:dependencyRequire(id),Buffer,console});
 const archive=new module.exports.Filesystem('C:\\app');
 archive.setHeader({files:{out:{files:{main:{files:{'index.js':{size:3,offset:'0'}}}}}}},0);
 assert.equal(archive.getFile(nativeArchivePath('/out/main/index.js',path.win32)).size,3);
});
