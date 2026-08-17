import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSqliteDatabase, openSqliteDatabase, sqlitePath } from "../../src/config/sqlite.js";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("SQLite database initialization", () => {
  it("applies ordered migrations once and opens the local database", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "revomail-migration-"));
    temporaryDirectories.push(directory);
    const databaseUrl = `file:${path.join(directory, "nested", "revomail.db").replaceAll("\\", "/")}`;
    const options = { databaseUrl, migrationsPath: path.resolve("database/migrations") };
    const firstPath = initializeSqliteDatabase(options);
    const secondPath = initializeSqliteDatabase(options);
    expect(secondPath).toBe(firstPath);
    const database = openSqliteDatabase(databaseUrl);
    expect(database.prepare("PRAGMA user_version").get().user_version).toBe(2);
    expect(database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'`).get().name).toBe("User");
    expect(database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Job'`).get().name).toBe("Job");
    database.close();
  });

  it("rejects non-file database URLs", () => {
    expect(() => sqlitePath("postgresql://localhost/revomail")).toThrow("must start with file:");
  });
});
