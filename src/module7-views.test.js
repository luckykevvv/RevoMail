import { describe, expect, it } from "vitest";
import { preferencesView } from "./module7-views.js";

describe("settings view", () => {
  it("names fieldsets from section titles rendered inside the cards", () => {
    const html = preferencesView({
      preferences: {
        theme: "system", reducedMotion: false, defaultAiModel: "fixture-model",
        replyLength: "medium", voiceEnabled: true, voiceAutoPlay: true, speechLanguage: "en-AU",
      },
      models: ["fixture-model"], status: "saved", error: false, accounts: "",
      escape: value => String(value), t: value => value,
    });
    expect(html.match(/<fieldset class="setting-group"/g)).toHaveLength(3);
    for (const [key, heading] of [["general", "General"], ["ai", "AI preferences"], ["voice", "Voice"]]) {
      expect(html).toContain(`aria-labelledby="setting-group-${key}"`);
      expect(html).toContain(`<h2 id="setting-group-${key}">${heading}</h2>`);
    }
    expect(html).toContain('class="setting-row setting-toggle-row"');
  });
});
