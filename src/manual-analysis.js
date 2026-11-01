export const MANUAL_MAX_BODY = 15000;
export const MANUAL_MAX_UPLOAD = 1024 * 1024;

export function createManualState() {
  return { body: "", subject: "", sender: "", email_date: "", file_name: "", instructions: "", tone: "professional", draft: "", draft_generation: null, draft_edited: false, summary: null, classification: null, extraction: null, busy: "", error: "", retry: "", warnings: [], notice: "" };
}

export function manualProblem(input) {
  if (!input.body.trim()) return "Paste email content or import a text email first.";
  if (input.body.length > MANUAL_MAX_BODY) return "Use no more than 15,000 characters of email content.";
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.body)) return "Remove binary or control characters from the email text.";
  return "";
}

export function manualFileProblem(file) {
  if (!/\.(txt|eml)$/i.test(file.name)) return "Only .txt and .eml files are supported.";
  if (!file.size) return "The file is empty.";
  if (file.size > MANUAL_MAX_UPLOAD) return "Upload a file no larger than 1 MiB.";
  return "";
}

export function manualPayload(input, operation) {
  const { body, subject, sender, email_date, tone, instructions, draft } = input;
  return { body, subject, sender, email_date, ...(operation === "draft-reply" ? { tone, instructions, current_draft: draft } : {}) };
}

export function resetManualResults(input) {
  Object.assign(input, { summary: null, classification: null, extraction: null, draft: "", draft_generation: null, draft_edited: false, error: "", retry: "", notice: "" });
}

export function markManualDraftGenerated(input) {
  input.draft_generation = { tone: input.tone, instructions: input.instructions };
  input.draft_edited = false;
}

export function manualDraftNeedsRegeneration(input) {
  return Boolean(input.draft && input.draft_generation && (
    input.tone !== input.draft_generation.tone || input.instructions !== input.draft_generation.instructions
  ));
}

