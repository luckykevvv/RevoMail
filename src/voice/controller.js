const FORMATS = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

export class VoiceController {
  constructor({ transcribe, changed, mediaDevices = globalThis.navigator?.mediaDevices, Recorder = globalThis.MediaRecorder }) {
    Object.assign(this, { transcribe, changed, mediaDevices, Recorder });
    this.generation = 0; this.status = "idle"; this.chunks = [];
  }
  emit(status, details = {}) { this.status = status; this.changed({ status, ...details }); }
  available() { return Boolean(this.mediaDevices?.getUserMedia && this.Recorder && FORMATS.some(type => this.Recorder.isTypeSupported(type))); }
  release() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
  }
  cancel() {
    this.generation++;
    this.abort?.abort(); this.abort = null;
    if (this.recorder) {
      this.recorder.ondataavailable = this.recorder.onstop = this.recorder.onerror = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
      this.recorder = null;
    }
    this.release(); this.chunks = []; this.emit("idle");
  }
  async start(limits, language) {
    this.cancel();
    const generation = this.generation;
    if (!this.available()) { this.emit("error", { error: "Microphone recording is unavailable. Type a command instead." }); return; }
    this.emit("requesting");
    try {
      const stream = await this.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const mimeType = FORMATS.find(type => this.Recorder.isTypeSupported(type));
      const recorder = this.recorder = new this.Recorder(stream, { mimeType });
      this.bytes = 0;
      recorder.ondataavailable = event => {
        if (generation !== this.generation || !event.data.size) return;
        this.bytes += event.data.size;
        if (this.bytes > limits.maxBytes) {
          this.cancel(); this.emit("error", { error: "Recording is too large. Record a shorter command." }); return;
        }
        this.chunks.push(event.data);
      };
      recorder.onerror = () => { if (generation === this.generation) { this.cancel(); this.emit("error", { error: "Recording failed. Try again or type a command." }); } };
      recorder.onstop = async () => {
        if (generation !== this.generation) return;
        this.release(); this.recorder = null;
        const blob = new Blob(this.chunks, { type: mimeType }); this.chunks = [];
        if (!blob.size) { this.emit("error", { error: "No audio was recorded. Try again or type a command." }); return; }
        this.abort = new AbortController();
        this.emit("transcribing");
        try {
          const result = await this.transcribe(blob, language, this.abort.signal);
          if (generation === this.generation) this.emit("review", { text: result.text });
        } catch (error) {
          if (generation === this.generation && error.name !== "AbortError") this.emit("error", { error: error.message });
        } finally { if (generation === this.generation) this.abort = null; }
      };
      recorder.start(250);
      this.emit("recording");
      // Wall-clock limit also bounds paused sessions and the lifetime of microphone access.
      this.timer = setTimeout(() => this.finish(), limits.maxSeconds * 1000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.release();
      this.emit("error", { error: error.name === "NotAllowedError" ? "Microphone permission was denied. Type a command or change browser permissions." : "Microphone unavailable. Check the device or type a command." });
    }
  }
  pause() {
    if (this.status !== "recording") return;
    this.recorder.pause(); this.stream.getAudioTracks().forEach(track => { track.enabled = false; }); this.emit("paused");
  }
  resume() {
    if (this.status !== "paused") return;
    this.stream.getAudioTracks().forEach(track => { track.enabled = true; }); this.recorder.resume(); this.emit("recording");
  }
  finish() {
    if (!["recording", "paused"].includes(this.status)) return;
    this.emit("transcribing"); this.recorder.stop(); this.release();
  }
}
