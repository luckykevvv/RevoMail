import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeSqliteDatabase } from "../backend/src/config/sqlite.js";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const databaseUrl = process.env.DATABASE_URL || "file:./data/revomail.db";
const databasePath = initializeSqliteDatabase({
  databaseUrl,
  migrationsPath: path.join(projectRoot, "database", "migrations"),
  cwd: projectRoot
});

console.log(`SQLite migrations are up to date at ${databasePath}.`);
