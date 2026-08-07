# RevoMail Project Requirements and TODO

Last updated: 2026-08-06

## 1. Project Objectives

RevoMail is an AI email assistant with voice interaction. It aims to:

- Reduce the time users spend managing large volumes of email.
- Help users understand messages, identify priorities, and prepare replies more quickly.
- Extract tasks, deadlines, and calendar events from emails to reduce missed commitments.
- Provide keyboard, screen reader, and voice support for users with accessibility needs.
- Keep users in control by requiring confirmation before sending email, creating tasks, or adding calendar events.

Target users:

- Professionals who manage large volumes of email.
- University students and researchers.
- Users with visual, motor, or input-related accessibility needs.

## 2. Current Status

### Completed

- [x] Built a responsive frontend prototype based on the presentation mockups.
- [x] Built an OAuth-style login screen without connecting real identity providers.
- [x] Built prototype interactions for the inbox, search, categories, starred messages, and email reading.
- [x] Built prototype interfaces for AI summaries, information extraction, and reply drafts.
- [x] Built prototype interfaces for voice commands, tasks, calendar events, and settings.
- [x] Added light, dark, and mobile layouts.
- [x] Added Vite build scripts, a FastAPI production entry point, and PM2 configuration.
- [x] Reserved backend, shared-contract, architecture, API documentation, and automation directories; Module 1 subsequently selected the authentication stack.
- [x] Preserved the Module 1 connected-account UI and `/api/v1` contract while adopting FastAPI for Google OAuth session, account, Gmail, and AI endpoints. Real-provider validation and Python persistence remain incomplete.
- [x] Added simulated FastAPI integration tests for Google callback/session, account disconnect/logout, Gmail listing, and AI summary behavior.
- [x] Added an Electron desktop launcher MVP with one-click service controls, health-based status, persisted local settings, secure preload/IPC boundaries, and Windows packaging configuration.

### Not Yet Completed

- [ ] Verify the merged OAuth, Gmail, and OpenAI implementations with provider test credentials; speech recognition and calendar APIs are not implemented.
- [ ] Verify Google OAuth authorization, refresh, and revocation end to end with a provider test application and test account.
- [ ] Microsoft OAuth and Microsoft Graph support is pending and is not part of the currently supported MVP provider path.
- [ ] Complete Python persistence, task queue, durable user sessions, and migration of the retained Node/SQLite authentication code.
- [ ] Add automated tests, security review, monitoring, and production deployment.
- [ ] Verify signed and installed desktop releases on macOS and Linux; code signing, notarization, and auto-update remain future work.

## 3. MVP Functional Requirements (P0)

### FR-01 Authentication and Authorization

- [ ] Integrate Google OAuth 2.0.
- [ ] Integrate Microsoft OAuth 2.0. **Status: pending; retain the adapter but defer provider setup and release validation.**
- [ ] Request only the email and calendar permissions required by enabled features.
- [ ] Support secure sign-out, token refresh, token expiration, and authorization revocation.
- [ ] Show understandable error messages and a retry option when authentication fails.

Acceptance criteria:

- Users can sign in without giving their email password to RevoMail.
- Tokens never appear in frontend source code, URLs, ordinary logs, or the Git repository.
- RevoMail loses access to the mailbox after the user revokes authorization.

### FR-02 Inbox and Email Reading

- [ ] Synchronize the email list and message bodies from the email provider.
- [ ] Support pagination or incremental loading instead of loading the entire mailbox at once.
- [ ] Support keyword search, category filters, unread state, and starred messages.
- [ ] Display sender, recipients, timestamp, body, and attachment metadata.
- [ ] Handle both plain-text and HTML email.
- [ ] Sanitize HTML email and prevent scripts or dangerous content from executing.

Acceptance criteria:

- Synchronization, search, filtering, and message reading use real provider data.
- Refreshing the inbox does not create duplicate records.
- Dangerous HTML, remote tracking resources, and malicious links do not execute automatically.

### FR-03 AI Email Summaries

- [ ] Generate a concise summary for an individual email.
- [ ] Generate an overview of multiple inbox messages.
- [ ] Show clear generating, success, failure, and retry states.
- [ ] Base summaries only on the selected email content and do not invent unsupported information.
- [ ] Provide source context or a way to locate critical details such as dates, locations, and people in the original email.

Acceptance criteria:

- Users can return from a summary to the original email.
- The interface displays uncertainty when the model cannot determine a value instead of presenting a guess as fact.
- A summary failure does not prevent the user from reading the email.

