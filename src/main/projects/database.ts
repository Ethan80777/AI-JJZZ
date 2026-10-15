import Database from 'better-sqlite3';
import { SnapshotSchema, type ProjectSnapshot } from '../../shared/model';
export const collections = [
  'revisions',
  'assets',
  'reviews',
  'localeVariants',
  'localeHistory',
  'toolBindings',
  'episodes',
  'scenes',
  'shots',
  'shotGroups',
  'characters',
  'costs',
  'releases',
  'metrics',
  'toolCatalog',
] as const;
export function initialize(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  for (const c of collections)
    db.exec(`CREATE TABLE IF NOT EXISTS ${c} (ordinal INTEGER PRIMARY KEY, payload TEXT NOT NULL)`);
  db.pragma('user_version = 1');
}
export function writeSnapshot(db: Database.Database, s: ProjectSnapshot) {
  SnapshotSchema.parse(s);
  for (const table of ['toolCatalog', 'localeHistory'])
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (ordinal INTEGER PRIMARY KEY, payload TEXT NOT NULL)`,
    );
  db.transaction(() => {
    const put = db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)');
    for (const key of ['project', 'template', 'canvas'] as const)
      put.run(key, JSON.stringify(s[key]));
    for (const c of collections) {
      db.prepare(`DELETE FROM ${c}`).run();
      const insert = db.prepare(`INSERT INTO ${c} VALUES (?,?)`);
      s[c].forEach((v, i) => insert.run(i, JSON.stringify(v)));
    }
  })();
}
export function readSnapshot(db: Database.Database): ProjectSnapshot {
  const data: Record<string, unknown> = {};
  for (const row of db.prepare('SELECT * FROM meta').all() as { key: string; value: string }[])
    data[row.key] = JSON.parse(row.value);
  for (const c of collections) {
    if (
      ['toolCatalog', 'localeHistory'].includes(c) &&
      !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(c)
    ) {
      data[c] = [];
      continue;
    }
    data[c] = (
      db.prepare(`SELECT payload FROM ${c} ORDER BY ordinal`).all() as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  return SnapshotSchema.parse(data);
}
