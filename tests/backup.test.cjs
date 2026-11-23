const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {load}=require('./helpers.cjs');
const globals={crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob};
const backup=load('src/lib/solana/backup.ts',{},globals);
const vault=load('src/lib/solana/vault.ts',{},globals);
const address=i=>'1'.repeat(31)+['2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f','g','h'][i];
const identity={mintAddress:'1'.repeat(32),walletAddresses:Array.from({length:40},(_,i)=>address(i))};
const sig=i=>'2'.repeat(86)+String(i+1).replace(/0/g,'A');
const input={name:'Test',symbol:'NOVA',supply:'1000000',poolTokens:'100000',poolSol:'0.1'};
const attempt={signature:'3'.repeat(88),lastValidBlockHeight:100,action:'sell',sale:{walletAddress:address(0),tokenAmountRaw:'18446744073709551615',minimumSolRaw:'1'}};
const progress=()=>({input,tokenCreated:true,poolCreated:true,pool:'4'.repeat(32),backupAcknowledged:true,pending:attempt,sales:[{...attempt,status:'confirmed'}],batch:{lastValidBlockHeight:101,rows:identity.walletAddresses.map((address,i)=>({address,status:'confirmed',signature:sig(i)}))}});
const keys=JSON.stringify({network:'devnet',treasury:'private-key-placeholder',wallets:['secret-wallet-placeholder']});
const stamp='2026-11-22T20:00:00.000Z';
const payload=value=>backup.backupPayload(keys,value,identity,stamp);

test('complete backups authenticate keys and exact transaction records together without leaking plaintext',async()=>{
 const session=await vault.createVaultSession('a long test password');
 const sealed=await session.seal(payload(progress()));
 assert.doesNotMatch(JSON.stringify(sealed),/private-key|secret-wallet|NOVA|walletAddress|lastValidBlockHeight/);
 const opened=await vault.openVault(sealed,'a long test password');
 const restored=backup.recoveredProgress(opened.payload,identity);
 assert.equal(restored.savedAt,stamp);assert.equal(restored.progress.pending.signature,attempt.signature);
 assert.equal(restored.progress.sales[0].sale.tokenAmountRaw,'18446744073709551615');
 assert.equal(restored.progress.batch.rows.length,40);
 assert.equal(JSON.parse(opened.payload).treasury,'private-key-placeholder');
 const damaged={...sealed,ciphertext:sealed.ciphertext.slice(0,10)+(sealed.ciphertext[10]==='A'?'B':'A')+sealed.ciphertext.slice(11)};
 await assert.rejects(vault.openVault(damaged,'a long test password'),/damaged/);
});

test('restored confirmations require on-chain verification and unresolved signatures are never discarded',()=>{
 const restored=backup.recoveredProgress(payload(progress()),identity).progress;
 assert.equal(restored.tokenCreated,false);assert.equal(restored.poolCreated,false);assert.equal(restored.recoveryRequired,true);
 assert.ok(restored.batch.rows.every(row=>row.status==='unknown'));
 assert.equal(restored.sales[0].status,'unknown');assert.equal(restored.pending.lastValidBlockHeight,100);
 assert.equal(restored.pool,'4'.repeat(32));
});

test('legacy wallet-only files still decrypt and are identified as missing a project snapshot',async()=>{
 const encrypted=await vault.encryptVault(keys,'a long test password');
 const opened=await vault.openVault(encrypted,'a long test password');
 assert.equal(backup.recoveredProgress(opened.payload,identity),null);
 const updated=await opened.session.seal(payload({input}));
 assert.equal(backup.recoveredProgress(await vault.decryptVault(updated,'a long test password'),identity).progress.input.symbol,'NOVA');
});

test('each snapshot reseals with a fresh IV without retaining a plaintext password',async()=>{
 const session=await vault.createVaultSession('a long test password');
 const first=await session.seal(payload({input})), second=await session.seal(payload({input}));
 assert.equal(first.salt,second.salt);assert.notEqual(first.iv,second.iv);assert.notEqual(first.ciphertext,second.ciphertext);
 assert.equal(await vault.decryptVault(second,'a long test password'),payload({input}));
 await assert.rejects(vault.decryptVault(second,'wrong long password'),/incorrect/);
});

test('workspace identity, version and saved date are checked before recovery',()=>{
 const document=JSON.parse(payload(progress()));
 for(const change of [{mintAddress:'5'.repeat(32)},{format:'mainnet'},{savedAt:'bad-date'}]){
  assert.throws(()=>backup.recoveredProgress(JSON.stringify({...document,workspace:{...document.workspace,...change}}),identity),/damaged|different/);
 }
});

