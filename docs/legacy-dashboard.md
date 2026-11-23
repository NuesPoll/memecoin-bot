# NovaPulse

The current development branch adds **Solana devnet token creation, Raydium pool creation, and a coordinated 40-wallet test purchase batch** at `/`. See [the Solana guide](docs/solana-devnet.md). The earlier read-only dashboard described below remains at `/dashboard`. Mainnet stays disabled.

A read-only Next.js dashboard with four working navigation panels. Public Ethereum token lookup works without login. Portfolio lookup uses an optional server-side Zerion credential. Saved wallets and transactions require an optional Supabase project and Discord login. No sample balances or simulated trades are presented as real data.

## Run on your computer

1. Install Node.js **22 LTS** (includes npm), then extract the ZIP into a normal folder.
2. Open that folder in VS Code and open Terminal > New Terminal.
3. Run `npm ci --legacy-peer-deps --ignore-scripts`, then `npm run dev`.
4. Open http://localhost:3000. No environment file is needed to open and navigate the dashboard.

If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm` in these commands. To stop the server, press Ctrl+C. For a production-style local run: `npm run build`, then `npm start`.

The ZIP contains the complete updated source, public assets, configuration, lockfile, tests and documentation. Installed dependencies (`node_modules`), build output, Git history and credentials are excluded. `npm ci` installs dependencies from the included lockfile.

## What each tab does

- **Memecoin Bot:** look up an Ethereum token contract address using Dexscreener. Displays market pairs, a no-results message or an actionable error. This does not assess token safety.
- **Wallet Manager:** displays only saved public addresses for the signed-in user. Explains missing configuration, signed-out, loading, empty and failed states.
- **Portfolio:** enter a public Ethereum address to retrieve holdings. Explains when its data provider is missing, unavailable, or returns no holdings.
- **Transactions:** displays saved transaction hashes for the signed-in user, with the same explicit account states.

Buying, selling, wallet generation, private-key display, transfers, and cancellation are deliberately unavailable. There is no flag that enables them. No private key or seed phrase is needed anywhere.

## Optional account configuration

Copy `.env.example` to `.env.local` and enter **your own** Supabase project URL and public anon key. Leave them blank to keep account features unavailable while public lookup remains usable. Never paste service-role keys into public environment variables.

Enable Discord in Supabase Authentication > Providers. Add each permitted dashboard origin to Authentication > URL Configuration > Redirect URLs, including http://localhost:3000 for development and the exact Vercel preview/production origin when used. Login redirects to the current browser origin, not a hardcoded localhost URL. Configure Discord's callback using the URL supplied by your Supabase project.

Run `docs/read-only-schema.sql` once in your own Supabase SQL editor. It creates separate `dashboard_wallets` and `dashboard_transactions` tables with `user_id` ownership and SELECT-only row-level security. It does not modify existing tables or copy private keys. The application does not create records: use the Supabase administrator interface to add public addresses or known transaction hashes, with the verified owner's auth user UUID. No matching records means an honest empty state. Never infer ownership from display names. Existing legacy rows are intentionally not loaded; migrate only public fields after verifying ownership.

The API verifies the session with `auth.getUser()`, filters by the verified UUID, ignores caller-supplied usernames, and selects only public fields. Account responses are not cached. No service-role credential is used. Do not connect an unreviewed legacy database: its original `wallet`, `wallets` and `transactions` permissions and stored keys need a separate review; this code cannot repair existing database policies remotely.

## Optional portfolio provider

Set `ZERION_API_KEY` in `.env.local` or Vercel Environment Variables to the base64-encoded Basic authorization credential supplied by your Zerion account. This variable is **server-only**. The old `NEXT_PUBLIC_ZERION` variable is no longer used. Without this configuration the tab remains visible and explains why lookup is unavailable.

## Vercel

Use the Next.js framework preset, Node 22.x, `npm ci --legacy-peer-deps --ignore-scripts` as install command, and `npm run build` as build command. No root-directory override is needed. Configure optional variables for the relevant environment (Preview or Production), then redeploy for public variable changes to take effect. The application does not need `NEXT_PUBLIC_URL`, Alchemy, 0x or Sentry credentials. A PR preview does not update the production domain; review and merge the PR to release through the existing Git integration.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The tests cover UI state rendering, unconfigured startup, ownership filtering, public-only responses, invalid requests, upstream failures and disabled transaction endpoints. CI runs these checks on pull requests.

## Audit and remaining work

The original code silently mapped missing arrays in Portfolio/Transactions, swallowed request failures as successful data, used a fixed localhost API/login origin, instantiated Supabase unconditionally, subscribed on every wallet render, and contained browser key custody and live transaction actions. The repair replaces those paths with typed same-origin read-only queries, optional auth, public-only account storage and visible states. A fixed light system theme on the original black layout could also hide text; the layout now has explicit contrasting colors.

The original repository included provider credentials in a tracked `.env` and a provider key in source. Those values have been removed from the repaired tree and ZIP, but remain in older Git history and deployments. Rotate the previously committed Alchemy, 0x and Zerion credentials in their provider dashboards, remove old public-prefixed provider variables from deployment settings, and redeploy. The Supabase URL/anon key are public configuration; review RLS and legacy table access separately. If any real wallet key was stored in the legacy database, treat it as exposed and handle remediation outside this dashboard.

This repository retains its existing Next.js 13 and Supabase auth-helper generation for a focused repair. A supported framework/auth-library upgrade and dependency security review remain necessary before using it as a production financial product. Live Discord login and populated account data require an available, correctly configured service owned by you; tests use isolated fixtures and do not claim that external account configuration has been repaired.
