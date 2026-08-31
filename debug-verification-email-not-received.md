# DEBUG: verification-email-not-received

> Status: **[OPEN]**
> Session ID: `verification-email-not-received`
> Created: 2026-08-31
> Bug: After calling `/api/v1/auth/register` no verification email is received by the user.
> Expected: A verification email is dispatched (SMTP) or at minimum a `[EMAIL::SIMULATE]` log line appears in the server output when SMTP is not configured.

---

## Hypotheses

| # | Title | Falsifiable Test | Likelihood |
|---|-------|------------------|------------|
| H1 | **SMTP not configured** → simulate mode should still emit `[EMAIL::SIMULATE]`; no `[EMAIL::*]` lines appear at all in server logs. | Check server stdout / stderr for any `[EMAIL::…]` tag during registration. | High |
| H2 | **`sendVerificationEmailAsync` never runs** — exception is thrown before or inside the fireAndForget wrapper, or the branch that creates the user skips email dispatch (e.g. duplicate email / validation short-circuit). | Instrument authController.register right before/after the email call; check whether the line is reached. | High |
| H3 | **Nodemailer stream-transport rejects silently** or transporter.verify() swallows error in simulate mode; `sendMailInternal` returns but produces no log output. | Add probes inside `sendEmail`, `sendMailInternal`, and `resolveTemplate` to track flow + any thrown errors. | Medium |
| H4 | **`APP_URL` / link-build throws synchronously** before fireAndForget, so the email promise is never constructed. | Probe APP_URL read and the link-string concatenation for errors. | Medium |
| H5 | **Race / timing**: The server crashes or the promise microtask never runs because the response is sent before the async email work executes (unlikely given Node event loop model — but possible if a worker/fork setup is involved). | Add a process.stdout flushing marker inside fireAndForget at its start/end. | Low |

---

## Evidence Log

### Pre-fix instrumentation run

| ID | Timestamp | Location | Event | Notes |
|----|-----------|----------|-------|-------|
| —  | —         | —        | —     | (pending) |

### Post-fix verification run

| ID | Timestamp | Location | Event | Notes |
|----|-----------|----------|-------|-------|
| —  | —         | —        | —     | (pending) |

---

## Root Cause

> _(to be filled after evidence collection)_

## Fix Patch

> _(to be filled)_

## Cleanup Checklist

- [ ] Remove all debug-point instrumentation from controllers & utils
- [ ] Stop debug server
- [ ] Delete `.dbg/verification-email-not-received.env` and `trae-debug-log-verification-email-not-received.ndjson`
- [ ] Delete this markdown file