### FR-04 AI Reply Drafts

- [ ] Generate a reply draft based on the current email.
- [ ] Support regeneration and tones such as Professional, Concise, and Friendly.
- [ ] Support configurable reply length.
- [ ] Let users edit the complete message before sending.
- [ ] Never allow AI to send a message automatically.
- [ ] Show the final recipients, subject, and body for confirmation before sending.
- [ ] Prevent repeated clicks from sending the same message more than once.

Acceptance criteria:

- Every AI draft starts in a user-review state.
- The application calls the send API only after explicit user confirmation.
- The interface distinguishes between sent, failed, and unknown delivery states.

### FR-05 Information, Task, and Event Extraction

- [ ] Extract dates, times, locations, participants, tasks, and deadlines from email.
- [ ] Distinguish explicit values, inferred values, and missing values.
- [ ] Resolve relative dates into a specific date and timezone for user review.
- [ ] Let users correct extracted values.
- [ ] Create a task or calendar event only after user confirmation.
- [ ] Prevent repeated actions from creating duplicate events.

Acceptance criteria:

- The application displays all fields for review before creating an event.
- The application asks for clarification when a date is missing or a time is ambiguous.
- After creation, the interface provides a link to the calendar item or an undo action.

### FR-06 Voice Interaction

- [ ] Integrate a browser-based or cloud Speech-to-Text service.
- [ ] Support starting, pausing, cancelling, and restarting voice capture.
- [ ] Display the recognized transcript before executing a command.
- [ ] Support a limited command set, including summarizing the current email, generating a reply, and showing tasks.
- [ ] Provide keyboard input when the microphone is unavailable or recognition fails.
- [ ] Do not activate the microphone or retain audio without user permission.

Acceptance criteria:

- Users can edit or cancel the recognized transcript before command execution.
- Core functionality remains available when voice input is disabled.
- Raw audio that does not need to be retained is deleted immediately after processing.

### FR-07 Settings

- [ ] Support interface language, light/dark theme, and reduced motion.
- [ ] Support a default AI model, reply length, and speech language.
- [ ] Allow users to enable or disable voice input.
- [ ] Show connected accounts, granted permissions, and a revoke-access action.
- [ ] Persist user settings across sessions.

### FR-08 Errors and Status Feedback

- [ ] Define a consistent error format for OAuth, email, AI, voice, and calendar operations.
- [ ] Provide retry handling for network failures, timeouts, rate limits, and unavailable services.
- [ ] Show progress for long-running actions so buttons never appear unresponsive.
- [ ] Never mark a failed operation as successful.

## 4. Non-Functional Requirements (P0)

### NFR-01 Security and Privacy

- [ ] Use HTTPS for all external communication.
- [ ] Store OAuth tokens and sensitive data only in secure server-side storage.
- [ ] Follow least-privilege access and avoid permissions unrelated to enabled features.
- [ ] Redact tokens, email bodies, email addresses, and personal data from logs.
- [ ] Provide data deletion, account disconnection, and authorization revocation flows.
- [ ] Validate API inputs and sanitize email HTML.
- [ ] Rate-limit authentication, AI, and email-sending endpoints.
- [ ] Never commit `.env` files, secrets, or production credentials to Git.

### NFR-02 Accessibility

- [ ] Target WCAG 2.1 AA conformance.
- [ ] Make every core workflow usable with a keyboard alone.
- [ ] Give every icon-only button an accessible label.
- [ ] Maintain a logical focus order and manage focus correctly when dialogs open.
- [ ] Support screen readers, sufficient color contrast, and reduced motion.
- [ ] Never make voice input the only way to complete a task.

### NFR-03 Performance

- [ ] Target a time to interactive of no more than 3 seconds on a typical connection.
- [ ] Target interaction responses below 200 milliseconds for a cached inbox list.
- [ ] Show progress when an AI operation exceeds 1 second and allow cancellation or retry after 15 seconds.
- [ ] Use pagination or list virtualization to avoid rendering excessive inbox DOM nodes.

### NFR-04 Reliability

- [ ] Use idempotency keys for email sending and calendar creation.
- [ ] Recover unfinished jobs after a service restart or mark them clearly as failed.
- [ ] Keep basic email reading available when an external AI service fails.
- [ ] Retain audit records for critical actions without storing sensitive email content.

### NFR-05 Compatibility

