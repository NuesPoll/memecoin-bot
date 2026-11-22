# Standard Solana launch and 40-wallet devnet batch

This feature is a hosted devnet implementation. It does not enable mainnet trading and cannot use real SOL. The original Ethereum read-only dashboard remains at /dashboard.

## User flow

1. Choose a password of at least 12 characters and create the vault. The browser generates 40 buying keypairs, one launch keypair and one token mint keypair. No server generates, receives or stores those private keys.
2. Download the AES-GCM encrypted backup and retain its password separately. PBKDF2-SHA256 uses a random salt and 600,000 iterations. Only ciphertext is saved in browser storage. Unlocking decrypts in browser memory. There is no password reset.
3. Request devnet SOL for the launch wallet or use the Solana devnet faucet. The public faucet can be rate limited. Do not send mainnet assets to these test addresses.
4. Create the Token-2022 token with on-mint name/symbol metadata, 6 decimals, fixed minted supply and no freeze authority. Mint authority is revoked in the creation transaction. The metadata update authority stays with the launch wallet. The off-chain metadata URI uses this hosted app.
5. Seed its Raydium devnet CPMM token/WSOL pool. The launch wallet pays pool fees and rent in addition to initial liquidity. LP tokens remain in the launch wallet; they are not automatically burned or locked.
6. Fund all 40 buying wallets. Each is topped up to its purchase cap plus a 0.01 test SOL account-rent/fee reserve. The batch spend is capped at 1 test SOL in this version.
7. Prepare purchases, review the aggregate cap and per-wallet minimum received, then submit. A conservative quote treats each wallet as if the other 39 buys happened first. An additional user-selected slippage limit is applied. Quotes expire after 30 seconds.
8. The app refreshes the blockhash, signs all 40 transactions locally, records their signatures before transmission, and starts all submission requests in one wave. Refresh transaction status to confirm results. Submission is not confirmation. Each transaction can succeed or fail independently; same-block inclusion and atomic success across all 40 are not guaranteed. There is no automatic replacement purchase after uncertainty or failure.

## Hosting and RPC

The source is intended for Vercel, not permanent localhost hosting. Its /api/solana/rpc route only permits a fixed method allowlist and verifies the RPC genesis hash against Solana devnet before relaying anything. There is no mainnet fallback or network-switch flag. Only public account addresses and signed transactions cross that boundary. Optional SOLANA_DEVNET_RPC_URL is server-only and must point to an HTTPS devnet provider; a mistakenly configured mainnet provider is rejected. Public devnet RPC/faucets may throttle a 40-wallet workload; a suitable devnet provider may be needed for reliable tests.

The existing mainnet Ethereum transaction endpoints stay blocked. Do not set live wallet credentials, seed phrases or private keys in Vercel variables. None are needed.

## Recovery and limits

The encrypted backup restores key material on another device. Public progress (mint/pool flags and transaction signatures) is stored separately in the original browser. It is not yet a cross-device project journal. Save the public mint/pool addresses and inspect on-chain state after any uncertain response. This devnet version intentionally permits one purchase batch per project and never silently repeats all purchases. Keep the original browser storage until checking the batch is complete. An audited mainnet release, richer recovery, and comprehensive live testing are separate milestones; this test feature must not be presented as already verified with real funds.

## Dependencies and validation

Solana and Raydium packages are pinned directly. During the development build, npm install generates an updated dependency lockfile in GitHub Actions, published as the solana-lockfile artifact. Local package installation was unavailable in the authoring session. Pure validation, encryption and API guard tests can run with the existing checkout packages; SDK compilation and transaction tests run in the connected GitHub build. Build results and live test results must be checked before claiming completion.

Primary implementation references:
- https://solana.com/docs/tokens/extensions/metadata
- https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/cpmm/createCpmmPool.ts
- https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/cpmm/swap.ts
