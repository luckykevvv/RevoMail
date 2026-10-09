import { afterEach, expect, it, vi } from "vitest";
import { VoiceController } from "./controller.js";

class Recorder {
  static isTypeSupported() { return true; }
  constructor() { this.state = "inactive"; }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["fixture"]) }); this.onstop?.(); }
}
function setup() {
  const track = { stop: vi.fn(), enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const changed = vi.fn(); const transcribe = vi.fn().mockResolvedValue({ text: "Show my tasks" });
  const mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) };
  const controller = new VoiceController({ changed, transcribe, mediaDevices, Recorder });
  return { controller, track, stream, changed, transcribe, mediaDevices };
}
const limits = { maxBytes: 1024, maxSeconds: 60 };
afterEach(() => vi.useRealTimers());
it("does not capture until started and does not transcribe until finished", async () => {
  const x = setup(); expect(x.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  await x.controller.start(limits, "en-AU"); x.controller.pause(); expect(x.track.enabled).toBe(false);
  x.controller.resume(); expect(x.track.enabled).toBe(true); expect(x.transcribe).not.toHaveBeenCalled();
  x.controller.finish(); await Promise.resolve(); expect(x.track.stop).toHaveBeenCalled();
  expect(x.changed).toHaveBeenLastCalledWith({ status: "review", text: "Show my tasks" });
});
it("releases late microphone grants after cancellation", async () => {
  const x = setup(); let resolve; x.mediaDevices.getUserMedia.mockImplementation(() => new Promise(r => { resolve = r; }));
  const pending = x.controller.start(limits, "en-AU"); x.controller.cancel(); resolve(x.stream); await pending;
  expect(x.track.stop).toHaveBeenCalled(); expect(x.controller.status).toBe("idle");
});
it("aborts and ignores late transcription responses", async () => {
  const x = setup(); let resolve; x.transcribe.mockImplementation(() => new Promise(r => { resolve = r; }));
  await x.controller.start(limits, "en-AU"); x.controller.finish(); x.controller.cancel();
  resolve({ text: "Show my tasks" }); await Promise.resolve();
  expect(x.transcribe.mock.calls[0][2].aborted).toBe(true); expect(x.controller.status).toBe("idle");
});
it("reports denial and enforces recording deadline", async () => {
  const x = setup(); x.mediaDevices.getUserMedia.mockRejectedValueOnce({ name: "NotAllowedError" });
  await x.controller.start(limits, "en-AU"); expect(x.controller.status).toBe("error");
  vi.useFakeTimers(); await x.controller.start(limits, "en-AU"); await vi.advanceTimersByTimeAsync(60000);
  expect(x.track.stop).toHaveBeenCalled(); expect(x.controller.status).toBe("review");
});

it("freezes displayed elapsed time while recording is paused", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
  const x = setup(); await x.controller.start(limits, "en-AU");
  await vi.advanceTimersByTimeAsync(4000); x.controller.pause();
  expect(x.changed).toHaveBeenLastCalledWith({ status: "paused", elapsed: 4 });
  await vi.advanceTimersByTimeAsync(7000);
  expect(x.changed).toHaveBeenLastCalledWith({ status: "paused", elapsed: 4 });
  x.controller.resume(); await vi.advanceTimersByTimeAsync(2000);
  expect(x.changed).toHaveBeenLastCalledWith({ status: "recording", elapsed: 6 });
  x.controller.cancel();
});
