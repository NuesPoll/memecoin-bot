# NovaPulse

A hosted Solana **devnet** launch studio with a responsive dashboard, encrypted wallet vault, standard Token-2022 creation, Raydium test pools, a reviewed 40-wallet buying batch individually reviewed sales and reviewed SOL collection to your receiving wallet. Mainnet and real-money trading remain disabled.

**Open online:** https://novapulse-nine.vercel.app — no local hosting or Discord login is required for the launch studio.

## Use the website

1. Open **Wallet manager**, choose a password of at least 12 characters and create your 40 buying wallets plus a separate launch wallet.
2. Download the encrypted project backup. Keep its password separately; there is no password reset.
3. Use the linked Solana devnet faucet to fund the launch wallet with test SOL, then refresh balances.
4. In **Token launch**, enter your token settings, create the fixed-supply token, then create its test trading pool.
5. In **Trading**, fund the buying wallets, prepare the batch, review it and explicitly submit. Forty independent transactions are used; same-block or all-or-nothing execution is not guaranteed.
6. Refresh transaction results and holdings. To sell, select a wallet, preview its sale and confirm the fresh review. Unknown results are paused and never automatically replaced.

7. In **Treasury**, paste your receiving Solana address, choose whether to include the launch wallet and choose a per-wallet reserve. Preview exact spendable test SOL and fees, verify the full address, then confirm the reviewed collection. Refresh individual results and download a fresh project backup. This moves native test SOL only; unsold tokens, liquidity positions and token-account rent stay in their existing accounts. Balances include original funding and are not reported as profit.

Use the sidebar or **Ctrl/Command + K** to navigate. **Activity** searches and filters recorded buy/sale signatures. **Practice lab** is a separate synthetic demonstration and never submits a trade.

## Back up and recover

New downloads encrypt wallet keys, token settings, pool address, receiving address, pending signature and recorded buy/sale/collection history together using AES-GCM. The derived encryption key stays only in the unlocked browser session; every snapshot uses a fresh random IV. Locking releases that session key. Passwords are cleared after unlocking.

A download is a **snapshot at that moment**. Download a fresh copy after transactions; a stale file cannot include later activity. Public transaction progress also stays in this browser so unfinished actions survive a reload. Private keys are never saved there unencrypted or sent to the server.

To move browsers or website addresses: download your latest backup on the original website, open **Wallet manager** on the new website, restore that file, enter its existing password and unlock. Check **on-chain progress**, **transaction status**, **buying-batch results** and **sale history** before continuing. Imported confirmations are rechecked on devnet; restoration never signs a replacement transaction. Valid existing browser history is retained because it may be newer than the file.

Older wallet-only files remain supported. If they lack trade history in the new browser and a token already exists, trading stays paused. Use the original browser or its latest complete project backup. If no token exists, an on-chain check clears that missing-history pause. Never create a replacement vault to recover an existing project.

## Run the complete project locally (optional)

The online website remains hosted; local setup is only for working with your downloaded source.

1. Install Node.js **22**, extract the ZIP and open the extracted folder in VS Code.
2. Run `npm ci --legacy-peer-deps --ignore-scripts`, then `npm run dev`.
3. Open http://localhost:3000. No environment file is required for the launch studio with its default devnet RPC. If PowerShell blocks npm.ps1, use `npm.cmd` instead.

For a production-style local run, use `npm run build` then `npm start`. Stop it with Ctrl+C. Source downloads include the dependency lockfile, tests, assets and documentation; they exclude installed dependencies, credentials, wallet data and Git history.

## Technical details and verification

See [Solana implementation and recovery](docs/solana-devnet.md). Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`; GitHub Actions runs the same checks with Node 22. Server and client verify the canonical devnet genesis hash, and the RPC proxy permits only the needed methods. A configured mainnet provider is rejected.

Automated SDK fixtures use mocked RPC responses. The complete funded token → pool → 40 buys → sale sequence remains unverified on-chain; passing tests and a successful deployment do not establish that this entire flow has passed live testing. This is a devnet development release.

The former Ethereum read-only dashboard remains at `/dashboard`. Its optional Discord/account and portfolio configuration is documented in [the legacy dashboard guide](docs/legacy-dashboard.md). Legacy framework/auth upgrades, dependency security review and rotation of previously committed provider credentials remain separate work before any production financial release.
