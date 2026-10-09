import { chunkSpeech } from "./commands.js";

export class VoicePlayback {
  constructor({ fetchSpeech, changed, AudioClass = globalThis.Audio, urlApi = globalThis.URL }) {
    Object.assign(this, { fetchSpeech, changed, AudioClass, urlApi });
    this.generation = 0;
    this.muted = false;
  }

  emit(status, details = {}) { this.changed({ status, muted: this.muted, ...details }); }

  cleanupAudio() {
    const settle = this.pendingResolve; this.pendingResolve = null;
    if (this.audio) { this.audio.pause(); this.audio.onended = this.audio.onerror = null; this.audio = null; }
    if (this.objectUrl) { this.urlApi.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    settle?.();
  }

  stop({ announce = true } = {}) {
    this.generation += 1;
    this.abort?.abort(); this.abort = null;
    this.cleanupAudio();
    if (announce) this.emit("stopped");
  }

  async speak(text, language = "en") {
    this.stop({ announce: false });
    this.last = { text, language };
    const generation = this.generation;
    const chunks = chunkSpeech(text);
    if (!chunks.length) return;
    this.emit("generating", { current: 0, total: chunks.length, error: "" });
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (generation !== this.generation) return;
        this.abort = new AbortController();
        const blob = await this.fetchSpeech(chunks[index], language, this.abort.signal);
        if (generation !== this.generation) return;
        this.abort = null;
        await this.playBlob(blob, generation, index + 1, chunks.length);
      }
      if (generation === this.generation) this.emit("complete", { current: chunks.length, total: chunks.length });
    } catch (error) {
      if (generation === this.generation && error.name !== "AbortError") this.emit("error", { error: error.message });
    }
  }

  playBlob(blob, generation, current, total) {
    return new Promise((resolve, reject) => {
      this.cleanupAudio();
      this.objectUrl = this.urlApi.createObjectURL(blob);
      const audio = this.audio = new this.AudioClass(this.objectUrl);
      this.pendingResolve = resolve;
      audio.muted = this.muted;
      audio.onended = () => this.cleanupAudio();
      audio.onerror = () => { this.pendingResolve = null; this.cleanupAudio(); reject(new Error("The generated speech could not be played.")); };
      this.emit("speaking", { current, total, error: "" });
      Promise.resolve(audio.play()).catch(error => { this.cleanupAudio(); reject(error); });
      if (generation !== this.generation) { this.cleanupAudio(); resolve(); }
    });
  }

  pause() { if (this.audio && !this.audio.paused) { this.audio.pause(); this.emit("paused"); } }
  resume() { if (this.audio?.paused) { void this.audio.play(); this.emit("speaking"); } }
  replay() { if (this.last) return this.speak(this.last.text, this.last.language); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.audio) this.audio.muted = this.muted;
    this.emit(this.audio && !this.audio.paused ? "speaking" : "stopped");
    return this.muted;
  }
}
