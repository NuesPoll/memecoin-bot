const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers.cjs');
const {Transaction, SendTransactionError} = require('@solana/web3.js');
const {TOKEN_2022_PROGRAM_ID, AuthorityType, decodeSetAuthorityInstruction, decodeMintToInstruction, decodeInitializeMintInstruction} = require('@solana/spl-token');
const bs58 = require('bs58').default;
const {DEVNET_GENESIS} = load('src/lib/solana/plan.ts');
const chain = load('src/lib/solana/chain.ts', {}, {window: {location: {origin: 'https://novapulse.example'}}, setTimeout, TextEncoder, TextDecoder});
test('project generation creates forty distinct buying wallets and restores authenticated keypairs', () => {
 const project = chain.generateProject();
 assert.equal(project.wallets.length, 40);
 const all = [project.treasury, project.mint, ...project.wallets].map(w => w.publicKey.toBase58());
 assert.equal(new Set(all).size, 42);
 const restored = chain.restoreProject(chain.serializeProject(project));
 assert.equal(restored.wallets[39].publicKey.toBase58(), project.wallets[39].publicKey.toBase58());
 const bad = JSON.parse(chain.serializeProject(project)); bad.wallets[0] = bad.wallets[1];
 assert.throws(() => chain.restoreProject(JSON.stringify(bad)), /distinct/);
});
test('creation transaction includes correct supply, no freeze authority, and mint authority revocation', async () => {
 const project = chain.generateProject(); let parsed;
 const rpc = {
  getGenesisHash: async () => DEVNET_GENESIS,
  getAccountInfo: async () => null,
  getMinimumBalanceForRentExemption: async () => 10000000,
  getLatestBlockhash: async () => ({blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100}),
  getFeeForMessage: async () => ({value: 10000}),
  getBalance: async () => 1000000000,
  sendRawTransaction: async bytes => { parsed = Transaction.from(bytes); assert.ok(bytes.length <= 1232); assert.ok(parsed.verifySignatures()); return bs58.encode(parsed.signature); },
  getSignatureStatuses: async () => ({value: [{err: null, confirmationStatus: 'confirmed'}]}),
 };
 await chain.createToken(rpc, project, {name: 'Test Coin', symbol: 'TEST', supply: '1000000', poolTokens: '100000', poolSol: '0.1'});
 const instructions = parsed.instructions.filter(ix => ix.programId.equals(TOKEN_2022_PROGRAM_ID));
 const mintTo = instructions.find(ix => ix.data[0] === 7);
 assert.equal(decodeMintToInstruction(mintTo, TOKEN_2022_PROGRAM_ID).data.amount, 1000000000000n);
 const revoke = decodeSetAuthorityInstruction(instructions[instructions.length - 1], TOKEN_2022_PROGRAM_ID);
 assert.equal(revoke.data.authorityType, AuthorityType.MintTokens); assert.equal(revoke.data.newAuthority, null);
 const initializeMint = instructions.find(ix => ix.data[0] === 0);
 assert.equal(decodeInitializeMintInstruction(initializeMint, TOKEN_2022_PROGRAM_ID).data.freezeAuthority, null);
});

function creationRpc(overrides = {}) {
 return {
  getGenesisHash: async () => DEVNET_GENESIS, getAccountInfo: async () => null,
  getMinimumBalanceForRentExemption: async () => 10000000,
  getLatestBlockhash: async () => ({blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100}),
  getFeeForMessage: async () => ({value: 10000}), getBalance: async () => 1000000000,
  sendRawTransaction: async bytes => bs58.encode(Transaction.from(bytes).signature),
  getSignatureStatuses: async () => ({value: [{err: null, confirmationStatus: 'confirmed'}]}),
  ...overrides,
 };
}
const input = {name: 'Test Coin', symbol: 'TEST', supply: '1000000', poolTokens: '100000', poolSol: '0.1'};

