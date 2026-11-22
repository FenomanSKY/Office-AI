// [Diubah oleh Codex - 2026-11-22] V22 numeric fixtures only; no real account logs.
'use strict';
process.env.OFFICE_MT5_AUTODETECT='0';process.env.OFFICE_AI_NO_DRIVE_SCAN='1';process.env.TZ='Asia/Jakarta';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),{createUsageHistory,hash,day,estimate,validDay}=require('../usage_history_store'),{createUsageImporter}=require('../collector');
const pricing=require('../pricing.json'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={checks:[],failed:[]};function check(name,value){out.checks.push(name);assert.ok(value,name);}
async function waitDone(importer){for(let i=0;i<2000;i++){const s=await importer.action('status');if(['complete','error'].includes(s.state))return s;await sleep(20);}throw Error('import_timeout');}
async function main(){const fixture=await fs.mkdtemp(path.join(__dirname,'v22-test-'));let importer,server;
try{
 const dataDir=path.join(fixture,'data'),logs=path.join(fixture,'logs');await fs.mkdir(dataDir);await fs.mkdir(path.join(logs,'claude','demo'),{recursive:true});await fs.mkdir(path.join(logs,'codex','2024','01','01'),{recursive:true});
 const roots={claude:path.join(logs,'claude'),codex:path.join(logs,'codex'),codexAccounts:null,gemini:[path.join(logs,'gemini')],hermes:path.join(logs,'hermes')};
 const clock=()=>Date.parse('2026-11-22T04:00:00Z');let currentPricing=structuredClone(pricing),store=await createUsageHistory({dataDir,now:clock,getPricing:()=>currentPricing});
 check('empty history honest',store.total().tokens===0&&store.total().first_date===null);
 check('invalid calendar day rejected',!validDay('2026-99-99')&&!validDay('2026-02-30'));
 check('local timezone midnight',day(Date.parse('2024-01-01T17:30:00Z'))==='2024-01-02');
 check('unknown model cost n/a',estimate({input_tokens:10},'new-unknown-model','codex',pricing)===null);
 const claudeModel='claude-sonnet-4-5',codexModel='gpt-5';
 const claude=(id,t,i,o,cr=0)=>({type:'assistant',timestamp:t,message:{id,model:claudeModel,usage:{input_tokens:i,output_tokens:o,cache_read_input_tokens:cr},content:[{type:'text',text:'PRIVATE_FIXTURE_TEXT'}]}});
 const cf=path.join(logs,'claude','demo','demo.jsonl'),old='2024-01-01T17:30:00Z';
 await fs.writeFile(cf,[claude('response-a',old,100,20,30),claude('response-a',old,100,25,30),claude('response-b','2026-11-22T01:00:00Z',10,5)].map(JSON.stringify).join('\n')+'\n');
 const xf=path.join(logs,'codex','2024','01','01','rollout-demo.jsonl');
 const codex=(i,o,c)=>({type:'event_msg',timestamp:'2024-01-01T12:00:00Z',payload:{type:'token_count',info:{total_token_usage:{input_tokens:i,output_tokens:o,cached_input_tokens:c}}}});
 await fs.writeFile(xf,[{type:'turn_context',payload:{model:codexModel}},codex(200,40,50),codex(300,60,80),codex(300,60,80)].map(JSON.stringify).join('\n')+'\n');
 importer=createUsageImporter({dataDir,store,getPricing:()=>currentPricing,roots,now:clock});
 await importer.action('start');check('full import completed',(await waitDone(importer)).state==='complete');
 // Claude: 100+25+30+10+5=170; Codex: (300-80)+80+60=360.
 check('hand-calculated full total',store.total().tokens===530);
 check('no nine-day limit',store.total().first_date==='2024-01-01'&&store.total().days===3);
 check('per-provider ranking sum',store.breakdown('provider',8).rows.reduce((s,r)=>s+r.tokens,0)===530);
 check('ranking percent sum',Math.abs(store.breakdown('model',8).rows.reduce((s,r)=>s+r.percent,0)-100)<1e-9);
 check('empty dates chart zero',store.daily(30).days.filter(r=>r.tokens===0).length===29);
 const costBefore=store.total().cost_usd;currentPricing.models[claudeModel].input=999;
 check('archived cost unchanged on price edit',store.total().cost_usd===costBefore);
 let sourceReads=0;const originalOpen=fs.open;fs.open=async function(file,...args){if(file===cf||file===xf)sourceReads++;return originalOpen.call(this,file,...args);};try{await importer.action('start');await waitDone(importer);}finally{fs.open=originalOpen;}check('repeat import idempotent',store.total().tokens===530);check('unchanged source files not reread',sourceReads===0);
 await importer.stop();importer=null;store=await createUsageHistory({dataDir,now:clock,getPricing:()=>currentPricing});
 importer=createUsageImporter({dataDir,store,getPricing:()=>currentPricing,roots,now:clock});await importer.action('start');await waitDone(importer);check('restart idempotent',store.total().tokens===530);
 await fs.appendFile(cf,JSON.stringify(claude('response-c','2026-11-22T02:00:00Z',7,3))+'\n');
 importer.enqueue('claude',{file:cf});for(let i=0;i<100&&store.total().tokens!==540;i++)await sleep(20);check('continuous collector append',store.total().tokens===540);
 await store.syncBaseline([{date:'2026-11-22',provider:'claude',model:claudeModel,usage:{input_tokens:17,output_tokens:8}}]);check('today counted once',store.total().tokens===540);
 await store.syncBaseline([{date:'2026-11-22',provider:'claude',model:claudeModel,usage:{input_tokens:30,output_tokens:10}}]);check('total covers existing daily floor',store.total().tokens===555);
 const bytesBefore=await fs.readFile(cf);check('log source remains unchanged',!bytesBefore.toString().includes('usage_history'));
 await importer.stop();importer=null;
 // Bounded parser: a million irrelevant lines and an oversized/malformed record.
 const large=path.join(logs,'claude','demo','large.jsonl'),handle=await fs.open(large,'w'),block=Buffer.from('{"type":"unused"}\n'.repeat(10000));for(let i=0;i<100;i++)await handle.write(block);await handle.write(Buffer.from('x'.repeat(5*1024*1024)+'\n{bad}\n'+JSON.stringify(claude('after-large','2026-11-21T03:00:00Z',1,1))+'\n'));await handle.close();
 const start=performance.now(),memory=process.memoryUsage().rss;let maxDelay=0,last=performance.now();const heartbeat=setInterval(()=>{const n=performance.now();maxDelay=Math.max(maxDelay,n-last-10);last=n;},10);
 importer=createUsageImporter({dataDir,store,getPricing:()=>currentPricing,roots,now:clock});await importer.action('start');await sleep(100);await importer.action('pause');const partial=store.total().tokens;check('pause is available',(await importer.action('status')).state==='paused');await importer.stop();importer=null;
 store=await createUsageHistory({dataDir,now:clock,getPricing:()=>currentPricing});importer=createUsageImporter({dataDir,store,getPricing:()=>currentPricing,roots,now:clock});await importer.action('start');await waitDone(importer);clearInterval(heartbeat);
 out.load={lines:1000000,elapsed_ms:Math.round(performance.now()-start),max_event_loop_delay_ms:Math.round(maxDelay),rss_growth_mb:Math.round((process.memoryUsage().rss-memory)/1048576)};
 check('million-line malformed file preserves following valid record',store.total().tokens===557);
 check('oversized record reported once',store.total().import.skipped_lines===1);
 check('bounded memory',out.load.rss_growth_mb<160);check('HTTP thread remains responsive',maxDelay<500);
 const diskNames=await fs.readdir(path.join(dataDir,'usage_history'));let contents='';for(const n of diskNames)if(n.endsWith('.json'))contents+=await fs.readFile(path.join(dataDir,'usage_history',n),'utf8');
 check('archive excludes content/private paths',!contents.includes('PRIVATE_FIXTURE_TEXT')&&!contents.includes(logs.replace(/\\/g,'\\\\'))&&!contents.includes('response-a'));
 await importer.stop();importer=null;
 // Corruption restores the previous atomic generation and replays its checkpoint.
 const sourceFile=path.join(dataDir,'usage_history','source-'+hash('claude:'+path.resolve(cf))+'.json');await fs.writeFile(sourceFile,'{broken');const recovered=await createUsageHistory({dataDir,now:clock,getPricing:()=>currentPricing});check('corrupt source recovers backup',recovered.total().import.recovered&&!recovered.total().import.error);
 importer=createUsageImporter({dataDir,store:recovered,getPricing:()=>currentPricing,roots,now:clock});await importer.action('start');await waitDone(importer);check('recovered checkpoint replays once',recovered.total().tokens===557);await importer.stop();importer=null;
 server=await require('../embedded_server').startServer({port:0,maxPort:0,dataDir:path.join(fixture,'server'),collector:false,usageOptions:{roots},allowDriveScan:false,now:clock});
 const page=await(await fetch(server.origin)).text(),token=/name="office-vault-token" content="([^"]+)"/.exec(page)?.[1];assert.ok(token);
 const api=(url,body,headers={})=>fetch(server.origin+url,{method:body?'POST':'GET',headers:{'X-Office-Token':token,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 check('token required on usage totals',(await fetch(server.origin+'/usage/total')).status===403);
 check('bad grouping rejected',(await api('/usage/breakdown?by=project')).status===400);check('bad limit rejected',(await api('/usage/breakdown?limit=0')).status===400);
 check('no arbitrary import path',(await api('/usage/import',{action:'start',path:'../elsewhere'})).status===400);
 check('invalid import action rejected',(await api('/usage/import',{action:'delete'})).status===400);
 check('foreign origin rejected',(await api('/usage/total',undefined,{Origin:'https://example.invalid'})).status===403);
 check('import route starts',(await api('/usage/import',{action:'start'})).status===200);
 for(let n=0;n<2000;n++){const status=await(await api('/usage/import',{action:'status'})).json();if(status.import.state==='complete')break;await sleep(20);}
 const response=await(await api('/usage/total')).json();check('route exact fixture total',response.tokens===542);
 check('route no private source',!JSON.stringify(response).includes(logs)&&!JSON.stringify(response).includes('response-a'));
 check('chart 90 days',(await(await api('/usage/history?days=90')).json()).days.length===90);
 const ranks=await(await api('/usage/breakdown?by=month&limit=1&offset=1')).json();check('rank pagination',ranks.rows.length===1&&ranks.total===2);
 await server.close();server=null;
 // SQLite paging uses metadata-only fake databases, including response-ID dedup.
 const {DatabaseSync}=require('node:sqlite'),sqlDir=path.join(fixture,'sqlite-data');await fs.mkdir(sqlDir);
 await fs.mkdir(path.join(logs,'gemini','conversations'),{recursive:true});await fs.mkdir(path.join(logs,'hermes'),{recursive:true});
 const vi=n=>{const b=[];do{let v=n%128;n=Math.floor(n/128);b.push(v|(n?128:0));}while(n);return Buffer.from(b);},num=(k,n)=>Buffer.concat([vi(k*8),vi(n)]),str=(k,b)=>Buffer.concat([vi(k*8+2),vi(b.length),b]);
 const gf=path.join(logs,'gemini','conversations','demo.db'),gdb=new DatabaseSync(gf);gdb.exec('create table gen_metadata(idx integer primary key,data blob)');
 for(let n=0;n<76;n++){const stats=Buffer.concat([num(2,4),num(3,2),num(4,3),num(5,1),str(11,Buffer.from('rid-'+(n===75?0:n)))]),gen=Buffer.concat([str(4,stats),str(19,Buffer.from('gemini-2.5-flash'))]);gdb.prepare('insert into gen_metadata values (?,?)').run(n,str(1,gen));}gdb.close();
 const hf=path.join(logs,'hermes','state.db'),hdb=new DatabaseSync(hf);hdb.exec('create table session_model_usage(session_id text,model text,input_tokens integer,output_tokens integer,cache_read_tokens integer,cache_write_tokens integer,reasoning_tokens integer,last_seen real)');for(let n=0;n<130;n++)hdb.prepare('insert into session_model_usage values (?,?,?,?,?,?,?,?)').run('session-'+String(n).padStart(3,'0'),'local',10,2,3,4,1,Date.parse('2025-01-01T00:00:00Z')/1000);hdb.close();
 const sqlStore=await createUsageHistory({dataDir:sqlDir,now:clock,getPricing:()=>pricing});importer=createUsageImporter({dataDir:sqlDir,store:sqlStore,getPricing:()=>pricing,roots:{...roots,claude:path.join(logs,'missing'),codex:path.join(logs,'missing')},now:clock});await importer.action('start');await waitDone(importer);check('SQLite full paging and response dedup',sqlStore.total().tokens===3350);check('SQLite unknown Hermes pricing honest',sqlStore.total().cost_usd===null&&sqlStore.total().unpriced_tokens===2600);await importer.action('start');await waitDone(importer);check('SQLite reimport unchanged fingerprint',sqlStore.total().tokens===3350);
 await sqlStore.syncBaseline([{date:day((await fs.stat(gf)).mtimeMs),provider:'gemini',model:'gemini-2.5-flash',account:'gemini-api',usage:{input_tokens:5}}]);check('BYOK separate from imported log balance',sqlStore.total().tokens===3355);
 const corruptDir=path.join(fixture,'unrecoverable');await fs.mkdir(path.join(corruptDir,'usage_history'),{recursive:true});await fs.writeFile(path.join(corruptDir,'usage_history','index.json'),'{broken');const corruptStore=await createUsageHistory({dataDir:corruptDir,getPricing:()=>pricing});check('unrecoverable corruption is visible',corruptStore.total().import.error==='history_corrupt');const disabled=createUsageImporter({dataDir:corruptDir,store:corruptStore,getPricing:()=>pricing,roots});await assert.rejects(()=>disabled.action('start'));await disabled.stop();check('corrupt import fails safely without overwriting',(await fs.readFile(path.join(corruptDir,'usage_history','index.json'),'utf8'))==='{broken');
}finally{if(importer)await importer.stop();if(server)await server.close();const absolute=path.resolve(fixture);if(path.dirname(absolute)===__dirname&&path.basename(absolute).startsWith('v22-test-'))await fs.rm(absolute,{recursive:true,force:true});}}
if(require.main===module)main().then(async()=>{if(process.argv.includes('--browser'))await new Promise((resolve,reject)=>{const child=require('node:child_process').spawn(process.execPath,[path.join(__dirname,'v22_browser_test.cjs')],{cwd:root,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code?reject(Error('browser_suite_failed')):resolve());});}).catch(e=>{out.failed.push(e.stack);process.exitCode=1;}).finally(async()=>{out.passed=out.checks.length-out.failed.length;await fs.writeFile(path.join(__dirname,'v22_usage_results.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));});
module.exports={main};
