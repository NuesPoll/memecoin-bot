// Optional one-time test. Only throwaway devnet keys exist here, in memory.
const {load} = require('../tests/helpers.cjs');
const {Connection} = require('@solana/web3.js');
const chain = load('src/lib/solana/chain.ts', {}, {
 window: {location: {origin: 'https://novapulse-git-fix-novapulse-dashboard-oluwa1295-9373s-projects.vercel.app'}},
 setTimeout, TextEncoder, TextDecoder,
});
(async () => {
 const rpc = new Connection('https://api.devnet.solana.com', {commitment: 'confirmed', disableRetryOnRateLimit: true});
 await chain.assertDevnet(rpc);
 const project = chain.generateProject();
 console.log('DEVNET_ONLY treasury:', project.treasury.publicKey.toBase58());
 await chain.requestTestSol(rpc, project);
 console.log('DEVNET_FAUCET_CONFIRMED');
 const input = {name: 'NovaPulse QA', symbol: 'NPQA', supply: '1000000', poolTokens: '100000', poolSol: '0.1'};
 console.log('DEVNET_TOKEN', await chain.createToken(rpc, project, input), project.mint.publicKey.toBase58());
 const pool = await chain.createPool(rpc, project, input, id => console.log('DEVNET_POOL_ADDRESS', id));
 console.log('DEVNET_POOL_CONFIRMED', pool.signature);
 await chain.fundWallets(rpc, project, '0.0001'); console.log('DEVNET_FORTY_WALLETS_FUNDED');
 const prepared = await chain.prepareBatch(rpc, project, pool.pool, '0.0001', 100, done => {if (done % 10 === 0) console.log('DEVNET_PREPARED', done);});
 let record;
 await chain.submitBatch(rpc, prepared, value => {record = value;}, row => {record.rows = record.rows.map(old => old.address === row.address ? row : old);});
 for (let attempt = 0; attempt < 20; attempt++) {
  record.rows = await chain.checkBatch(rpc, record);
  const confirmed = record.rows.filter(row => row.status === 'confirmed').length;
  console.log('DEVNET_BATCH_CONFIRMED', confirmed);
  if (confirmed === 40) { console.log('DEVNET_END_TO_END_PASS'); return; }
  if (record.rows.some(row => row.status === 'failed')) throw new Error('A devnet purchase failed.');
  await new Promise(resolve => setTimeout(resolve, 3000));
 }
 throw new Error('Not all devnet purchases confirmed within the smoke-test window.');
})().catch(error => {console.error('DEVNET_SMOKE_INCOMPLETE:', error.message); process.exitCode = 1;});
