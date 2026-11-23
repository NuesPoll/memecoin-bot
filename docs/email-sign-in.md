# Email-link sign-in setup

The Account screen and callback are implemented. **Email sign-in is not activated until an account service and email delivery are connected.** NovaPulse currently has no Supabase environment configuration in its Vercel project. The owner chose to prepare email sign-in setup in this release.

1. Create a Supabase project in your own account at https://supabase.com/dashboard. Keep its database password private.
2. In Authentication → Providers, enable Email. Choose email-link delivery. The default confirmation email template must contain the confirmation URL, not only an OTP code.
3. In Authentication → URL Configuration, set Site URL to `https://novapulse-nine.vercel.app`. Add `https://novapulse-nine.vercel.app/auth/callback` to Redirect URLs. Add exact preview callback URLs only when testing those previews. For optional local work, allow `http://localhost:3000/auth/callback`.
4. From project settings, obtain the project URL and the **public publishable/anon client key**. In the existing NovaPulse Vercel project's Environment Variables, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Select Production and the Preview environments that should use this service. Never use a service-role JWT or `sb_secret_` key. The application refuses known secret-key formats in browser configuration.
5. Configure your email sender/SMTP in Supabase and verify its sender domain if required. Its test/default sender may restrict recipients and has provider rate limits. NovaPulse's 60-second resend countdown is an interface aid, not a replacement for provider limits or abuse protection.
6. Redeploy the same NovaPulse project because the public client configuration is included at build time.
7. Open Account, enter your own email and request a sign-in link. Open the newest link in the same browser. `/auth/callback` waits for the Supabase session and verifies it with `getUser()` before returning to Account. Expired/used/invalid links display a fixed error and can be requested again.
8. Verify sign-out and access controls with a real account. The agent has not sent an email or completed a live sign-in in this release.

The form sends the email directly to your configured Supabase service using its supported client. NovaPulse does not handle account passwords or create a custom credential database. It neither logs email addresses nor adds them to the wallet backup. Existing optional dashboard APIs verify the authenticated identity server-side and apply per-user filtering; see the legacy dashboard schema and RLS guide before connecting account tables.

Account sign-in does not decrypt, recover, sync or upload the wallet vault. Wallets still require their vault password; another browser needs the encrypted project backup. “Sign out & lock vault” clears the in-memory project/session key before contacting the sign-out service, so an account-service failure still locks the wallet vault.

Reference: https://supabase.com/docs/reference/javascript/auth-signinwithotp
