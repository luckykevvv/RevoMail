import { expect, it, vi } from "vitest";
import { VoicePlayback } from "./playback.js";

class AudioFixture {
  constructor() { this.paused = true; }
  play() { this.paused = false; queueMicrotask(() => this.onended?.()); return Promise.resolve(); }
  pause() { this.paused = true; }
}

it("plays speech chunks, revokes URLs, and remembers replay input", async () => {
  const changed = vi.fn();
  const fetchSpeech = vi.fn().mockResolvedValue(new Blob(["audio"]));
  const urlApi = { createObjectURL: vi.fn(() => "blob:fixture"), revokeObjectURL: vi.fn() };
  const playback = new VoicePlayback({ fetchSpeech, changed, AudioClass: AudioFixture, urlApi });
  await playback.speak("A short result", "en");
  expect(fetchSpeech).toHaveBeenCalledWith("A short result", "en", expect.any(AbortSignal));
  expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "complete" }));
  await playback.replay();
  expect(fetchSpeech).toHaveBeenCalledTimes(2);
});

it("aborts pending speech and supports session mute", async () => {
  let reject;
  const fetchSpeech = vi.fn((_text, _language, signal) => new Promise((_resolve, rejectPromise) => {
    reject = rejectPromise; signal.addEventListener("abort", () => rejectPromise(new DOMException("aborted", "AbortError")));
  }));
  const changed = vi.fn();
  const playback = new VoicePlayback({ fetchSpeech, changed, AudioClass: AudioFixture, urlApi: URL });
  const pending = playback.speak("pending", "en");
  playback.toggleMute(); playback.stop();
  await pending;
  expect(playback.muted).toBe(true);
  expect(reject).toBeTypeOf("function");
});
