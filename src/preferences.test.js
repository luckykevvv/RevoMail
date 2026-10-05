import { expect, it, vi } from "vitest";
import { PreferenceWriter } from "./preferences.js";

it("serialises saves and preserves newer edits", async () => {
  let resolve; const changed = vi.fn();
  const save = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ settings: { theme: "light" } });
  const writer = new PreferenceWriter(save, changed);
  const done = writer.update({ theme: "dark" });
  writer.update({ theme: "light" });
  expect(save).toHaveBeenCalledTimes(1);
  resolve({ settings: { theme: "dark" } }); await done;
  expect(save).toHaveBeenLastCalledWith({ theme: "light" });
  expect(changed).not.toHaveBeenCalledWith("saving", { theme: "dark" });
});
it("retains failed edits for an explicit retry and ignores results after logout", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue({ settings: { voiceEnabled: true } });
  const changed = vi.fn(); const writer = new PreferenceWriter(save, changed);
  await writer.update({ voiceEnabled: true }); expect(changed).toHaveBeenLastCalledWith("error");
  await writer.flush(); expect(changed).toHaveBeenLastCalledWith("saved");
  let resolve; save.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const pending = writer.update({ theme: "dark" }); writer.reset(); changed.mockClear();
  resolve({ settings: { theme: "dark" } }); await pending; expect(changed).not.toHaveBeenCalled();
});
