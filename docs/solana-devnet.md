# Standard Solana launch and 40-wallet devnet batch

This feature is a hosted devnet implementation. It does not enable mainnet trading and cannot use real SOL. The original Ethereum read-only dashboard remains at /dashboard.

## User flow

1. Choose a password of at least 12 characters and create the vault. The browser generates 40 buying keypairs, one launch keypair and one token mint keypair. No server generates, receives or stores those private keys.
2. Download the AES-GCM encrypted backup and retain its password separately. PBKDF2-SHA256 uses a random salt and 600,000 iterations. Only ciphertext is saved in browser storage. Unlocking decrypts in browser memory. There is no password reset.
3. Open the Solana web faucet, paste the launch wallet public address, request test SOL, then refresh balances. The RPC faucet returned HTTP 410 (closed) during verification, so the app uses the web faucet. It may require sign-in or a challenge. Do not send mainnet assets to these test addresses.
4. Create the Token-2022 token with on-mint name/symbol metadata, 6 decimals, fixed minted supply and no freeze authority. Mint authority is revoked in the creation transaction. The metadata update authority stays with the launch wallet. The off-chain metadata URI uses this hosted app.
5. Seed its Raydium devnet CPMM token/WSOL pool. The launch wallet pays pool fees and rent in addition to initial liquidity. LP tokens remain in the launch wallet; they are not automatically burned or locked.
6. Fund all 40 buying wallets. Each is topped up to its purchase cap plus a 0.01 test SOL account-rent/fee reserve. The batch spend is capped at 1 test SOL in this version.
7. Prepare purchases, review the aggregate cap and per-wallet minimum received, then submit. A conservative quote treats each wallet as if the other 39 buys happened first. An additional user-selected slippage limit is applied. Quotes expire after 30 seconds.
8. The app refreshes the blockhash, signs all 40 transactions locally, records their signatures before transmission, and starts all submission requests in one wave. Refresh transaction status to confirm results. Submission is not confirmation. Each transaction can succeed or fail independently; same-block inclusion and atomic success across all 40 are not guaranteed. There is no automatic replacement purchase after uncertainty or failure.

## Hosting and RPC

The source is intended for Vercel, not permanent localhost hosting. Its /api/solana/rpc route only permits a fixed method allowlist and verifies the RPC genesis hash against Solana devnet before relaying anything. There is no mainnet fallback or network-switch flag. Only public account addresses and signed transactions cross that boundary. Optional SOLANA_DEVNET_RPC_URL is server-only and must point to an HTTPS devnet provider; a mistakenly configured mainnet provider is rejected. Public devnet RPC/faucets may throttle a 40-wallet workload; a suitable devnet provider may be needed for reliable tests.

The existing mainnet Ethereum transaction endpoints stay blocked. Do not set live wallet credentials, seed phrases or private keys in Vercel variables. None are needed.

## Wallet holdings and reviewed sales

Refresh balances now reads both native devnet SOL and the project's Token-2022 associated token accounts for the launch wallet and forty buying wallets. Raw token values stay exact integers; missing associated accounts are zero, while wrong-owner, wrong-mint, malformed and incomplete responses fail visibly. The app creates associated token accounts for its buys. Tokens held in unrelated non-associated accounts are outside this view.

The Wallet holdings and selling panel previews a single buying wallet's 25%, 50% or 100% sale into the recovered/created Raydium devnet token/WSOL pool. It checks the official devnet program and both pool mints, reads actual holdings, rejects frozen/empty accounts, refreshes owner accounts and builds a pinned-SDK swap. The review shows the exact token input, quoted output, slippage and minimum output before network fees. A checkbox and separate Confirm devnet sale action are required. Quotes expire after 30 seconds from preparation start; a consumed review cannot be used again, including concurrent submissions. A balance decrease or project change stops submission. The selected wallet needs test SOL for WSOL account rent and network fees; output is unwrapped to test SOL by the SDK.

Before broadcast, the public sale intent, signature and validity window are saved alongside project progress. Failed preflight and confirmed/failed/expired/unknown results are distinct; unknown results pause further submissions until checked. History retains the latest 100 sale records and never labels an unknown or failed trade as completed. Confirmed sales remain confirmed if a subsequent balance refresh fails. User-selected sales are single reviewed actions, with no automated repeat-buy/sell or volume generation. All paths remain devnet-only. The browser-only practice simulator is optional and separate from these transaction controls.

## Project recovery

