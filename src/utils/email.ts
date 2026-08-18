/**
 * Simulated sender for account-verification emails.
 *
 * In this scaffolding commit the action is intentionally a no-op that
 * only writes to the console. A future commit will swap this for a real
 * transport (Nodemailer / SES / etc.) without changing the call sites.
 *
 * @param email - Recipient address (e.g. the new user's submitted email).
 * @param token - Opaque verification token already saved to the user
 *                document; should appear in the verification link.
 */
export function sendVerificationEmail(email: string, token: string): void {
  // eslint-disable-next-line no-console
  console.log(
    `[EMAIL::VERIFICATION] Would send email to=${email} verificationToken=${token}`,
  );
}

/**
 * Simulated sender for password-reset emails.
 *
 * Mirrors {@link sendVerificationEmail}: currently console-only, will be
 * upgraded to a real transport in a later commit.
 *
 * @param email - Recipient address (the account holder's email on file).
 * @param token - Opaque reset token already saved to the user document;
 *                should appear in the reset link.
 */
export function sendResetEmail(email: string, token: string): void {
  // eslint-disable-next-line no-console
  console.log(
    `[EMAIL::RESET] Would send email to=${email} resetToken=${token}`,
  );
}
