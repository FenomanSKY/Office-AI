/* [Diubah oleh Codex - 2026-11-22] V21: isolated real transport and physical endpoint invariants. */
'use strict';
process.env.OFFICE_MT5_AUTODETECT='0';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{open,root,sleep}=require('./v21_lib.cjs');
const baseline=process.argv.includes('--baseline'),mutant=process.argv.includes('--mutant'),out={baseline,mutant,checks:[],scenarios:[]};
const check=(name,ok,details)=>{out.checks.push({name,ok:!!ok,...(ok?{}:{details})});assert.ok(ok,name+' '+JSON.stringify(details||'').slice(0,1500));};
// Read actual instanced voxel matrices: char.visible is false because the office batches its actors.
const inspector=`window.v21Inspect=()=>{updateBatch();const rect=canvas.getBoundingClientRect();return flowSnapshot.flatMap(f=>f.edges.map(e=>({flow:f.id,kind:e.kind,from:e.from,to:e.to,ends:[e.from,e.to].map(id=>{const n=f.nodes.find(n=>n.id===id),a=flowActorFor(n,f),p=flowAnchor(n,f),sp=p&&project(p),head=a&&project(a.char.userData.head.getWorldPosition(new THREE.Vector3())),part=charParts.findIndex(v=>v.actor===a&&v.part===a?.char.userData.head.children.find(c=>c.isMesh)),idx=part>=0?part:charParts.findIndex(v=>v.actor===a&&v.part.isMesh),matrix=new THREE.Matrix4();if(idx>=0)charMesh.getMatrixAt(idx,matrix);return{id,agent:n.agent,type:n.agentType,persona:n.persona,visual:n.visual,actor:a?.id||null,kind:a?.kind||null,hidden:!a||!!a.hidden||!!a.removed,mesh:idx>=0&&Math.abs(matrix.determinant())>1e-10,label:!!a?.label?.isConnected,screen:sp&&{x:sp.x,y:sp.y,z:sp.z},head,inside:!!sp&&sp.x>=0&&sp.x<=rect.width&&sp.y>=0&&sp.y<=rect.height&&Math.abs(sp.z)<=1,point:p?.toArray()};})})));};`;
async function browserLock(){
 const file=path.join(__dirname,'v21_browser.lock');
 const until=Date.now()+3600000;let notified=0;
 while(Date.now()<until){
  const peers=(await fs.readdir(__dirname)).filter(e=>e.endsWith('browser.lock'));
  if(!peers.length){
   try{await fs.writeFile(file,JSON.stringify({pid:process.pid,task:'v21_subagent_test'}),{flag:'wx'});}catch(e){if(e.code==='EEXIST'){await sleep(5000);continue;}throw e;}
   if((await fs.readdir(__dirname)).some(n=>n.endsWith('browser.lock')&&n!=='v21_browser.lock')){await fs.unlink(file);await sleep(5000);continue;}
   return async()=>{const own=JSON.parse(await fs.readFile(file,'utf8').catch(()=>'null'));if(own?.pid===process.pid)await fs.unlink(file);};
  }
  if(Date.now()-notified>30000){console.log('V21 waiting for browser:',peers.join(', '));notified=Date.now();}
  await sleep(5000);
 }
 throw Error('V21 browser lock wait timed out');
}
async function main(){
 const unlock=await browserLock();let b;
 try{
  let source=await fs.readFile(path.join(root,process.argv.includes('--candidate')?'qa/v21_office_candidate.js':'office.js'),'utf8');
  if(mutant)source=source.replace('flowAllocate(b);','/* mutation: skip the first physical allocation */');
  let sources;
  const diagnostic='window.v21State=()=>typeof flowBindings==="undefined"?null:[...flowBindings.values()].map(b=>({id:b.node.agent,status:b.node.status,worker:b.worker,doneAt:b.doneAt,doneClock:b.doneClock,exiting:b.exiting,actor:b.actor?.id,hidden:b.actor?.hidden,pos:b.actor?.char.position.toArray(),path:b.actor?.path,queue:b.actor?.queue.map(q=>({type:q.type,goal:q.goalPoint}))}));';
  b=await open({prepareFixture:async fixture=>{sources=await require('./v21_sources.cjs').prepare(fixture);return sources.options;},sourceOverrides:{'/office.js':source.replace('window.officeDebug=()=>',inspector+'\n'+diagnostic+'\nwindow.v21Busy=(value)=>{const a=actors.find(a=>a.id==="software-architect");a.busy=value;a.qualityWorking=value;};\nwindow.officeDebug=()=>')}});
  await b.server.collectorReady;
  await b.go('?qa=1');await b.size(1600,900);
  await b.ev('officeQA.freeze();officeQA.auto(false);officeQA.preset("iso");officeQA.clearJobs();0');
  const post=async e=>{const r=await fetch(b.server.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)});assert.equal(r.status,200,JSON.stringify(await r.json()));};
  let counter=0;
  out.latency=[];
  const reset=async mode=>{out.latency.push(...await b.ev('OfficeFlow.stats().latencyMs'));await b.ev('OfficeFlow.clear();officeQA.clearJobs();OfficeFlow.configure({enabled:true,maxVisibleEdges:128,walkAnimation:'+JSON.stringify(mode)+',patterns:true});officeQA.preset("iso");0');};
  const send=async(type,extra={})=>{const event={provider:'claude',source:'hook',agent:'v21-main',kind:'main',session:'v21-fixture',flow_id:'v21-turn',taskTitle:'Demo delegation',at:Date.now(),type,event_id:'v21-'+(++counter),...extra};await post(event);await sleep(15);return event;};
  const inspect=async name=>{await b.ev('officeQA.tick(0);0');const rows=await b.ev('v21Inspect()');const bad=rows.flatMap(r=>r.ends.filter(n=>n.hidden||!n.mesh||!n.label||!n.inside).map(n=>({flow:r.flow,edge:r.from+'>'+r.to,...n})));out.maxDraw=Math.max(out.maxDraw||0,await b.ev('officeDebug().drawCalls'));out.scenarios.push({name,edges:rows.length,bad});check(name+' every edge has a physical on-screen endpoint',rows.length>0&&!bad.length,bad);return rows;};
  const shot=async name=>{await b.ev('OfficeFlow.advance(300);0');await b.settle();const r=await b.call('Page.captureScreenshot',{format:'png'}),dir=path.join(__dirname,'v21-shots');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));};
  const hook=payload=>new Promise((resolve,reject)=>{const child=spawn(process.env.OFFICE_PYTHON||path.join(process.env.LOCALAPPDATA,'Programs/Python/Python310/python.exe'),['-I','-B','hook_send.py'],{cwd:root,windowsHide:true,env:{...process.env,OFFICE_PORT:String(b.server.port),OFFICE_AI_DATA_DIR:path.join(b.fixture,'hook-data')},stdio:['pipe','pipe','pipe']});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('hook exit '+code)));child.stdin.end(JSON.stringify(payload));});
  await reset('fast');await send('call');await send('spawn',{kind:'subagent',agent:'v21-known',parent:'v21-main',agent_type:'Plan'});
  await inspect('mapped Plan');await shot(baseline?'before_known':'01_known');
  await send('spawn',{kind:'subagent',agent:'v21-unknown',parent:'v21-main',agent_type:'custom-helper'});
  if(baseline){await b.ev('officeQA.tick(0);0');out.reproduction=await b.ev('v21Inspect()');await shot('before_unknown');const bad=out.reproduction.flatMap(r=>r.ends).filter(n=>!n.actor||!n.mesh);check('baseline reproduces orphan endpoint',bad.some(n=>n.agent==='v21-unknown'),bad);return;}
  const unknown=await inspect('unknown custom type');check('unmapped type allocates a real temporary worker with its original label',unknown.flatMap(r=>r.ends).some(n=>n.agent==='v21-unknown'&&n.kind==='worker'&&n.type==='custom-helper'));await shot('02_unknown');
  check('original custom type is visible in the 3D label',await b.ev('[...document.querySelectorAll(".office-flow-label")].some(e=>!e.hidden&&e.dataset.agent==="v21-unknown"&&e.textContent.includes("custom-helper"))'));
  for(let i=0;i<3;i++)await send('spawn',{kind:'subagent',agent:'v21-five-'+i,parent:'v21-main',agent_type:['Explore','general-purpose',''][i]});
  await b.ev('officeQA.advance(5);0');await inspect('five parallel');await shot('03_five_parallel');
  if(process.argv.includes('--preview')){
   await send('retire',{kind:'subagent',agent:'v21-five-0',parent:'v21-main',agent_type:'Explore',status:'done'});await b.ev('OfficeFlow.advance(120);0');await b.settle();
   const closeup=await b.call('Page.captureScreenshot',{format:'png',clip:{x:320,y:280,width:800,height:450,scale:2}}),file=path.join(root,'docs/images/flow_closeup.png'),backup=path.join(root,'cadangan/v21-codex/flow_closeup.png');
   if(!await fs.stat(backup).catch(()=>null)){await fs.mkdir(path.dirname(backup),{recursive:true});await fs.copyFile(file,backup);}
   const bytes=require('./v21_png.cjs').optimise(Buffer.from(closeup.data,'base64'));check('public demo close-up stays <=600 KB',bytes.length<=600*1024,bytes.length);await fs.writeFile(file,bytes);await fs.writeFile(path.join(__dirname,'v21-shots/06_preview_closeup.png'),bytes);
  }
  for(let i=0;i<12;i++)await send('spawn',{kind:'subagent',agent:'v21-overflow-'+i,parent:i===11?'v21-overflow-0':'v21-main',agent_type:i<2?'Plan':'custom-'+i});
  const overflow=await inspect('over pool with nested child');check('pool uses at most eight physical workers',await b.ev('officeDebug().actors.filter(a=>a.kind==="worker"&&!a.hidden).length<=8'));
  check('overflow represented by +N badge',await b.ev('[...document.querySelectorAll(".office-flow-label-text")].some(e=>/^\\+\\d/.test(e.textContent))'));
  await shot('04_overflow');
  const badge=await b.ev('(()=>{const el=[...document.querySelectorAll(".office-flow-label[role=button]")].find(e=>!e.hidden&&/^\\+\\d/.test(e.textContent));if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
  check('overflow badge is visible and selectable',!!badge);
  for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,x:badge.x,y:badge.y,button:'left',clickCount:1});
  await sleep(150);check('+N opens all child identities in expanded Flow tree',await b.ev('document.getElementById("panel").open&&Array.from({length:12},(_,i)=>"v21-overflow-"+i).every(id=>[...document.querySelectorAll(".flow16-item[open] [data-agent]")].some(e=>e.dataset.agent===id))'));
  await b.ev('document.getElementById("panel").close();0');
  await b.ev('[...document.querySelectorAll(".office-flow-label[role=button]")].find(e=>!e.hidden).focus();0');
  for(const type of ['keyDown','keyUp'])await b.call('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter'});
  await sleep(100);check('overflow badge opens by keyboard',await b.ev('document.getElementById("panel").open'));await b.ev('document.getElementById("panel").close();0');
  await send('report',{status:'done'});await b.ev('OfficeFlow.advance(2600);officeQA.advance(100);0');
  check('workers leave after all completion',await b.ev('officeDebug().actors.filter(a=>a.kind==="worker"&&!a.hidden).length===0'));
  await shot('05_workers_left');
  if(process.argv.includes('--quick')){out.ok=true;return;}
  await reset('fast');await b.ev('v21Busy(true);0');await send('call');await send('spawn',{kind:'subagent',agent:'v21-busy-persona',parent:'v21-main',agent_type:'Plan'});
  const busy=await inspect('mapped persona is busy');check('busy mapped persona gets a temporary worker',busy.flatMap(r=>r.ends).some(n=>n.agent==='v21-busy-persona'&&n.kind==='worker'));
  await b.ev('v21Busy(false);0');await send('report',{status:'done'});await b.ev('OfficeFlow.advance(2600);officeQA.advance(100);0');
  await reset('fast');
  for(const [hook_event_name,agent_type] of [['UserPromptSubmit',''],['SubagentStart','statusline-setup']])await hook({hook_event_name,session_id:'v21-actual-hook',agent_id:'fixture-hook-child',agent_type});
  await sleep(100);await inspect('real hook_send Python to SSE to mesh');
  await hook({hook_event_name:'SubagentStop',session_id:'v21-actual-hook',agent_id:'fixture-hook-child',agent_type:'statusline-setup'});
  await hook({hook_event_name:'Stop',session_id:'v21-actual-hook'});await sleep(100);await b.ev('OfficeFlow.advance(2600);officeQA.advance(100);0');
  check('actual hook worker leaves',await b.ev('officeDebug().actors.filter(a=>a.kind==="worker"&&!a.hidden).length===0'));
  await reset('fast');await sources.update();await b.server.collector.tick();await sleep(100);
  const logs=await fetch(b.server.origin+'/flow/state').then(r=>r.json());
  out.logSources=logs.flows.filter(f=>['gemini','hermes'].includes(f.provider));
  for(const provider of ['gemini','hermes'])check(provider+' real collector emits estimated subagent',out.logSources.some(f=>f.provider===provider&&f.source==='log'&&f.estimated&&f.nodes.some(n=>n.role==='persona')),out.logSources);
  await inspect('actual Gemini Hermes log subagents');
  await sources.retire();await b.server.collector.tick();await sleep(100);await b.ev('OfficeFlow.advance(3000);officeQA.advance(120);0');
  check('log subagents eventually leave',await b.ev('officeDebug().actors.filter(a=>a.kind==="worker"&&!a.hidden).length===0'));
  // OpenCode has no native collector in the current product: exercise the explicit observed log envelope honestly.
  await b.ev('officeQA.event({type:"flow_event",event:{type:"spawn",provider:"opencode",source:"log",kind:"subagent",agent:"v21-oc-log",parent:"main-opencode",session:"v21-oc-log",agent_type:"log-helper",at:Date.now()}});0');
  await inspect('OpenCode observed log envelope');
  let seed=210022;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const types=['Explore','Plan','general-purpose','kerja-berat','kerja-sedang','kerja-ringan','claude-code-guide','statusline-setup','custom-helper',''];
  for(let trial=0;trial<42;trial++){
   const mode=['fast','off','full'][trial%3],provider=['claude','codex','gemini','opencode','hermes'][trial%5];await reset(mode);
   const common={provider,session:'v21-'+trial,flow_id:'v21-'+trial,agent:'v21-main-'+trial,source:'hook'};
   await send('call',common);const count=trial===0?12:1+Math.floor(random()*12),ids=[];
   for(let i=0;i<count;i++){
    const agent='v21-'+trial+'-child-'+i,type=types[(trial+i)%types.length],parent=i&&random()<.25?ids[Math.floor(random()*ids.length)]:common.agent;ids.push(agent);
    await send(trial%7===0&&i===0?'retire':'spawn',{...common,kind:'subagent',agent,parent,agent_type:type});
   }
   const liveRows=await inspect('seeded '+trial+' '+provider+' '+mode),startTypes=new Map(liveRows.flatMap(r=>r.ends).filter(n=>n.agent).map(n=>[n.agent,n.type]));
   const physics=await b.ev('(()=>{const r={conflicts:0,pairs:0,floating:0};for(let k=0;k<12;k++){officeQA.step(.25);r.conflicts=Math.max(r.conflicts,officeQA.physics().conflicts);const a=officeQA.sampleActors().filter(a=>!a.hidden&&!a.lifted);for(let i=0;i<a.length;i++){if(!a[i].seated&&Math.abs(a[i].y)>.03)r.floating++;for(let j=i+1;j<a.length;j++)if(Math.hypot(a[i].x-a[j].x,a[i].z-a[j].z)<.48)r.pairs++;}}return r;})()');
   check('seeded '+trial+' movement has no collisions or floating actors',!physics.conflicts&&!physics.pairs&&!physics.floating,physics);await inspect('moving '+trial);
   for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
   for(const agent of ids)await send('retire',{...common,kind:'subagent',agent,parent:common.agent});
   const stopped=await b.ev('OfficeFlow.snapshot().flatMap(f=>f.nodes).filter(n=>n.role==="persona").map(n=>({agent:n.agent,type:n.agentType}))');
   check('seeded '+trial+' stops preserve child type identity',stopped.every(n=>n.type===startTypes.get(n.agent)),stopped);
   await send('report',{...common,status:'done'});await b.ev('OfficeFlow.advance(2600);officeQA.advance(120);0');
   check('seeded '+trial+' all temporary workers exit',await b.ev('officeDebug().actors.filter(a=>a.kind==="worker"&&!a.hidden).length===0'));
   check('seeded '+trial+' permanent personas released',await b.ev('officeDebug().actors.filter(a=>a.kind==="persona").every(a=>!a.flowWorking)'));
   if(trial%7===0)console.log('V21 seeded scenarios',trial+1,'/ 42');
  }
  await reset('full');await b.ev('OfficeFlow.configure({enabled:false,walkAnimation:"full"});0');
  const hiddenLines={provider:'claude',session:'v21-lines-off',flow_id:'v21-lines-off',agent:'v21-lines-off-main'};
  await send('call',hiddenLines);for(let i=0;i<2;i++)await send('spawn',{...hiddenLines,kind:'subagent',agent:'v21-lines-off-'+i,parent:hiddenLines.agent,agent_type:'custom-helper'});
  await b.ev('officeQA.advance(10);0');check('disabled lines do not duplicate workers through the legacy engine',await b.ev('officeDebug().actors.filter(a=>a.kind==="worker").length===2&&officeDebug().liveWorkers.length===0'));
  await send('report',{...hiddenLines,status:'done'});await b.ev('OfficeFlow.advance(2600);officeQA.advance(120);0');check('disabled-line workers still leave',await b.ev('officeDebug().actors.every(a=>a.kind!=="worker")'));
  await reset('off');await b.ev('for(let i=0;i<8;i++)officeQA.removeObject("project-"+i);0');
  const standing={provider:'codex',session:'v21-standing',flow_id:'v21-standing',agent:'v21-standing-main'};
  await send('call',standing);for(let i=0;i<2;i++)await send('spawn',{...standing,kind:'subagent',agent:'v21-standing-'+i,parent:standing.agent,agent_type:'custom-helper'});
  await b.ev('officeQA.advance(1);0');await inspect('no project desks: standing work points');
  check('missing desks use clear standing points away from the doorway',await b.ev('(()=>{const a=officeDebug().actors.filter(a=>a.kind==="worker");return a.length===2&&a.every(a=>!a.seated&&!officeQA.nav(a.x,a.z).blocked&&Math.hypot(a.x,a.z-15.5)>=2);})()'));
  await send('report',{...standing,status:'done'});await b.ev('OfficeFlow.advance(2600);officeQA.advance(120);0');check('standing workers eventually leave',await b.ev('officeDebug().actors.every(a=>a.kind!=="worker")'));
  out.latency.push(...await b.ev('OfficeFlow.stats().latencyMs'));check('visible endpoint latency <=500 ms',out.latency.length&&Math.max(...out.latency)<=500,out.latency);
  check('draw calls <=340',out.maxDraw<=340,out.maxDraw);
  out.console=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(e.params.type));check('no console errors or warnings',!out.console.length,out.console);
  out.ok=true;
 }catch(error){out.error=error.stack;out.debug=await b?.ev('({time:officeDebug().time,flow:OfficeFlow.stats(),workers:officeDebug().actors.filter(a=>a.kind==="worker"),bindings:window.v21State?.()})').catch(()=>null);throw error;}
 finally{await fs.writeFile(path.join(__dirname,baseline?'v21_baseline_results.json':mutant?'v21_mutation_results.json':process.argv.includes('--quick')?'v21_quick_results.json':'v21_subagent_results.json'),JSON.stringify(out,null,2));await b?.close();await unlock();}
}
main().then(()=>console.log(JSON.stringify({ok:true,baseline,checks:out.checks.length,scenarios:out.scenarios.length}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
