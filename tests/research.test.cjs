const {test}=require('node:test');const assert=require('node:assert/strict');const {load,response}=require('./helpers.cjs');
const research=load('src/lib/research.ts',{}, {TextEncoder});
const pool='2'.repeat(32),token='3'.repeat(32),now=Date.UTC(2026,10,23,12,30),end=Date.UTC(2026,10,23,12);
const candles=()=>({data:{attributes:{ohlcv_list:Array.from({length:9},(_,i)=>[(end/1000)-(i+1)*3600,100-i,102-i,99-i,101-i,10])}}});
const market=()=>({data:[{attributes:{address:pool,name:'NOVA / SOL',pool_created_at:new Date(now-3*3600000).toISOString(),reserve_in_usd:'15000',volume_usd:{h24:'20000'},base_token_price_usd:'0.1'},relationships:{base_token:{data:{id:'solana_'+token}}}}],included:[{id:'solana_'+token,attributes:{name:'Example Token',symbol:'EX'}}]});
test('market parsing uses real pool age and nullable provider metrics without creating defaults',()=>{
 const row=research.parseMarkets(market())[0];assert.equal(row.token,token);assert.equal(row.name,'Example Token');assert.equal(row.liquidityUsd,15000);
 const sparse=market();delete sparse.data[0].attributes.reserve_in_usd;sparse.data[0].attributes.pool_created_at='bad';const parsed=research.parseMarkets(sparse)[0];assert.equal(parsed.liquidityUsd,null);assert.equal(parsed.createdAt,null);
 assert.throws(()=>research.parseMarkets({}),/invalid/);assert.equal(research.parseMarkets({data:[{}]}).length,0);
});
test('requested 2/3/6/7 hour performance comes from complete contiguous hourly candles',()=>{
 const result=research.hourlyPerformance(candles(),now);assert.equal(result.asOf,end);
 for(const n of [2,3,6,7]){assert.equal(result.windows[n].volumeUsd,10*n);assert.ok(Math.abs(result.windows[n].changePct-((101/(101-n))-1)*100)<1e-9);}
});
test('partial, stale, gapped, duplicate and malformed history is never turned into a return',()=>{
 const payload=candles();payload.data.attributes.ohlcv_list.unshift([end/1000,100,500,90,400,20]);assert.equal(research.hourlyPerformance(payload,now).asOf,end);
 const gap=candles();gap.data.attributes.ohlcv_list.splice(1,1);assert.equal(research.hourlyPerformance(gap,now).windows[2],null);
 assert.equal(research.hourlyPerformance(candles(),now+3600000).windows[2],null);
 const duplicate=candles();duplicate.data.attributes.ohlcv_list.push(duplicate.data.attributes.ohlcv_list[0]);assert.throws(()=>research.hourlyPerformance(duplicate,now),/duplicate/);
 const bad=candles();bad.data.attributes.ohlcv_list[0][4]=Infinity;assert.throws(()=>research.hourlyPerformance(bad,now),/verified/);
 assert.equal(research.hourlyPerformance({data:{attributes:{ohlcv_list:[]}}},now).windows[7],null);
});
test('age filters and performance rankings are independent, with unknown history kept separate',()=>{
 const a=research.parseMarkets(market())[0],b={...a,pool:'4'.repeat(32),token:'5'.repeat(32),createdAt:now-6*3600000};
 const history={[a.pool]:{windows:{2:{changePct:10}}},[b.pool]:{windows:{2:{changePct:30}}}};
 assert.equal(research.selectMarkets([a,b],history,7,2,10000,now)[0].pool,b.pool);assert.equal(research.selectMarkets([a,b],history,3,2,10000,now).length,1);
 assert.equal(research.uniqueMarkets([a,{...a,liquidityUsd:20000}])[0].liquidityUsd,20000);
});
test('original drafts validate names and reject reusing the reference identity',()=>{
 const source=research.parseMarkets(market())[0];assert.equal(research.validateOriginalDraft('My Orbit','orbit',source).symbol,'ORBIT');
 for(const args of [['Example Token','OTHER'],['My Name','EX'],['','TEST'],['A','bad-symbol']])assert.throws(()=>research.validateOriginalDraft(...args,source));
});
test('research APIs reject writes and unsafe addresses before making any provider call',async()=>{
 const globals={TextEncoder,fetch:()=>{throw new Error('must not fetch');}};
 const list=load('src/pages/api/research/markets.ts',{},globals).default,history=load('src/pages/api/research/history.ts',{},globals).default;
 for(const handler of [list,history]){const res=response();await handler({method:'POST',query:{}},res);assert.equal(res.code,405);}
 const res=response();await history({method:'GET',query:{pool:'https://internal.example'}},res);assert.equal(res.code,400);
});
test('market API handles a partial source, deduplicates and returns fixed errors on upstream failures',async()=>{
 let calls=0;const handler=load('src/pages/api/research/markets.ts',{}, {TextEncoder,fetch:async url=>{calls++;return {ok:url.includes('trending'),json:async()=>market()};}}).default;
 const res=response();await handler({method:'GET'},res);assert.equal(res.code,200);assert.equal(res.body.rows.length,1);assert.equal(res.body.partial,true);assert.equal(calls,4);
 const again=response();await handler({method:'GET'},again);assert.equal(calls,4);
 const failing=load('src/pages/api/research/markets.ts',{}, {fetch:async()=>{throw new Error('private provider message');}}).default;
 const failure=response();await failing({method:'GET'},failure);assert.equal(failure.code,503);assert.doesNotMatch(JSON.stringify(failure.body),/private provider/);
});
test('history API calculates all requested periods from one bounded public request and caches it',async()=>{
 let calls=0;const handler=load('src/pages/api/research/history.ts',{}, {fetch:async url=>{calls++;assert.ok(url.startsWith('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+pool+'/ohlcv/hour?'));assert.ok(url.includes('limit=10'));return {ok:true,json:async()=>candles()};}}).default;
 const res=response();await handler({method:'GET',query:{pool}},res);assert.equal(res.code,200);assert.equal(res.body.pool,pool);assert.equal(calls,1);
 const second=response();await handler({method:'GET',query:{pool}},second);assert.equal(calls,1);
});
