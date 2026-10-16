import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';

// Execute production SQL and migrations with D1's atomic batch semantics.
class D1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys = ON'); }
  prepare(sql) {
    const db = this;
    return { args: [], bind(...args) { this.args = args; return this; },
      async first() { return db.sqlite.prepare(sql).get(...this.args) ?? null; },
      async all() { return { results: db.sqlite.prepare(sql).all(...this.args) }; },
      async run() { const result = db.sqlite.prepare(sql).run(...this.args); return { meta: { changes: Number(result.changes) } }; } };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (err) { this.sqlite.exec('ROLLBACK'); throw err; }
  }
}
export async function createTestDatabase() {
  const db = new D1();
  try {
    for (const file of (await readdir('packages/worker/migrations')).sort()) db.sqlite.exec(await readFile(`packages/worker/migrations/${file}`, 'utf8'));
    return db;
  } catch (err) { db.sqlite.close(); throw err; }
}
