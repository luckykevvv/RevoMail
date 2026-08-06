import { describe, expect, it } from "vitest";
import { shouldOverrideDotenv } from "../../src/config/dotenv.js";

describe("desktop environment precedence", () => {
  it("preserves the documented .env override for normal server starts", () => {
    expect(shouldOverrideDotenv({})).toBe(true);
  });

  it("allows validated desktop launch settings to override .env host and port", () => {
    expect(shouldOverrideDotenv({ REVOMAIL_DESKTOP: "1" })).toBe(false);
  });
});
