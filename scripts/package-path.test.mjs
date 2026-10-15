import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {normalizeArchivePath} from './package-path.mjs';
test('normalizes native Windows and POSIX archive paths to the same entry',()=>{
 const expected='/out/main/index.js';
 assert.equal(normalizeArchivePath(path.win32.join('/','out','main','index.js')),expected);
 assert.equal(normalizeArchivePath(path.posix.join('/','out','main','index.js')),expected);
});
