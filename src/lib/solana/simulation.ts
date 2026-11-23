// Synthetic practice data only. This module has no wallet, signing or network access.
export type PracticeAction = { wallet: number; kind: 'buy' | 'sell'; quantity: number; balanceAfter: number; delayMs: number; atMs: number };
export type PracticeOptions = { minDelaySeconds: number; maxDelaySeconds: number };
export const PRACTICE_WALLETS = 40;
export const PRACTICE_BUYS = 3;
export const PRACTICE_SELLS = 2;

export function practiceSchedule(options: PracticeOptions, random: () => number = Math.random): PracticeAction[] {
  const { minDelaySeconds, maxDelaySeconds } = options;
  if (!Number.isInteger(minDelaySeconds) || !Number.isInteger(maxDelaySeconds) || minDelaySeconds < 2 || maxDelaySeconds > 30 || maxDelaySeconds < minDelaySeconds) throw new Error('Choose whole-second delays between 2 and 30; maximum must be at least minimum.');
  const choose = (length: number) => {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Invalid practice random sample.');
    return Math.floor(sample * length);
  };
  const wallets = Array.from({ length: PRACTICE_WALLETS }, () => ({ buys: 0, sells: 0, balance: 0 }));
  const actions: PracticeAction[] = [];
  let atMs = 0;
  while (actions.length < PRACTICE_WALLETS * (PRACTICE_BUYS + PRACTICE_SELLS)) {
    const eligible: { wallet: number; kind: 'buy' | 'sell' }[] = [];
    wallets.forEach((state, wallet) => {
      if (state.buys < PRACTICE_BUYS) eligible.push({ wallet, kind: 'buy' });
      if (state.buys > 0 && state.balance > 0 && state.sells < PRACTICE_SELLS) eligible.push({ wallet, kind: 'sell' });
    });
    const next = eligible[choose(eligible.length)];
    const state = wallets[next.wallet];
    const quantity = next.kind === 'buy' ? 100 : state.balance * 0.25;
    if (next.kind === 'buy') { state.buys++; state.balance += quantity; }
    else { state.sells++; state.balance -= quantity; }
    const delayMs = (minDelaySeconds + choose(maxDelaySeconds - minDelaySeconds + 1)) * 1000;
    atMs += delayMs;
    actions.push({ wallet: next.wallet + 1, kind: next.kind, quantity, balanceAfter: state.balance, delayMs, atMs });
  }
  return actions;
}
