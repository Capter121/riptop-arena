import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createArenaHttpServer } from '../server/http-server.mjs';
import { openDatabase } from '../server/storage/database.mjs';
import { migrateDatabase } from '../server/storage/migrate.mjs';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4182);
const siteRoot = fileURLToPath(new URL('../dist/site/', import.meta.url));
await stat(new URL('../dist/site/index.html', import.meta.url));

const database = openDatabase(':memory:');
await migrateDatabase(database);
database.prepare('INSERT INTO invites (code, max_uses) VALUES (?, ?)').run('E2E-FRIENDS', 3);

const server = createArenaHttpServer({ database, production: true, siteRoot });
server.listen(port, host, () => console.log(`Challenge E2E server listening on http://${host}:${port}`));

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
