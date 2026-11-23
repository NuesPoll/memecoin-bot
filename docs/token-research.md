# Token research and original drafts

Research is read-only Solana mainnet data; all on-chain NovaPulse actions remain devnet-only. It requires no wallet, private key, account login or market-data key for the current public GeckoTerminal endpoints.

The scanner samples page 1 of GeckoTerminal trending and new Solana pools. It deduplicates tokens by their highest reported liquidity pool. This is not a scan or definitive leaderboard of the entire market. Missing provider attributes remain null. Pool creation time is labeled as pool age and must not be called token mint/launch time. Age and performance use independent selectors (2/3/6/7 hours), plus a reported USD-liquidity filter.

Analyze checks at most six pools per user request, two at a time. Each pool uses one bounded request for ten hourly USD/base-token OHLCV candles with empty intervals requested from the provider. Current incomplete candles are excluded. For each N-hour window, N contiguous complete UTC hourly candles are required: return = (last close / first open - 1) * 100. Volume is the sum of their observed volumes. Missing timestamps, duplicates, invalid prices, nonfinite values and stale final candles are never interpolated into returns. The displayed endpoint timestamp is the end of the latest complete hour, not the current instant. Very young pools often lack sufficient history for longer windows.

Candidate lists and history are cached for 90 seconds; responses are bounded and fixed upstream hosts prevent user-controlled fetch targets. Partial source availability is labeled; provider failures/rate limits produce visible errors without fake fallback winners. The price sparkline uses only observed complete closing prices. A high historical return is neither a safety rating nor a guarantee of future returns.

Original token studio accepts an original name/symbol and can use a selected market only as a reference. It rejects reusing that reference's exact name or symbol, does not copy logos/contracts and never automatically creates a token or submits a trade. Applying a draft changes only name/symbol on the existing devnet launch form; all supply/liquidity settings still need review. Existing/unresolved projects keep their token settings locked. Draft settings survive creation of the wallet vault. Account login never syncs research drafts or wallet keys to a server.

Reference: https://docs.coingecko.com/reference/pool-ohlcv-contract-address
