export const DEFAULT_PREFERENCES = Object.freeze({
  language: "en", theme: "system", reducedMotion: false, defaultAiModel: null,
  replyLength: "medium", speechLanguage: "auto", voiceEnabled: false, voiceAutoPlay: true
});

// Only one request is in flight. New edits remain visible while older saves complete.
export class PreferenceWriter {
  constructor(save, changed) { this.save = save; this.changed = changed; this.pending = {}; this.saving = false; this.generation = 0; }
  reset() { this.generation++; this.pending = {}; this.saving = false; }
  update(patch) { Object.assign(this.pending, patch); return this.flush(); }
  async flush() {
    if (this.saving || !Object.keys(this.pending).length) return;
    const generation = this.generation;
    this.saving = true;
    this.changed("saving");
    while (Object.keys(this.pending).length) {
      const patch = this.pending; this.pending = {};
      try {
        const result = await this.save(patch);
        if (generation !== this.generation) return;
        this.changed("saving", { ...result.settings, ...this.pending });
      } catch {
        if (generation !== this.generation) return;
        this.pending = { ...patch, ...this.pending }; this.saving = false;
        this.changed("error"); return;
      }
    }
    this.saving = false; this.changed("saved");
  }
}
