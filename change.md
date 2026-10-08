# Global bilingual voice assistant

Date: 2026-10-06

## Task scope

Replace the fixed-target English voice-command prototype with a reviewed bilingual assistant that can resolve mailbox targets, run safe read-only/draft workflows, present distinct task/calendar results, and speak generated results while clearly reporting microphone and playback state.

## Changes

- Replaced the fixed target with a reviewed command state machine: transcript review, guarded intent preview, target resolution/selection, explicit execution, result, and optional playback.
- Added deterministic English/Chinese commands plus a strict structured-AI fallback for safe search, open, summary, reply-draft, extraction, task/calendar view, and navigation actions.
- Fixed Review command rejecting natural requests such as `Help me summarize this email.`: common English/Chinese polite wrappers now stay on the deterministic path, while complex commands use OpenAI strict JSON Schema output instead of legacy JSON mode.
- Expanded the voice dialog into a bounded two-column desktop workspace: microphone/transcript input remains on the left, while command review, target selection, generated summaries/drafts/details, and playback controls remain visible on the right. Narrow screens switch to a single internally scrolling column without horizontal page overflow.
- Corrected follow-up interaction defects: whole-mailbox “this email” requests now return to editable review with a specific-target prompt; pause freezes the active-recording timer; the `00:00` timer and recording controls keep stable dimensions; the privacy disclosure aligns with the output column; focused transcript outlines are no longer clipped; and playback state updates preserve both pane scroll positions.
- Preserved an explicitly reviewed search result as a visible, clearable follow-up target for the lifetime of the voice dialog. Starting another recording no longer discards that target, and “summarise it / 总结它” resolves to it after another review and confirmation. Safe compound requests such as “find the email from Hassan and summarise it” now resolve directly to the terminal summary action instead of stopping after search.
- Removed duplicated voice-summary content: the voice output and TTS path now use the main prose summary only, while the original email Summary card retains its key-point bullets. Bullets are used as a fallback only when the provider returns no prose summary.
- Removed dead confirmations for unclear or unmatched prompts. Comparative “highest priority/most important” summary requests now use the ranked mailbox candidate set; low-confidence interpretations and zero-result searches clear the inert preview, retain editable input, and show concrete clarification guidance.
- Made all voice suggestion chips follow the saved English/Chinese interface language. Task-view commands now display and read tasks only, with an explicit “No tasks at the moment” state instead of substituting calendar events.
- Replaced the Calendar extraction list with an accessible month grid, month navigation, and event cards in their validated date cells. Events without a reliable concrete date remain in a separate review section, and task/event extraction guidance now distinguishes actionable work from scheduled occurrences without duplicating items.
- Added mailbox candidate lookup across up to 50 messages, classification-assisted High/Medium/Low/newest ranking, five-result display, click selection, and English/Chinese ordinal selection.
- Prevented voice commands from sending, deleting, archiving, starring, changing read state, creating tasks, or writing calendar events. Opening a message through voice does not mark it read.
- Made Start recording available while voice is off: after the visible disclosure, the first click persists consent before requesting system permission.
- Added explicit permission, recording, muted-pause, released/transcribing, resolving, selection, confirmation, execution, playback, completion, and error status; recording also shows elapsed time and audio-chunk level feedback.
- Added automatic English/Chinese recognition plus explicit en-AU, en-US, and zh-CN settings while preserving existing saved values.
- Added the authenticated speech endpoint and OpenAI TTS adapter using `gpt-4o-mini-tts`, the deployment-level `alloy` voice, MP3 output, per-user rate/timeout/length limits, and no-store responses.
- Added full summary/draft/extraction playback with sentence-boundary chunking, automatic playback only for voice-originated commands, and Play/Pause/Resume/Stop/Replay/session-Mute controls with an AI-voice disclosure.
- Added the persisted `voiceAutoPlay` setting and SQLite migration; updated environment examples, shared contracts, API documentation, README, requirements status, English/Chinese UI copy, and focus restoration across view changes.
- Added unit, API, migration, playback, bilingual intent, candidate-ranking, consent, desktop/mobile browser, axe, and synthetic-media coverage.
- Created GitHub issue #71 as a formal sub-issue of #7 for reviewed bilingual TTS/playback. Added English scope/acceptance comments to open issues #7, #27, #31, #33, #34, and #37; none were closed.

## Reason

