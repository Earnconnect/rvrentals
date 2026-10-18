// Copies everything from a local SQLite database file (default: data/riseflorals.db) into the database at DATABASE_URL,
// e.g. a new Turso database for the Vercel deployment. Also copies any photos in data/uploads.
//   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run db:copy [-- path/to/file.db] [-- --force]
// --force deletes whatever is already in the target database first.
import '../env.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

if (!process.env.DATABASE_URL && !process.env.TURSO_DATABASE_URL) {
  console.error('Set DATABASE_URL (and DATABASE_AUTH_TOKEN) to the database you want to copy into.');
  process.exit(1);
}
const { db, client, initSchema, markChatRepliesEmailed, DB_FILE, UPLOAD_DIR } = await import('../db.js');
const force = process.argv.includes('--force');
const source = process.argv.slice(2).find(a => !a.startsWith('--')) || DB_FILE;
if (!fs.existsSync(source)) { console.error(`Source database not found: ${source}`); process.exit(1); }

await initSchema();
// Parents before children, so foreign keys always point at rows that exist.
const ORDER = ['campgrounds', 'lots', 'rvs', 'sales', 'users', 'sessions', 'settings', 'runtime', 'bookings', 'inquiries', 'messages',
  'testimonials', 'chats', 'chat_messages', 'email_log', 'uploads'];

const counts = await Promise.all(['rvs', 'bookings', 'users'].map(async t => (await db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get()).c));
if (counts.some(Boolean)) {
  if (!force) { console.error('The target database already has data. Run again with --force to replace it.'); process.exit(1); }
  await client.executeMultiple(['PRAGMA foreign_keys = OFF', ...[...ORDER].reverse().map(t => `DELETE FROM ${t}`), 'PRAGMA foreign_keys = ON'].join(';\n'));
}

const local = new DatabaseSync(source, { readOnly: true });
const localTables = new Set(local.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
for (const table of ORDER.filter(t => localTables.has(t))) {
  const target = new Set((await db.prepare(`PRAGMA table_info(${table})`).all()).map(c => c.name));
  const cols = local.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name).filter(c => target.has(c));
  const rows = local.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  for (let i = 0; i < rows.length; i += 200) {
    await client.batch(rows.slice(i, i + 200).map(r => ({ sql, args: cols.map(c => r[c] ?? null) })), 'write');
  }
  console.log(`  ${table}: ${rows.length} row${rows.length === 1 ? '' : 's'}`);
}
await markChatRepliesEmailed();

// Photos uploaded before the move were saved as files. Store them in the database under the same URL.
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const files = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).filter(f => TYPES[path.extname(f).slice(1).toLowerCase()]) : [];
for (const f of files) {
  await db.prepare('INSERT OR REPLACE INTO uploads (name, type, data) VALUES (?, ?, ?)')
    .run(f, TYPES[path.extname(f).slice(1).toLowerCase()], fs.readFileSync(path.join(UPLOAD_DIR, f)));
}
if (files.length) console.log(`  photos: ${files.length}`);
console.log('Copy complete.');