The encrypted backup restores key material on another device. Public progress (mint/pool flags and transaction signatures) is stored separately in the original browser. It is not yet a cross-device project journal. Save the public mint/pool addresses. The Check on-chain progress button restores verified mint/pool flags after an uncertain response or a move to another device; paste the saved pool address when needed. This devnet version intentionally permits one purchase batch per project and never silently repeats all purchases. Keep the original browser storage until checking the batch is complete. An audited mainnet release, richer recovery, and comprehensive live testing are separate milestones; this test feature must not be presented as already verified with real funds.

## Dependencies and validation

Solana and Raydium packages are pinned directly. The dependency lockfile generated by the passing GitHub build is committed, and installs use npm ci. Local package installation was unavailable in the authoring session. Pure validation, encryption and API guard tests can run with the existing checkout packages; SDK compilation and transaction tests run in the connected GitHub build. Build results and live test results must be checked before claiming completion.

Primary implementation references:
- https://solana.com/docs/tokens/extensions/metadata
- https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/cpmm/createCpmmPool.ts
- https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/cpmm/swap.ts

## Token-creation error recovery

Create token remains disabled until the vault is unlocked, its encrypted backup is saved or explicitly acknowledged as already saved, and any pending transaction is checked. Saving/acknowledging the backup is remembered for that project on that browser. The reason is displayed beside the token controls. Restoring and successfully decrypting a backup also saves its ciphertext for later unlocks; no plaintext keys are stored.

## Shuffled practice simulation

The separate Shuffled buy/sell practice panel is entirely synthetic. It uses 40 virtual wallets, three simulated buys and two simulated sells each, for 200 actions (60% buys). Each virtual sell uses 25% of current virtual holdings and is eligible only after a buy. Delays default to 2-5 seconds and can be set to whole seconds between 2 and 30. Preview creates a finite schedule, playback applies one event per delay, and pause/resume/reset affect only that in-memory simulation. Timers are cleared when paused or unmounted; background browser throttling can lengthen delays. The schedule is not saved across page reloads. This module imports no wallet/signing/network code, never accesses the vault and never submits transactions. Virtual tokens do not represent prices, proceeds or expected execution. It is not a real buy/sell cycle bot.

## Hosted addresses and recovery

The public devnet website is https://novapulse-nine.vercel.app. Old preview deployment addresses are immutable and may still contain earlier errors. Browser vault storage belongs to each address separately: download the encrypted backup on the original address and restore that same backup on the updated address. Do not create a replacement vault to recover an existing project.

Before mint creation the app reads the actual account-rent costs, network fee and launch-wallet balance. An unfunded wallet is stopped before broadcast with the required test SOL amount and a faucet instruction. RPC preflight errors receive fixed explanations rather than provider URLs or raw logs. A signed attempt is saved before broadcast; interrupted results pause new transactions and expose a status check. Failed/expired results do not trigger automatic replacement transactions. The public read-only /api/solana/transaction?signature= endpoint verifies devnet before looking up a public signature. An absent signature alone is not proof of failed submission.

## Current verification status

The preceding source passed 69 automated tests, type checks, lint and the optimized Node 22 build. Current validation details are linked from PR #2 and the separate Verification-Solana.txt release record. The public short address is hosted on Vercel; browser inspection verified the public page and the synthetic practice controls. Live wallet creation, backup restoration, pool trading and sale signing have not been independently verified end to end. An earlier live check reached the closed RPC faucet (HTTP 410), before token/pool/funding/purchases. The complete funded on-chain flow still needs devnet verification. Mainnet remains disabled.

## Complete encrypted project snapshots

Current downloads seal wallet keys and a validated project journal in one AES-GCM authenticated payload. The outer encrypted-vault format stays compatible; existing wallet-only files still decrypt. The journal includes token settings, pool address, current pending attempt, all 40 signed batch records and up to 100 sale records. It never contains a plaintext password. Every reseal uses a new 96-bit random IV with the non-exportable session key. The session key is dropped when the vault locks. File and decrypted payload sizes are bounded.

Restore validates the format, mint identity, wallet membership, unique signatures/rows, amount ranges, statuses and block heights. Only recognized fields are copied. Imported token/pool flags reset and all imported batch/sale confirmations become unknown until actual devnet checks. A pending signature and its validity window survive recovery; no transaction is sent as part of importing or inspecting a backup. Existing valid browser history takes precedence over a possibly older snapshot. Damaged local history can be recovered with a valid complete backup.

Snapshots cannot include actions performed after their download. Keep the original browser until results are settled and download a current file before moving devices. A legacy file without browser history pauses trading for an existing token. An on-chain inspection confirming no token exists clears this missing-history pause. Legacy keys alone cannot reconstruct every previous transaction. Sale-history refresh performs one batched signature lookup for up to 100 records; absent/processed records stay unknown and block a new sale from the same wallet. Incomplete lookup responses fail visibly.
