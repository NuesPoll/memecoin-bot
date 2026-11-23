const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const {Keypair,PublicKey,Transaction}=require('@solana/web3.js');const {AccountLayout,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,NATIVE_MINT,getAssociatedTokenAddressSync}=require('@solana/spl-token');const ray=require('@raydium-io/raydium-sdk-v2');const BN=require('bn.js');const bs58=require('bs58').default;
const globals={TextEncoder,TextDecoder,setTimeout};const core=load('src/lib/solana/chain.ts',{},globals);const {DEVNET_GENESIS}=load('src/lib/solana/plan.ts');
function fixture({reverse=false,frozen=false,amount=1000n}={}){
 const project=core.generateProject(),pool=Keypair.generate().publicKey,lpMint=Keypair.generate().publicKey,lpAccount=getAssociatedTokenAddressSync(lpMint,project.treasury.publicKey),program=ray.DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
 let held=amount,broadcasts=0,parsed,owner=project.treasury.publicKey;
 const token=()=>{const data=Buffer.alloc(165);AccountLayout.encode({mint:lpMint,owner,amount:held,delegateOption:0,delegate:PublicKey.default,state:frozen?2:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);return {data,owner:TOKEN_PROGRAM_ID,lamports:2039280,executable:false,rentEpoch:0};};
 const poolInfo={id:pool.toBase58(),programId:program.toBase58(),lpMint:{address:lpMint.toBase58()},mintA:{address:(reverse?NATIVE_MINT:project.mint.publicKey).toBase58()},mintB:{address:(reverse?project.mint.publicKey:NATIVE_MINT).toBase58()}};
 const rpc={getGenesisHash:async()=>DEVNET_GENESIS,getAccountInfo:async key=>key.equals(pool)?{owner:program,data:Buffer.alloc(0)}:key.equals(lpAccount)?token():null,getLatestBlockhash:async()=>({blockhash:PublicKey.default.toBase58(),lastValidBlockHeight:100}),getMinimumBalanceForRentExemption:async()=>2039280,getFeeForMessage:async()=>({value:5000}),getBalance:async()=>100000000,sendRawTransaction:async bytes=>{broadcasts++;parsed=Transaction.from(bytes);assert.ok(parsed.verifySignatures());return bs58.encode(parsed.signature);},getSignatureStatuses:async()=>({value:[{err:null,confirmationStatus:'confirmed'}]})};
 const mocks={'@raydium-io/raydium-sdk-v2':{...ray,Raydium:{load:async()=>({account:{fetchWalletTokenAccounts:async()=>{}},cpmm:{getPoolInfoFromRpc:async()=>({poolInfo,poolKeys:{}}),withdrawLiquidity:async params=>{
  assert.equal(params.closeWsol,true);const key=project.treasury.publicKey,a=new PublicKey(poolInfo.mintA.address),b=new PublicKey(poolInfo.mintB.address);
  const ix=ray.makeWithdrawCpmmInInstruction(program,key,key,pool,lpAccount,key,key,key,key,a,b,lpMint,params.lpAmount,new BN(reverse?'5000':'100'),new BN(reverse?'100':'5000'));
  return {transaction:new Transaction().add(ix),signers:[]};
 }}})}}};
 const api=load('src/lib/solana/liquidity.ts',mocks,globals);
 return {api,rpc,project,pool:pool.toBase58(),poolInfo,setAmount:value=>held=value,setOwner:value=>owner=value,get broadcasts(){return broadcasts;},get parsed(){return parsed;}};
}
test('LP preview verifies the owned associated holding and reads exact encoded minimums in either mint order',async()=>{
 for(const reverse of [false,true]){const f=fixture({reverse}),review=await f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,25,100);assert.equal(review.lpBalanceRaw,'1000');assert.equal(review.lpAmountRaw,'250');assert.equal(review.minimumTokenRaw,'100');assert.equal(review.minimumSolRaw,'5000');assert.equal(review.feeRaw,'5000');assert.equal(review.rentAllowanceRaw,'4078560');assert.equal(f.broadcasts,0);}
});
test('reviewed LP removal signs the actual withdrawal instruction and preserves recovery intent before broadcast',async()=>{
 const f=fixture(),review=await f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,100,100),events=[];
 const signature=await f.api.submitLiquidityRemoval(f.rpc,f.project,review,next=>events.push(next));assert.equal(f.broadcasts,1);assert.equal(signature,events[0].signature);assert.equal(events[0].action,'liquidity');assert.equal(events[0].liquidity.lpAmountRaw,'1000');assert.equal(events[1],undefined);
 assert.equal(f.parsed.instructions[0].data.readBigUInt64LE(8),1000n);assert.ok(f.parsed.feePayer.equals(f.project.treasury.publicKey));await assert.rejects(f.api.submitLiquidityRemoval(f.rpc,f.project,review,()=>{}),/already used/);
});
test('LP cannot be removed when empty, frozen, held by someone else or in an unrelated pool',async()=>{
 for(const args of [{amount:0n},{frozen:true}]){const f=fixture(args);await assert.rejects(f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,25,100),/spendable|verified/);}
 const f=fixture();f.setOwner(Keypair.generate().publicKey);await assert.rejects(f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,25,100),/verified/);
 const wrong=fixture();wrong.poolInfo.mintA.address=Keypair.generate().publicKey.toBase58();await assert.rejects(wrong.api.prepareLiquidityRemoval(wrong.rpc,wrong.project,wrong.pool,25,100),/match/);
});
test('expired, changed LP and wrong-project reviews stop before a removal is broadcast',async()=>{
 for(const kind of ['expired','balance','project']){const f=fixture(),review=await f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,50,100);if(kind==='expired')review.createdAt-=31000;if(kind==='balance')f.setAmount(1n);if(kind==='project')review.mint=Keypair.generate().publicKey.toBase58();await assert.rejects(f.api.submitLiquidityRemoval(f.rpc,f.project,review,()=>{}),/expired|changed|another project/);assert.equal(f.broadcasts,0);}
});
test('concurrent LP removal cannot consume a review twice',async()=>{
 const f=fixture(),review=await f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,25,100);const result=await Promise.allSettled([f.api.submitLiquidityRemoval(f.rpc,f.project,review,()=>{}),f.api.submitLiquidityRemoval(f.rpc,f.project,review,()=>{})]);assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(f.broadcasts,1);
});
test('unknown liquidity responses retain their intent and mainnet is always rejected',async()=>{
 const f=fixture(),review=await f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,25,100),events=[];let sends=0;f.rpc.sendRawTransaction=async()=>{sends++;throw new Error('private provider detail');};f.rpc.getSignatureStatuses=async()=>({value:[null]});
 await assert.rejects(f.api.submitLiquidityRemoval(f.rpc,f.project,review,next=>events.push(next)),/Check transaction status/);assert.equal(sends,1);assert.equal(events.length,1);assert.equal(events[0].liquidity.pool,f.pool);assert.doesNotMatch(JSON.stringify(events),/private provider|secretKey/);
 const mainnet={...f.rpc,getGenesisHash:async()=> 'mainnet'};await assert.rejects(f.api.prepareLiquidityRemoval(mainnet,f.project,f.pool,25,100),/Devnet/);
});

test('liquidity previews reject an unavailable network-fee estimate without signing or sending',async()=>{
 const f=fixture();f.rpc.getFeeForMessage=async()=>({value:null});await assert.rejects(f.api.prepareLiquidityRemoval(f.rpc,f.project,f.pool,25,100),/invalid balance or fee/);assert.equal(f.broadcasts,0);
});
