/* V16-C [Diubah oleh Codex - 2026-11-21] Real SSE → pooled 3D, deterministic fixture frames. */
/* V16-C [Diubah oleh Gemini - 2026-11-21] Tambah sinkronisasi SSE/laporan deterministik (hilangkan lomba sleep 25ms), verifikasi label Bos & Sekretaris tanpa duplikat, status header aktif/kembali, preset ketebalan garis (tipis/normal/tebal), dan kelulusan penuh di 4 kombinasi tema/resolusi. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {open,root,sleep,lockBrowser}=require('./v16_3d_lib.cjs');
async function main(){
 const unlock=await lockBrowser('v16_3d_test');
 let b;const out={checks:[],shots:[],latency:[]},check=(name,condition,detail)=>{out.checks.push({name,ok:!!condition,detail});assert.ok(condition,name+': '+JSON.stringify(detail));};
 try{
  b=await open();await b.go('?qa=1');await b.size(1280,720);
  const post=async event=>{const r=await fetch(b.server.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.json();};
  const waitUntil=async(expr,ms=4000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await b.ev(expr))return true;await sleep(30);}return await b.ev(expr);};
  if(!process.argv.includes('--visual-only')){
  out.reportChecks=await require('./v16_3d_reports_test.cjs').run(b);
  await b.ev('officeQA.auto(false);officeQA.freeze(false);OfficeFlow.clear();0');
  for(let i=0;i<30;i++){
   await b.ev('OfficeFlow.clear();0');
   const base={provider:'claude',type:'call',agent:'main-latency-'+i,session:'latency-'+i,flow_id:'latency-'+i,event_id:'latency-'+i,source:'hook'};
   await post(base);
   const sample=await b.ev('new Promise((resolve,reject)=>{const start=performance.now(),tick=()=>{const a=OfficeFlow.stats().latencyMs;if(a.length)resolve(Math.max(...a));else if(performance.now()-start>2500)reject(Error("flow latency timeout"));else setTimeout(tick,20);};tick();})');
   out.latency.push(sample);
   await post({...base,type:'report',event_id:'latency-end-'+i});
  }
  const sorted=[...out.latency].sort((a,b)=>a-b);out.timing={count:sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],maxMs:sorted.at(-1)};
  check('event to first actual draw <=500 ms median/max',out.timing.medianMs<=500&&out.timing.maxMs<=500,out.timing);
  await b.ev('officeQA.freeze();OfficeFlow.clear();0');
  // All 200 replacements use the same pooled GPU allocations and one material.
  const stress=await b.ev('(()=>{const readings=[];for(let i=0;i<200;i++){OfficeFlow.clear();const at=Date.now();OfficeFlow.emit({type:"call",provider:"claude",agent:"main-memory",session:"memory-"+i,flow_id:"memory-"+i,at});OfficeFlow.emit({type:"spawn",provider:"claude",agent:"child-memory",parent:"main-memory",session:"memory-"+i,flow_id:"memory-"+i,agent_type:"Plan",at:at+1});OfficeFlow.advance(300,true);OfficeFlow.emit({type:"report",provider:"claude",agent:"main-memory",session:"memory-"+i,flow_id:"memory-"+i,at:at+2});OfficeFlow.advance(800,true);if(i===9||i===199)readings.push(officeDebug().memory);}return{readings,stats:OfficeFlow.stats(),draw:officeDebug().drawCalls};})()');
  out.memory=stress;check('200 flows stable geometry and textures',JSON.stringify(stress.readings[0])===JSON.stringify(stress.readings[1]),stress.readings);
  check('200 flows draw budget <=340',stress.draw<=340,stress.draw);
  // Thickness presets (thin / normal / thick) configure renderer cleanly with halos and stable draw calls.
  const thickCheck=await b.ev('(()=>{const vals=[];for(const th of [0.65,1,1.75]){OfficeFlow.clear();OfficeFlow.configure({...OfficeSettings.get().flow16,thickness:th});OfficeFlow.emit({type:"call",provider:"claude",agent:"main-th",session:"th-"+th,flow_id:"th-"+th,at:Date.now()});OfficeFlow.advance(300);const s=OfficeFlow.stats().renderer;vals.push({th,applied:s.thickness,halos:s.halos,segments:s.segments,draw:officeDebug().drawCalls});}return vals;})()');
  check('thickness presets thin/normal/thick render with contrast halos <=340 draws',thickCheck.every(v=>v.applied===v.th&&v.halos>0&&v.segments>0&&v.draw<=340),thickCheck);
  await b.ev('OfficeFlow.clear();OfficeFlow.configure({...OfficeSettings.get().flow16,maxVisibleEdges:8});for(let i=0;i<40;i++)OfficeFlow.emit({type:"call",provider:"codex",agent:"main-parallel-"+i,session:"parallel-"+i,flow_id:"parallel-"+i,at:Date.now()+i});OfficeFlow.advance(300);0');
  const parallel=await b.ev('OfficeFlow.stats()');check('parallel active and rendered edges capped',parallel.active<=16&&parallel.renderer.visibleEdges<=8&&parallel.renderer.records<=128,parallel);
  await b.ev('OfficeFlow.clear();for(const e of [null,false,1,{},[],{type:"not-an-event"}])OfficeFlow.emit(e);officeQA.tick(0);0');check('malformed events do not crash',await b.ev('OfficeFlow.stats().flows===0'));
  await b.ev('OfficeFlow.emit({type:"call",provider:"gemini",source:"log",agent:"main-log",session:"log",at:Date.now()});officeQA.tick(0);0');check('log provenance is estimated',await b.ev('OfficeFlow.snapshot()[0].source==="log"&&OfficeFlow.snapshot()[0].estimated'));
  await b.ev('OfficeFlow.setPaused(true);window.v16PauseClock=OfficeFlow.stats().renderer.clock;OfficeFlow.advance(800);0');check('pause holds animation clock',await b.ev('OfficeFlow.stats().renderer.clock===v16PauseClock'));
  await b.ev('OfficeFlow.setPaused(false);OfficeFlow.configure({...OfficeSettings.get().flow16,enabled:false});officeQA.tick(0);0');check('disable hides all visible lines',await b.ev('OfficeFlow.stats().renderer.visibleEdges===0'));
  // Fast movement from a real ambient destination follows the navigation route.
  await b.ev('OfficeFlow.clear();OfficeFlow.configure({...OfficeSettings.get().flow16,walkAnimation:"fast"});officeQA.use("secretary","phone","phone");officeQA.advance(15);OfficeFlow.emit({type:"call",provider:"claude",agent:"main-seat",session:"seat",at:Date.now()});officeQA.advance(1.2);0');
  let sec=await b.ev('officeDebug().actors.find(a=>a.id==="secretary")');check('fast secretary seated <=1.2 sec',sec.seated&&!sec.moving,sec);
  await b.ev('OfficeFlow.emit({type:"report",provider:"claude",agent:"main-seat",session:"seat",at:Date.now()});OfficeFlow.advance(850);officeQA.advance(.1);0');
  sec=await b.ev('officeDebug().actors.find(a=>a.id==="secretary")');check('secretary released after task',!sec.busy,sec);
  await b.ev('OfficeFlow.clear();OfficeFlow.configure({...OfficeSettings.get().flow16,walkAnimation:"off"});officeQA.use("secretary","phone","phone");officeQA.advance(15);OfficeFlow.emit({type:"call",provider:"codex",agent:"main-seat-off",session:"seat-off",at:Date.now()});officeQA.tick(0);0');
  sec=await b.ev('officeDebug().actors.find(a=>a.id==="secretary")');check('off secretary seats immediately',sec.seated&&!sec.moving,sec);
  }
  // Eight ordered frames in both themes and resolutions, with real HTTP reports.
  for(const theme of ['light','dark'])for(const [width,height]of [[1600,900],[1280,720]]){
   await b.size(width,height);
   const ids=await fetch(b.server.origin+'/reports').then(r=>r.json()).then(r=>r.reports.filter(r=>!r.archived).map(r=>r.id));
   if(ids.length){for(const action of ['read','archive']){const archived=await fetch(b.server.origin+'/reports/batch/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});assert.equal(archived.status,200);}await sleep(200);}
   await b.ev('(()=>{const s=OfficeSettings.get();s.appearance.theme='+JSON.stringify(theme)+';s.appearance.light="day";s.language="id";s.followTask=false;s.flow16.enabled=true;s.flow16.thickness=1;s.flow16.walkAnimation="fast";s.flow16.maxVisibleEdges=128;OfficeSettings.set(s);OfficeFlow.configure(s.flow16);OfficeFlow.clear();document.querySelectorAll("dialog[open]").forEach(d=>d.close());officeQA.pose(.42,1.02,44,[-8,0,-5]);})()');await sleep(180);
   const id='shot-'+theme+'-'+width,base={provider:'claude',source:'hook',agent:'main-'+id,session:id,flow_id:id,taskTitle:'Aktivitas agen'};
   const shot=async n=>out.shots.push(await b.shot('c2_after_'+theme+'_'+width+'_'+String(n).padStart(2,'0')));
   await post({...base,type:'call',event_id:id+'-call'});
   await waitUntil('OfficeFlow.snapshot().some(f=>f.session==='+JSON.stringify(id)+')');
   await b.ev('OfficeFlow.advance(100);officeQA.advance(.1);0');await shot(1);
   await b.ev('OfficeFlow.advance(200);officeQA.advance(1);0');await shot(2);
   await post({...base,type:'spawn',kind:'subagent',agent:'child-plan-'+id,parent:base.agent,agent_type:'Plan',event_id:id+'-plan'});
   await waitUntil('OfficeFlow.snapshot().some(f=>f.session==='+JSON.stringify(id)+'&&f.nodes.some(n=>n.persona==="software-architect"))');
   await b.ev('OfficeFlow.advance(280);0');await shot(3);
   await post({...base,type:'spawn',kind:'subagent',agent:'child-ui-'+id,parent:base.agent,agent_type:'Designer',event_id:id+'-ui'});
   await waitUntil('OfficeFlow.snapshot().some(f=>f.session==='+JSON.stringify(id)+'&&f.nodes.some(n=>n.persona==="ui-designer"))');
   await b.ev('OfficeFlow.advance(280);0');await shot(4);
   const activeHeader=await b.ev('({text:document.getElementById("storyText").textContent,busy:document.getElementById("story").dataset.busy,labels:[...document.querySelectorAll(".office-flow-label:not([hidden])")].map(e=>e.textContent)})');
   check(theme+' '+width+' active header reflects working flow',activeHeader.text.includes('Claude')&&!activeHeader.text.includes('Kantor santai')&&activeHeader.busy==='true',activeHeader);
   check(theme+' '+width+' prominent Boss & Secretary labels with zero duplicates',activeHeader.labels.some(t=>/bos/i.test(t))&&activeHeader.labels.some(t=>/sekretaris/i.test(t))&&new Set(activeHeader.labels).size===activeHeader.labels.length,activeHeader.labels);
   await b.ev('OfficeFlow.advance(300);officeQA.advance(1);0');await shot(5);
   await post({...base,type:'retire',kind:'subagent',agent:'child-plan-'+id,parent:base.agent,agent_type:'Plan',event_id:id+'-plan-done'});
   await waitUntil('OfficeFlow.snapshot().some(f=>f.session==='+JSON.stringify(id)+'&&f.nodes.some(n=>n.persona==="software-architect"&&n.status==="completed"))');
   await b.ev('OfficeFlow.advance(100);0');await shot(6);
   const done=await post({...base,type:'report',event_id:id+'-done'});
   await waitUntil('OfficeFlow.snapshot().some(f=>f.session==='+JSON.stringify(id)+'&&f.status==="completed")');
   await b.ev('OfficeFlow.advance(320);0');
   const returningHeader=await b.ev('({text:document.getElementById("storyText").textContent,busy:document.getElementById("story").dataset.busy,packets:OfficeFlow.stats().renderer.packets})');
   check(theme+' '+width+' returning header stays active during return packet',returningHeader.text.includes('Claude')&&!returningHeader.text.includes('Kantor santai')&&returningHeader.busy==='true'&&returningHeader.packets>=1,returningHeader);
   await shot(7);
   await b.ev('OfficeFlow.advance(450);officeQA.advance(.1);0');
   await waitUntil('officeDebug().reports.some(r=>r.id==='+JSON.stringify(done.report.id)+'&&r.inTray)',4000);
   await shot(8);
   out[theme+'_'+width+'_delivery']=await b.ev('({reports:officeDebug().reports.map(r=>({id:r.id,inTray:r.inTray,animating:r.animating,archived:r.archived})),flow:OfficeFlow.snapshot(),stats:OfficeFlow.stats(),returns:officeDebug().milestones.filter(m=>m.stage==="flow-return-boss").slice(-3)})');
   check(theme+' '+width+' report in tray after return',await b.ev('officeDebug().reports.some(r=>r.id==='+JSON.stringify(done.report.id)+'&&r.inTray)'),out[theme+'_'+width+'_delivery'].reports.slice(-3));
   check(theme+' '+width+' <=340 draw calls',await b.ev('officeDebug().drawCalls<=340'),await b.ev('officeDebug().drawCalls'));
   const metrics=await b.ev('({labels:[...document.querySelectorAll(".office-flow-label:not([hidden])")].map(e=>({text:e.textContent,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.offsetWidth,h:e.offsetHeight})),stats:OfficeFlow.stats()})');out[theme+'_'+width]=metrics;
  }
  const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(e.params.type)||e.method==='Log.entryAdded'&&['error','warning'].includes(e.params.entry.level));out.console=errors;
  check('zero browser console errors/warnings',errors.length===0,errors.slice(0,3));out.ok=true;
 }finally{try{await b?.close();}finally{await unlock();await fs.writeFile(path.join(__dirname,'v16_3d_results.json'),JSON.stringify(out,null,2));}}
 console.log(JSON.stringify({ok:true,checks:out.checks.length,reportChecks:out.reportChecks?.length,timing:out.timing,memory:out.memory?.readings,shots:out.shots.length}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
