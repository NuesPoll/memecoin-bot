const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Keypair,PublicKey,SystemProgram,SystemInstruction,Transaction}=require('@solana/web3.js');
const bs58=require('bs58').default;
const {load}=require('./helpers.cjs');
const globals={TextEncoder,TextDecoder,setTimeout};
const chain=load('src/lib/solana/chain.ts',{},globals);
const api=load('src/lib/solana/treasury.ts',{},globals);
const {DEVNET_GENESIS}=load('src/lib/solana/plan.ts');
function fixture({destinationBalance=1000000,balance=10000000}={}) {
 const project=chain.generateProject(),destination=Keypair.generate().publicKey,accounts=new Map(),sent=new Map(),events=[];
 const account=lamports=>({owner:SystemProgram.programId,lamports,executable:false,data:Buffer.alloc(0),rentEpoch:0});
 for(const owner of [project.treasury,...project.wallets])accounts.set(owner.publicKey.toBase58(),account(balance));
 accounts.set(destination.toBase58(),destinationBalance?account(destinationBalance):null);
 const rpc={
  getGenesisHash:async()=>DEVNET_GENESIS,
  getMultipleAccountsInfo:async keys=>keys.map(key=>accounts.get(key.toBase58())??null),
  getLatestBlockhash:async()=>({blockhash:PublicKey.default.toBase58(),lastValidBlockHeight:100}),
  getMinimumBalanceForRentExemption:async()=>890880,
  getFeeForMessage:async()=>({value:5000}),
  sendRawTransaction:async(bytes,options)=>{
   assert.equal(options.skipPreflight,false);const tx=Transaction.from(bytes);assert.ok(tx.verifySignatures());
   assert.equal(tx.instructions.length,1);const ix=SystemInstruction.decodeTransfer(tx.instructions[0]);
   assert.ok(ix.toPubkey.equals(destination));assert.ok(ix.fromPubkey.equals(tx.feePayer));
   assert.ok([project.treasury,...project.wallets].some(owner=>owner.publicKey.equals(ix.fromPubkey)));
   const signature=bs58.encode(tx.signature);assert.ok(events.at(-1).rows.some(row=>row.signature===signature&&row.status==='unknown'));
   sent.set(signature,{tx,ix});return signature;
  },
  getSignatureStatuses:async signatures=>({value:signatures.map(signature=>sent.has(signature)?{err:null,confirmationStatus:'confirmed'}:null)}),
 };
 const persist=record=>events.push(JSON.parse(JSON.stringify(record)));
 return {project,destination,accounts,sent,events,rpc,persist};
}

test('collection previews actual balances for all 41 wallets minus exact fees and reserve without signing',async()=>{
 const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0.001');
 assert.equal(review.rows.length,41);assert.equal(review.rows[0].amountRaw,'8995000');assert.equal(review.rows[0].feeRaw,'5000');assert.equal(review.reserveRaw,'1000000');assert.equal(f.sent.size,0);assert.equal(f.events.length,0);
 const buyers=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),false,'0');assert.equal(buyers.rows.length,40);assert.equal(buyers.rows[0].amountRaw,'9995000');assert.ok(!buyers.rows.some(row=>row.address===f.project.treasury.publicKey.toBase58()));
});

test('collection signs only reviewed transfers, saves signatures before sending and confirms individual results',async()=>{
 const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0.001');
 const result=await api.submitCollection(f.rpc,f.project,review,f.persist);
 assert.equal(result.rows.length,41);assert.equal(f.sent.size,41);assert.ok(result.rows.every(row=>row.status==='confirmed'));
 assert.equal(f.events[0].rows.length,41);assert.ok(f.events[0].rows.every(row=>row.signature&&row.status==='ready'));
 for(const {ix} of f.sent.values())assert.equal(ix.lamports,8995000n);
 assert.doesNotMatch(JSON.stringify(f.events),/secretKey|privateKey|password/);
 await assert.rejects(api.submitCollection(f.rpc,f.project,review,f.persist),/already used/);assert.equal(f.sent.size,41);
});

test('a collection review cannot be submitted concurrently twice',async()=>{
 const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),false,'0');
 const results=await Promise.allSettled([api.submitCollection(f.rpc,f.project,review,f.persist),api.submitCollection(f.rpc,f.project,review,f.persist)]);
 assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(f.sent.size,40);
});

