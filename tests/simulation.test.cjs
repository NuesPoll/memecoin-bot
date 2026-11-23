const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers.cjs');
const simulation = load('src/lib/solana/simulation.ts');
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('synthetic schedules give all forty wallets three buys and two sells without negative holdings', () => {
 for(let seed = 0; seed < 100; seed++) {
  const actions = simulation.practiceSchedule({minDelaySeconds:2,maxDelaySeconds:5},seeded(seed));
  assert.equal(actions.length,200);
  const states = Array.from({length:40},() => ({buys:0,sells:0,balance:0}));
  let elapsed=0;
  for(const action of actions) {
   const state=states[action.wallet-1]; assert.ok(state);
   if(action.kind==='buy') {state.buys++; state.balance+=100; assert.equal(action.quantity,100);}
   else {assert.ok(state.buys>0);assert.equal(action.quantity,state.balance*0.25);state.sells++;state.balance-=action.quantity;}
   assert.ok(state.balance>=0);assert.equal(action.balanceAfter,state.balance);
   assert.ok(action.delayMs>=2000 && action.delayMs<=5000 && action.delayMs%1000===0);
   elapsed+=action.delayMs;assert.equal(action.atMs,elapsed);
  }
  assert.ok(states.every(state => state.buys===3 && state.sells===2));
 }
});

test('shuffled schedules vary while each preserves the exact buy and sell totals', () => {
 const first=simulation.practiceSchedule({minDelaySeconds:2,maxDelaySeconds:5},seeded(1));
 const second=simulation.practiceSchedule({minDelaySeconds:2,maxDelaySeconds:5},seeded(99));
 assert.notEqual(JSON.stringify(first),JSON.stringify(second));
 assert.equal(first.filter(a => a.kind==='buy').length,120);
 assert.equal(first.filter(a => a.kind==='sell').length,80);
 assert.ok(first.some((a,i) => a.kind==='sell' && first.slice(i+1).some(b => b.kind==='buy')));
 assert.ok(first.some((a,i) => i>0 && a.wallet!==first[i-1].wallet));
});

test('fixed delays still separate every action in the virtual timeline', () => {
 const rows=simulation.practiceSchedule({minDelaySeconds:3,maxDelaySeconds:3},seeded(10));
 assert.ok(rows.every((row,i) => row.delayMs===3000 && row.atMs===(i+1)*3000));
});

test('invalid delay bounds and invalid random values are rejected', () => {
 for(const [min,max] of [[0,5],[2,31],[5,2],[2.5,5],[NaN,5],[2,Infinity]]) assert.throws(() => simulation.practiceSchedule({minDelaySeconds:min,maxDelaySeconds:max}),/whole-second/);
 for(const value of [-1,1,NaN,Infinity]) assert.throws(() => simulation.practiceSchedule({minDelaySeconds:2,maxDelaySeconds:5},() => value),/random sample/);
});

test('practice generation requires no keys, network, vault or balances', () => {
 const isolated=load('src/lib/solana/simulation.ts',{}, {fetch:() => {throw new Error('must never access network');}});
 const rows=isolated.practiceSchedule({minDelaySeconds:2,maxDelaySeconds:5},seeded(42));
 assert.doesNotMatch(JSON.stringify(rows),/signature|publicKey|secretKey|treasury|http|lamports/);
});
