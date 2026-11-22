export const WALLET_COUNT = 40;
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const VAULT_VERSION = 'novapulse-devnet-v1';
export type WalletResult = { address: string; status: 'ready' | 'submitted' | 'confirmed' | 'failed' | 'unknown'; signature?: string; message?: string };

// Parse amounts as integers: floating-point rounding must never alter a spend cap.
export function units(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) throw new Error('Enter a positive decimal amount.');
  const [whole, fraction = ''] = value.trim().split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const result = BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (result <= BigInt(0) || result > BigInt('18446744073709551615')) throw new Error('Amount is outside the supported range.');
  return result;
}

export function validateLaunch(name: string, symbol: string, supply: string, poolTokens: string, poolSol: string) {
  if (!name.trim() || new TextEncoder().encode(name.trim()).length > 32) throw new Error('Token name must use 1–32 bytes.');
  if (!/^[A-Za-z0-9]{1,10}$/.test(symbol)) throw new Error('Symbol must contain 1–10 letters or numbers.');
  const total = units(supply, 6);
  const liquidity = units(poolTokens, 6);
  if (liquidity >= total) throw new Error('Pool token amount must be smaller than the total supply.');
  const sol = units(poolSol, 9);
  if (sol > BigInt(1_000_000_000)) throw new Error('This test version limits initial liquidity to 1 test SOL.');
  return { total, liquidity, sol };
}

export function batchBudget(amount: string, count: number, slippageBps: number) {
  if (count !== WALLET_COUNT) throw new Error('The batch must contain exactly 40 distinct wallets.');
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new Error('Slippage must be between 0.01% and 5%.');
  const perWallet = units(amount, 9);
  const total = perWallet * BigInt(count);
  if (total > BigInt(1_000_000_000)) throw new Error('This test version limits a complete batch to 1 test SOL.');
  return { perWallet, total };
}

export async function submitWave<T extends { address: string }>(
  prepared: T[],
  submit: (item: T) => Promise<string>,
  update: (result: WalletResult) => void,
) {
  if (prepared.length !== WALLET_COUNT || new Set(prepared.map(item => item.address)).size !== WALLET_COUNT) throw new Error('Prepare 40 distinct wallets before submission.');
  // All submissions start before awaiting any result. Failures never cancel other statuses.
  return Promise.all(prepared.map(async item => {
    try {
      const signature = await submit(item);
      const result: WalletResult = { address: item.address, status: 'submitted', signature };
      update(result);
      return result;
    } catch {
      // A transport failure is uncertain: the RPC may have accepted the signed transaction.
      const result: WalletResult = { address: item.address, status: 'unknown', message: 'Submission response unavailable. Check status before retrying.' };
      update(result);
      return result;
    }
  }));
}