test('receiving address validation rejects programs, project wallets, mint and malformed input',async()=>{
 const f=fixture();for(const destination of ['bad-address',PublicKey.default.toBase58(),f.project.treasury.publicKey.toBase58(),f.project.wallets[0].publicKey.toBase58(),f.project.mint.publicKey.toBase58()])await assert.rejects(api.prepareCollection(f.rpc,f.project,destination,true,'0.001'),/receiving|external/);
 f.accounts.set(f.destination.toBase58(),{lamports:1000000,data:Buffer.alloc(1),owner:SystemProgram.programId,executable:false});
 await assert.rejects(api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0.001'),/ordinary SOL/);assert.equal(f.sent.size,0);
});

test('low balances are skipped and invalid fees, reserves or incomplete accounts stop preparation',async()=>{
 const f=fixture({balance:5000});await assert.rejects(api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0'),/No wallet/);
 const g=fixture();for(const reserve of ['0.00001','0.02','-1'])await assert.rejects(api.prepareCollection(g.rpc,g.project,g.destination.toBase58(),true,reserve));
 g.rpc.getFeeForMessage=async()=>({value:null});await assert.rejects(api.prepareCollection(g.rpc,g.project,g.destination.toBase58(),true,'0'),/invalid/);
 g.rpc.getMultipleAccountsInfo=async()=>[];await assert.rejects(api.prepareCollection(g.rpc,g.project,g.destination.toBase58(),true,'0'),/incomplete/);assert.equal(g.sent.size,0);
});

test('changed balances or fees, expired quotes and wrong projects stop before broadcast',async()=>{
 for(const kind of ['balance','fee','expired','project']){
  const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0.001');
  if(kind==='balance')f.accounts.get(review.rows[0].address).lamports=1000;
  if(kind==='fee')f.rpc.getFeeForMessage=async()=>({value:10000});
  if(kind==='expired')review.createdAt-=61000;
  if(kind==='project')review.mint=Keypair.generate().publicKey.toBase58();
  await assert.rejects(api.submitCollection(f.rpc,f.project,review,f.persist),/changed|expired|different/);assert.equal(f.sent.size,0);
 }
});

test('a new recipient is funded by the largest transfer before remaining transfers start',async()=>{
 const f=fixture({destinationBalance:0});const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0.001');
 let confirmedFirst=false;const original=f.rpc.getSignatureStatuses;f.rpc.getSignatureStatuses=async signatures=>{const result=await original(signatures);if(f.sent.size===1){confirmedFirst=true;assert.ok(result.value[0]);}return result;};
 const send=f.rpc.sendRawTransaction;f.rpc.sendRawTransaction=async(...args)=>{if(f.sent.size)assert.equal(confirmedFirst,true);return send(...args);};
 await api.submitCollection(f.rpc,f.project,review,f.persist);assert.equal(f.sent.size,41);
});

test('interrupted responses stay unknown and status checks never resend transfers',async()=>{
 const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0');let calls=0;
 f.rpc.sendRawTransaction=async()=>{calls++;throw new Error('private provider detail');};
 const result=await api.submitCollection(f.rpc,f.project,review,f.persist);assert.equal(calls,41);assert.ok(result.rows.every(row=>row.status==='unknown'));
 const checked=await api.checkCollection(f.rpc,result);assert.equal(calls,41);assert.ok(checked.rows.every(row=>row.status==='unknown'));assert.doesNotMatch(JSON.stringify(result),/private provider/);
});

test('failed first recipient funding leaves remaining transfers explicitly not sent',async()=>{
 const f=fixture({destinationBalance:0});const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0');
 f.rpc.getSignatureStatuses=async signatures=>({value:signatures.map((_,i)=>i===0?{err:{InstructionError:[0,'Custom']},confirmationStatus:'confirmed'}:null)});
 const result=await api.submitCollection(f.rpc,f.project,review,f.persist);assert.equal(f.sent.size,1);assert.equal(result.rows[0].status,'failed');assert.ok(result.rows.slice(1).every(row=>row.status==='not_sent'));
});

test('mainnet or failed persistence prevents collection broadcasts',async()=>{
 const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0');
 const mainnet={...f.rpc,getGenesisHash:async()=> 'mainnet'};
 await assert.rejects(api.prepareCollection(mainnet,f.project,f.destination.toBase58(),true,'0'),/Devnet/);
 await assert.rejects(api.submitCollection(mainnet,f.project,review,f.persist),/Devnet/);
 await assert.rejects(api.submitCollection(f.rpc,f.project,review,()=>{throw new Error('Storage full');}),/Storage full/);assert.equal(f.sent.size,0);
});

test('collection status distinguishes failure and confirmation without claiming absent signatures failed',async()=>{
 const f=fixture();const review=await api.prepareCollection(f.rpc,f.project,f.destination.toBase58(),true,'0');const result=await api.submitCollection(f.rpc,f.project,review,f.persist);
 f.rpc.getSignatureStatuses=async signatures=>({value:signatures.map((_,i)=>i===0?{err:null,confirmationStatus:'finalized'}:i===1?{err:'failed'}:null)});
 const checked=await api.checkCollection(f.rpc,result);assert.equal(checked.rows[0].status,'confirmed');assert.equal(checked.rows[1].status,'failed');assert.equal(checked.rows[2].status,'unknown');
 f.rpc.getSignatureStatuses=async()=>({value:[]});await assert.rejects(api.checkCollection(f.rpc,result),/incomplete/);
});
