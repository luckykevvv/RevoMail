import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./backend/src/app.js";
import { loadConfig } from "./backend/src/config/env.js";
import { createProviders } from "./backend/src/providers/oauth/provider.js";
import { PrismaAuthRepository } from "./backend/src/repositories/prisma-auth-repository.js";
import { AuthService } from "./backend/src/services/auth-service.js";
import { createCipher } from "./backend/src/utils/security.js";

dotenv.config({ override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const repository = new PrismaAuthRepository(prisma);
const authService = new AuthService({ repository, providers: createProviders(config), cipher: createCipher(config.TOKEN_ENCRYPTION_KEY) });
const app = createApp({ authService, config, distPath: path.join(__dirname, "dist"), healthCheck: () => prisma.$queryRaw`SELECT 1` });

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`RevoMail is running at ${config.APP_BASE_URL}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