The recording button was disabled until users changed Settings, the dialog implied that one preselected email was always the target, commands were English-only and narrowly hard-coded, and no text-to-speech path or reliable microphone-use indicator existed. After the first implementation, a transcribed polite summary request missed the narrow deterministic rule and the legacy JSON-mode fallback produced an incomplete intent that the API correctly rejected, making Review command appear unresponsive. Follow-up testing also showed mixed-language suggestion chips, task commands reporting calendar events, an unclear empty-task state, and a Calendar page that rendered as another flat task list. A later conversational test found that starting a second recording cleared the email selected by a reviewed search, so pronouns and subsequent instructions could not refer to it.

## Commands and validation

- Reviewed the branch status and skip-worktree entries (none), repository instructions, Module 7 requirements, runtime documentation, active implementation, tests, persistence schema, and API contracts before editing.
- Confirmed the current OpenAI transcription and speech request shapes, 4096-character TTS input limit, `gpt-4o-mini-tts`, `alloy`, MP3 support, and the preferred strict `json_schema` response format in the official OpenAI documentation.
- Archived the previous task record as `change/change-31.md`.
- Targeted voice/settings Vitest: 23 tests passed.
- Targeted Module 7 Pytest: 16 tests passed.
- Follow-up target regression Pytest: 33 tests passed, including English/Chinese search-plus-action parsing, pronoun references, and the extended intent context contract. The first run exposed a Windows temp-directory permission problem for four fixture-backed tests; rerunning with a repository-local temp directory passed.
- Review-command regression Pytest: 23 tests passed, covering the reported English transcript, polite English/Chinese variants, guarded write commands, and strict structured-output configuration.
- Full `npm test`: 127 JavaScript and 156 Python tests passed.
- `npm run build` passed.
- Targeted Calendar helper/voice-command Vitest: 17 tests passed. Targeted Calendar Pytest: 45 tests passed, including extraction date validation and the task/event distinction prompt.
- Targeted Microsoft Edge task/calendar regressions completed at 1280px and 320px with no assertion failure, including language-aware voice examples, task-only spoken output, explicit empty tasks, validated event placement, contained mobile scrolling, independent removal, and axe checks scoped to the month calendar. The Windows runner again required manual interruption after completing the scenarios.
- Targeted Microsoft Edge Playwright: the 1280px and 320px keyboard voice-review scenarios both completed successfully with the reported natural-language transcript, two-stage confirmation, responsive split/single-column layout assertions, generated-summary display, and axe checks. The resulting screenshots were visually inspected. As in the full run, the Windows runner did not terminate afterward and was manually interrupted, so this targeted command had no normal success exit code.
- Targeted Microsoft Edge interaction regression: five scenarios reported `ok`, covering whole-mailbox target clarification, playback scroll retention, frozen and non-wrapping paused time, equal recording-control sizing, disclosure alignment, focus-outline spacing, and desktop/mobile voice layout. The runner again required manual interruption after completing the scenarios.
- Targeted Microsoft Edge summary regression: both 1280px and 320px scenarios reported `ok` and confirmed that key-point bullets remain absent from the voice output while the prose summary is displayed. The runner again required manual interruption after completing the scenarios.
- Targeted Microsoft Edge clarification regression reported `ok` for ranked highest-priority resolution, zero-match recovery, and low-confidence recovery without leaving a dead confirmation. The runner again required manual interruption after completing the scenario.
- Targeted Microsoft Edge conversational regression passed with a normal exit: a reviewed Hassan search result survived Start recording, the next “Summarise it” request carried the retained message identifier into intent review, and the confirmed action generated the summary for that email.
- Microsoft Edge Playwright: all 11 Module 7 scenarios reached completion without an assertion failure, including 1280px/320px axe checks, two-stage intent confirmation, ranked candidate selection, one-click voice consent, MediaRecorder pause/release, and transcript review. The Windows runner did not terminate after reporting the final scenario and was manually interrupted, so it did not emit the normal final pass summary or exit code.
- Follow-up full `npm test`: 127 JavaScript and 163 Python tests passed. Pytest emitted two non-failing cache-write warnings because the existing `.pytest_cache` directory is not writable on this host.
- Follow-up `npm run build` passed, and the shared JSON API schema parsed successfully.
- `git diff --check`, documentation trailing-whitespace inspection, and JSON parsing of the shared API schema passed.

## Known issues and remaining work

- Real OpenAI transcription, structured-intent fallback, synthesis, physical microphone, speaker, screen-reader, and packaged Electron checks have not been performed; automated provider paths use local fakes and Edge media capture uses a synthetic device.
- The bundled default Playwright browser could not start on this host. Microsoft Edge ran every scenario, but the Windows runner still hung after completing the suite and required manual interruption.
- Spoken candidate lists are displayed for screen readers and support spoken ordinal selection, but are not automatically read before a target is selected.
- This follow-up remains uncommitted and unpushed.
