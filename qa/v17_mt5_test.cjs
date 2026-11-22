// [Diubah oleh Codex - 2026-11-21] Fake MT5 end-to-end: real Python stream, SSE, Chromium and owned process cleanup.
'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const { createMt5FinanceStore } = require('../mt5_finance_store');
const { pythonCandidates, terminalCandidates } = require('../mt5_sync');
const { open, sleep, root } = require('./v6c_lib.cjs');
process.env.OFFICE_MT5_AUTODETECT = '0';
process.env.OFFICE_AI_NO_DRIVE_SCAN = '1';
const results = { checks: [], latencyMs: [], failures: [] };
const check = (name, pass, detail) => { results.checks.push({name, pass:Boolean(pass), detail}); if(!pass) { results.failures.push(name); throw Error(name + ': ' + JSON.stringify(detail)); } };
const waitFor = async (fn, timeout=6000) => { const start=Date.now(); let value; do { value=await fn(); if(value)return value; await sleep(30); } while(Date.now()-start<timeout); throw Error('Timeout: '+fn.toString().slice(0,160)); };
let b, fixture, stores=[];
async function main() {
  fixture = await fs.mkdtemp(path.join(root, 'qa/v17-fixture-'));
  const python = process.env.V17_PYTHON || path.join(process.env.LOCALAPPDATA, 'Programs/Python/Python310/python.exe');
  const stateFile = path.join(fixture,'fake.json'), logFile=path.join(fixture,'calls.jsonl');
  const fakePython = path.join(root,'qa/v17_fake_python.py');
  const terminals = [path.join(fixture,'terminal64.exe')];
  await fs.writeFile(terminals[0], 'FAKE MT5');
  let fake = {account:{balance:10000,equity:10000,profit:0,currency:'USD'}, positions:[], deals:[]};
  const save = async patch => { fake={...fake,...patch}; await fs.writeFile(stateFile+'.tmp', JSON.stringify(fake)); await fs.rename(stateFile+'.tmp',stateFile); };
  await save({});
  const candidates = [{exe:path.join(fixture,'missing-python.exe'),args:[]},
    {exe:python,args:[fakePython,'--no-module']},{exe:python,args:[fakePython]}];
  const syncOptions={autodetect:true,candidates,terminals,environment:{V17_FAKE_STATE:stateFile,V17_FAKE_LOG:logFile}};
  const create = async (name, config) => {
    const dataDir=path.join(fixture,name);await fs.mkdir(dataDir,{recursive:true});
    if(config)await fs.writeFile(path.join(dataDir,'mt5_finance.json'),JSON.stringify({version:1,config,entries:[],mt5HistoryDeals:[],recordedDealTickets:[]}));
    const store=await createMt5FinanceStore({dataDir,syncOptions});stores.push(store);await store.ready;return store;
  };
  const explicit=await create('opt-out',{enabled:false,autoSyncDecided:true,pollIntervalMs:1000});
  check('explicit opt-out survives detection and restart', !explicit.getStatus().config.enabled && explicit.getStatus().detection.module);
  await assert.rejects(()=>explicit.updateConfig({enabled:true,pollIntervalMs:999}),{status:400});
  check('invalid config cannot partly enable synchronization',!explicit.getStatus().config.enabled);
  const customized=await create('customized-legacy',{enabled:false,pollIntervalMs:7000,pythonPath:'custom-python'});
  check('customized legacy false conservatively preserved',!customized.getStatus().config.enabled && customized.getStatus().config.autoSyncDecided);
  const missing=await createMt5FinanceStore({dataDir:path.join(fixture,'missing'),syncOptions:{...syncOptions,candidates:[{exe:python,args:[fakePython,'--no-module']}],terminals:[]}});stores.push(missing);await missing.ready;
  check('new users without MT5 remain quiet and disabled',!missing.getStatus().config.enabled && !missing.getStatus().error && !missing.getStatus().detection.module);
  const discovered=await terminalCandidates(terminals[0]);
  check('saved terminal discovered without opening account files',discovered.includes(terminals[0]));
  const pythonList=await pythonCandidates(python);
  check('saved Python precedes launcher and PATH candidates',pythonList[0].exe===python && pythonList.some(c=>c.exe==='py'&&c.args[0]==='-3'));
  const legacy=await create('untouched-legacy',{enabled:false,pollIntervalMs:5000,pythonPath:'',terminalPath:'',usdToIdr:16200});
  await waitFor(()=>legacy.getStatus().connected);
  check('untouched legacy false migrates and starts automatically',legacy.getStatus().config.enabled && legacy.getStatus().config.autoSyncDecided && legacy.getStatus().config.pollIntervalMs===1000);
  await legacy.stop();
  const callsBefore = (await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse);
  check('detection never initializes an account',callsBefore.filter(c=>c.kind==='initialize').length===1,callsBefore);

  b=await open({serverOptions:{allowDriveScan:false,mt5Options:{syncOptions}}});
  await b.server.mt5Finance.ready;
  await waitFor(()=>b.server.mt5Finance.getStatus().connected);
  await b.go('?qa=1');
  await b.ev(`(()=>{const s=OfficeSettings.get();s.language='id';s.currency='USD';s.appearance.theme='light';OfficeSettings.set(s);officeQA.v15.setup?.close();document.getElementById('openFinance').click();})()`);
  await sleep(300);
  const html=await(await fetch(b.server.origin)).text();
  const token=html.match(/name="office-vault-token" content="([^"]+)"/)[1];
  const api=async (url,body)=>{const r=await fetch(b.server.origin+url,{method:body===undefined?'GET':'POST',headers:{'X-Office-Token':token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const sseAbort=new AbortController();
  const events=[];
  const sseRun=(async()=>{const r=await fetch(b.server.origin+'/events',{signal:sseAbort.signal});let buffer='';for await(const part of r.body){buffer+=Buffer.from(part).toString();let end;while((end=buffer.indexOf('\n\n'))>=0){const msg=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=msg.split('\n').find(l=>l.startsWith('data: '));if(line){try{events.push(JSON.parse(line.slice(6)));}catch{}}}}})().catch(()=>{});
  const opening={ticket:501,position_id:101,type:0,entry:0,volume:1,commission:-3,time:Math.floor(Date.now()/1000),symbol:'TESTUSD',price:100,profit:0,swap:0};
  const position={ticket:101,identifier:101,type:0,volume:1,symbol:'TESTUSD',price_open:100,price_current:110,profit:25,swap:-2,sl:95,tp:120,time:Math.floor(Date.now()/1000)};
  for(let i=0;i<4;i++) {
    if(i===1)await b.ev("document.getElementById('v17ConnectionConfig').open=true;document.getElementById('v12Mt5Python').value='draft-python';document.getElementById('v12Mt5Python').focus();");
    const started=Date.now();
    await save({positions:[{...position,profit:25+i}],deals:[opening],account:{balance:10000,equity:10020+i,profit:23+i,currency:'USD'}});
    try {
      await waitFor(()=>b.ev(`officeQA.v12.ui?.getSummary?.()?.mt5?.floatingProfit===${20+i} && document.getElementById('v17NetFloating')?.textContent===document.getElementById('v12NetBalance')?.textContent`),2000);
    } catch (error) {
      results.failedLatency = {iteration:i,elapsedMs:Date.now()-started,server:b.server.mt5Finance.getStatus(),
        ui:await b.ev("({state:officeQA.v12.ui?.getSummary?.()?.mt5,panel:document.getElementById('v17NetFloating')?.textContent,tile:document.getElementById('v12NetBalance')?.textContent,active:officeQA.v12.ui?.active})"),
        events:events.filter(e=>e.type==='mt5_state'||e.type==='mt5_heartbeat').slice(-5)};
      throw error;
    }
    results.latencyMs.push(Date.now()-started);
    const st=(await api('/mt5/status')).body;
    check('net math and terminal reconciliation '+i,st.floatingProfit===20+i&&st.floatingMatches===true&&st.activePositions[0].swap===-2&&st.activePositions[0].commission===-3,st.floatingDifference);
    if(i===1){check('price updates retain a focused connection edit',await b.ev("document.getElementById('v17ConnectionConfig').open&&document.getElementById('v12Mt5Python').value==='draft-python'"));await b.ev("document.getElementById('v17ConnectionConfig').open=false;document.getElementById('v12Mt5Python').blur();");}
    if(i===0){await b.ev('officeQA.advance(.1)');const actor=await b.ev("officeDebug().actors.find(a=>a.id==='mt5-trader')");check('Trader seated within snapshot latency',actor.seated && actor.taskStatus==='working',actor);}
    if(i<3) { await save({positions:[],deals:[opening],account:{balance:10000,equity:10000,profit:0,currency:'USD'}});await waitFor(()=>b.server.mt5Finance.getStatus().status==='idle',2000); }
  }
  check('open to rendered UI median and maximum <= 2 seconds',Math.max(...results.latencyMs)<=2000,results.latencyMs);
  const logEntries=(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse);
  const activePid=logEntries.filter(e=>e.kind==='initialize').at(-1).pid;
  const procStats=()=>new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${activePid} -ErrorAction SilentlyContinue | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress`],{windowsHide:true},(err,stdout)=>{try{resolve(JSON.parse(stdout));}catch{resolve(null);}}));
  const usageStart=await procStats();const usageAt=Date.now();await sleep(2000);const usageEnd=await procStats();
  if(usageStart&&usageEnd)results.resources={workingSetMb:Math.round(usageEnd.WorkingSet64/1024/1024*100)/100,cpuPercentOneCore:Math.round((usageEnd.CPU-usageStart.CPU)/(Date.now()-usageAt)*10000000)/100};
  await save({account:{...fake.account,equity:10024}});
  await waitFor(()=>b.server.mt5Finance.getStatus().floatingMatches===false);
  check('difference is visibly flagged',await waitFor(()=>b.ev("document.getElementById('v17FloatingMatch')?.textContent.includes('Selisih')")));
  await save({commission_unavailable:true});
  await waitFor(()=>b.server.mt5Finance.getStatus().activePositions[0]?.commission===null);
  check('unavailable commission is n/a, never fabricated zero',await waitFor(()=>b.ev("document.querySelector('#v17Positions tbody')?.textContent.includes('n/a')")));
  await save({commission_unavailable:false,account:{...fake.account,equity:10023}});
  await waitFor(()=>b.server.mt5Finance.getStatus().floatingMatches);
  await sleep(250); // Let the final changed snapshot reach the independent SSE observer.
  const oldCount=events.filter(e=>e.type==='mt5_state').length;
  await sleep(2200);
  check('unchanged snapshots use heartbeat, not repeated full states',events.filter(e=>e.type==='mt5_state').length===oldCount && events.some(e=>e.type==='mt5_heartbeat'),{oldCount,newCount:events.filter(e=>e.type==='mt5_state').length,types:events.map(e=>e.type).filter(Boolean)});
  // Hold an older HTTP pull until a newer SSE price arrives, then release it.
  const olderStatus=(await api('/mt5/status')).body;
  await b.call('Fetch.enable',{patterns:[{urlPattern:'*/mt5/status',requestStage:'Request'}]});
  const requestStart=b.events.length;
  await b.ev('void officeQA.v12.ui.refresh()');
  const held=await waitFor(()=>b.events.slice(requestStart).find(e=>e.method==='Fetch.requestPaused'));
  await save({positions:[{...position,profit:40}],account:{balance:10000,equity:10035,profit:38,currency:'USD'}});
  await waitFor(()=>b.ev('officeQA.v12.ui.getSummary().mt5.floatingProfit===35'),2000);
  await b.call('Fetch.fulfillRequest',{requestId:held.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(olderStatus)).toString('base64')});
  await b.call('Fetch.disable');await sleep(250);
  check('late HTTP snapshot cannot overwrite a newer SSE price',await b.ev('officeQA.v12.ui.getSummary().mt5.floatingProfit===35'));
  const newerAt=await b.ev('officeQA.v12.ui.getSummary().mt5.lastUpdated');
  await b.ev(`officeQA.v12.ui.handleEvent({type:'mt5_heartbeat',lastUpdated:${JSON.stringify(olderStatus.lastUpdated)}})`);
  check('older heartbeat cannot rewind snapshot age',await b.ev(`officeQA.v12.ui.getSummary().mt5.lastUpdated>=${JSON.stringify(newerAt)}`));
  await save({positions:[{...position,profit:28}],account:{balance:10000,equity:10023,profit:26,currency:'USD'}});
  await waitFor(()=>b.ev('officeQA.v12.ui.getSummary().mt5.floatingProfit===23'));
  const tested=await api('/mt5/test',{});
  check('Test now repeats fake detection and returns a connected account',tested.status===200&&tested.body.connected&&tested.body.detection.module);
  await b.ev("document.getElementById('settingsButton').click();document.getElementById('tab-general').click();");
  await waitFor(()=>b.ev("!!document.getElementById('v17SettingsAutoSync')"));
  await b.ev("document.getElementById('v17SettingsAutoSync').click();");
  await waitFor(()=>!b.server.mt5Finance.getStatus().config.enabled);
  check('Settings opt-out is explicit and persists',b.server.mt5Finance.getStatus().config.autoSyncDecided);
  await waitFor(()=>b.ev("!document.getElementById('v17SettingsAutoSync').disabled"));
  await b.ev("document.getElementById('v17SettingsAutoSync').click();document.getElementById('settingsDialog').close();");
  await waitFor(()=>b.server.mt5Finance.getStatus().config.enabled);
  await waitFor(()=>Date.now()-Date.parse(b.server.mt5Finance.getStatus().lastUpdated)<1000);

  await fs.mkdir(path.join(root,'qa/v17-shots'),{recursive:true});
  for(const theme of ['light','dark']) {
    await b.ev(`(()=>{const s=OfficeSettings.get();s.appearance.theme='${theme}';OfficeSettings.set(s);officeQA.tick(1);})()`);await b.settle();
    const shot=await b.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(root,'qa/v17-shots',theme+'.png'),Buffer.from(shot.data,'base64'));
  }
  const closeStarted=Date.now();
  const closed={...opening,ticket:502,entry:1,type:1,profit:30,commission:-1,swap:-2,time:Math.floor(Date.now()/1000)};
  await save({positions:[],deals:[opening,closed],account:{balance:10027,equity:10027,profit:0,currency:'USD'}});
  await waitFor(()=>b.server.mt5Finance.getSummary().entryCount===1,2000);
  results.closeLatencyMs=Date.now()-closeStarted;
  await sleep(2300);
  check('closed deal booked once and correct net 27',b.server.mt5Finance.getSummary().entryCount===1&&b.server.mt5Finance.getSummary().netBalanceIdr===27*16200);
  await b.ev('officeQA.advance(90)');
  check('real close sends slip through Finance to safe',await b.ev("officeDebug().milestones.some(m=>m.stage==='mt5-finance-handoff')&&officeDebug().milestones.some(m=>m.stage==='finance-safe-stored')"));
  check('idle tile is labelled realized today',await waitFor(()=>b.ev("document.getElementById('v12Mt5Badge')?.textContent.includes('Realisasi hari ini')")));
  const beforeReal=JSON.stringify(b.server.mt5Finance.getSummary());
  const demoOpen=await api('/finance/demo-trade',{phase:'open',profitUsd:999});
  await api('/finance/demo-trade',{phase:'close',profitUsd:999});
  check('server simulation keeps real ledger and floating unchanged',demoOpen.body.mt5.demo && demoOpen.body.mt5.netFloating===999 && b.server.mt5Finance.getSummary().netBalanceIdr===27*16200 && b.server.mt5Finance.getStatus().activePositions.length===0);
  check('demo ledger stored separately',(await api('/finance/demo')).body.entries.every(e=>e.demo));
  await b.ev('officeQA.v15.openSetup()');await sleep(300);
  check('Setup shows detection and Test now',await b.ev("!!document.getElementById('v17SetupTestMt5')&&document.getElementById('v17SetupDetection')?.textContent.includes('terdeteksi')"));

  await save({offline:true});await waitFor(()=>!b.server.mt5Finance.getStatus().connected);
  check('terminal disconnect has waiting status',b.server.mt5Finance.getStatus().reason==='terminal_not_running');
  check('Setup detection updates live without reopening',await waitFor(()=>b.ev("document.getElementById('v17SetupDetection')?.textContent.includes('Akun terhubung: belum tersedia')")));
  await save({offline:false,no_account:true});await waitFor(()=>b.server.mt5Finance.getStatus().reason==='account_not_logged_in',7000);
  check('logged-out account distinguished',true);
  await save({no_account:false});await waitFor(()=>b.server.mt5Finance.getStatus().connected,7000);
  check('terminal reconnects automatically',true);
  await b.ev("officeQA.v15.setup.close();document.getElementById('openFinance').click();");
  // Slow bridge: age must tick independently and turn stale even when snapshots stop.
  await save({slow:12});
  await sleep(1500);
  const age1=await b.ev("document.getElementById('v17Mt5Freshness')?.textContent");
  await sleep(2100);
  const age2=await b.ev("document.getElementById('v17Mt5Freshness')?.textContent");
  check('Updated N seconds ticks on client',age1!==age2,{age1,age2});
  await sleep(7200);
  check('snapshot older than 10 seconds is stale',await waitFor(()=>b.ev("document.getElementById('v17Mt5Freshness')?.dataset.stale==='true'"),3000));
  await save({slow:0});await waitFor(()=>Date.now()-Date.parse(b.server.mt5Finance.getStatus().lastUpdated)<2000,7000);
  const keys=['order_send','ordersend','order_check','ordercheck','place_order','placeorder','close_position','closeposition','close_order','closeorder','modify_order','modifyorder','execute_trade','executetrade','password','mt5_password','mt5password','investor_password','investorpassword','broker_password','passwd','pwd','login','account_login','lot_size','lotsize','sl','tp','stop_loss','stoploss','take_profit','takeprofit','magic','magic_number','api_secret','private_key'];
  for(const key of keys)for(const url of ['/mt5/config','/mt5/refresh','/mt5/test','/finance/demo-trade'])assert.equal((await api(url,{nested:[{[key]:true}]})).status,403,key+' '+url);
  check('all forbidden keys retain HTTP 403 recursively',true,{keys:keys.length,routes:4});
  await save({positions:[position],deals:[opening],account:{balance:10000,equity:10020,profit:23,currency:'EUR'}});
  await waitFor(()=>b.server.mt5Finance.getStatus().currency==='EUR');
  check('non-USD account retains native currency without fabricated IDR',b.server.mt5Finance.getStatus().floatingProfitIdr===null&&b.server.mt5Finance.getStatus().floatingProfit===20);
  await waitFor(()=>b.ev("document.getElementById('v17NetFloating')?.textContent.includes('EUR')"));
  await save({positions:[],deals:[opening,closed,{...closed,ticket:503,profit:1,commission:-9,swap:1}],account:{balance:10020,equity:10020,profit:0,currency:'USD'}});
  await waitFor(()=>b.server.mt5Finance.getSummary().entryCount===2,2000);
  await b.ev('officeQA.advance(90)');
  check('net loss despite gross profit creates expense and loss handoff',b.server.mt5Finance.getLedger().entries.some(e=>e.ticket==='503'&&e.type==='expense'&&e.amountOriginal===7)&&await b.ev("officeDebug().milestones.some(m=>m.stage==='mt5-finance-handoff'&&m.detail==='loss')"));
  await b.ev('officeQA.tick(1)');
  results.drawCalls=await b.ev('officeDebug().drawCalls');check('drawCalls <=340',results.drawCalls<=340,results.drawCalls);
  results.consoleErrors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Log.entryAdded'&&e.params.entry.level==='error'));
  check('browser has zero console errors',results.consoleErrors.length===0,results.consoleErrors);
  sseAbort.abort();await sseRun;
  await b.close();b=null;
  const streamPids=[...new Set((await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse).filter(e=>e.kind==='stream').map(e=>e.pid))];
  await sleep(500);
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  check('normal shutdown leaves zero MT5 stream orphans',streamPids.every(pid=>!alive(pid)),streamPids);

  // Fail stream twice -> serialized legacy fallback, still fake-only.
  await save({fail_stream:true});
  const fallback=await create('fallback');await waitFor(()=>fallback.getStatus().connected,7000);
  check('stream failure falls back to spawn snapshots',fallback.getStatus().connected);await fallback.stop();
  await save({fail_stream:false});
  // Kill only our own Node harness; V15 parent watch must terminate the stream.
  const dataDir=path.join(fixture,'forced');await fs.mkdir(dataDir);
  const harness=spawn(process.execPath,['-e',`(async()=>{const s=await require('./mt5_finance_store').createMt5FinanceStore({dataDir:${JSON.stringify(dataDir)},syncOptions:${JSON.stringify(syncOptions)}});await s.ready;setInterval(()=>{},1000);console.log('READY');})().catch(e=>{console.error(e);process.exit(1)})`],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env}});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('forced harness startup')),8000);harness.stdout.on('data',d=>{if(String(d).includes('READY')){clearTimeout(t);resolve();}});harness.on('error',reject);});
  await waitFor(async()=>{const entries=(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse);const last=entries.filter(e=>e.kind==='stream').at(-1);return last&&alive(last.pid)&&last;});
  const forcedPid=(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse).filter(e=>e.kind==='stream').at(-1).pid;
  harness.kill('SIGKILL');await waitFor(()=>!alive(forcedPid),5000);
  check('forced parent crash leaves zero stream orphans',!alive(forcedPid),forcedPid);
}
main().catch(error=>{results.failures.push(error.stack);console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  if(b)await b.close().catch(()=>{});for(const store of stores)await store.stop().catch(()=>{});
  results.ok=results.failures.length===0;const sorted=[...results.latencyMs].sort((a,b)=>a-b);
  results.medianLatencyMs=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null;results.maxLatencyMs=sorted.at(-1)||null;
  await fs.writeFile(path.join(root,'qa/v17_mt5_results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({ok:results.ok,checks:results.checks.length,medianLatencyMs:results.medianLatencyMs,maxLatencyMs:results.maxLatencyMs,failures:results.failures},null,2));
});
