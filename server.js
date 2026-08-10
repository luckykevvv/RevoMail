import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./backend/src/app.js";
import { shouldOverrideDotenv } from "./backend/src/config/dotenv.js";
import { loadConfig } from "./backend/src/config/env.js";
import { initializeSqliteDatabase, openSqliteDatabase } from "./backend/src/config/sqlite.js";
import { createProviders } from "./backend/src/providers/oauth/provider.js";
import { SqliteAuthRepository } from "./backend/src/repositories/sqlite-auth-repository.js";
import { AuthService } from "./backend/src/services/auth-service.js";
import { createCipher } from "./backend/src/utils/security.js";

dotenv.config({ override: shouldOverrideDotenv() });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
initializeSqliteDatabase({ databaseUrl: config.DATABASE_URL, migrationsPath: path.join(__dirname, "database", "migrations"), cwd: __dirname });
const database = openSqliteDatabase(config.DATABASE_URL, __dirname);
const repository = new SqliteAuthRepository(database);
const authService = new AuthService({ repository, providers: createProviders(config), cipher: createCipher(config.TOKEN_ENCRYPTION_KEY) });
const app = createApp({ authService, config, distPath: path.join(__dirname, "dist"), healthCheck: () => database.prepare("SELECT 1").get() });

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`RevoMail is running at ${config.APP_BASE_URL}`);
});

async function shutdown() {
  server.close(async () => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
