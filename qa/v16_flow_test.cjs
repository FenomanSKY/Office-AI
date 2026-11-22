/* V16-C [Diubah oleh Codex - 2026-11-21] Only workspace fixtures, local processes, no paid agents or uploads. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {startServer}=require('../embedded_server'),root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const fixture=await fs.mkdtemp(path.join(__dirname,'v16-flow-')),checks=[],out={checks};let server,request;
 const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
 const fakeSpawn=()=>{const child=new EventEmitter();child.pid=999999;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;setTimeout(()=>{child.stdout.end('Fixture completed.');child.emit('close',0);},60);return child;};
 try{
  const roots=Object.fromEntries(['claude','codex','gemini','hermes','codexAccounts'].map(p=>[p,path.join(fixture,'logs',p)]));
  await Promise.all(Object.values(roots).map(p=>fs.mkdir(p,{recursive:true})));
  const logFile=path.join(roots.claude,'fixture-project','fixture-session.jsonl');await fs.mkdir(path.dirname(logFile));await fs.writeFile(logFile,'');
  server=await startServer({root,cwd:fixture,dataDir:path.join(fixture,'data'),port:0,maxPort:0,allowDriveScan:false,collector:{roots},flowHooksHome:path.join(fixture,'home'),agentPrompt:{spawnImpl:fakeSpawn}});
  await server.collectorReady;
  const html=await fetch(server.origin).then(r=>r.text()),token=html.match(/name="office-vault-token" content="([a-f0-9]+)"/)?.[1];check('isolated server token',!!token);
  const api=async(route,body,headers={})=>{const r=await fetch(server.origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const post=e=>api('/event',e),headers={'X-Office-Token':token};
  const frames=[];let raw='',sseClosed=false;request=http.get(server.origin+'/events',r=>{r.on('end',()=>{sseClosed=true;});r.on('error',()=>{sseClosed=true;});r.on('data',chunk=>{raw+=chunk;let at;while((at=raw.indexOf('\n\n'))>=0){const text=raw.slice(0,at);raw=raw.slice(at+2);const data=text.split('\n').find(l=>l.startsWith('data: '));if(data)frames.push(JSON.parse(data.slice(6)));}});});await sleep(50);
  const base={provider:'claude',source:'hook',agent:'main-v16',kind:'main',role:'Claude',session:'v16',flow_id:'turn-v16',taskTitle:'Fixture activity',at:Date.now()};
  check('Claude prompt accepted',(await post({...base,type:'call',event_id:'v16-call'})).status===200);
  for(const [index,type] of ['Explore','Plan'].entries())check('distinct subagent '+type,(await post({...base,type:'spawn',kind:'subagent',agent:'child-'+index,parent:base.agent,agent_type:type,event_id:'v16-child-'+index,at:base.at+index+1})).status===200);
  let state=(await api('/flow/state')).body,flow=state.flows.find(f=>f.session==='v16');
  check('Boss Secretary Claude two actual children',flow.nodes.length===5&&flow.edges.length===4);
  const children=flow.nodes.filter(n=>n.role==='persona');check('types map to distinct personas',new Set(children.map(n=>n.persona)).size===2);
  check('branches have distinct colors',new Set(flow.edges.filter(e=>e.kind==='delegate').map(e=>e.color)).size===2);
  check('stop accepted',(await post({...base,type:'report',status:'done',event_id:'v16-stop',at:base.at+20,tokens:400})).status===200);
  state=(await api('/flow/state')).body;flow=state.flows.find(f=>f.session==='v16');
  check('return chain reaches Boss',flow.edges.some(e=>e.kind==='return'&&e.to==='boss'));
  check('source remains real hook',flow.source==='hook'&&!flow.estimated);
  check('collector does not double hook tokens',(await api('/state')).body.total_tokens===0);
  check('collector does not book hook report twice',(await api('/reports')).body.reports.length===0);
  check('Codex collector active',(await post({provider:'codex',type:'call',agent:'main-v16-codex',session:'v16-codex',flow_id:'cx-turn',event_id:'cx-call'})).body.superseded==='collector');
  check('Codex stop collector active',(await post({provider:'codex',type:'report',agent:'main-v16-codex',session:'v16-codex',flow_id:'cx-turn',event_id:'cx-stop'})).status===200);
  check('Codex flow lifecycle survives',(await api('/flow/state')).body.flows.some(f=>f.provider==='codex'&&f.status==='completed'));
  await sleep(30);check('dedicated flow envelope survives supersession',frames.some(e=>e.type==='flow_event'&&e.event.provider==='codex'&&e.event.type==='report'));
  for(const [name,bad]of Object.entries({source:{source:'panel'},extra:{prompt:'PRIVATE_FIXTURE'},title:{taskTitle:'x'.repeat(121)},control:{taskTitle:'bad\u0000'},time:{at:-1},limit:{limitDetected:'true'},status:{flow_status:'working'},id:{flow_id:'../bad'},type:{agent_type:'x'.repeat(65)}}))check('reject invalid '+name,(await post({...base,type:'call',...bad})).status===400);
  await post({...base,type:'call',session:'redaction',flow_id:'redaction',event_id:'redaction',taskTitle:'api_key=PRIVATE_FIXTURE'});
  state=(await api('/flow/state')).body;check('unsafe title never enters projection',!JSON.stringify(state).includes('PRIVATE_FIXTURE'));
  check('hook capability GET does not inspect home',(await api('/flow/hooks/status',undefined,headers)).body.requiresTarget===true);
  check('hook operation token guard',(await api('/flow/hooks/status',{provider:'claude',scope:'project',folder:fixture})).status===403);
  const folder=path.join(fixture,'project'),target=path.join(folder,'.claude','settings.json');await fs.mkdir(path.dirname(target),{recursive:true});
  const original='{ "theme": "light", "hooks": {"Stop":[{"hooks":[{"type":"command","command":"echo fixture"}]}]} }\r\n';await fs.writeFile(target,original);
  const body={provider:'claude',scope:'project',folder};let preview=(await api('/flow/hooks/preview',body,headers)).body;
  check('preview exact content and no mutation',preview.writes?.length===1&&await fs.readFile(target,'utf8')===original);
  check('confirmation is enforced',(await api('/flow/hooks/install',{...body,previewId:preview.previewId},headers)).status===409);
  let install=await api('/flow/hooks/install',{...body,previewId:preview.previewId,confirm:true},headers);
  check('confirmed fixture install backed up',install.body.status==='installed'&&!!install.body.backup);
  check('preview equals exact installed bytes',await fs.readFile(target,'utf8')===preview.writes[0].content);
  check('other handlers preserved',JSON.parse(await fs.readFile(target)).hooks.Stop[0].hooks[0].command==='echo fixture');
  preview=(await api('/flow/hooks/preview',body,headers)).body;check('duplicate install preview is no-op',preview.changed===false);
  check('fixture uninstall restores original',(await api('/flow/hooks/uninstall',{...body,confirm:true,previewId:preview.previewId},headers)).body.restored==='exact'&&await fs.readFile(target,'utf8')===original);
  preview=(await api('/flow/hooks/preview',body,headers)).body;await fs.appendFile(target,' ');check('stale preview rejected',(await api('/flow/hooks/install',{...body,confirm:true,previewId:preview.previewId},headers)).status===409);
  for(const [name,folder]of [['traversal',fixture+'/../bad'],['protected',path.join(fixture,'Secrets')],['git',path.join(fixture,'.git')]])check('unsafe target '+name,(await api('/flow/hooks/status',{...body,folder},headers)).status===400);
  const link=path.join(fixture,'linked');await fs.symlink(folder,link,'junction');check('junction target rejected',(await api('/flow/hooks/status',{...body,folder:link},headers)).status===400);await fs.unlink(link);
  preview=(await api('/flow/hooks/preview',{provider:'codex',scope:'global'},headers)).body;check('global scope uses only injected fixture home',preview.target?.startsWith(path.join(fixture,'home')));
  check('global fixture install',(await api('/flow/hooks/install',{provider:'codex',scope:'global',confirm:true,previewId:preview.previewId},headers)).body.status==='installed');
  preview=(await api('/flow/hooks/preview',{provider:'codex',scope:'global'},headers)).body;check('global fixture uninstall',(await api('/flow/hooks/uninstall',{provider:'codex',scope:'global',confirm:true,previewId:preview.previewId},headers)).body.status==='absent');
  const result=await server.agentPrompt.runAgent('codex','Fixture task.',{cwd:fixture,mode:'demo',persona:'software-architect'});check('panel demo run finishes',result.ok);
  state=(await api('/flow/state')).body;flow=state.flows.find(f=>f.session===result.runId);check('panel source and actual persona branch',flow?.source==='panel'&&flow.nodes.some(n=>n.persona==='software-architect')&&flow.status==='completed');
  const [pipeline,panel]=await Promise.all([
   server.agentPrompt.runAgent('codex','Fixture pipeline task.',{cwd:fixture,mode:'demo',persona:'software-architect',flowSource:'pipeline',flowTaskId:'pipeline-fixture:script:1',flowParent:'pipeline-fixture'}),
   server.agentPrompt.runAgent('codex','Fixture independent panel.',{cwd:fixture,mode:'demo',persona:'software-architect'})
  ]);
  state=(await api('/flow/state')).body;
  check('concurrent pipeline source identified explicitly',pipeline.ok&&state.flows.some(f=>f.session==='pipeline-fixture:script:1'&&f.source==='pipeline'&&f.status==='completed'));
  check('concurrent panel source remains panel',panel.ok&&state.flows.some(f=>f.session===panel.runId&&f.source==='panel'));
  const logSession=require('node:crypto').createHash('sha256').update('fixture-session').digest('hex').slice(0,16),logBase={provider:'claude',agent:'main-'+logSession,session:logSession,source:'hook'};
  const beforeTokens=(await api('/state')).body.total_tokens,beforeReports=(await api('/reports')).body.reports.length;
  await post({...logBase,type:'call',event_id:'actual-log-call'});await post({...logBase,type:'report',event_id:'actual-log-stop',tokens:400});
  const logAt=new Date().toISOString(),rows=[
   {type:'user',timestamp:logAt,message:{role:'user',content:'PRIVATE_CONTENT_FIXTURE'}},
   {type:'assistant',timestamp:logAt,message:{id:'fixture-message',model:'claude-opus-5-5',content:[{type:'text',text:'PRIVATE_CONTENT_FIXTURE'}],usage:{input_tokens:100,output_tokens:300}}},
   {type:'system',subtype:'turn_duration',timestamp:logAt,durationMs:20}
  ];await fs.appendFile(logFile,rows.map(r=>JSON.stringify(r)+'\n').join(''));await sleep(50);await server.collector.tick();
  check('actual hook plus collector usage counted once',(await api('/state')).body.total_tokens===beforeTokens+400);
  check('actual hook plus collector report booked once',(await api('/reports')).body.reports.length===beforeReports+1);
  await server.collector.tick();check('collector repeated tick remains idempotent',(await api('/state')).body.total_tokens===beforeTokens+400&&(await api('/reports')).body.reports.length===beforeReports+1);
  state=(await api('/flow/state')).body;check('collector transcript text never enters flow state',!JSON.stringify(state).includes('PRIVATE_CONTENT_FIXTURE'));
  // V16-C [Diubah oleh Codex - 2026-11-21] A healthy SSE peer must survive a state frame above Node's 16 KB write watermark.
  for(let i=0;i<64;i++)assert.equal((await post({type:'call',provider:'claude',source:'hook',agent:'main-burst-'+i,session:'burst-'+i,event_id:'burst-'+i,taskTitle:'Bounded streaming fixture'})).status,200);
  await post({type:'report',provider:'claude',source:'hook',agent:'main-burst-63',session:'burst-63',event_id:'burst-report-sentinel'});
  const receivedSentinel=()=>frames.some(e=>e.event?.event_id==='burst-report-sentinel'||e.event_id==='burst-report-sentinel');
  for(let i=0;i<100&&!receivedSentinel()&&!sseClosed;i++)await sleep(20);
  check('SSE exercised state frame above 16 KB',Buffer.byteLength(JSON.stringify((await api('/state')).body))>16384);
  check('healthy SSE connection stays open across large snapshots',!sseClosed);
  check('report lifecycle delivered after SSE burst',receivedSentinel());
  const Model=require('../office_flow_model'),model=Model.create({maxFlows:8,maxActiveFlows:4,maxEvents:64,now:Date.now});
  for(let i=0;i<100;i++)model.ingest({type:'call',provider:'codex',agent:'main-codex',session:'stress-'+i,flow_id:'stress-'+i,at:Date.now()+i});
  check('parallel model limits remain bounded',model.stats().flows<=8&&model.stats().active<=4&&model.stats().events<=64);
  for(const bad of [null,false,42,{},[],{type:'invalid'}])check('malformed model event ignored '+JSON.stringify(bad),model.ingest(bad).accepted===false);
  model.clear();model.ingest({type:'call',provider:'gemini',source:'collector',agent:'main-g',at:Date.now()});check('log source honestly estimated',model.snapshot()[0].source==='log'&&model.snapshot()[0].estimated);
  model.configure({subagentTypes:{explore:'ui-designer'}});model.ingest({type:'spawn',provider:'gemini',source:'log',agent:'child',parent:'main-g',agent_type:'Explore',at:Date.now()});check('editable subagent map applied',model.snapshot()[0].nodes.some(n=>n.persona==='ui-designer'));
  model.clear();const correlated={provider:'codex',agent:'main-shared',session:'shared',at:Date.now()},a=model.ingest({...correlated,type:'call',flow_id:'a',event_id:'a-call'}),b=model.ingest({...correlated,type:'call',flow_id:'b',event_id:'b-call'});
  check('parallel turns in one session have distinct flow identities',!!a.flowId&&!!b.flowId&&a.flowId!==b.flowId);
  const endA={...correlated,type:'report',flow_id:'a',event_id:'a-report',at:correlated.at+1};
  check('report resolves only its exact flow',model.ingest(endA).flowId===a.flowId&&model.get(b.flowId).status==='working');
  check('duplicate completion preserves exact flow identity',model.ingest(endA).flowId===a.flowId);
  out.ok=true;
 }finally{request?.destroy();await server?.close();await fs.writeFile(path.join(__dirname,'v16_flow_results.json'),JSON.stringify(out,null,2));const target=path.resolve(fixture);assert.equal(path.dirname(target),__dirname);await fs.rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 console.log(JSON.stringify({ok:true,checks:checks.length}));
 if(!process.argv.includes('--api-only'))await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,'v16_3d_test.cjs')],{cwd:root,windowsHide:true,stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('3D suite failed '+code)));});
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