test('unfunded mint creation checks actual rent and fee before any broadcast', async () => {
 let sent = false; const attempts = [];
 const rpc = creationRpc({getBalance: async () => 0, sendRawTransaction: async () => {sent = true;}});
 await assert.rejects(chain.createToken(rpc, chain.generateProject(), input, attempt => attempts.push(attempt)), /0\.000000000 test SOL.*0\.020010000.*Nothing was submitted/);
 assert.equal(sent, false); assert.equal(attempts.length, 0);
});

test('unknown fee estimate fails before broadcast', async () => {
 const rpc = creationRpc({getFeeForMessage: async () => ({value: null}), sendRawTransaction: async () => {throw new Error('must not send');}});
 await assert.rejects(chain.createToken(rpc, chain.generateProject(), input), /could not estimate.*Nothing was submitted/);
});

test('preflight rejection remains actionable and clears the persisted attempt', async () => {
 const attempts = [];
 const rpc = creationRpc({sendRawTransaction: async () => {throw new SendTransactionError({action: 'send', signature: '', transactionMessage: 'Preflight rejected: There is not enough test SOL to pay account rent.'});}});
 await assert.rejects(chain.createToken(rpc, chain.generateProject(), input, attempt => attempts.push(attempt)), /Preflight rejected:.*test SOL/);
 assert.equal(attempts[0].action, 'token'); assert.equal(attempts[0].lastValidBlockHeight, 100);
 assert.equal(attempts[1], undefined);
});

test('transport failure preserves signature for recovery without resending', async () => {
 let sent = 0; const attempts = [];
 const rpc = creationRpc({sendRawTransaction: async () => {sent++; throw new Error('private-provider-url?token=secret');}, getSignatureStatuses: async () => ({value: [null]})});
 await assert.rejects(chain.createToken(rpc, chain.generateProject(), input, attempt => attempts.push(attempt)), error => /Check transaction status/.test(error.message) && !/private-provider|secret/.test(error.message));
 assert.equal(sent, 1); assert.equal(attempts.length, 1); assert.ok(attempts[0].signature);
 assert.doesNotMatch(JSON.stringify(attempts), /secretKey|wallets|treasury/);
});

test('interrupted submission confirmed by chain does not cause another broadcast', async () => {
 let sent = 0; const attempts = [];
 const rpc = creationRpc({sendRawTransaction: async () => {sent++; throw new Error('timeout');}});
 const signature = await chain.createToken(rpc, chain.generateProject(), input, attempt => attempts.push(attempt));
 assert.equal(signature, attempts[0].signature); assert.equal(attempts[1], undefined); assert.equal(sent, 1);
});

test('transaction recovery distinguishes failed, confirmed, expired and unresolved results', async () => {
 const attempt = {signature:'public-signature',lastValidBlockHeight:100,action:'token'};
 for (const [state, height, expected] of [[null, 101, 'expired'], [null, 100, 'unknown'], [{err:null,confirmationStatus:'processed'},101,'unknown'], [{err:null,confirmationStatus:'confirmed'},101,'confirmed'], [{err:'InsufficientFundsForFee',confirmationStatus:'confirmed'},101,'failed']]) {
  const rpc = creationRpc({getSignatureStatuses:async () => ({value:[state]}),getBlockHeight:async () => height});
  assert.equal(await chain.checkTransaction(rpc,attempt),expected);
 }
 await assert.rejects(chain.checkTransaction(creationRpc({getGenesisHash:async () => 'mainnet'}),attempt),/Devnet verification/);
});
test('mainnet genesis is rejected before mint creation or faucet use', async () => {
 const project = chain.generateProject(); const rpc = {getGenesisHash: async () => 'mainnet'};
 await assert.rejects(chain.createToken(rpc, project, {name:'Test',symbol:'T',supply:'100',poolTokens:'10',poolSol:'0.1'}), /Devnet verification/);
 await assert.rejects(chain.requestTestSol(rpc, project), /Devnet verification/);
});
