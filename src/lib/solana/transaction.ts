// Return fixed, public explanations. Never display provider URLs, tokens or raw logs.
export function describeTransactionError(error: unknown): string {
  if (error === 'InsufficientFundsForFee' || error === 'AccountNotFound') return 'The launch wallet needs free devnet SOL for network fees. Open the devnet faucet, then refresh balances.';
  if (error === 'BlockhashNotFound') return 'The transaction expired before simulation. Check on-chain progress before preparing it again.';
  if (error === 'AlreadyProcessed') return 'This transaction was already processed. Check its status before continuing.';
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    if ('InsufficientFundsForRent' in value) return 'There is not enough test SOL to pay account rent. Request free devnet SOL, then refresh balances.';
    const instruction = value.InstructionError;
    if (Array.isArray(instruction) && Number.isInteger(instruction[0]) && instruction[0] >= 0 && instruction[0] < 256) {
      const detail = instruction[1];
      if (detail === 'InsufficientFunds') return 'There is not enough test SOL or token balance for this instruction. Refresh balances before continuing.';
      if (detail && typeof detail === 'object' && Number.isSafeInteger(detail.Custom) && detail.Custom >= 0) return `Instruction ${instruction[0] + 1} was rejected by the on-chain program (code ${detail.Custom}). Check on-chain progress before continuing.`;
      return `Instruction ${instruction[0] + 1} was rejected by the on-chain program. Check on-chain progress before continuing.`;
    }
  }
  return 'The devnet transaction was rejected. Check the launch wallet balance and on-chain progress before continuing.';
}
