const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, response } = require('./helpers.cjs');
const address = '0x' + '1'.repeat(40);
const request = (query = {}, method = 'GET') => ({ query, method });
function server(configured = false, client = null, globals = {}) {
  return load('src/lib/server.ts', { './config': { hasAuth: configured }, '@supabase/auth-helpers-nextjs': { createServerSupabaseClient() { if (!client) throw new Error('Should not create a client'); return client; } } }, globals);
}
function route(name, helpers, globals) { return load('src/pages/api/' + name + '.ts', { '@/lib/server': helpers }, globals).default; }
test('missing and malformed auth configuration is safe', () => {
  const { authConfigured } = load('src/lib/config.ts');
  assert.equal(authConfigured(), false);
  assert.equal(authConfigured('not-a-url', 'key'), false);
  assert.equal(authConfigured('https://project.supabase.co', 'key'), true);
});
test('account reads without configuration fail visibly before client creation', async () => {
  const res = response(); await server().accountRows(request(), res, 'wallets');
  assert.equal(res.code, 503); assert.match(res.body.error, /not configured/); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('account writes are rejected', async () => {
  const res = response(); await server().accountRows(request({}, 'POST'), res, 'wallets');
  assert.equal(res.code, 405); assert.equal(res.headers.Allow, 'GET');
});
test('unverified sessions cannot query account tables', async () => {
  const res = response(); await server(true, { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from() { throw new Error('Must not query'); } }).accountRows(request(), res, 'transactions');
  assert.equal(res.code, 401);
});
for (const kind of ['wallets', 'transactions']) test(kind + ' uses verified identity and explicit public-only columns', async () => {
  const calls = [];
  const query = { select(value) { calls.push(['select', value]); return this; }, eq(...values) { calls.push(['eq', ...values]); return this; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } }, error: null }) }, from(table) { calls.push(['from', table]); return query; } };
  const res = response(); await server(true, client).accountRows(request({ username: 'victim', user_id: 'victim' }), res, kind);
  assert.equal(res.code, 200);
  assert.deepEqual(calls, [['from', 'dashboard_' + kind], ['select', kind === 'wallets' ? 'public_key,active' : 'hash,created_at'], ['eq', 'user_id', 'verified-owner']]);
  assert.equal(JSON.stringify(res.body), '[]');
});
test('storage failures return an actionable error without database details', async () => {
  const query = { select() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ data: null, error: { message: 'sensitive database detail' } }).then(resolve); } };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => query };
  const res = response(); await server(true, client).accountRows(request(), res, 'wallets');
  assert.equal(res.code, 503); assert.doesNotMatch(JSON.stringify(res.body), /sensitive/);
});
for (const endpoint of ['cancel', 'flashbot']) for (const method of ['GET', 'POST']) test(endpoint + ' blocks ' + method + ' without network access', async () => {
  const res = response(); await route(endpoint, {})(request({}, method), res);
  assert.equal(res.code, 403); assert.match(res.body.error, /disabled/);
});
test('token lookup validates input before external request', async () => {
  const res = response(); await route('token-info', server())(request({ tokenAddress: ['bad'] }), res);
  assert.equal(res.code, 400);
});
test('token upstream failures are not disguised as successful data', async () => {
  const res = response(); await route('token-info', server())(request({ tokenAddress: address }), res);
  assert.equal(res.code, 502); assert.match(res.body.error, /unavailable/);
});
test('token lookup handles null pairs and filters to Ethereum', async () => {
  for (const pairs of [null, [{ chainId: 'ethereum', priceUsd: '1' }, { chainId: 'solana' }]]) {
    const helpers = server(false, null, { fetch: async () => ({ ok: true, json: async () => ({ pairs }) }) });
    const res = response(); await route('token-info', helpers)(request({ tokenAddress: address }), res);
    assert.equal(res.code, 200); assert.equal(res.body.pairs.length, pairs ? 1 : 0);
  }
});
test('portfolio missing provider configuration returns 503', async () => {
  const res = response(); await route('wallet/portfolio', server())(request({ address }), res);
  assert.equal(res.code, 503); assert.match(res.body.error, /not configured/);
});
test('portfolio uses a server-only credential and propagates upstream failure safely', async () => {
  let headers;
  const helpers = server(false, null, { fetch: async (_url, options) => { headers = options.headers; return { ok: false }; } });
  const res = response(); await route('wallet/portfolio', helpers, { process: { env: { ZERION_API_KEY: 'test-credential' } } })(request({ address }), res);
  assert.equal(headers.authorization, 'Basic test-credential'); assert.equal(res.code, 502); assert.doesNotMatch(JSON.stringify(res.body), /test-credential/);
});
test('client request helper rejects unsuccessful responses', async () => {
  const { getJson } = load('src/lib/api.ts', {}, { fetch: async () => ({ ok: false, json: async () => ({ error: 'Unavailable' }) }) });
  await assert.rejects(getJson('/api/wallet/wallets'), /Unavailable/);
});