test('foreign wallet sale and buying records are rejected',()=>{
 for(const mutate of [p=>p.pending.sale.walletAddress='6'.repeat(32),p=>p.batch.rows[0].address='6'.repeat(32)]) {
  const p=JSON.parse(JSON.stringify(progress()));mutate(p);assert.throws(()=>payload(p),/different/);
 }
});

test('duplicate, missing and unsigned buying records cannot masquerade as a recoverable batch',()=>{
 for(const mutate of [p=>p.batch.rows.pop(),p=>p.batch.rows[0]=p.batch.rows[1],p=>delete p.batch.rows[0].signature,p=>p.batch.rows[0].signature=p.batch.rows[1].signature]){
  const p=JSON.parse(JSON.stringify(progress()));mutate(p);assert.throws(()=>payload(p),/damaged/);
 }
});

test('bad amounts, heights, statuses and oversized journals fail closed',()=>{
 for(const mutate of [p=>p.pending.sale.tokenAmountRaw='18446744073709551616',p=>p.pending.lastValidBlockHeight=-1,p=>p.sales[0].status='success',p=>p.sales=Array.from({length:101},()=>p.sales[0]),p=>p.input.name='x'.repeat(129),p=>p.pending.signature='invalid']){
  const p=JSON.parse(JSON.stringify(progress()));mutate(p);assert.throws(()=>payload(p),/damaged/);
 }
});

test('journal parsing keeps known public data and strips unexpected keys',()=>{
 const p=progress();p.secretKey='must-not-copy';p.input.password='must-not-copy';p.batch.rows[0].privateKey='must-not-copy';
 const cleaned=backup.readProgress(p,identity);
 assert.doesNotMatch(JSON.stringify(cleaned),/must-not-copy|secretKey|privateKey|password/);
 assert.equal(cleaned.pending.sale.walletAddress,address(0));
 assert.equal(cleaned.tokenCreated,true); // Local history is validated without resetting every unlock.
});

test('the vault accepts a bounded full journal and rejects oversized payloads',async()=>{
 const session=await vault.createVaultSession('a long test password');
 const large='x'.repeat(120000);const encrypted=await session.seal(large);
 assert.equal(await vault.decryptVault(encrypted,'a long test password'),large);
 await assert.rejects(session.seal('x'.repeat(200001)),/too large/);
 await assert.rejects(vault.openVault({...encrypted,ciphertext:'A'.repeat(300001)},'a long test password'),/valid/);
});

test('restoring older snapshots preserves newer local records and adds missing signed records',()=>{
 const snapshot=backup.recoveredProgress(payload(progress()),identity).progress;
 const local={...progress(),pending:undefined,sales:[{...attempt,signature:'5'.repeat(88),status:'confirmed'}]};
 const merged=backup.mergeRecoveredProgress(local,snapshot);
 assert.equal(merged.sales.length,2);assert.equal(merged.sales.find(sale=>sale.signature==='5'.repeat(88)).status,'confirmed');
 assert.equal(merged.pending.signature,attempt.signature);assert.equal(merged.recoveryRequired,true);
 const noBatch={input,historyMissing:true};
 const upgraded=backup.mergeRecoveredProgress(noBatch,snapshot);
 assert.equal(upgraded.batch.rows.length,40);assert.ok(!upgraded.historyMissing);assert.equal(upgraded.recoveryRequired,true);
 assert.equal(backup.mergeRecoveredProgress(local,undefined),local);
});

test('conflicting pending transactions or buying batches fail without silently losing either record',()=>{
 const snapshot=backup.recoveredProgress(payload(progress()),identity).progress;
 assert.throws(()=>backup.mergeRecoveredProgress({...progress(),pending:{...attempt,signature:'5'.repeat(88)}},snapshot),/Two different/);
 const local=progress();local.batch.rows[0].signature='5'.repeat(88);
 assert.throws(()=>backup.mergeRecoveredProgress(local,snapshot),/different buying batches/);
});

test('liquidity intent and history survive encrypted recovery while mismatched pools are rejected',()=>{
 const p=progress();const removal={signature:'6'.repeat(88),action:'liquidity',lastValidBlockHeight:100,liquidity:{pool:p.pool,lpAmountRaw:'250',minimumTokenRaw:'100',minimumSolRaw:'5000'},status:'confirmed'};
 p.pending=removal;p.liquidityRemovals=[removal];
 const restored=backup.recoveredProgress(payload(p),identity).progress;assert.equal(restored.pending.liquidity.lpAmountRaw,'250');assert.equal(restored.liquidityRemovals[0].status,'unknown');
 const merged=backup.mergeRecoveredProgress({input},restored);assert.equal(merged.liquidityRemovals.length,1);assert.equal(merged.recoveryRequired,true);
 p.pending={...removal,liquidity:{...removal.liquidity,pool:'7'.repeat(32)}};assert.throws(()=>payload(p),/damaged/);
});