- [ ] Support the current and previous major versions of Chrome, Edge, Firefox, and Safari.
- [ ] Support desktop, tablet, and mobile browsers down to a width of 320 pixels.
- [ ] Make core features available without requiring a browser extension.

## 5. Technical Implementation TODO

### P0: Foundation

- [x] Select the backend technology stack and define the initial authentication API contract.
- [ ] Establish development, test, and production environment configuration.
- [x] Add a backend health check and a standard API error response.
- [ ] Define data models for users, mailbox connections, settings, tasks, and audit records. (User, mailbox connection, credential, OAuth transaction, and session models are complete.)
- [x] Add the initial authentication database migration.
- [ ] Establish CI for installation, linting, tests, and production builds.

### P0: External Services

- [ ] Implement a Google Gmail API adapter.
- [ ] Implement a Microsoft Graph Mail adapter. **Status: pending.**
- [ ] Implement Google Calendar and Microsoft Calendar adapters.
- [ ] Define a replaceable LLM provider interface.
- [ ] Define a Speech-to-Text provider interface.
- [ ] Add timeouts, retries, and rate-limit handling for every external service.

### P0: Frontend and Backend Integration

- [ ] Replace the simulated login with a real authenticated session.
- [ ] Replace the static emails in `src/main.js` with API data.
- [ ] Convert summaries, drafts, extraction, and voice actions to asynchronous API states.
- [ ] Add loading skeletons, empty states, error states, and cancellation.
- [ ] Add session-expiration and reauthorization flows.

### P0: Testing

- [ ] Add unit tests for date parsing, permission checks, HTML sanitization, and idempotency.
- [ ] Add integration tests for OAuth callbacks, email reading, AI calls, and calendar creation.
- [ ] Add end-to-end tests for sign-in, reading, summaries, replies, sending, and calendar creation.
- [ ] Add keyboard workflow tests and basic automated accessibility checks.
- [ ] Use test accounts and never use real personal mailbox data for testing.

### P1: Product Enhancements

#### Desktop application

- [x] Establish separate Electron main, preload, and renderer boundaries without duplicating the RevoMail Web UI.
- [x] Add start, stop, restart, duplicate-start protection, and health-based readiness for the managed service.
- [x] Add a desktop control room with explicit stopped, starting, running, stopping, and failed states.
- [x] Validate and persist loopback host, port, startup, shutdown, theme, language, and reduced-motion preferences.
- [x] Restrict renderer privileges, navigation, new windows, permissions, and IPC operations.
- [x] Add desktop settings and service lifecycle unit tests.
- [x] Bundle the FastAPI backend and Python runtime for one-click packaged starts on Windows.
- [ ] Migrate desktop per-user persistence to FastAPI. (The earlier Node/SQLite implementation remains in history and migration-reference code.)
- [ ] Verify the installed Windows package end to end with real OAuth test-app credentials.
- [ ] Verify macOS and Linux build artifacts in CI or on native hosts.
- [ ] Add release signing, macOS notarization, and a reviewed automatic-update channel.

- [ ] Add Apple account sign-in.
- [ ] Improve priority detection and automatic email classification.
- [ ] Add user-defined reply templates and signatures.
- [ ] Add attachment summaries and attachment risk warnings.
- [ ] Add multilingual summaries, replies, and voice commands.
- [ ] Let users review and correct AI extraction history.
- [ ] Synchronize tasks with third-party task management services.

### P2: Future Exploration

- [ ] Explore offline drafts and poor-network support.
- [ ] Explore shared team rules and administrator policies.
- [ ] Add more granular cost, model, and privacy controls.
- [ ] Evaluate the feasibility of native mobile applications.

## 6. Explicitly Out of Scope

- Training or fine-tuning a dedicated large language model.
- Native iOS or Android applications.
- Real-time collaborative email editing.
- Automatically sending email or creating calendar events without user confirmation.
- Replacing every advanced feature of a complete email client.

## 7. MVP Definition of Done

- [ ] At least one provider, Google or Microsoft, has a working end-to-end mailbox integration.
- [ ] Users can sign in securely, read email, generate a summary, and inspect the original content.
- [ ] Users can generate, edit, confirm, and send an AI-assisted reply.
- [ ] Users can review extracted information and create a calendar event.
- [ ] Voice commands support at least email summarization and task display, with a keyboard alternative.
- [ ] Core workflows pass automated tests and a manual accessibility review.
- [ ] No high-severity security vulnerabilities or sensitive-data leaks remain.
- [ ] README, `.env.example`, deployment documentation, and `change.md` match the implemented system.
