export function shouldOverrideDotenv(environment = process.env) {
  return environment.REVOMAIL_DESKTOP !== "1";
}
