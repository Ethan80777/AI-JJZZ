import fs from 'node:fs';
import path from 'node:path';
import { ManifestSchema, uid, type Manifest } from '../../shared/model';
export function atomicWrite(file: string, data: string) {
  const temp = file + '.' + uid() + '.tmp';
  try {
    fs.writeFileSync(temp, data, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export function inside(root: string, relative: string): string {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.split('/').includes('..') ||
    /^[a-z]:/i.test(relative)
  )
    throw Error('不安全的相對路徑');
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw Error('路徑超出專案');
  let current = path.resolve(root);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw Error('專案不允許符號連結');
  }
  return result;
}
export function readManifest(file: string): { manifest: Manifest; root: string } {
  if (fs.lstatSync(file).isSymbolicLink()) throw Error('不允許符號連結');
  if (fs.statSync(file).size > 1048576) throw Error('專案檔超過大小限制');
  const manifest = ManifestSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  return { manifest, root: inside(path.dirname(fs.realpathSync(file)), manifest.assets) };
}
