// Deletes all data and re-seeds the database (the local file, or DATABASE_URL if set). `--clean` seeds inventory only (no demo bookings).
import '../env.js';
const { client, initSchema, seedIfEmpty } = await import('../db.js');

const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map(r => r.name);
await client.executeMultiple(['PRAGMA foreign_keys = OFF', ...tables.map(t => `DROP TABLE IF EXISTS "${t}"`), 'PRAGMA foreign_keys = ON'].join(';\n'));
await initSchema();
await seedIfEmpty({ demo: !process.argv.includes('--clean') });
console.log('Database reset complete.');
