import fs from 'node:fs';
import path from 'node:path';
const pending: string[] = [];
export function queueOpenRequest(file: string) {
  if (file.endsWith('.aidrama')) pending.push(path.resolve(file));
}
export async function drainOpenRequests(open: (file: string) => Promise<void>) {
  const seen = new Set<string>();
  while (pending.length) {
    const f = pending.shift()!;
    const canonical = fs.existsSync(f) ? fs.realpathSync(f) : f;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      await open(canonical);
    }
  }
}
