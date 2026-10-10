export function preferencesView({ preferences: p, models, status, error, accounts, escape: e, t }) {
  const select = (key, label, options) => `<label class="setting-row"><span>${t(label)}</span><select data-preference="${key}" id="setting-${key}">${options.map(([value, text]) => `<option value="${e(value)}" ${p[key] === value ? "selected" : ""}>${t(text)}</option>`).join("")}</select></label>`;
  const toggle = (key, label) => `<label class="setting-row"><span>${t(label)}</span><input type="checkbox" data-preference="${key}" ${p[key] ? "checked" : ""}></label>`;
  return `<header class="page-header"><div><h1>${t("Settings")}</h1><p>${t("Customise your RevoMail assistant experience.")}</p></div><span role="status">${t({ loading: "Loading settings…", saving: "Saving…", saved: "Settings saved", error: "Settings could not be saved" }[status] || "Settings")}</span></header>
    ${error ? `<p role="alert">${t("Settings could not be loaded. Retry before changing preferences.")} <button data-retry-settings>${t("Retry")}</button></p>` : ""}
    ${status === "error" ? `<button class="secondary-button" data-retry-save>${t("Retry saving")}</button>` : ""}
    <div class="settings-stack">${accounts}<fieldset class="setting-group" ${error || status === "loading" ? "disabled" : ""}><legend>${t("General")}</legend>
    ${select("theme", "Theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]])}
    ${toggle("reducedMotion", "Reduce motion")}</fieldset>
    <fieldset class="setting-group" ${error || status === "loading" ? "disabled" : ""}><legend>${t("AI preferences")}</legend>
    ${select("defaultAiModel", "Default AI model", models.map(value => [value, value]))}
    ${select("replyLength", "Response length", [["concise", "Concise"], ["medium", "Medium"], ["detailed", "Detailed"]])}
    <p class="setting-row">${t("Human review is always required before sending.")}</p></fieldset>
    <fieldset class="setting-group" ${error || status === "loading" ? "disabled" : ""}><legend>${t("Voice")}</legend>
    ${toggle("voiceEnabled", "Voice input")}
    ${toggle("voiceAutoPlay", "Automatically read voice-command results")}
    ${select("speechLanguage", "Speech-to-text language", [["auto", "Automatic (English)"], ["en-AU", "English (AU)"], ["en-US", "English (US)"]])}
    <p class="setting-row">${t("English commands are supported. Keyboard commands remain available when voice is off.")}</p></fieldset></div>`;
}