export function manualView(input, escape, icon) {
  const busy = input.busy ? "disabled" : "";
  const staleDraft = manualDraftNeedsRegeneration(input);
  const field = (name, label, limit) => `<label for="manual-${name}">${label}<input id="manual-${name}" data-manual-field="${name}" maxlength="${limit}" value="${escape(input[name])}" ${busy}></label>`;
  const actions = [["summarise", "Summarise"], ["classify", "Classify priority"], ["extract", "Extract tasks / events"], ["draft-reply", input.draft ? (staleDraft ? "Regenerate reply draft" : "Update reply draft") : "Generate reply draft"]];
  const copy = (target, label) => `<button type="button" class="secondary-button" data-manual-copy="${target}">${label}</button>`;
  const suggestions = (kind, items) => items.length ? items.map((item, index) => `<label for="manual-${kind}-${index}">${kind === "events" ? "Event" : "Task"} suggestion ${index + 1}</label><textarea id="manual-${kind}-${index}" data-manual-suggestion="${kind}" data-index="${index}">${escape(item)}</textarea>`).join("") : `<p>No explicit ${kind} found.</p>`;
  return `<header class="page-header manual-header"><div><span class="eyebrow">Manual Email Analysis</span><h1 tabindex="-1">Analyse Text</h1><p>Understand email from Outlook, Yahoo, university mail, or any other provider.</p></div></header>
    <section class="manual-notice"><strong>Manually supplied · Not synchronised with Gmail</strong><p>Importing only parses the file in RevoMail. Choosing an AI action sends the email content and headers, plus any draft instructions, to the configured AI provider (currently OpenAI). Review all generated results. Content stays in this page's memory and is cleared on reload or sign-out.</p></section>
    <div class="manual-grid"><section class="manual-panel" aria-labelledby="manual-input-title"><h2 id="manual-input-title">Email content</h2>
      <label for="manual-file">Import .txt or .eml (up to 1 MiB)</label>
      <input type="file" id="manual-file" data-manual-file accept=".txt,.eml,text/plain,message/rfc822" ${busy} aria-describedby="manual-file-hint" hidden>
      <div class="manual-file-control"><button type="button" class="secondary-button" data-manual-choose-file aria-controls="manual-file" aria-describedby="manual-file-hint" ${busy}>Choose file</button><span data-manual-file-name>${input.file_name ? escape(input.file_name) : "No file selected"}</span></div>
      <small id="manual-file-hint">UTF-8 or BOM-marked UTF-16 text, or a standard email export. Attachments are ignored.</small>
      ${field("subject", "Subject (optional)", 1000)}${field("sender", "Sender (optional)", 500)}${field("email_date", "Email date (optional)", 128)}
      <small>Use the original email date for relative dates such as “tomorrow”. Leave unknown dates blank.</small>
      <label for="manual-body">Email text</label><textarea id="manual-body" data-manual-field="body" maxlength="15000" ${busy} aria-describedby="manual-body-hint">${escape(input.body)}</textarea>
      <small id="manual-body-hint"><span data-manual-count>${input.body.length.toLocaleString("en")}</span> / 15,000 characters. Classification uses sender, subject, and the first 400 characters.</small>
      <label for="manual-instructions">Reply instructions (optional)</label><textarea id="manual-instructions" data-manual-field="instructions" maxlength="1000" ${busy}>${escape(input.instructions)}</textarea>
      <label for="manual-tone">Reply tone<select id="manual-tone" data-manual-field="tone" ${busy}>${["professional", "concise", "friendly"].map(tone => `<option value="${tone}" ${input.tone === tone ? "selected" : ""}>${tone[0].toUpperCase() + tone.slice(1)}</option>`).join("")}</select></label>
      <div class="manual-actions">${actions.map(([action, label]) => `<button type="button" class="primary-button" data-manual-action="${action}" ${busy}>${icon("sparkles")} <span data-manual-action-label="${action}">${label}</span></button>`).join("")}</div>
      <div class="manual-actions"><button type="button" class="secondary-button" data-manual-clear>Clear</button>${input.busy ? '<button type="button" class="secondary-button" data-manual-cancel>Cancel request</button>' : ""}</div>
      ${input.busy ? '<p role="status">Processing… You can cancel this request.</p>' : ""}
      ${input.error ? `<div role="alert"><p class="manual-error">${escape(input.error)}</p>${input.retry ? '<button type="button" class="secondary-button" data-manual-retry>Retry analysis</button>' : ""}</div>` : ""}
      ${input.warnings.map(warning => `<p role="status">${escape(warning)}</p>`).join("")}
      ${input.notice ? `<p role="status">${escape(input.notice)}</p>` : ""}
    </section><section class="manual-panel manual-results" aria-labelledby="manual-results-title"><h2 id="manual-results-title" tabindex="-1">AI results for review</h2>
      ${!input.summary && !input.classification && !input.extraction && !input.draft ? '<p>Choose an AI action to analyse the text. Nothing will be sent or saved to a mailbox, task list, or calendar.</p>' : ""}
      ${input.summary ? `<article><h3>Summary</h3><p id="manual-summary" data-user-content>${escape(input.summary.summary)}</p><ul>${input.summary.bullets.map(item => `<li data-user-content>${escape(item)}</li>`).join("")}</ul>${copy("summary", "Copy summary")}</article>` : ""}
      ${input.classification ? `<article><h3>Priority suggestion</h3><p data-user-content>${escape(input.classification.priority || "Unclassified")}</p><p data-user-content>${escape(input.classification.reason)}</p>${input.classification.warning ? '<p>The AI did not return a usable priority. You can try classification again.</p>' : ""}</article>` : ""}
      ${input.extraction ? `<article><h3>Task suggestions</h3>${suggestions("tasks", input.extraction.tasks)}<h3>Event suggestions</h3>${suggestions("events", input.extraction.events)}<p>Review and edit these suggestions. Copying does not create tasks or calendar events.</p>${input.extraction.warning ? '<p>The AI response could not be read. Retry extraction.</p>' : ""}${copy("suggestions", "Copy suggestions")}</article>` : ""}
      ${input.draft ? `<article><h3><label for="manual-draft">Reply draft</label></h3><textarea id="manual-draft" data-manual-field="draft" maxlength="20000" ${busy}>${escape(input.draft)}</textarea><p data-manual-draft-status role="status" ${staleDraft ? "" : "hidden"}>Reply tone or instructions changed. Regenerate to apply them. ${input.draft_edited ? "Your edited draft is preserved." : "The current draft is preserved."}</p><p>Edit and copy this draft into your email provider. RevoMail will not send it.</p>${copy("draft", "Copy reply draft")}</article>` : ""}
      <textarea id="manual-copy-fallback" aria-label="Text to copy manually" hidden readonly></textarea>
    </section></div>`;
}

export function editableSuggestions(result) {
  const format = item => Object.entries(item).filter(([, value]) => value !== null && value !== "" && value !== false).map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`).join("\n");
  return { tasks: (result.tasks || []).map(format), events: (result.events || []).map(format), warning: result.warning };
}
