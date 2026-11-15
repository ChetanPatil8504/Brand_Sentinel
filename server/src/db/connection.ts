import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..', '..');

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) {
    const customPath = path.isAbsolute(process.env.DATABASE_PATH)
      ? process.env.DATABASE_PATH
      : path.resolve(process.cwd(), process.env.DATABASE_PATH);

    const customDir = path.dirname(customPath);
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }

    // Auto-seed persistent volume on initial mount if database does not exist or is empty
    const baselineCandidates = [
      path.resolve(serverDir, 'brand_sentinel.db'),
      path.resolve(process.cwd(), 'brand_sentinel.db'),
      path.resolve(process.cwd(), 'server', 'brand_sentinel.db')
    ];

    if (!fs.existsSync(customPath) || fs.statSync(customPath).size < 10000) {
      for (const candidate of baselineCandidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).size > 10000 && candidate !== customPath) {
          try {
            fs.copyFileSync(candidate, customPath);
            console.log(`[Database] Initialized persistent volume DB from baseline: ${candidate} -> ${customPath}`);
            break;
          } catch (e) {
            console.warn(`[Database] Could not copy baseline DB to ${customPath}:`, e);
          }
        }
      }
    }

    return customPath;
  }

  const serverDbPath = path.resolve(serverDir, 'brand_sentinel.db');
  const cwdDbPath = path.resolve(process.cwd(), 'brand_sentinel.db');

  if (fs.existsSync(serverDbPath) && fs.statSync(serverDbPath).size > 10000) {
    return serverDbPath;
  }
  if (fs.existsSync(cwdDbPath) && fs.statSync(cwdDbPath).size > 10000) {
    return cwdDbPath;
  }
  return serverDbPath;
}

const dbPath = resolveDbPath();

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema
export function initDatabase() {
  const possiblePaths = [
    path.resolve(process.cwd(), 'src', 'db', 'schema.sql'),
    path.resolve(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
    path.resolve(process.cwd(), 'dist', 'db', 'schema.sql'),
    path.resolve(process.cwd(), 'schema.sql')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const schemaSql = fs.readFileSync(p, 'utf8');
      db.exec(schemaSql);
      break;
    }
  }
}

initDatabase();

export default db;
