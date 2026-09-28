import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4173),
  APP_BASE_URL: z.string().url().default("http://localhost:4173"),
  DATABASE_URL: z.string().startsWith("file:").default("file:./data/revomail.db"),
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "must be a base64-encoded 32-byte key"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_AUTH_URL: optionalUrl.default("https://accounts.google.com/o/oauth2/v2/auth"),
  GOOGLE_TOKEN_URL: optionalUrl.default("https://oauth2.googleapis.com/token"),
  GOOGLE_USERINFO_URL: optionalUrl.default("https://openidconnect.googleapis.com/v1/userinfo"),
  GOOGLE_REVOKE_URL: optionalUrl.default("https://oauth2.googleapis.com/revoke")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && !value.APP_BASE_URL.startsWith("https://")) {
    context.addIssue({ code: "custom", path: ["APP_BASE_URL"], message: "must use HTTPS in production" });
  }
});

export function loadConfig(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${names}`);
  }
  return result.data;
}
