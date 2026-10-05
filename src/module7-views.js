export function preferencesView({ preferences: p, models, status, error, accounts, escape: e, t }) {
  const select = (key, label, options) => `<label class="setting-row"><span>${t(label)}</span><select data-preference="${key}" id="setting-${key}">${options.map(([value, text]) => `<option value="${e(value)}" ${p[key] === value ? "selected" : ""}>${t(text)}</option>`).join("")}</select></label>`;
  const toggle = (key, label) => `<label class="setting-row"><span>${t(label)}</span><input type="checkbox" data-preference="${key}" ${p[key] ? "checked" : ""}></label>`;
  return `<header class="page-header"><div><h1>${t("Settings")}</h1><p>${t("Customise your RevoMail assistant experience.")}</p></div><span role="status">${t({ loading: "Loading settings…", saving: "Saving…", saved: "Settings saved", error: "Settings could not be saved" }[status] || "Settings")}</span></header>
    ${error ? `<p role="alert">${t("Settings could not be loaded. Retry before changing preferences.")} <button data-retry-settings>${t("Retry")}</button></p>` : ""}
    ${status === "error" ? `<button class="secondary-button" data-retry-save>${t("Retry saving")}</button>` : ""}
    <div class="settings-stack">${accounts}<fieldset class="setting-group" ${error || status === "loading" ? "disabled" : ""}><legend>${t("General")}</legend>
    ${select("language", "Language", [["en", "English"], ["zh-CN", "简体中文"]])}
    ${select("theme", "Theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]])}
    ${toggle("reducedMotion", "Reduce motion")}</fieldset>
    <fieldset class="setting-group" ${error || status === "loading" ? "disabled" : ""}><legend>${t("AI preferences")}</legend>
    ${select("defaultAiModel", "Default AI model", models.map(value => [value, value]))}
    ${select("replyLength", "Response length", [["concise", "Concise"], ["medium", "Medium"], ["detailed", "Detailed"]])}
    <p class="setting-row">${t("Human review is always required before sending.")}</p></fieldset>
    <fieldset class="setting-group" ${error || status === "loading" ? "disabled" : ""}><legend>${t("Voice")}</legend>
    ${toggle("voiceEnabled", "Voice input")}
    ${select("speechLanguage", "Speech-to-text language", [["en-AU", "English (AU)"], ["en-US", "English (US)"]])}
    <p class="setting-row">${t("Only English commands are supported. Keyboard commands remain available when voice is off.")}</p></fieldset></div>`;
}

export function voiceView({ voice: v, enabled, capabilities, escape: e, t }) {
  const capturing = ["recording", "paused"].includes(v.status);
  const busy = ["requesting", "transcribing", "executing"].includes(v.status);
  const labels = { idle: "Ready", requesting: "Requesting microphone permission…", recording: "Recording…", paused: "Paused", transcribing: "Transcribing…", review: "Review your command", executing: "Executing…", error: "Voice needs attention" };
  return `<div class="modal-backdrop"><section class="voice-modal" role="dialog" aria-modal="true" aria-labelledby="voice-title" tabindex="-1">
    <div class="modal-header"><h2 id="voice-title">${t("Voice commands")}</h2><button class="icon-button" data-close-voice aria-label="${t("Close voice commands")}">×</button></div>
    <p>${t("Only English commands are supported. Keyboard commands remain available when voice is off.")}</p>
    <p class="privacy-note">${t("Starting a recording requests microphone access. Finishing uploads audio to OpenAI for transcription. RevoMail does not save audio or transcripts. Cancelling cannot recall audio already uploaded.")} <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">${t("Provider data policy")}</a></p>
    <p data-voice-status role="status">${t(labels[v.status] || "Ready")}</p>
    ${v.error ? `<p role="alert">${e(t(v.error))}</p>` : ""}
    ${!enabled ? `<p>${t("Enable voice input in Settings to record. You can type below.")}</p>` : !capabilities?.available ? `<p>${t("Cloud transcription is unavailable. You can type below.")}</p>` : ""}
    <div class="voice-controls">
    <button class="secondary-button" data-record ${!enabled || !capabilities?.available || busy || capturing ? "disabled" : ""}>${t("Start recording")}</button>
    ${capturing ? `<button class="secondary-button" data-pause>${t(v.status === "paused" ? "Resume" : "Pause")}</button><button class="primary-button" data-finish-recording>${t("Finish and transcribe")}</button>` : ""}
    <button class="secondary-button" data-cancel-recording ${v.status === "executing" ? "disabled" : ""}>${t("Cancel recording")}</button>
    <button class="secondary-button" data-restart-recording ${!enabled || !capabilities?.available || v.status === "executing" ? "disabled" : ""}>${t("Restart recording")}</button></div>
    <p>${t("Target email:")} <span data-user-content>${e(v.targetSubject || t("No email selected"))}</span></p>
    <label for="voice-transcript">${t("Review or type an English command")}</label>
    <textarea id="voice-transcript" maxlength="2000" rows="3" ${busy || capturing ? "disabled" : ""}>${e(v.text)}</textarea>
    <div class="voice-hints">${["Summarise the current email", "Generate a reply", "Show my tasks"].map(command => `<button data-command="${command}" lang="en" ${busy || capturing ? "disabled" : ""}>${command}</button>`).join("")}</div>
    <button class="primary-button" data-run-command ${busy || capturing || !v.text.trim() ? "disabled" : ""}>${t("Run command")}</button></section></div>`;
}
