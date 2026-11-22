const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers.cjs');
const {Transaction} = require('@solana/web3.js');
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
  getLatestBlockhash: async () => ({blockhash: '11111111111111111111111111111111'}),
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
test('mainnet genesis is rejected before mint creation or faucet use', async () => {
 const project = chain.generateProject(); const rpc = {getGenesisHash: async () => 'mainnet'};
 await assert.rejects(chain.createToken(rpc, project, {name:'Test',symbol:'T',supply:'100',poolTokens:'10',poolSol:'0.1'}), /Devnet verification/);
 await assert.rejects(chain.requestTestSol(rpc, project), /Devnet verification/);
});
