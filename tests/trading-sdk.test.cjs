const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {PublicKey,Transaction}=require('@solana/web3.js');
const {AccountLayout,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,NATIVE_MINT,getAssociatedTokenAddressSync}=require('@solana/spl-token');
const ray=require('@raydium-io/raydium-sdk-v2');
const BN=require('bn.js');
const bs58=require('bs58').default;
const {DEVNET_GENESIS}=load('src/lib/solana/plan.ts');
const globals={window:{location:{origin:'https://novapulse.example'}},setTimeout,TextEncoder,TextDecoder};
const original=load('src/lib/solana/chain.ts',{},globals);

function fixture({reverse=false,amount=100000000n,frozen=false}={}) {
 const project=original.generateProject(); const wallet=project.wallets[0];
 const tokenInfo=(owner=wallet.publicKey,mint=project.mint.publicKey)=>{
  const data=Buffer.alloc(165);
  AccountLayout.encode({mint,owner,amount,delegateOption:0,delegate:PublicKey.default,state:frozen?2:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);
  return {data,owner:TOKEN_2022_PROGRAM_ID,lamports:2039280,executable:false,rentEpoch:0};
 };
 const ata=getAssociatedTokenAddressSync(project.mint.publicKey,wallet.publicKey,false,TOKEN_2022_PROGRAM_ID);
 let broadcasts=0,parsed;
 const rpc={
  getGenesisHash:async()=>DEVNET_GENESIS,
  getMultipleAccountsInfo:async keys=>keys.map(key=>key.equals(ata)?tokenInfo():null),
  getLatestBlockhash:async()=>({blockhash:'11111111111111111111111111111111',lastValidBlockHeight:100}),
  getFeeForMessage:async()=>({value:5000}),getBalance:async()=>10000000,
  getMinimumBalanceForRentExemption:async()=>2039280,
  sendRawTransaction:async bytes=>{broadcasts++;parsed=Transaction.from(bytes);assert.ok(parsed.verifySignatures());return bs58.encode(parsed.signature);},
  getSignatureStatuses:async()=>({value:[{err:null,confirmationStatus:'confirmed'}]}),
 };
 const poolId=project.treasury.publicKey.toBase58();
 const token={address:project.mint.publicKey.toBase58()},sol={address:NATIVE_MINT.toBase58()};
 const poolInfo={id:poolId,programId:ray.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58(),mintA:reverse?sol:token,mintB:reverse?token:sol};
 const rpcData={baseReserve:new BN(reverse?'1000000000':'1000000000000'),quoteReserve:new BN(reverse?'1000000000000':'1000000000'),feeOn:ray.FeeOn.BothToken,configInfo:{tradeFeeRate:new BN(2500),creatorFeeRate:new BN(0),protocolFeeRate:new BN(120000),fundFeeRate:new BN(40000)}};
 let swapParams,loadedOwner;
 const mocks={'@raydium-io/raydium-sdk-v2':{...ray,Raydium:{load:async opts=>{
  loadedOwner=opts.owner;
  return {account:{fetchWalletTokenAccounts:async()=>{}},cpmm:{getPoolInfoFromRpc:async()=>({poolInfo,poolKeys:{},rpcData}),swap:async params=>{
   swapParams=params;
   const minimum=params.swapResult.outputAmount.muln(10000-Math.round(params.slippage*10000)).divn(10000);
   const key=project.treasury.publicKey;
   const ix=ray.makeSwapCpmmBaseInInstruction(ray.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,wallet.publicKey,key,key,key,ata,key,key,key,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,project.mint.publicKey,NATIVE_MINT,key,params.inputAmount,minimum);
   const transaction=new Transaction().add(ix);transaction.feePayer=wallet.publicKey;
   return {transaction,signers:[]};
  }}};
 }}}};
 const chain=load('src/lib/solana/chain.ts',mocks,globals);
 return {chain,rpc,project,wallet,ata,poolId,poolInfo,tokenInfo,get parsed(){return parsed;},get broadcasts(){return broadcasts;},get swapParams(){return swapParams;},get loadedOwner(){return loadedOwner;}};
}

test('holdings decode actual token accounts exactly and report missing accounts as zero',async()=>{
 const f=fixture({amount:18446744073709551615n});const rows=await f.chain.tokenHoldings(f.rpc,f.project);
 assert.equal(rows.length,41);assert.equal(rows[0].rawAmount,'0');assert.equal(rows[1].rawAmount,'18446744073709551615');assert.equal(rows[1].address,f.wallet.publicKey.toBase58());
});

test('holdings reject wrong account owners, wrong mints and truncated responses',async()=>{
 const f=fixture();
 for(const info of [f.tokenInfo(f.project.wallets[1].publicKey),f.tokenInfo(f.wallet.publicKey,f.project.wallets[1].publicKey)]) {
  await assert.rejects(f.chain.tokenHoldings({...f.rpc,getMultipleAccountsInfo:async keys=>keys.map(key=>key.equals(f.ata)?info:null)},f.project),/could not be verified/);
 }
 await assert.rejects(f.chain.tokenHoldings({...f.rpc,getMultipleAccountsInfo:async()=>[]},f.project),/incomplete/);
});

test('sale preview binds the selected owner and quotes token-to-SOL in either mint order',async()=>{
 for(const reverse of [false,true]) {
  const f=fixture({reverse});const review=await f.chain.prepareSell(f.rpc,f.project,f.poolId,0,25,100);
  assert.equal(review.tokenAmountRaw,'25000000');assert.equal(review.walletAddress,f.wallet.publicKey.toBase58());assert.equal(f.loadedOwner,f.wallet);
  assert.equal(f.swapParams.baseIn,!reverse);assert.equal(f.swapParams.config.associatedOnly,true);
  assert.ok(BigInt(review.minimumSolRaw)>0n);assert.ok(BigInt(review.minimumSolRaw)<BigInt(review.expectedSolRaw));
  assert.ok(review.built.signers.some(signer=>signer.publicKey.equals(f.wallet.publicKey)));assert.equal(f.broadcasts,0);
 }
});

test('a reviewed sale signs a real SDK swap instruction with the reviewed amount and minimum output',async()=>{
 const f=fixture();const review=await f.chain.prepareSell(f.rpc,f.project,f.poolId,0,50,100);const events=[];
 const signature=await f.chain.submitSell(f.rpc,f.project,review,event=>events.push(event));
 assert.equal(f.broadcasts,1);assert.equal(signature,events[0].signature);assert.equal(events[0].action,'sell');assert.equal(events[0].sale.tokenAmountRaw,'50000000');assert.equal(events[1],undefined);
 assert.ok(f.parsed.feePayer.equals(f.wallet.publicKey));
 const ix=f.parsed.instructions[0];assert.ok(ix.programId.equals(ray.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM));
 assert.equal(ix.data.readBigUInt64LE(8),50000000n);assert.equal(ix.data.readBigUInt64LE(16),BigInt(review.minimumSolRaw));
 await assert.rejects(f.chain.submitSell(f.rpc,f.project,review),/already been used/);assert.equal(f.broadcasts,1);
});

test('concurrent submissions cannot consume the same sale review twice',async()=>{
 const f=fixture();const review=await f.chain.prepareSell(f.rpc,f.project,f.poolId,0,25,100);
 const result=await Promise.allSettled([f.chain.submitSell(f.rpc,f.project,review),f.chain.submitSell(f.rpc,f.project,review)]);
 assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(f.broadcasts,1);
});

test('sale preparation rejects zero or frozen balances and unrelated pools',async()=>{
 for(const opts of [{amount:0n},{frozen:true}]) {const f=fixture(opts);await assert.rejects(f.chain.prepareSell(f.rpc,f.project,f.poolId,0,25,100),/no spendable|frozen/);assert.equal(f.broadcasts,0);}
 const f=fixture();f.poolInfo.programId=PublicKey.default.toBase58();await assert.rejects(f.chain.prepareSell(f.rpc,f.project,f.poolId,0,25,100),/matching Raydium devnet/);
});

test('expired, wrong-project and changed-balance reviews stop before broadcast',async()=>{
 for(const change of ['expired','project','balance']) {
  const f=fixture();const review=await f.chain.prepareSell(f.rpc,f.project,f.poolId,0,25,100);
  if(change==='expired') review.createdAt-=31000;
  if(change==='project') review.mint=PublicKey.default.toBase58();
  if(change==='balance') f.rpc.getMultipleAccountsInfo=async keys=>keys.map(()=>null);
  await assert.rejects(f.chain.submitSell(f.rpc,f.project,review),/expired|different wallet or project|balance changed/);assert.equal(f.broadcasts,0);
 }
});

test('an interrupted sale keeps its public recovery intent and never resends automatically',async()=>{
 const f=fixture();const review=await f.chain.prepareSell(f.rpc,f.project,f.poolId,0,25,100);const events=[];let sent=0;
 f.rpc.sendRawTransaction=async()=>{sent++;throw new Error('private provider token');};f.rpc.getSignatureStatuses=async()=>({value:[null]});
 await assert.rejects(f.chain.submitSell(f.rpc,f.project,review,event=>events.push(event)),/Check transaction status/);
 assert.equal(sent,1);assert.equal(events.length,1);assert.equal(events[0].sale.minimumSolRaw,review.minimumSolRaw);assert.doesNotMatch(JSON.stringify(events),/secretKey|private provider/);
});

test('mainnet and invalid sale settings are rejected before SDK/network work',async()=>{
 const f=fixture();await assert.rejects(f.chain.tokenHoldings({...f.rpc,getGenesisHash:async()=> 'mainnet'},f.project),/Devnet verification/);
 await assert.rejects(f.chain.prepareSell({...f.rpc,getGenesisHash:async()=> 'mainnet'},f.project,f.poolId,0,25,100),/Devnet verification/);
 for(const args of [[-1,25,100],[40,25,100],[0,0,100],[0,25,501]]) await assert.rejects(f.chain.prepareSell(f.rpc,f.project,f.poolId,...args));
});
