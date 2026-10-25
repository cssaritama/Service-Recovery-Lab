import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function database(filename = ':memory:') {
  const raw = new DatabaseSync(filename);
  raw.exec('PRAGMA busy_timeout=5000;');
  raw.exec('CREATE TABLE IF NOT EXISTS test_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter(f => f.endsWith('.sql'))
    .sort()) {
    if (!raw.prepare('SELECT name FROM test_migrations WHERE name=?').get(name)) {
      raw.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
      raw.prepare('INSERT INTO test_migrations VALUES (?)').run(name);
    }
  }
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return raw.prepare(sql).get(...values) || null;
        },
        async run() {
          const r = raw.prepare(sql).run(...values);
          return { meta: { changes: Number(r.changes) } };
        },
      };
    },
  };
  return { db, raw, close: () => raw.close() };
}
