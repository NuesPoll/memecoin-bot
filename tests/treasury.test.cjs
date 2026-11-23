const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const plan=load('src/lib/solana/treasury-plan.ts',{}, {TextEncoder});
const backup=load('src/lib/solana/backup.ts',{}, {TextEncoder});
const address='2'.repeat(32),mint='3'.repeat(32),destination='4'.repeat(32),signature='5'.repeat(88);
const record=()=>({mint,destination,reserveRaw:'1000000',createdAt:100,lastValidBlockHeight:200,rows:[{address,amountRaw:'1000000',feeRaw:'5000',signature,status:'confirmed'}]});
const input={name:'Test',symbol:'T',supply:'100',poolTokens:'10',poolSol:'0.1'};
test('reserves and fee arithmetic reject precision loss and invalid values',()=>{
 assert.equal(plan.reserveAmount('0'),0n);assert.equal(plan.reserveAmount('0.001'),1000000n);
 for(const value of ['-1','0.02','1e-3','0.0000000001'])assert.throws(()=>plan.reserveAmount(value));
 for(const value of [null,NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>plan.safeLamports(value),/invalid/);
 assert.equal(plan.safeLamports(5000),5000n);
});
test('only unresolved collection states pause new submissions',()=>{
 for(const status of ['ready','submitted','confirmed','failed','unknown','not_sent'])assert.equal(plan.collectionUnresolved([{...record(),rows:[{...record().rows[0],status}]}]),['ready','submitted','unknown'].includes(status));
});
test('collection records validate identity, scope, signatures, amounts and bounded history',()=>{
 assert.equal(plan.readCollections([record()],mint,[address])[0].destination,destination);
 for(const mutate of [r=>r.mint=destination,r=>r.destination=address,r=>r.rows[0].address=destination,r=>r.rows[0].signature='bad',r=>r.rows[0].amountRaw='0',r=>r.rows.push(r.rows[0]),r=>r.reserveRaw='10000001',r=>r.rows[0].status='success']){
  const r=record();mutate(r);assert.throws(()=>plan.readCollections([r],mint,[address]),/damaged/);
 }
 assert.throws(()=>plan.readCollections(Array.from({length:11},record),mint,[address]),/damaged/);
});
test('encrypted project journals retain destination and collection results but recheck restored confirmations',()=>{
 const r=record();r.privateKey='must-not-copy';r.rows[0].secretKey='must-not-copy';
 const identity={mintAddress:mint,walletAddresses:[address]};
 const payload=backup.backupPayload(JSON.stringify({network:'devnet'}),{input,receivingAddress:destination,collections:[r]},identity,'2026-11-22T20:00:00Z');
 assert.doesNotMatch(payload,/must-not-copy/);
 const restored=backup.recoveredProgress(payload,identity).progress;
 assert.equal(restored.receivingAddress,destination);assert.equal(restored.collections[0].rows[0].signature,signature);assert.equal(restored.collections[0].rows[0].status,'unknown');assert.equal(restored.recoveryRequired,true);
 const merged=backup.mergeRecoveredProgress({input},restored);assert.equal(merged.collections.length,1);assert.equal(merged.recoveryRequired,true);
});
test('history retention never evicts an unresolved collection',()=>{
 const records=Array.from({length:10},(_,i)=>({...record(),rows:[{...record().rows[0],signature:signature+String(i),status:i===0?'unknown':'confirmed'}]}));
 const next={...record(),rows:[{...record().rows[0],signature:'new-signature',status:'unknown'}]};
 const saved=plan.rememberCollection(records,next);assert.equal(saved.length,10);assert.ok(saved.some(r=>r.rows[0].signature===signature+'0'));assert.ok(saved.some(r=>r.rows[0].signature==='new-signature'));
 assert.throws(()=>plan.rememberCollection(records.map(r=>({...r,rows:r.rows.map(row=>({...row,status:'unknown'}))})),next),/outstanding/);
});
