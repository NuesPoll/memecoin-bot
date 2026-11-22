const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ChakraProvider } = require('@chakra-ui/react');
const { load } = require('./helpers.cjs');
function render(Component, props = {}) { return renderToStaticMarkup(React.createElement(ChakraProvider, null, React.createElement(Component, props))).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ''); }
for (const [auth, expected] of [
  [{ configured: false }, /Account data is not configured/],
  [{ configured: true, loading: true }, /Checking your session/],
  [{ configured: true, error: true }, /account service is unavailable/],
  [{ configured: true, user: null }, /Sign in with Discord/],
  [{ configured: true, user: { id: 'owner' } }, /Account content/],
]) test('account gate renders ' + expected, () => {
  const Component = load('src/components/AccountGate.tsx', { './Auth': { useAuth: () => auth } }).default;
  assert.match(render(Component, { children: React.createElement('div', null, 'Account content') }), expected);
});
for (const kind of ['wallets', 'transactions']) for (const [query, expected] of [
  [{ isLoading: true }, new RegExp('Loading ' + kind)],
  [{ isError: true, error: new Error('Service failed') }, /Service failed/],
  [{ data: [] }, new RegExp('No saved ' + kind)],
  [{ data: [{ public_key: 'public-address', hash: 'public-hash' }] }, new RegExp(kind === 'wallets' ? 'public-address' : 'public-hash')],
]) test(kind + ' renders ' + expected, () => {
  const Component = load('src/components/AccountList.tsx', { './Auth': { useAuth: () => ({ user: { id: 'owner' } }) }, '@tanstack/react-query': { useQuery: () => query } }).default;
  assert.match(render(Component, { kind }), expected);
});
test('public token lookup has content without login or configuration', () => {
  const Component = load('src/components/Buying/Buying.tsx', { '@tanstack/react-query': { useQuery: () => ({}) } }).default;
  const html = render(Component);
  assert.match(html, /Token contract address/); assert.match(html, /Look up token/); assert.match(html, /Live trading is disabled/);
});
test('token lookup shows empty and error states', () => {
  for (const [query, pattern] of [[{ isSuccess: true, data: { pairs: [] } }, /No market pairs/], [{ isError: true, error: new Error('Provider failed') }, /Provider failed/]]) {
    const Component = load('src/components/Buying/Buying.tsx', { '@tanstack/react-query': { useQuery: () => query } }).default;
    assert.match(render(Component), pattern);
  }
});
test('portfolio shows instructions and handles sparse upstream assets', () => {
  for (const query of [{}, { isSuccess: true, data: { data: [{ attributes: {} }] } }]) {
    const Component = load('src/components/Portfolio/Portfolio.tsx', { '@tanstack/react-query': { useQuery: () => query } }).default;
    assert.match(render(Component), /Public wallet address/);
  }
});
test('missing configuration does not construct Supabase', () => {
  const Component = load('src/components/Auth.tsx', { '@/lib/config': { hasAuth: false }, '@supabase/auth-helpers-nextjs': { createBrowserSupabaseClient() { throw new Error('Must not construct'); } } }).default;
  assert.match(render(Component, { children: React.createElement('div', null, 'Dashboard available') }), /Dashboard available/);
});
