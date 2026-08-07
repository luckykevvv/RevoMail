import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export function sqlitePath(databaseUrl, cwd = process.cwd()) {
  if (!databaseUrl.startsWith("file:")) throw new Error("SQLite DATABASE_URL must start with file:.");
  if (databaseUrl.startsWith("file://")) return fileURLToPath(databaseUrl);
  const value = decodeURIComponent(databaseUrl.slice("file:".length));
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

export function initializeSqliteDatabase({ databaseUrl, migrationsPath, cwd = process.cwd() }) {
  const databasePath = sqlitePath(databaseUrl, cwd);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const currentVersion = database.prepare("PRAGMA user_version").get().user_version;
    const migrations = fs.readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(migrationsPath, entry.name, "migration.sql"))
      .filter((migrationPath) => fs.existsSync(migrationPath))
      .sort();
    migrations.forEach((migrationPath, index) => {
      const version = index + 1;
      if (version <= currentVersion) return;
      const sql = fs.readFileSync(migrationPath, "utf8");
      database.exec("BEGIN IMMEDIATE");
      try {
        database.exec(sql);
        database.exec(`PRAGMA user_version = ${version}`);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    });
  } finally {
    database.close();
  }
  return databasePath;
}

export function openSqliteDatabase(databaseUrl, cwd = process.cwd()) {
  const database = new DatabaseSync(sqlitePath(databaseUrl, cwd));
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  return database;
}
