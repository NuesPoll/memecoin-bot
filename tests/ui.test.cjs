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

test('Solana studio displays the forty-wallet flow and safe initial action gates', () => {
 const Component = load('src/components/SolanaStudio.tsx', {}, {TextEncoder, TextDecoder}).default;
 const html = render(Component);
 assert.match(html, /Solana Launch Studio/i); assert.match(html, /Create 40 wallets/);
 assert.match(html, /DEVNET/); assert.match(html, /Create trading pool/); assert.match(html, /Prepare batch for review/);
 assert.match(html, /Unlock or create your wallets first/);
 assert.match(html, /SIMULATION - NO TRANSACTIONS/);
 assert.match(html, /Wallet holdings and selling/);assert.match(html,/each sale requires a fresh review/);
});

test('selling controls require a pool, backup-ready state and a resolved buy for the selected wallet',()=>{
 const Component=load('src/components/WalletTrading.tsx').default;
 const key={toBase58:()=> 'PublicTestWallet'};
 const base={project:{wallets:[{publicKey:key}]},pool:'pool',disabled:false,busy:false,holdings:[],blockedWallets:[],sales:[],run:async()=>{},track:()=>{},record:()=>{},refresh:async()=>{}};
 for(const [extra,enabled] of [[{},true],[{pool:undefined},false],[{disabled:true},false],[{blockedWallets:['PublicTestWallet']},false]]) {
  const html=renderToStaticMarkup(React.createElement(ChakraProvider,null,React.createElement(Component,{...base,...extra})));
  const preview=html.match(/<button\b[^>]*>Preview sale<\/button>/)?.[0];assert.ok(preview);assert.equal(preview.includes('disabled='),!enabled);
 }
});

test('a balance refresh error after a confirmed sale does not turn its history into a failure',async()=>{
 let index=0;const records=[];const review={used:false,walletIndex:0,tokenAmountRaw:'1000000',minimumSolRaw:'10',expectedSolRaw:'11',percent:25,slippageBps:100};
 const mockReact={...React,useState:initial=>[index++===3?review:index===5?true:initial,()=>{}]};
 const attempt={action:'sell',signature:'known-signature',lastValidBlockHeight:100,sale:{walletAddress:'public-wallet',tokenAmountRaw:'1000000',minimumSolRaw:'10'}};
 const api={connection:()=>({}),submitSell:async(_rpc,_project,_review,track)=>{track(attempt);track(undefined);return attempt.signature;}};
 const Component=load('src/components/WalletTrading.tsx',{'react':mockReact,'@/lib/solana/chain':api}).default;
 const key={toBase58:()=> 'public-wallet'};
 const tree=Component({project:{wallets:[{publicKey:key}]},pool:'pool',disabled:false,busy:false,holdings:[],blockedWallets:[],sales:[],run:async(_label,task)=>task(),track:()=>{},record:row=>records.push(row),refresh:async()=>{throw new Error('balance temporarily unavailable');}});
 function find(node){if(!node||typeof node!=='object')return null;if(node.props?.children==='Confirm devnet sale')return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child);if(found)return found;}return null;}
 const confirm=find(tree);assert.ok(confirm);assert.equal(confirm.props.isDisabled,false);
 await assert.rejects(confirm.props.onClick(),/balance temporarily unavailable/);
 assert.equal(records.length,2);assert.equal(records[1].status,'confirmed');
});

test('buy and sell practice clearly distinguishes synthetic events from submitted transactions', () => {
 const Component=load('src/components/PracticeSimulation.tsx').default;
 const html=render(Component);
 assert.match(html,/synthetic practice run/);assert.match(html,/never submits trades/);
 assert.match(html,/3 simulated buys and 2 simulated sells/);assert.match(html,/60% buys/);
 assert.match(html,/Preview shuffled schedule/);assert.match(html,/Pause practice/);
});

test('token creation is gated by backup confirmation, not the funded-wallet balance', () => {
 for(const backedUp of [false,true]) {
  let index=0;
  const key={toBase58:() => 'PublicTestAddress'};
  const mockReact={...React,useState: initial => {
   const current=index++;
   const value=current===0 ? {treasury:{publicKey:key},mint:{publicKey:key},wallets:[]} : current===6 ? backedUp : current===9 ? [10000000000] : typeof initial==='function' ? initial() : initial;
   return [value,() => {}];
  }};
  const Component=load('src/components/SolanaStudio.tsx',{'react':mockReact},{TextEncoder,TextDecoder}).default;
  const html=renderToStaticMarkup(React.createElement(ChakraProvider,null,React.createElement(Component)));
  const button=html.match(/<button\b[^>]*>Create token<\/button>/)?.[0];
  assert.ok(button);assert.equal(button.includes('disabled='),!backedUp);
  if(!backedUp) assert.match(html,/Create token is paused until you save your encrypted backup/);
 }
});
