const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {filterActivity}=load('src/lib/workspace.ts');
const rows=['ready','submitted','unknown','confirmed','failed','expired'].map((status,i)=>({address:'Wallet'+i,signature:'Signature'+i,status,kind:i%2?'Sell':'Buy'}));
test('activity filters keep unresolved results separate from confirmation and failure',()=>{
 assert.equal(filterActivity(rows,'all','').length,6);
 assert.equal(filterActivity(rows,'confirmed','').length,1);
 assert.equal(filterActivity(rows,'unresolved','').length,3);
 assert.equal(filterActivity(rows,'failed','').length,2);
 assert.equal(filterActivity(rows,'confirmed','')[0].status,'confirmed');
});
test('transaction search handles addresses, signatures, kinds, whitespace and empty results',()=>{
 assert.equal(filterActivity(rows,'all',' wallet3 ')[0].signature,'Signature3');
 assert.equal(filterActivity(rows,'all','SIGNATURE2')[0].status,'unknown');
 assert.equal(filterActivity(rows,'unresolved','sell').length,1);
 assert.equal(filterActivity(rows,'confirmed','wallet0').length,0);
 assert.equal(filterActivity([],'all','').length,0);
 assert.equal(rows.length,6);
});

test('collection activity can be searched by its receiving destination',()=>{
 const row={address:'Source',destination:'ReceivingWallet',signature:'KnownSignature',status:'unknown',kind:'Collect'};
 assert.equal(filterActivity([row],'unresolved','receivingwallet').length,1);
 assert.equal(filterActivity([row],'all','collect').length,1);
});