export function voiceView({ voice: v, enabled, capabilities, currentEmail, escape: e, t }) {
  const capturing = ["recording", "paused"].includes(v.status);
  const busy = ["requesting", "transcribing", "resolving", "executing"].includes(v.status);
  const available = capabilities?.transcriptionAvailable ?? capabilities?.available;
  const labels = {
    idle: "Ready — microphone off", requesting: "Waiting for microphone permission — microphone not recording",
    recording: "Microphone on — recording", paused: "Paused — microphone muted; capture session remains open",
    transcribing: "Microphone off — transcribing", review: "Microphone off — review your transcript",
    resolving: "Microphone off — finding the requested email", selecting: "Microphone off — choose an email",
    ready: "Microphone off — ready for confirmation", executing: "Microphone off — running the confirmed command",
    speaking: "Microphone off — reading the result", complete: "Complete — microphone off", error: "Voice needs attention — microphone off"
  };
  const candidates = v.candidates || [];
  const selected = candidates.find(item => String(item.id) === String(v.selectedTargetId));
  const needsSelection = v.status === "selecting" && !selected;
  const playback = v.playback || {};
  const statusClass = v.status === "recording" ? "is-recording" : v.status === "paused" ? "is-paused" : "is-off";
  const commandButton = v.intent ? "Run confirmed command" : "Review command";
  const resultHeading = ({ summarize_message: "Summary", draft_reply: "Reply draft", extract_details: "Key details", show_tasks: "Tasks", show_calendar: "Calendar" })[v.intent?.action] || "Result ready";
  const runButton = `<button class="primary-button voice-command-button" data-run-command ${busy || capturing || !v.text.trim() || needsSelection ? "disabled" : ""}>${t(commandButton)}</button>`;
  const elapsed = Math.max(0, Number(v.elapsed) || 0);
  const elapsedText = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const microphoneErrors = new Set([
    "Microphone recording is unavailable. Type a command instead.",
    "Microphone permission was denied. Type a command or change browser permissions.",
    "Microphone unavailable. Check the device or type a command."
  ]);
  const errorText = microphoneErrors.has(v.error) ? v.error : t(v.error);
  return `<div class="modal-backdrop"><section class="voice-modal" data-preserve-scroll="voice-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-title" tabindex="-1">
    <div class="modal-header"><h2 id="voice-title">${t("Voice commands")}</h2><button class="icon-button" data-close-voice aria-label="${t("Close voice commands")}">×</button></div>
    <div class="voice-intro"><p>${t("Use voice commands to search, open, summarise, draft, extract, or navigate. Every command is reviewed before it runs.")}</p>
    <p class="privacy-note" lang="en">Starting records only after permission. Finished audio is sent to OpenAI for transcription; text selected for playback is sent for speech generation. RevoMail does not persist recordings, transcripts, or generated audio. The playback voice is AI-generated. <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">Provider data policy</a></p></div>
    <div class="voice-workspace">
      <section class="voice-pane voice-input-pane" data-preserve-scroll="voice-input" aria-labelledby="voice-input-title"><h3 id="voice-input-title">${t("Voice and command input")}</h3>
        <div class="microphone-status ${statusClass}" data-microphone-state="${statusClass}" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span data-voice-status ${v.status === "requesting" ? 'lang="en"' : ""}>${v.status === "requesting" ? labels.requesting : t(labels[v.status] || labels.idle)}</span>${v.status === "recording" ? `<span class="voice-level" aria-label="${t("Microphone level")}" style="--voice-level:${Math.max(.08, Number(v.level) || 0)}"><i></i><i></i><i></i><i></i></span>` : ""}${capturing && Number.isFinite(v.elapsed) ? `<time datetime="PT${elapsed}S">${elapsedText}</time>` : ""}</div>
        ${v.error ? `<p role="alert" ${microphoneErrors.has(v.error) ? 'lang="en"' : ""}>${e(errorText)}</p>` : ""}
        ${!enabled ? `<p lang="en">Voice input is off. Choosing Start recording will save your consent, then request system microphone permission. You can always type instead.</p>` : !available ? `<p>${t("Cloud transcription is unavailable. You can type below.")}</p>` : ""}
        <div class="voice-controls voice-capture-controls">${capturing ? `<button class="secondary-button" data-pause>${t(v.status === "paused" ? "Resume" : "Pause")}</button><button class="primary-button" data-finish-recording>${t("Finish and transcribe")}</button>` : `<button class="secondary-button" data-record ${!available || busy ? "disabled" : ""}>${t("Start recording")}</button>`}
        <button class="secondary-button" data-cancel-recording ${v.status === "executing" ? "disabled" : ""}>${t("Cancel recording")}</button>
        <button class="secondary-button" data-restart-recording ${!available || v.status === "executing" ? "disabled" : ""}>${t("Restart recording")}</button></div>
        <p class="voice-context">${currentEmail ? t("Context: a current email is available when you say ‘this email’. No target is selected until your command is reviewed.") : t("Context: whole mailbox. Name or describe an email in your command.")}</p>
        ${v.contextTarget ? `<p class="voice-context voice-follow-up"><strong>${t("Follow-up target:")}</strong> <span data-user-content>${e(v.contextTarget.subject || t("No subject"))}</span> <button class="link-button" data-clear-voice-context>${t("Clear follow-up target")}</button></p>` : ""}
        <label for="voice-transcript">${t("Review or type a command")}</label>
        <textarea id="voice-transcript" maxlength="2000" rows="4" ${busy || capturing ? "disabled" : ""}>${e(v.text)}</textarea>
        <div class="voice-hints">${["Summarise this email", "Find my most important recent email", "Generate a reply to this email", "Show my tasks"].map(command => `<button data-command="${e(t(command))}" ${busy || capturing ? "disabled" : ""}>${t(command)}</button>`).join("")}</div>
        ${v.intent ? "" : runButton}
      </section>
      <section class="voice-pane voice-output-pane" data-preserve-scroll="voice-output" aria-labelledby="voice-output-title"><h3 id="voice-output-title">${t("Review and output")}</h3>
        ${v.intent ? `<section class="voice-review" aria-labelledby="voice-review-title"><h4 id="voice-review-title">${t("Command preview")}</h4><p><strong>${t("Action:")}</strong> ${e(v.intent.displayText)}</p>${v.intent.target?.mode === "current" ? `<p>${t("Target rule: current email")}</p>` : v.intent.target?.mode === "search" ? `<p>${t("Target rule: search mailbox")}</p>` : `<p>${t("No email target is required")}</p>`}</section>` : ""}
        ${candidates.length ? `<fieldset class="voice-candidates"><legend>${t("Choose the target email")}</legend><p>${t("Choose below or say first, second, third, fourth, or fifth.")}</p>${candidates.map((email, index) => `<label><input type="radio" name="voice-target" data-voice-candidate="${e(email.id)}" ${String(email.id) === String(v.selectedTargetId) ? "checked" : ""}><span><strong>${index + 1}. ${e(email.subject || t("No subject"))}</strong><small>${e(email.sender)} · ${e(email._localDate || "")}</small></span></label>`).join("")}</fieldset>` : ""}
        ${selected ? `<p class="voice-selected"><strong>${t("Selected email:")}</strong> <span data-user-content>${e(selected.subject || t("No subject"))}</span></p>` : ""}
        ${v.intent ? runButton : `<div class="voice-output-empty"><p>${t("Review a command to see its action, target, and generated result here.")}</p></div>`}
        ${v.resultText ? `<section class="voice-result" aria-labelledby="voice-result-title"><h4 id="voice-result-title">${t(resultHeading)}</h4><div class="voice-result-copy" data-user-content>${e(v.resultText)}</div><p class="ai-voice-disclosure">${t("Audio playback uses an AI-generated voice.")}</p><div class="voice-controls"><button class="secondary-button" data-speak>${t("Play")}</button>${playback.status === "speaking" ? `<button class="secondary-button" data-pause-speech>${t("Pause audio")}</button>` : playback.status === "paused" ? `<button class="secondary-button" data-resume-speech>${t("Resume audio")}</button>` : ""}<button class="secondary-button" data-stop-speech>${t("Stop")}</button><button class="secondary-button" data-replay-speech>${t("Replay")}</button><button class="secondary-button" data-mute-speech aria-pressed="${Boolean(playback.muted)}">${t(playback.muted ? "Unmute" : "Mute")}</button></div><p role="status">${e(playback.error || ({ generating: t("Generating speech…"), speaking: t("Playing AI-generated speech"), paused: t("Speech paused"), complete: t("Speech complete"), stopped: t("Speech stopped") }[playback.status] || ""))}</p></section>` : ""}
      </section>
    </div>
  </section></div>`;
}
