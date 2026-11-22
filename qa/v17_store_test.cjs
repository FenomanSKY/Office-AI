// [Diubah oleh Codex - 2026-11-21] Fake-only migration, demo isolation and native currency persistence.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createMt5FinanceStore}=require('../mt5_finance_store');
(async()=>{
 const dir=await fs.mkdtemp(path.join(__dirname,'v17-store-'));let store;
 const stamp=new Date().toISOString(),cfg={enabled:false,autoSyncDecided:true,pollIntervalMs:1000,usdToIdr:16200};
 const entry=(id,demo)=>({id,source:'mt5',type:'income',amountIdr:162000,amountOriginal:10,currency:'USD',ticket:id,date:stamp,demo});
 const deal=(ticket,demo)=>({ticket,symbol:'TEST',side:'BUY',volume:1,net_profit:10,profit:10,commission:0,swap:0,time:stamp,currency:'USD',demo});
 let snapshot={ok:true,connected:true,readonly:true,account:{currency:'EUR',balance:10000,equity:10000,profit:0},positions:[],closed_deals:[{...deal('eur-close',false),net_profit:2,profit:2,currency:'EUR'}],fetched_at:stamp};
 try{
  await fs.writeFile(path.join(dir,'mt5_finance.json'),JSON.stringify({config:cfg,entries:[entry('real',false),entry('demo',true)],mt5HistoryDeals:[deal('real',false),deal('demo',true)],recordedDealTickets:['real','demo']}));
  const create=()=>createMt5FinanceStore({dataDir:dir,bridgeRunner:async()=>snapshot});
  store=await create();assert.equal(store.getSummary().entryCount,1);assert.equal((await store.getDemoStore()).getSummary().entryCount,1);
  const realBefore=store.getSummary().netBalanceIdr;
  const opened=await store.simulateDemoTrade({phase:'open',profitUsd:70});assert.equal(opened.mt5.netFloating,70);
  const closed=await store.simulateDemoTrade({phase:'close',profitUsd:-3});assert.equal(closed.mt5.netFloating,0);assert.equal(store.getSummary().netBalanceIdr,realBefore);
  await store.refresh();await store.refresh();assert.equal(store.getLedger().entries.filter(e=>e.ticket==='eur-close').length,1);
  const native=store.getLedger().entries.find(e=>e.ticket==='eur-close');assert.equal(native.amountOriginal,2);assert.equal(native.currency,'EUR');assert.equal(native.amountIdr,null);
  assert.equal(store.getSummary().unconvertedCount,1);assert.equal(store.getSummary().mt5ByCurrency.EUR,2);assert.equal(store.getMt5Analytics().metrics.netProfitIdr,null);assert.equal(store.getMt5Analytics().metrics.netProfit,2);
  snapshot.closed_deals.push({...deal('eur-loss',false),profit:1,commission:-9,swap:1,net_profit:-7,currency:'EUR'});
  await store.refresh();const loss=store.getLedger().entries.find(e=>e.ticket==='eur-loss');
  assert.equal(loss.type,'expense');assert.equal(loss.amountOriginal,7);assert.equal(store.getSummary().mt5ByCurrency.EUR,-5);assert.equal(store.getMt5Analytics().metrics.netProfit,-5);
  await assert.rejects(()=>store.updateConfig({enabled:true,pollIntervalMs:6000}),{status:400});assert.equal(store.getStatus().config.enabled,false);
  await assert.rejects(()=>store.updateConfig({pythonPath:'Secrets/python.exe'}),{status:403});
  await store.stop();store=await create();await store.refresh();assert.equal(store.getLedger().entries.filter(e=>e.ticket==='eur-close').length,1);assert.equal(store.getStatus().config.autoSyncDecided,true);
  console.log(JSON.stringify({ok:true,checks:22}));
 }finally{await store?.stop();assert.equal(path.dirname(path.resolve(dir)),__dirname);await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
