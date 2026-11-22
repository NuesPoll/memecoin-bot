const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { load, response } = require('./helpers.cjs');
const globals = { TextEncoder, TextDecoder, crypto: webcrypto, btoa, atob };
const plan = load('src/lib/solana/plan.ts', {}, globals);
test('amount parsing preserves integer precision and rejects invalid decimals', () => {
  assert.equal(plan.units('0.000000001', 9), 1n);
  assert.equal(plan.units('1000000', 6), 1000000000000n);
  for (const bad of ['0', '-1', '1e9', '0.0000000001', 'NaN']) assert.throws(() => plan.units(bad, 9));
});
test('40-wallet budget caps total spend and slippage', () => {
  assert.equal(plan.batchBudget('0.001', 40, 100).total, 40000000n);
  for (const args of [['0.1', 40, 100], ['0.001', 39, 100], ['0.001', 40, 1000]]) assert.throws(() => plan.batchBudget(...args));
});
test('token validation rejects excess liquidity and malformed names', () => {
  assert.throws(() => plan.validateLaunch('Name', 'NOVA', '10', '10', '0.1'));
  assert.throws(() => plan.validateLaunch('Name', 'bad!', '100', '10', '0.1'));
  assert.equal(plan.validateLaunch('Name', 'NOVA', '100', '10', '0.1').sol, 100000000n);
});
test('all forty submissions start before any response is awaited', async () => {
  const items = Array.from({length: 40}, (_, i) => ({address: String(i)}));
  const releases = []; const updates = [];
  const pending = plan.submitWave(items, item => new Promise(resolve => releases.push(() => resolve('sig-' + item.address))), item => updates.push(item));
  assert.equal(releases.length, 40);
  releases.forEach(release => release()); await pending;
  assert.equal(updates.length, 40); assert.ok(updates.every(row => row.status === 'submitted'));
});
test('one uncertain submission never hides the other thirty-nine results', async () => {
  const items = Array.from({length: 40}, (_, i) => ({address: String(i)}));
  const rows = await plan.submitWave(items, async item => { if (item.address === '7') throw new Error('timeout'); return item.address; }, () => {});
  assert.equal(rows.filter(row => row.status === 'submitted').length, 39);
  assert.equal(rows[7].status, 'unknown');
});
test('duplicate wallets are rejected before any request', async () => {
  await assert.rejects(plan.submitWave(Array.from({length: 40}, () => ({address: 'duplicate'})), () => { throw new Error('must not send'); }, () => {}), /distinct/);
});
test('vault encrypts and authenticates its payload without a plaintext password or wallet key', async () => {
  const vault = load('src/lib/solana/vault.ts', {}, globals);
  const encrypted = await vault.encryptVault('test-secret-key-material', 'test password phrase');
  assert.doesNotMatch(JSON.stringify(encrypted), /test-secret|password phrase/);
  assert.equal(await vault.decryptVault(encrypted, 'test password phrase'), 'test-secret-key-material');
  await assert.rejects(vault.decryptVault(encrypted, 'different password'), /incorrect|damaged/);
  await assert.rejects(vault.decryptVault({...encrypted, iv: 'broken'}, 'test password phrase'), /incorrect|damaged/);
});
test('vault encryption uses fresh salt and IV', async () => {
  const vault = load('src/lib/solana/vault.ts', {}, globals);
  const first = await vault.encryptVault('same payload', 'test password phrase');
  const second = await vault.encryptVault('same payload', 'test password phrase');
  assert.notEqual(first.salt, second.salt); assert.notEqual(first.iv, second.iv); assert.notEqual(first.ciphertext, second.ciphertext);
});
function rpc(fetch, env = {}) { return load('src/pages/api/solana/rpc.ts', {}, {...globals, fetch, process: {env}}).default; }
const post = (method, params = []) => ({method: 'POST', body: {jsonrpc: '2.0', id: 1, method, params}});
test('RPC rejects unsupported methods and GET before network access', async () => {
  const handler = rpc(() => { throw new Error('must not call'); });
  const res = response(); await handler(post('unknown'), res); assert.equal(res.code, 400);
  const get = response(); await handler({method: 'GET'}, get); assert.equal(get.code, 405);
});
test('RPC rejects a mainnet endpoint even when configured by mistake', async () => {
  const calls = [];
  const handler = rpc(async (_url, opts) => { calls.push(JSON.parse(opts.body)); return {ok: true, json: async () => ({result: 'mainnet-genesis'})}; }, {SOLANA_DEVNET_RPC_URL: 'https://example.com'});
  const res = response(); await handler(post('sendTransaction', ['signed-bytes', {skipPreflight: false}]), res);
  assert.equal(res.code, 503); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'getGenesisHash');
});
test('RPC verifies devnet then forwards only the approved request shape', async () => {
  const calls = [];
  const handler = rpc(async (_url, opts) => { const body = JSON.parse(opts.body); calls.push(body); return {ok: true, json: async () => ({jsonrpc: '2.0', id: body.id, result: body.method === 'getGenesisHash' ? 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' : 42})}; });
  const res = response(); const req = post('getBalance', ['public-wallet']); req.body.endpoint = 'https://attacker.example';
  await handler(req, res); assert.equal(res.code, 200); assert.equal(res.body.result, 42); assert.equal(calls.length, 2); assert.equal(calls[1].endpoint, undefined);
});
test('RPC caps faucet amounts and requires preflight', async () => {
  const handler = rpc(() => { throw new Error('must not call'); });
  for (const req of [post('requestAirdrop', ['wallet', 3000000000]), post('sendTransaction', ['bytes', {skipPreflight: true}])]) {
    const res = response(); await handler(req, res); assert.equal(res.code, 400);
  }
});

test('network guard pins the full genesis hash rather than a truncated CAIP identifier', () => {
 assert.equal(plan.DEVNET_GENESIS, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
 assert.equal(plan.DEVNET_GENESIS.length, 44);
});

