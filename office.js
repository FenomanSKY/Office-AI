/* v4 · narration locale, files d'actions, navigation et caméra sans dépendance. */
'use strict';
(() => {
const $=id=>document.getElementById(id), params=new URLSearchParams(location.search);
if(typeof THREE==='undefined'){$('notice').textContent=I18n.text(I18n.raw('strings.mesin_3d_lokal_tidak_tersedia'));return;}
THREE.ColorManagement.legacyMode=false;
const Settings=OfficeSettings;let preferences=Settings.get();
const stage=$('stage'), scene=new THREE.Scene(), renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
// V16-C: a cheap overlay pass can show a received edge without redrawing the office.
const flowScene=new THREE.Scene();renderer.info.autoReset=false;let flowWorldCalls=0;
renderer.setPixelRatio(1);renderer.outputEncoding=THREE.sRGBEncoding;stage.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(42,1,.025,400), hemi=new THREE.HemisphereLight(0xfff1d7,0x76928b,.95),sun=new THREE.DirectionalLight(0xffddb1,.85),fill=new THREE.DirectionalLight(0xc5e2ed,.35);sun.position.set(-8,20,12);fill.position.set(14,12,-8);scene.add(hemi,sun,fill);
// v6-C: residen = roster agen aktif di Pengaturan > Agen di kantor. providers/names/colors = kunci/nama/warna residen
// (urutan meja), diisi ulang oleh applyRoster(); kunci residen = id agen roster (bawaan: claude, codex, gemini, hermes).
const rosterActive=v=>(Array.isArray(v?.agents)?v.agents:[]).filter(a=>a.enabled).slice(0,8);globalThis.officeResidentCount=Math.max(1,rosterActive(preferences).length);
const layout=buildOfficeV4(scene), providers=[], names=[],colors=[];
const world=layout.world;let layoutEditor=null;
// [Diubah oleh Gemini - 2026-11-20] Simpan batas dunia V12 (48x32 m + Teras Barat), kunci kursi kerja khusus agar tidak ditempati aktor santai, dan picu rebuildBatch saat warna suar MT5 berubah.
const worldBounds=layout.worldBounds||{minX:-28,maxX:24,minZ:-16,maxZ:16};
for(const o of world.items.values()){
 if(o.affordances?.sit&&/^(persona-chair-|quality-manager-chair$|mt5-chair$|finance-chair$)/.test(o.id))o.affordances.sit.idle=false;
 if(o.id==='inspection'&&o.affordances?.read)o.affordances.read.idle=false;
}
if(layout.setMt5Beacon){const _origBeacon=layout.setMt5Beacon;layout.setMt5Beacon=m=>{_origBeacon(m);batchDirty=true;};}
let time=0,paused=false,mode='demo',forcedDemo=params.get('demo')==='1',timeMode='auto',seed=7831,autoDemo=true,nextCall=18,serial=0,archived=0,totalTokens=0,job=null,archiveJob=null,lastUI=0,lastTexture=0,lastFrame=performance.now(),rendering=true,source=null,latestLive=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
if(!forcedDemo&&location.protocol!=='file:'){mode='live';autoDemo=false;}
let dailyData=null,syncTimer=null,syncRunning=false,syncAgain=false;
const readPending=new Set(),liveWorkers=new Map();
const backgroundJobs=[],actors=[],reports=[],events=[],jobs=[],milestones=[],samples=[],collisions={static:0,actors:0,minDistance:100,routeFailures:0},routes=[];
// V16-C [Diubah oleh Codex - 2026-11-21] Flow receives events before any walking choreography.
// V16-C [Diubah oleh Gemini - 2026-11-21] Tambah timer pelepasan fallback flowPendingReports agar laporan/quickReadAll tidak pernah macet saat tab latar/frozen, dan cegah penguncian ulang sesudah rilis.
let flowModel=null,flowRenderer=null,flowMap=null,flowQueue=[],flowLastTick=0,flowSnapshot=[],flowSettings={...preferences.flow16};
const flowActors=new Set(),flowPendingReports=new Map(),flowReleasedReports=new Set(),flowReturnedFlows=new Set();let flowReadyResolve;
const flowVisibility=new Map(),flowLatencies=[];
function flowReleaseReport(id){
 const pending=flowPendingReports.get(id);
 if(pending?.timer)clearTimeout(pending.timer);
 flowPendingReports.delete(id);
 flowReleasedReports.add(id);if(flowReleasedReports.size>512)flowReleasedReports.delete(flowReleasedReports.values().next().value);
 const row=reports.find(r=>r.id===id);
 // V19 [Diubah oleh Gemini - 2026-11-21] Jangan kembalikan inTray bila laporan sedang diproses di batch arsip aktif
 if(row&&!(archiveJob&&archiveJob.batch.includes(row))){row.inTray=!row.archived;row.animating=false;row.deliveredAt=time;}
}
// V16-C [Diubah oleh Codex - 2026-11-21] A provider can have several sessions/turns returning at different times.
function flowHoldReport(id,flowId){
 if(!id||!flowId||flowSettings.enabled===false||flowSettings.paused||flowReleasedReports.has(id)||flowReturnedFlows.has(flowId))return;
 const prev=flowPendingReports.get(id);if(prev?.timer)clearTimeout(prev.timer);
 const timer=setTimeout(()=>{if(!flowPendingReports.has(id))return;flowReleaseReport(id);updateStacks();updateUI();},650);
 flowPendingReports.set(id,{flowId,at:performance.now(),timer});
}
function flowClearPendingReports(){for(const p of flowPendingReports.values())if(p?.timer)clearTimeout(p.timer);flowPendingReports.clear();flowReleasedReports.clear();flowReturnedFlows.clear();}
const flowReady=new Promise(resolve=>{flowReadyResolve=resolve;});
const flowWalking=()=>flowSettings.walkAnimation||'fast';
// V21 [Diubah oleh Codex - 2026-11-22] Real endpoints for every observed child; eight shared project-worker slots.
const flowBindings=new Map(),flowSeenChildren=new Set();let flowWorkerSerial=0;
const flowBindingKey=(node,flow)=>flow.id+'|'+node.id;
function flowLeader(flow){
 const n=flow.nodes.find(n=>n.role==='agent');
 return (n&&actors.find(a=>!a.hidden&&!a.removed&&(a.id===n.agent||(a.provider||a.id)===n.provider)))||
  (flow.provider==='opencode'&&residents.find(a=>(a.provider||a.id)==='codex'&&!a.hidden&&!a.removed))||secretary;
}
function flowActorFor(node,flow){
 if(!node)return null;if(node.role==='boss')return boss;if(node.role==='secretary')return secretary;
 if(node.role==='persona'){
  const binding=flow&&flowBindings.get(flowBindingKey(node,flow));
  if(binding?.actor&&!binding.actor.hidden&&!binding.actor.removed)return binding.actor;
  return flow?flowLeader(flow):actors.find(a=>a.id===node.persona&&!a.hidden&&!a.removed);
 }
 return actors.find(a=>a.id===node.agent&&!a.hidden&&!a.removed)||residents.find(a=>(a.provider||a.id)===node.provider&&!a.hidden&&!a.removed)||
  (node.provider==='opencode'?residents.find(a=>(a.provider||a.id)==='codex'&&!a.hidden&&!a.removed):null)||secretary;
}
function flowHead(a){a.char.updateMatrixWorld(true);return a.char.userData.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.55,0));}
function flowAnchor(node,flow){const a=flowActorFor(node,flow);return a&&!a.hidden&&!a.removed?flowHead(a):null;}
function flowRecoverAnchor(node,flow){
 const a=flowLeader(flow);node.visual={kind:'overflow',actor:a.id,identity:'overflow:'+a.id};return flowHead(a);
}
function flowChildLabel(node){return node.agentType||actors.find(a=>a.id===node.persona&&!a.removed)?.name||(['general','researcher'].includes(node.persona)?t('flow16.persona.'+node.persona):node.label)||t('flow16.persona.general');}
function flowLabel(node,flow){
 if(node.visual?.kind==='overflow'){
  const a=flowActorFor(node,flow),count=[...flowBindings.values()].filter(b=>b.node.visual?.kind==='overflow'&&flowLeader(b.flow)===a).length;
  return '+'+Math.max(1,count);
 }
 if(node.role==='persona')return flowChildLabel(node);
 const actor=flowActorFor(node,flow);return actor?I18n.text(actor.name):node.label;
}
function flowWorkerRemove(binding){
 const a=binding.actor;if(!a||!binding.worker)return;
 world.release(a);a.flowTravel=null;a.hidden=true;a.removed=true;a.label.remove();scene.remove(a.char);
 const i=actors.indexOf(a);if(i>=0)actors.splice(i,1);binding.actor=null;batchDirty=true;mark('flow-worker-left',binding.node.agent);
}
function flowClearBindings(){for(const b of flowBindings.values())flowWorkerRemove(b);flowBindings.clear();flowSeenChildren.clear();}
function flowWorkerGoal(){
 const desk=layout.projects.find(d=>world.get(d.objectId)?.enabled&&d.seat&&!occupiedGoal(d.seat)&&!actors.some(a=>!a.removed&&a.desk?.objectId===d.objectId));
 if(desk)return desk;
 const center=layout.projects[0]?.seat||layout.projects[0]||{x:layout.entry.x,z:layout.entry.z-3};
 const p=[...reachableNodes.values()].filter(p=>Math.hypot(p.x-layout.entry.x,p.z-layout.entry.z)>=2&&!occupiedGoal(p)&&![...flowBindings.values()].some(b=>b.actor?.desk?.seat&&Math.hypot(b.actor.desk.seat.x-p.x,b.actor.desk.seat.z-p.z)<.8))
  .sort((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z))[0];
 return p?{seat:{...p},objectId:null}:null;
}
function flowWorkerWalk(a,goal,activity){
 const step=walk(goal,activity);if(flowWalking()!=='full')step.targetSeconds=1.1;return step;
}
function flowEnterWorker(binding){
 const a=binding.actor;if(!a||!a.hidden||binding.exiting)return;
 if(actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-layout.entry.x,b.char.position.z-layout.entry.z)<.8))return;
 a.hidden=false;a.busy=true;a.seated=false;a.char.position.set(layout.entry.x,0,layout.entry.z);mark('flow-worker-enter',binding.node.agent);
 const seat=a.desk.seat;
 if(flowWalking()==='off'&&!occupiedGoal(seat,a)){
  const route=pathTo(a.char.position,seat,a);if(route){a.softAllow=route.allow;a.char.position.set(seat.x,0,seat.z);sit(a);enqueue(a,wait(3600,I18n.raw('strings.mengetik')));}
 }
 if(!a.queue.length)enqueue(a,flowWorkerWalk(a,()=>a.desk.seat,I18n.raw('strings.masuk_lewat_pintu')),action(()=>sit(a)),wait(3600,I18n.raw('strings.mengetik')));
}
function flowAllocate(binding){
 const {node}=binding;
 const fixed=actors.find(a=>a.id===node.persona&&!a.hidden&&!a.removed&&!a.lifted&&!a.leaving&&!a.busy&&!a.qualityWorking&&!a.qualityActive&&!a.workflowWorking&&!a.promptWorking&&
  ![...flowBindings.values()].some(b=>b!==binding&&b.actor===a));
 if(fixed){binding.actor=fixed;binding.worker=false;return;}
 if(actors.filter(a=>a.kind==='worker'&&!a.removed).length>=8)return;
 const desk=flowWorkerGoal();if(!desk)return;
 const a=createActor('flow-worker-'+(++flowWorkerSerial),flowChildLabel(node),layout.entry.x,layout.entry.z,parseInt((flowMap.personas[node.persona]||flowMap.personas.general).color.slice(1),16),'short','worker');
 a.hidden=true;a.busy=true;a.flowChild=true;a.flowAgent=node.agent;a.desk=desk;a.category='code';a.taskStatus=node.status;binding.actor=a;binding.worker=true;
 flowEnterWorker(binding);
}
function flowDescribeBinding(binding){
 const {node,flow,actor}=binding,visible=actor&&!actor.hidden&&!actor.removed;
 const visual=node.visual||(node.visual={});visual.kind=visible?(binding.worker?'worker':'persona'):'overflow';
 visual.actor=visible?actor.id:flowLeader(flow).id;visual.identity=visible?flowBindingKey(node,flow):'overflow:'+flowLeader(flow).id;
 visual.actionLabel=t('flow16.panelTitle');
}
function flowPrepareBindings(){
 const present=new Set();
 for(const flow of flowSnapshot)for(const node of flow.nodes)if(node.role==='persona'){
  const key=flowBindingKey(node,flow);present.add(key);let b=flowBindings.get(key);
  if(!b&&!flowSeenChildren.has(key)){
   if(flow.endedAt!==null&&flow.endedAt>1e12&&Date.now()-flow.endedAt>12000)continue;
   b={node,flow,actor:null,worker:false,doneAt:null,doneClock:null};flowBindings.set(key,b);flowSeenChildren.add(key);flowAllocate(b);
  }
  if(b){b.node=node;b.flow=flow;if(node.status!=='working'&&b.doneAt===null){b.doneAt=time;b.doneClock=flowRenderer?.clock||0;}flowDescribeBinding(b);}
 }
 for(const [key,b] of flowBindings)if(!present.has(key)&&b.doneAt===null){b.doneAt=time;b.doneClock=flowRenderer?.clock||0;}
 while(flowSeenChildren.size>2048)flowSeenChildren.delete(flowSeenChildren.values().next().value);
}
function flowWorkersTick(){
 const clock=flowRenderer?.clock||0;
 for(const [key,b] of flowBindings){
  if(!b.actor&&!b.exiting&&b.doneAt===null)flowAllocate(b);
  if(b.worker&&b.actor){
   const a=b.actor;if(a.hidden&&!b.exiting)flowEnterWorker(b);
   if(b.doneAt!==null&&!b.exiting&&time-b.doneAt>=2.1&&clock-b.doneClock>=2100){
    if(a.hidden){flowWorkerRemove(b);flowBindings.delete(key);continue;}
    b.exiting=true;world.release(a);a.queue=[];a.path=[];a.flowTravel=null;a.yielding=false;a.resuming=false;a.seated=false;a.taskStatus='idle';
    enqueue(a,flowWorkerWalk(a,()=>layout.entry,I18n.raw('strings.pulang_lewat_pintu')),action(()=>{flowWorkerRemove(b);flowBindings.delete(key);}));mark('flow-worker-exit',b.node.agent);
   }
   // Leave at the door threshold; demanding the exact shared grid cell deadlocks a crowd of returning workers.
   if(b.exiting&&Math.hypot(a.char.position.x-layout.entry.x,a.char.position.z-layout.entry.z)<=.55){flowWorkerRemove(b);flowBindings.delete(key);continue;}
   if(b.exiting&&flowWalking()==='off'&&!occupiedGoal(layout.entry,a)){a.char.position.set(layout.entry.x,0,layout.entry.z);flowWorkerRemove(b);flowBindings.delete(key);continue;}
  }else if(b.doneAt!==null&&time-b.doneAt>=2.1&&clock-b.doneClock>=2100){flowBindings.delete(key);continue;}
  flowDescribeBinding(b);
 }
}
function flowNotify(){
 if(!flowModel)return;flowSnapshot=flowModel.snapshot();flowPrepareBindings();flowRenderer?.sync(flowSnapshot);
 flowApplyActors();updateUI();window.dispatchEvent(new CustomEvent('office-flow-update',{detail:{flows:flowSnapshot,stats:officeFlow.stats()}}));
}
function flowDrawImmediate(){
 // Submit the new geometry in this SSE turn; expensive screen/label refresh can follow next frame.
 if(!flowRenderer||flowSettings.enabled===false)return;
 flowRenderer.frame(performance.now(),rendering);renderer.info.reset();renderer.autoClear=false;renderer.render(flowScene,camera);renderer.autoClear=true;renderer.info.render.calls+=flowWorldCalls;flowRenderer.didRender(performance.now());
}
const officeFlow=window.OfficeFlow={ready:flowReady,get map(){return flowMap;},
 emit(event){if(!flowModel){if(flowQueue.length>=256)flowQueue.shift();flowQueue.push(event);return {accepted:false,reason:'loading'};}const received=performance.now(),result=flowModel.ingest(event);if(result.accepted||result.reason==='duplicate'){for(const f of flowModel.snapshot())for(const e of f.edges)if(e.kind!=='return'){const key=f.id+'|'+e.from+'|'+e.to+'|'+e.kind+'|'+e.startedAt;if(!flowVisibility.has(key))flowVisibility.set(key,received);}while(flowVisibility.size>2048)flowVisibility.delete(flowVisibility.keys().next().value);flowNotify();}return result;},
 snapshot:()=>flowSnapshot.length?JSON.parse(JSON.stringify(flowSnapshot)):[],stats:()=>({...flowModel?.stats(),renderer:flowRenderer?.stats(),queued:flowQueue.length,pendingReports:flowPendingReports.size,latencyMs:flowLatencies.slice(-128)}),
 configure(value={}){flowSettings={...value};flowModel?.configure(value,preferences.personas);flowRenderer?.configure({...value,paused:!!value.paused});if(flowModel)flowNotify();},
 setPaused(value){flowSettings.paused=!!value;flowRenderer?.configure(flowSettings);},
 clear(){flowClearBindings();flowModel?.clear();flowRenderer?.clear();flowQueue=[];flowSnapshot=[];flowVisibility.clear();flowLatencies.length=0;flowClearPendingReports();flowApplyActors();},
 advance(ms=0,overlayOnly=false){flowRenderer?.advance(ms);if(overlayOnly)flowDrawImmediate();else{render(0);updateUI();}},
 acceptObserved(e){
  if(e.flowObserved||e.type==='flow_event'||e.type==='usage')return;
  if(['call','spawn','retire','report','persona_call','submit'].includes(e.type)||!e.type&&e.agent){
   return officeFlow.emit({...e,provider:e.provider||e.engine,at:e.at??(e.updated_at?e.updated_at*1000:Date.now()),source:e.source==='collector'?'log':e.source||'hook'});
  }
 }
};
function flowSeat(a){
 if(a.lifted||!a.desk?.seat)return;
 world.release(a);a.chat=null;a.queue=[];a.path=[];a.resuming=false;a.yielding=false;carry(a,false);a.busy=true;a.flowWorking=true;
 const seat=a.desk.seat,atDesk=Math.hypot(a.char.position.x-seat.x,a.char.position.z-seat.z)<.2;
 if(atDesk){sit(a);a.char.rotation.y=seat.facing||0;enqueue(a,wait(3600,I18n.raw('strings.mengetik')));return;}
 const route=pathTo(a.char.position,seat,a,true)||pathTo(a.char.position,seat,a);
 if(!route)return;
 a.softAllow=route.allow;
 if(flowWalking()==='off'&&!actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-seat.x,b.char.position.z-seat.z)<.75)){
  a.char.position.set(seat.x,0,seat.z);sit(a);a.char.rotation.y=seat.facing||0;enqueue(a,wait(3600,I18n.raw('strings.mengetik')));return;
 }
 let previous=a.char.position,total=0;for(const p of route){total+=Math.hypot(p.x-previous.x,p.z-previous.z);previous=p;}
 a.flowTravel={route,speed:flowWalking()==='full'?2.35:Math.max(2.35,total/.95),started:time};a.seated=false;
}
// V19 [Diubah oleh Gemini - 2026-11-21] Lindungi aktor arsip agar tidak dibajak flowSeat/flowApplyActors/flowActorsTick saat arsip aktif
const isArchiveActor=a=>!!(archiveJob&&(a===archivist||archiveJob.usesSecretary&&a===secretary&&['settle','handoff'].includes(archiveJob.phase)));
function flowApplyActors(){
 const wanted=new Map();
 for(const f of flowSnapshot.filter(f=>f.status==='working'))for(const n of f.nodes)if(n.status==='working'&&n.role!=='boss'&&(flowWalking()!=='full'||n.role==='persona')&&(!n.visual||n.visual.kind==='persona')){
  const a=flowActorFor(n,f);if(a)wanted.set(a,(wanted.get(a)||0)+1);
 }
 for(const a of [...flowActors])if(!wanted.has(a)){
  flowActors.delete(a);a.flowWorking=false;a.flowTravel=null;
  if(!a.qualityWorking&&!a.workflowWorking&&!a.promptWorking&&!a.lifted&&!isArchiveActor(a)){a.queue=[];a.path=[];a.busy=false;a.taskStatus='idle';a.activity=I18n.raw('strings.siap_menerima_tugas');a.nextIdle=time+2;}
 }
 for(const [a,count] of wanted){
  a.inbox=Math.max(0,count-1);a.taskStatus='working';
  if(!flowActors.has(a)){if(isArchiveActor(a))continue;flowActors.add(a);if(!a.qualityWorking&&!a.workflowWorking)flowSeat(a);}
 }
 updateInboxStacks();
}
function flowActorsTick(dt){
 for(const a of flowActors){if(!a.flowWorking||a.lifted||isArchiveActor(a))continue;
  const travel=a.flowTravel;
  if(travel){
   let budget=travel.speed*dt;a.moving=false;
   while(budget>0&&travel.route.length){const p=travel.route[0],pos=a.char.position,d=Math.hypot(p.x-pos.x,p.z-pos.z),step=Math.min(d,budget,.2),nx=pos.x+(d?(p.x-pos.x)*step/d:0),nz=pos.z+(d?(p.z-pos.z)*step/d:0);
    const blocker=actors.find(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-nx,b.char.position.z-nz)<.74);
    if(blocker){giveWay(blocker,a);break;}
    let mx=nx,mz=nz;if(blocked(mx,mz)){if(Math.abs(nx-pos.x)>1e-5&&!blocked(nx,pos.z))mz=pos.z;else if(Math.abs(nz-pos.z)>1e-5&&!blocked(pos.x,nz))mx=pos.x;}
    a.char.rotation.y=Math.atan2(pos.x-p.x,pos.z-p.z);pos.x=mx;pos.z=mz;budget-=step;a.steps+=step;a.moving=true;if(Math.hypot(p.x-pos.x,p.z-pos.z)<=.02||(mx===nx&&mz===nz&&d<=step+.001)||step===0)travel.route.shift();
   }
   if(!travel.route.length){a.flowTravel=null;sit(a);a.char.rotation.y=a.desk.seat.facing||0;enqueue(a,wait(3600,I18n.raw('strings.mengetik')));mark('flow-seated',a.id);}
  }else if(!a.queue.length&&!a.qualityWorking&&!a.workflowWorking)enqueue(a,wait(3600,I18n.raw('strings.mengetik')));
 }
}
async function flowHydrate(){
 if(!flowModel||forcedDemo)return;
 // V16-C [Diubah oleh Gemini - 2026-11-21] Pensiunkan alur selesai historis di renderer 3D saat hydrate/reconnect agar tidak memutar ulang garis lama
 try{const r=await fetch('/flow/state');if(!r.ok)return;const data=await r.json();for(const e of data.events||[])flowModel.ingest(e);flowModel.tick(Date.now());flowRenderer?.retireCompleted?.(flowModel.snapshot());for(const f of flowModel.snapshot())if(f.endedAt!==null)for(const n of f.nodes)if(n.role==='persona')flowSeenChildren.add(flowBindingKey(n,f));flowNotify();}catch{}
}
fetch('/office_flow_map.json').then(r=>r.ok?r.json():null).then(map=>{
 if(!map||!window.OfficeFlowModel||!window.OfficeFlow3D)return;
 flowMap=map;flowModel=OfficeFlowModel.create({map,maxEvents:1024,now:Date.now});flowModel.configure(flowSettings,preferences.personas);
 flowRenderer=OfficeFlow3D.create({THREE,scene:flowScene,map,anchorFor:flowAnchor,labelFor:flowLabel,recoverAnchor:flowRecoverAnchor,onSelectNode:(node,flow)=>window.OfficeFlowUI?.instance?.openFlow(flow.id),container:stage,onVisible({key,at}){const received=flowVisibility.get(key);if(received!==undefined){flowLatencies.push(Math.max(0,at-received));if(flowLatencies.length>128)flowLatencies.shift();}},onReturn(flow){
  flowReturnedFlows.add(flow.id);if(flowReturnedFlows.size>512)flowReturnedFlows.delete(flowReturnedFlows.values().next().value);
  for(const [id,pending] of [...flowPendingReports])if(pending.flowId===flow.id)flowReleaseReport(id);
  mark('flow-return-boss',flow.id);updateStacks();updateUI();scheduleSync();
 }});flowRenderer.configure(flowSettings);for(const e of flowQueue)flowModel.ingest(e);flowQueue=[];flowNotify();flowReadyResolve(officeFlow);window.dispatchEvent(new CustomEvent('office-flow-ready',{detail:officeFlow}));void flowHydrate();
}).catch(()=>{});
const shared=new THREE.MeshLambertMaterial({color:0xffffff});
let figureBatches=[],batchDirty=true,contactShadows=null,overviewFigures=false;
const contactTransform=new THREE.Object3D();
const contactMaterial=new THREE.MeshBasicMaterial({map:layout.contactMap,color:0x342f2a,transparent:true,opacity:.32,depthWrite:false});
function updateContacts(){
 if(!contactShadows||contactShadows.instanceMatrix.count<actors.length){
  if(contactShadows){scene.remove(contactShadows);contactShadows.dispose();}
  contactShadows=new THREE.InstancedMesh(sharedPlaneGeo1,contactMaterial,Math.max(32,actors.length));
  contactShadows.frustumCulled=false;contactShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(contactShadows);
 }
 let count=0;
 contactTransform.rotation.x=-Math.PI/2;
 for(const a of actors){
  if(a.hidden||a.removed||a.lifted||a.char.position.y>.34)continue;
  contactTransform.position.set(a.char.position.x,.084,a.char.position.z);
  contactTransform.scale.set(a.seated?.79:.72,a.seated?.84:.56,1);
  contactTransform.updateMatrix();contactShadows.setMatrixAt(count++,contactTransform.matrix);
 }
 contactShadows.count=count;contactShadows.instanceMatrix.needsUpdate=true;
}
function log(text){soundNotice();events.unshift({time,text});events.length=Math.min(events.length,7);toast(text);}
// v5: area notifikasi di bawah judul. Maks 3 toast; yang lama memudar lalu keluar dengan animasi.
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)'),motionOff=()=>reduceMotion.matches||!!preferences.appearance.economy;
function dropToast(li){if(!li||li.dataset.leaving)return;li.dataset.leaving='1';li.classList.add('leaving');setTimeout(()=>li.remove(),motionOff()?0:260);}
function toast(text){const list=$('toasts');if(!list)return;const first=list.querySelector('li:not(.leaving)');if(first&&first.firstChild.textContent===text){first.dataset.count=String(Number(first.dataset.count||1)+1);return;}const li=document.createElement('li'),span=document.createElement('span');I18n.bind(span,text);li.append(span);const who=[...actors].find(a=>text.startsWith(a.name));if(who)li.style.setProperty('--actor-color','#'+new THREE.Color(who.color).getHexString());list.prepend(li);const live=[...list.querySelectorAll('li:not(.leaving)')];live.forEach((n,i)=>n.dataset.age=String(i));live.slice(3).forEach(dropToast);setTimeout(()=>dropToast(li),5000);}
function setText(id,text){const e=$(id),t=e.querySelector('.t');(t||e).removeAttribute('data-i18n');I18n.bind(t||e,text);}
function countUp(e,value,format){if(e.dataset.v===String(value)&&e.dataset.f===format.name+I18n.language+preferences.currency)return;const from=Number(e.dataset.v||0);e.dataset.v=String(value);e.dataset.f=format.name+I18n.language+preferences.currency;cancelAnimationFrame(e.anim);if(value===null||!Number.isFinite(value)||!Number.isFinite(from)||motionOff()||from===value){e.textContent=I18n.text(format(value));return;}const start=performance.now(),dur=700;e.classList.remove('tick');void e.offsetWidth;e.classList.add('tick');const step=now=>{const f=Math.min(1,Math.max(0,(now-start)/dur)),k=1-Math.pow(1-f,3);e.textContent=I18n.text(format(from+(value-from)*k));if(f<1)e.anim=requestAnimationFrame(step);};e.anim=requestAnimationFrame(step);}
const fmtInt=function fmtInt(n){return I18n.number(n===null?null:Math.round(n));};
const fmtRp=function fmtRp(n){return I18n.moneyIDR(n,{notation:'compact',maximumFractionDigits:1});};
const fmtTokShort=n=>I18n.number(n,{notation:'compact',maximumFractionDigits:1});
let costToday=null,providerToday=null,lastUnread=0,trayShake=0;
function mark(stage,detail=''){milestones.push({stage,time,detail});if(milestones.length>400)milestones.shift();}
function createActor(id,name,x,z,color,style='short',kind='resident',look=null){
 const {char,paper,cigarette,smoke,receiver}=actorVisual(look||{shirt:color,skin:[0xe5b48e,0xa96f4d,0xf0cba7,0xc78d67][actors.length%4],hairStyle:style,accessory:actors.length%2?'glasses':'headset',outfit:kind==='boss'?'tie':'shirt'},x,z,kind);
 const label=document.createElement('div');label.className='label';label.style.visibility='hidden';const title=document.createElement('b');I18n.bind(title,name);const activityLine=document.createElement('span');activityLine.className='activity-line';label.append(title,activityLine);$('labels').append(label);
 const a={id,name,kind,char,paper,cigarette,smoke,receiver,label,color,queue:[],path:[],busy:false,activity:kind==='boss'?I18n.raw("strings.menunggu_laporan"):kind==='secretary'?I18n.raw("strings.menunggu_panggilan_bos"):kind==='archivist'?I18n.raw("strings.menjaga_arsip"):kind==='trader'?I18n.raw('v12.world.mt5Idle'):I18n.raw('strings.siap_menerima_tugas'),seated:false,carrying:false,blocked:0,nextIdle:time+2+(actors.length%10)*1.1,phase:actors.length*1.7,chat:null,hidden:false,moving:false,steps:0,history:[]};actors.push(a);batchDirty=true;return a;
}
// v6-C: visual karakter dipisah agar gaya avatar agen bisa diganti tanpa membuat aktor baru.
function actorVisual(look,x,z,kind){
 const char=makeVoxelChar(look,preferences.appearance.modelQuality);char.position.set(x,0,z);scene.add(char);
 const paper=voxelBox(char.userData.arms[1],[.64,.035,.86],[0,-.45,-.3],0xf6edcf);paper.visible=false;paper.rotation.z=.4;voxelBox(paper,[.8,1.4,.82],[0,0,0],0xf7f1de);paper.userData.stripe=voxelBox(paper,[.9,1.6,.06],[0,0,-.32],0x719d9a);for(let i=0;i<3;i++)voxelBox(paper,[.55,1.5,.025],[0,0,-.2+i*.14],0x718178);
 const cigarette=voxelBox(char.userData.arms[1],[.045,.045,.21],[0,-.53,-.16],0xe8d6af);cigarette.visible=false;
 const smoke=new THREE.Group();char.add(smoke);for(let i=0;i<5;i++)voxelBox(smoke,[.07,.07,.07],[.3,1.8,0],0xc6c8bc);smoke.visible=false;
 let receiver=null;if(kind==='secretary'){receiver=new THREE.Group();receiver.position.set(0,-.48,-.02);char.userData.arms[1].add(receiver);voxelBox(receiver,[.11,.09,.36],[0,0,-.08],0x283f45);for(const z of[-.24,.08])voxelBox(receiver,[.19,.14,.14],[0,0,z],0x354e52);receiver.visible=false;}
 return {char,paper,cigarette,smoke,receiver};
}
// [Diubah oleh Gemini - 2026-11-20] Posisi spawn dinamis staf inti (Bos, Sekretaris, Arsiparis) dari layout.*Seat V12 + tambahkan 2 agen otonom permanen: mt5-trader & finance-manager.
const bossP=layout.bossSeat||{x:-18.5,z:-11,facing:0};
const boss=createActor('boss',I18n.raw('strings.bos_anda'),bossP.x,bossP.z,0x3c5d68,'quiff','boss');boss.seated=true;boss.char.rotation.y=bossP.facing||0;boss.desk={objectId:'boss-desk',get seat(){return layout.bossSeat;},screen:world.get('boss-desk').screen};boss.category='doc';
const secP=layout.secretarySeat||{x:-16.5,z:-4,facing:0};
const secretary=createActor('secretary',I18n.raw('strings.sekretaris'),secP.x,secP.z,0xc89376,'ponytail','secretary');secretary.seated=true;secretary.char.rotation.y=secP.facing||0;secretary.desk={objectId:'secretary-desk',get seat(){return layout.secretarySeat;},screen:world.get('secretary-desk').screen};secretary.category='chat';
const archP=layout.archivistSeat||{x:19.5,z:-9,facing:0};
const archivist=createActor('archivist',I18n.raw('strings.arsiparis'),archP.x,archP.z,0x789782,'bald','archivist');archivist.seated=true;archivist.char.rotation.y=archP.facing||0;archivist.desk={objectId:'archive-desk',get seat(){return layout.archivistSeat;},screen:world.get('archive-desk').screen};archivist.category='notes';
const mt5P=layout.mt5Seat||{x:17.5,z:8,facing:0};
const mt5Trader=createActor('mt5-trader',I18n.raw('v12.world.mt5Trader'),mt5P.x,mt5P.z,0x1e5c4d,'short','trader',{shirt:0x1e5c4d,pants:0x243440,skin:0xe5b48e,hairStyle:'short',hair:0x2e2622,accessory:'headset',outfit:'shirt'});mt5Trader.seated=true;mt5Trader.char.rotation.y=mt5P.facing||0;mt5Trader.desk=layout.mt5Desk||{objectId:'mt5-desk',get seat(){return layout.mt5Seat;}};mt5Trader.category='data';mt5Trader.taskStatus='idle';
const finP=layout.financeSeat||{x:16,z:14,facing:0};
const financeManager=createActor('finance-manager',I18n.raw('v12.world.financeManager'),finP.x,finP.z,0x345240,'quiff','finance',{shirt:0x345240,pants:0x27362e,skin:0xc78d67,hairStyle:'quiff',hair:0x3b2f2a,accessory:'glasses',outfit:'tie'});financeManager.seated=true;financeManager.char.rotation.y=finP.facing||0;financeManager.desk=layout.financeDesk||{objectId:'finance-desk',get seat(){return layout.financeSeat;}};financeManager.category='data';financeManager.taskStatus='idle';
const residents=[];
// v6-C: roster -> residen + meja. Menambah agen memasang meja (skala naik) lalu karakter masuk lewat pintu; menghapus agen
// membuat karakter pulang lewat pintu dan mejanya dilepas. Meja berpindah halus lalu world.move menghitung ulang navigasi.
const SKIN_TONES=[0xe5b48e,0xa96f4d,0xf0cba7,0xc78d67],hexNum=c=>parseInt(String(c).slice(1),16)||0x8aa0aa;
const lookOf=g=>({shirt:hexNum(g.avatar.top),skin:SKIN_TONES[g.avatar.skin]??SKIN_TONES[0],hairStyle:g.avatar.hair,hair:hexNum(g.avatar.hairColor),accessory:g.avatar.accessory==='none'?'':g.avatar.accessory,outfit:g.avatar.outfit});
const deskAnims=[],pendingJoins=[];let rosterSig='';
// Pendatang masuk satu per satu saat ambang pintu kosong (pola pekerja sementara), lalu berjalan ke kursinya.
function joinTick(){const j=pendingJoins[0];if(!j)return;if(j.a.removed||j.a.leaving){pendingJoins.shift();return;}if(time<j.after||actors.some(b=>b!==j.a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-layout.entry.x,b.char.position.z-layout.entry.z)<1.2))return;pendingJoins.shift();const a=j.a;a.char.position.set(layout.entry.x,0,layout.entry.z);a.hidden=false;batchDirty=true;enqueue(a,walk(()=>a.desk?.seat,I18n.raw('strings.masuk_lewat_pintu')),action(()=>{sit(a);a.busy=false;a.nextIdle=time+6;}));if(pendingJoins[0])pendingJoins[0].after=Math.max(pendingJoins[0].after,time+1.2);}
const nowS=()=>performance.now()/1000,ease=f=>f<.5?2*f*f:1-Math.pow(-2*f+2,2)/2;
function deskTween(d,{x,z,from,to,remove}){const o=world.get(d.objectId),ch=world.get(d.chairId);if(!o)return;const children=[...world.items.values()].filter(k=>k!==o&&(k.follow===o.id||k.on===o.id&&world.onSurface(k))).map(k=>({o:k,dx:k.node.position.x-o.node.position.x,dz:k.node.position.z-o.node.position.z}));const anim={d,o,ch,children,x0:o.node.position.x,z0:o.node.position.z,x:x??o.node.position.x,z:z??o.node.position.z,from,to,remove,start:nowS(),dur:motionOff()?0:.7};for(let i=deskAnims.length-1;i>=0;i--)if(deskAnims[i].d===d)deskAnims.splice(i,1);deskAnims.push(anim);if(!anim.dur)stepDeskAnims(true);}
function stepDeskAnims(force=false){for(let i=deskAnims.length-1;i>=0;i--){const m=deskAnims[i],f=force||!m.dur?1:Math.min(1,(nowS()-m.start)/m.dur),k=ease(f),s=m.from===undefined?1:m.from+(m.to-m.from)*k,x=m.x0+(m.x-m.x0)*k,z=m.z0+(m.z-m.z0)*k;
  for(const [o,dz] of [[m.o,0],[m.ch,1.25]])if(o){o.node.position.x=x;o.node.position.z=z+dz;o.node.scale.setScalar(Math.max(.02,s));world.refresh(o);}
  for(const k of m.children){k.o.node.position.x=x+k.dx;k.o.node.position.z=z+k.dz;world.refresh(k.o);}
   // v9: agen yang duduk di meja itu ikut bergeser bersama kursinya (sebelumnya meja bergeser menimpa agen yang diam).
  // [Diubah oleh Gemini - 2026-11-20] Sinkronkan geser aktor duduk ke posisi kursi residen (z + 1.25).
  if(!m.remove)for(const a of actors)if(a.desk===m.d&&a.seated&&!a.lifted&&!a.hidden&&!a.path.length&&a.queue[0]?.type!=='walk'){a.char.position.x=x;a.char.position.z=z+1.25;}
  if(f>=1){deskAnims.splice(i,1);m.o.node.scale.setScalar(1);if(m.ch)m.ch.node.scale.setScalar(1);if(m.remove){world.remove(m.o.id);if(m.ch)world.remove(m.ch.id);}else{world.move(m.o.id,m.x,m.z);if(m.ch)world.move(m.ch.id,m.x,m.z+1.25);}}}}
function resit(a){if(a.lifted||!a.desk)return;if(a.busy){a.queue.unshift(walk(()=>a.desk?.seat,I18n.raw('strings.menyesuaikan_meja_kerja')),action(()=>sit(a)));a.path=[];return;}world.release(a);a.queue=[walk(()=>a.desk?.seat,I18n.raw('strings.menyesuaikan_meja_kerja')),action(()=>{sit(a);})];a.path=[];a.seated=false;}
function leaveOffice(a,animate){const i=residents.indexOf(a);if(i>=0)residents.splice(i,1);if(liftedActor===a)finishLift(true);if(job&&job.a===a){secretary.queue=[];secretary.path=[];carry(secretary,false);secretary.busy=false;enqueue(secretary,walk(()=>layout.secretarySeat),action(()=>sit(secretary)));job=null;}for(let k=jobs.length-1;k>=0;k--)if(jobs[k].provider===a.id)jobs.splice(k,1);for(let k=backgroundJobs.length-1;k>=0;k--)if(backgroundJobs[k].a===a)backgroundJobs.splice(k,1);world.release(a);a.queue=[];a.path=[];a.busy=true;a.chat=null;carry(a,false);a.leaving=true;
 const gone=()=>{a.hidden=true;a.removed=true;a.desk=null;a.label.remove();batchDirty=true;mark('resident-leave',a.id);};
 if(!animate||a.hidden){gone();return;}a.desk=null;a.seated=false;enqueue(a,walk(()=>layout.entry,I18n.raw('strings.pulang_lewat_pintu')),action(gone));log(I18n.source('messages.agentLeft',{name:a.name}));}
function joinOffice(g,slot,animate){const d=layout.desks[slot],p=animate?layout.entry:(d.seat||layout.entry),a=createActor(g.id,g.name,p.x,p.z,hexNum(g.color),g.avatar.hair,'resident',lookOf(g));a.desk=d;a.lookSig=JSON.stringify(g.avatar);
 if(animate){a.busy=true;a.hidden=true;a.activity=I18n.raw('strings.masuk_lewat_pintu');pendingJoins.push({a,after:time+.9});log(I18n.source('messages.agentJoined',{name:g.name}));mark('resident-join',g.id);}else a.seated=true;return a;}
function restyle(a,g){const sig=JSON.stringify(g.avatar);if(a.lookSig!==sig){a.lookSig=sig;const old=a.char,v=actorVisual(lookOf(g),old.position.x,old.position.z,a.kind);v.char.rotation.copy(old.rotation);v.char.visible=old.visible;scene.remove(old);v.paper.visible=a.paper.visible;Object.assign(a,v);batchDirty=true;}
 if(a.name!==g.name){a.name=g.name;const b=a.label.querySelector('b');if(b)I18n.bind(b,g.name);}a.color=hexNum(g.color);}
function applyRoster(list,animate=true){const active=rosterActive({agents:list});if(!active.length)return;const sig=JSON.stringify(active);if(sig===rosterSig)return;rosterSig=sig;const n=active.length,slots=officeResidentSlots(n);
 for(const a of [...residents])if(!active.some(g=>g.id===a.id))leaveOffice(a,animate);
 layout.desks.forEach((d,i)=>{const o=world.get(d.objectId);if(i<n){const [x,z]=slots[i];if(!o.enabled){world.move(d.objectId,x,z);o.node.scale.setScalar(.02);world.restore(d.objectId);world.get(d.chairId).node.position.set(x,0,z+1.25);world.restore(d.chairId);deskTween(d,{x,z,from:.02,to:1});}else if(Math.hypot(o.node.position.x-x,o.node.position.z-z)>.01)deskTween(d,{x,z});}else if(o.enabled)deskTween(d,{from:1,to:.02,remove:true});});
 const ordered=active.map((g,i)=>{let a=residents.find(r=>r.id===g.id);if(!a)a=joinOffice(g,i,animate&&!!rosterSig&&applyRoster.ready);else{restyle(a,g);if(a.desk!==layout.desks[i]){a.desk=layout.desks[i];resit(a);}}Object.assign(a,{provider:g.provider,source:g.source,account:g.account,agent:g});layout.styleDesk(i,{name:g.name,plate:g.plate,color:g.color});return a;});
 for(const a of residents)if(!ordered.includes(a))leaveOffice(a,animate);
 residents.splice(0,residents.length,...ordered);providers.splice(0,providers.length,...ordered.map(a=>a.id));names.splice(0,names.length,...ordered.map(a=>a.name));colors.splice(0,colors.length,...ordered.map(a=>a.color));
 for(const [i,d] of layout.desks.entries())if(i<n&&animate)setTimeout(()=>{for(const a of residents)if(a.desk===d&&!a.busy&&a.seated&&Math.hypot(a.char.position.x-d.seat.x,a.char.position.z-d.seat.z)>.3)resit(a);},760);
 batchDirty=true;if(typeof updateUI==='function'&&applyRoster.ready)updateUI();}
applyRoster(preferences.agents,false);applyRoster.ready=true;
function rebuildBatch(){
 if(!batchDirty)return;
 for(const mesh of figureBatches){scene.remove(mesh);mesh.dispose();}
 figureBatches=[];
 const groups=new Map();
 function collect(root,actor){
  root.traverse(part=>{
   if(!part.isMesh)return;
   const finish=part.material.userData.finish||'legacy';
   const key=part.geometry.uuid+'|'+finish;
   if(!groups.has(key))groups.set(key,{geometry:part.geometry,finish,entries:[]});
   groups.get(key).entries.push({part,root,actor});
  });
 }
 for(const a of actors)if(!a.removed)collect(a.char,a);
 collect(layout.dynamic,null);
 for(const {geometry,finish,entries} of groups.values()){
  const mat=finish==='legacy'?shared:figureMaterial(0xffffff,finish);
  const mesh=new THREE.InstancedMesh(geometry,mat,entries.length);
  mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.figureEntries=entries;
  mesh.userData.nearGeometry=geometry;
  const shape=geometry.userData.figureShape;
  mesh.userData.farGeometry=shape&&!['lapel','collar','tie','fringe'].includes(shape)?figureShape(shape,true):geometry;
  mesh.userData.drawn=[];
  entries.forEach(({part},i)=>mesh.setColorAt(i,part.material.color));
  scene.add(mesh);figureBatches.push(mesh);
 }
 batchDirty=false;
}
function updateBatch(){
 rebuildBatch();updateContacts();
 // Hysteresis prevents swapping meshes while the camera hovers near the overview distance.
 if(preferences.appearance.economy||cam.distance>30)overviewFigures=true;
 else if(cam.distance<26)overviewFigures=false;
 for(const a of actors){a.char.visible=false;a.char.updateMatrixWorld(true);}
 layout.dynamic.visible=false;layout.dynamic.updateMatrixWorld(true);
 for(const mesh of figureBatches){
  mesh.geometry=overviewFigures?mesh.userData.farGeometry:mesh.userData.nearGeometry;
  let index=0;
  for(const entry of mesh.userData.figureEntries){
   const {part,root,actor}=entry;
   if(actor?.hidden||actor?.removed)continue;
   let visible=true;
   for(let p=part;p!==root;p=p.parent){if(!p.visible){visible=false;break;}}
   if(!visible)continue;
   mesh.setMatrixAt(index,part.matrixWorld);mesh.setColorAt(index,part.material.color);
   mesh.userData.drawn[index++]=entry;
  }
  mesh.count=index;
  // Three revisions with an instance bounding sphere must refit it after actors move.
  if('boundingSphere' in mesh)mesh.boundingSphere=null;
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
 }
}
// Jalur terpendek pada grid: tapak benda + radius karakter, tanpa pintasan diagonal.
const grid=.5, key=(x,z)=>Math.round(x*2)+','+Math.round(z*2),point=k=>{const [x,z]=k.split(',').map(Number);return{x:x/2,z:z/2};};
// v9: obstacle diturunkan dari footprint benda (world.sync). Keras = dinding/perabot; lunak = tempat duduk (hanya pemakainya
// boleh masuk: owner titik awal/tujuan); permukaan (on) tidak menghalangi. Radius karakter .25 + jarak aman = .36.
const PAD=.36,hits=(o,x,z)=>Math.abs(x-o.x)<o.w/2+PAD&&Math.abs(z-o.z)<o.d/2+PAD;
// [Diubah oleh Gemini - 2026-11-20] Perluas batas lantai, grid navigasi BFS, dan A* ke dunia V12 (48x32 m: x -23.5..23.5, z -15.5..15.5 + Teras Barat: x -27.5..-23.5, z 0.5..14.5).
function outsideFloor(x,z){return !(x>=-23.5&&x<=23.5&&z>=-15.5&&z<=15.5)&&!(x>=-27.5&&x<=-23.5&&z>=.5&&z<=14.5);}
function blocked(x,z){if(outsideFloor(x,z))return true;return layout.obstacles.some(o=>!o.disabled&&!o.soft&&!o.surface&&hits(o,x,z));}
function softOwners(x,z){const out=[];for(const o of layout.obstacles)if(!o.disabled&&o.soft&&!o.surface&&hits(o,x,z))out.push(o.owner);return out;}
const staticNodes=new Map(),softNodes=new Map();
const reachableNodes=new Map(),usePointCache=new Map();
function refreshNavigation(){staticNodes.clear();softNodes.clear();usePointCache.clear();for(let x=worldBounds.minX+.5;x<=worldBounds.maxX-.5;x+=.5)for(let z=worldBounds.minZ+.5;z<=worldBounds.maxZ-.5;z+=.5)if(!blocked(x,z)){const s=softOwners(x,z);if(s.length)softNodes.set(key(x,z),{x,z,owners:s});else staticNodes.set(key(x,z),{x,z});}reachableNodes.clear();const entry=world.get('entry').node.position,sk=key(entry.x,entry.z),open=[sk];if(staticNodes.has(sk))reachableNodes.set(sk,staticNodes.get(sk));for(let i=0;i<open.length;i++){const p=point(open[i]);for(const [dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(p.x+dx,p.z+dz);if(staticNodes.has(nk)&&!reachableNodes.has(nk)){reachableNodes.set(nk,staticNodes.get(nk));open.push(nk);}}}}
function seatReachable(k){const n=softNodes.get(k);if(!n)return false;const own=new Set(n.owners),open=[k],seen=new Set(open);for(let i=0;i<open.length&&i<64;i++){const p=point(open[i]);for(const[dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(p.x+dx,p.z+dz);if(reachableNodes.has(nk))return true;const m=softNodes.get(nk);if(m&&!seen.has(nk)&&m.owners.every(o=>own.has(o))){seen.add(nk);open.push(nk);}}}return false;}
// v9: titik yang tidak sah tidak lagi digeser diam-diam ke node terdekat (penyebab agen berdiri di tempat aneh); titik itu nonaktif.
// Hanya benda inti terkunci (alur cerita) yang tetap digeser, dan audit v9 mencatat pergeseran itu sebagai pelanggaran.
world.resolvePoint=p=>{const k=p.objectId+':'+p.index;if(usePointCache.has(k))return usePointCache.get(k);const o=world.get(p.objectId),spec=o?.usePoints[p.index],nk=key(p.x,p.z),soft=softNodes.get(nk),seatOk=soft&&(spec?.kind==='sit'||soft.owners.includes(p.objectId))&&seatReachable(nk);let q=p;if(!reachableNodes.has(nk)&&!seatOk){if(!o?.locked){usePointCache.set(k,null);return null;}const near=[...reachableNodes.values()].filter(n=>Math.hypot(n.x-p.x,n.z-p.z)<=2).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];q=near?{...p,x:near.x,z:near.z}:null;}usePointCache.set(k,q);return q;};refreshNavigation();

world.onChange=o=>{refreshNavigation();for(const a of actors)if(a.desk?.objectId===o.id&&o.enabled&&a.seated&&!a.lifted&&!a.hidden&&!a.path.length&&a.queue[0]?.type!=='walk'&&!a.usingObject){const s=a.desk.seat;if(s){a.char.position.x=s.x;a.char.position.z=s.z;}}for(const click of layout.clicks){if(click.kind==='reports')click.point.copy(layout.tray);if(click.kind==='server'){const n=world.get('server').node.position;click.point.set(n.x,1.5,n.z+.45);}if(click.kind==='daily')click.point.copy(world.get('daily-board').node.position);}for(const a of actors){if(a.desk?.objectId===o.id&&a.busy&&!a.lifted){if(!o.enabled){const other=[...world.items.values()].find(v=>v.enabled&&v.screen&&v.affordances.sit_work&&!actors.some(b=>b!==a&&!b.removed&&b.desk?.objectId===v.id));if(other)a.desk={objectId:other.id,screen:other.screen,get seat(){return world.point(other.id);}};}if(a.desk.seat){a.queue.unshift(walk(()=>a.desk.seat,I18n.raw('strings.menyesuaikan_meja_kerja')),action(()=>sit(a)));a.path=[];}}if(a.usingObject?.id===o.id||a.usingObject&&world.get(a.usingObject.id)?.version!==a.usingObject.version){a.yielding=false;a.resuming=false;if(a.currentAudit)a.currentAudit.cancelled='benda dipindah atau dihapus';world.release(a);a.queue=[];a.path=[];a.seated=false;a.activity=I18n.raw('strings.mencari_benda_lain');a.nextIdle=time+.5;}else if(a.queue[0]?.type==='walk'){a.queue[0].started=false;a.path=[];}}updateStacks();};

// v9: pemeriksa fisika tunggal (footprint, zona kosong, titik pakai, rute) untuk editor, overlay "Garis fisik" dan QA.
const physics=(()=>{const TOL=.02,CAP=.25,pen=(a,b)=>Math.min((a.w+b.w)/2-Math.abs(a.x-b.x),(a.d+b.d)/2-Math.abs(a.z-b.z)),within=(c,p)=>c.x-c.w/2>=p.x-p.w/2-.01&&c.x+c.w/2<=p.x+p.w/2+.01&&c.z-c.d/2>=p.z-p.d/2-.01&&c.z+c.d/2<=p.z+p.d/2+.01,inside=(c,p)=>Math.abs(c.x-p.x)<=p.w/2+1e-6&&Math.abs(c.z-p.z)<=p.d/2+1e-6,circle=(x,z,r,f)=>{const dx=Math.max(Math.abs(x-f.x)-f.w/2,0),dz=Math.max(Math.abs(z-f.z)-f.d/2,0);return dx*dx+dz*dz<(r-TOL)*(r-TOL);};
 function footprints(){const out=[];for(const o of world.items.values()){if(!o.enabled||!o.footprint)continue;const r=world.rect(o);out.push({...r,id:o.id,name:o.type,kind:'object',on:o.on,locked:o.locked,clearance:world.clearRects(o)});}for(const b of layout.obstacles)if(!b.owner&&!b.disabled)out.push({x:b.x,z:b.z,w:b.w,d:b.d,id:'static:'+b.x+','+b.z,name:b.name||'',kind:b.w<=.15||b.d<=.15?'wall':'static',solid:true,clearance:[]});return out;}
 function conflicts(fps=footprints()){const overlaps=[],clear=[],actorsHit=[];for(let i=0;i<fps.length;i++)for(let j=i+1;j<fps.length;j++){const a=fps[i],b=fps[j];if(a.kind!=='object'&&b.kind!=='object')continue;if(pen(a,b)<=TOL||a.on===b.id&&within(a,b)||b.on===a.id&&within(b,a))continue;overlaps.push({a,b});}
  for(const f of fps)for(const c of f.clearance||[])for(const g of fps)if(g!==f&&!(g.on&&g.surface)&&pen(c,g)>TOL)clear.push({owner:f,zone:c,other:g});
  for(const a of actors){if(a.hidden||a.removed||a.lifted)continue;const p=a.char.position,allow=new Set([a.usingObject?.id,...(a.softAllow||[])].filter(Boolean));for(const f of fps){if(allow.has(f.id)||f.on&&f.surface)continue;if(f.soft&&inside(p,f)&&a.seated)continue;if(circle(p.x,p.z,CAP,f)){actorsHit.push({actor:a,f});break;}}}
  return{overlaps,clear,actors:actorsHit,count:overlaps.length+clear.length+actorsHit.length};}
 // [Diubah oleh Gemini - 2026-11-20] Sesuaikan batas grid navigasi hipotetis navWith() ke batas dunia V12 (48x32 m + Teras Barat).
 function navWith(over){const obs=layout.obstacles.filter(o=>!o.disabled&&!(o.owner&&over.has(o.owner))).map(o=>o);for(const [id,r] of over)if(r)obs.push({...r,owner:id});const hard=(x,z)=>outsideFloor(x,z)||obs.some(o=>!o.soft&&!o.surface&&hits(o,x,z)),soft=new Map(),free=new Set();for(let x=worldBounds.minX+.5;x<=worldBounds.maxX-.5;x+=.5)for(let z=worldBounds.minZ+.5;z<=worldBounds.maxZ-.5;z+=.5){if(hard(x,z))continue;const s=obs.filter(o=>o.soft&&!o.surface&&hits(o,x,z)).map(o=>o.owner);if(s.length)soft.set(key(x,z),s);else free.add(key(x,z));}
  const e=world.get('entry').node.position,reach=new Set(),open=[key(e.x,e.z)];if(free.has(open[0]))reach.add(open[0]);for(let i=0;i<open.length;i++){const p=point(open[i]);for(const[dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(p.x+dx,p.z+dz);if(free.has(nk)&&!reach.has(nk)){reach.add(nk);open.push(nk);}}}
  const seat=(k,kind,id)=>{const n=soft.get(k);if(!n||!(kind==='sit'||n.includes(id)))return false;const q=[k],seen=new Set(q);for(let i=0;i<q.length&&i<64;i++){const p=point(q[i]);for(const[dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(p.x+dx,p.z+dz);if(reach.has(nk))return true;const m=soft.get(nk);if(m&&!seen.has(nk)&&m.every(o=>n.includes(o))){seen.add(nk);q.push(nk);}}}return false;};
  return{reach,ok:(x,z,kind,id)=>{const k=key(x,z);return reach.has(k)||seat(k,kind,id);}};}
 const pt=(o,p,at)=>{const r=at?.r??o.node.rotation.y,c=Math.cos(r),s=Math.sin(r),x=(at?.x??o.node.position.x)+p.x*c+p.z*s,z=(at?.z??o.node.position.z)-p.x*s+p.z*c;return{x:Math.round(x*2)/2,z:Math.round(z*2)/2};};
 // Pemeriksaan penempatan editor: id benda yang ada (atau template untuk benda baru) pada x,z,r(rad). null = sah.
 function placement({id,template,x,z,r}){const o=world.get(id)||world.get(template);if(!o?.footprint)return null;const at={x,z,r},moving=new Map(),own=world.rect(o,at),list=[[o,at,own]];
  if(world.get(id)){const old={x:o.node.position.x,z:o.node.position.z,r:o.node.rotation.y},dr=r-old.r,c=Math.cos(dr),s=Math.sin(dr);for(const k of world.items.values())if(k!==o&&k.enabled&&k.footprint&&(k.follow===o.id||k.on===o.id&&world.onSurfaceAt(k,old))){const rx=k.node.position.x-old.x,rz=k.node.position.z-old.z,kat={x:x+rx*c+rz*s,z:z-rx*s+rz*c,r:k.node.rotation.y+dr};list.push([k,kat,world.rect(k,kat)]);}}
  const ids=new Set(list.map(([k])=>k.id));if(!world.get(id))ids.clear();const fps=footprints().filter(f=>!ids.has(f.id));
  for(const [k,kat,rect] of list){if(!rect.surface){const a=actors.find(a=>!a.hidden&&!a.removed&&!a.lifted&&circle(a.char.position.x,a.char.position.z,CAP,rect));if(a)return{reason:'overlap',other:{id:'actor:'+a.id,name:a.name}};}for(const f of fps){if(f.on&&f.surface&&!ids.has(f.on))continue;if(pen(rect,f)<=TOL)continue;if(k.on===f.id&&within(rect,f))continue;return{reason:f.kind==='wall'?'wall':'overlap',other:f};}
   for(const f of fps)for(const c of f.clearance)if(pen(rect,c)>TOL)return{reason:'clearance',other:f};
   for(const c of world.clearRects(k,kat))for(const f of fps)if(!(f.on&&f.surface)&&pen(c,f)>TOL)return{reason:'clearance',other:f};}
  const over=new Map();for(const [k,,rect] of list)over.set(world.get(id)?k.id:'__new',{x:rect.x,z:rect.z,w:rect.w,d:rect.d,h:rect.h,soft:!!k.soft});const nav=navWith(over);
  for(const v of world.items.values()){if(!v.enabled||ids.has(v.id))continue;v.usePoints.forEach((p,i)=>{if(over.blocked)return;const q=world.point(v,i);if(!q)return;if(!nav.ok(q.x,q.z,p.kind,v.id))over.blocked={reason:'blocksUse',other:{id:v.id,name:v.type}};});if(over.blocked)return over.blocked;}
  for(const [k,kat] of list){if(!k.usePoints.length||!Object.keys(k.affordances).length)continue;if(!k.usePoints.some(p=>{const q=pt(k,p,kat);return nav.ok(q.x,q.z,p.kind,world.get(id)?k.id:'__new');}))return{reason:'noAccess',other:{id:k.id,name:k.type}};}
  return null;}
 return{footprints,conflicts,placement,pen,within,inside};})();
function pathTo(start,end,a,avoid=false){if(!end)return null;const sk=key(start.x,start.z),ek=key(end.x,end.z),allow=new Set([...(softNodes.get(sk)?.owners||[]),...(softNodes.get(ek)?.owners||[])]),ok=k=>staticNodes.has(k)||softNodes.get(k)?.owners.every(o=>allow.has(o));if(!ok(ek))return null;if(sk===ek)return Object.assign([],{allow:[...allow]});
 if(!ok(sk)&&!start.escape){const esc=[...reachableNodes.values()].filter(n=>Math.hypot(n.x-start.x,n.z-start.z)<=3).sort((u,v)=>Math.hypot(u.x-start.x,u.z-start.z)-Math.hypot(v.x-start.x,v.z-start.z))[0];if(!esc)return null;const rest=pathTo({...esc,escape:true},end,a,avoid);if(!rest)return null;collisions.escapes=(collisions.escapes||0)+1;return Object.assign([esc,...rest],{allow:[...new Set([...allow,...rest.allow])]});}const occupied=new Set();if(avoid)for(const actor of actors)if(actor!==a&&!actor.hidden&&!actor.removed&&!actor.lifted){const p=actor.char.position;for(let dx=-.5;dx<=.5;dx+=.5)for(let dz=-.5;dz<=.5;dz+=.5){const x=Math.round(p.x*2)/2+dx,z=Math.round(p.z*2)/2+dz;if(Math.hypot(x-p.x,z-p.z)<.8)occupied.add(key(x,z));}}if(occupied.has(ek))return null;
 // V10: Manhattan A* with a binary heap keeps the enlarged grid cheap for 20+ actors.
 const heap=[],came=new Map([[sk,null]]),scores=new Map([[sk,0]]),h=k=>{const p=point(k);return Math.abs(p.x-end.x)+Math.abs(p.z-end.z);},less=(a,b)=>a.f<b.f||a.f===b.f&&a.h<b.h;
 const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}},pop=()=>{const n=heap[0],tail=heap.pop();if(heap.length){heap[0]=tail;let i=0;for(;;){let j=i,l=i*2+1,r=l+1;if(l<heap.length&&less(heap[l],heap[j]))j=l;if(r<heap.length&&less(heap[r],heap[j]))j=r;if(j===i)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j;}}return n;};push({k:sk,g:0,h:h(sk),f:h(sk)});
 // [Diubah oleh Gemini - 2026-11-20] Tingkatkan batas kunjungan A* ke 16000 untuk ruang 48x32 m + Teras Barat.
 // V19 [Diubah oleh Gemini - 2026-11-21] Rapatkan titik awal non-grid ke node grid terdekat agar jalur berbelok tidak menyerempet sudut obstacle.
 for(let visited=0;heap.length&&visited<16000;visited++){const n=pop(),k=n.k;if(n.g!==scores.get(k))continue;if(k===ek){const out=[];let c=k;while(c!==sk){out.unshift(point(c));c=came.get(c);}const sp=point(sk);if(out.length&&Math.hypot(start.x-sp.x,start.z-sp.z)>.05&&ok(sk)&&!occupied.has(sk))out.unshift(sp);out.allow=[...allow];return out;}const p=point(k);for(const[dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(p.x+dx,p.z+dz),g=n.g+.5;if(!ok(nk)||occupied.has(nk)||g>=(scores.get(nk)??Infinity))continue;scores.set(nk,g);came.set(nk,k);const nh=h(nk);push({k:nk,g,h:nh,f:g+nh});}}return null;}

function deskHandoff(a){const o=world.get(a.desk?.objectId);if(!o)return near(secretary,a);return world.point(o,1)||{x:a.desk.seat.x+1,z:a.desk.seat.z};}
function updateInboxStacks(){if(layout.updateInboxes)layout.updateInboxes(actors);}
function near(a,receiver){const p=receiver.char.position,candidates=[];for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1]]){const q={x:Math.round(p.x*2)/2+dx,z:Math.round(p.z*2)/2+dz};if(!blocked(q.x,q.z)&&!actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-q.x,b.char.position.z-q.z)<.85)){const path=pathTo(a.char.position,q,a);if(path)candidates.push({q,len:path.length});}}candidates.sort((a,b)=>a.len-b.len);return candidates[0]?.q||null;}
// V19 [Diubah oleh Gemini - 2026-11-21] Opsi kecepatan adaptif walk, durasi handoff opsional transfer, paksa minggir giveWay, dan sub-step bebas tabrakan pada updateActor
const walk=(p,activity=I18n.raw('strings.berjalan'),opts=null)=>({type:'walk',goal:p,activity,...(opts||{})}), wait=(duration,activity)=>({type:'wait',duration,activity}), action=fn=>({type:'action',fn});
function enqueue(a,...steps){a.queue.push(...steps);}function idle(a){return !a.lifted&&!a.resuming&&!a.yielding&&!a.queue.length&&!a.path.length;}
// [Diubah oleh Gemini - 2026-11-20] Tambah warna lembar laporan profit hijau (0x58c98f) dan rugi merah (0xd96b5b) untuk koreografi serah terima Trader MT5 -> Manajer Keuangan.
function carry(a,value,color){a.carrying=value;if(color&&a.paper.userData.stripe){a.paper.userData.tint=color;if(!voxelMaterials.has(color))voxelMaterials.set(color,new THREE.MeshLambertMaterial({color}));a.paper.userData.stripe.material=voxelMaterials.get(color);const shade=color===0x58c98f?0xcff5e1:color===0xd96b5b?0xfad4ce:color===0xe8af93?0xffdac5:color===0xe5c16e?0xf3df98:0xf6edcf;if(!voxelMaterials.has(shade))voxelMaterials.set(shade,new THREE.MeshLambertMaterial({color:shade}));a.paper.material=voxelMaterials.get(shade);}batchDirty=true;}
function face(a,b){a.char.rotation.y=Math.atan2(a.char.position.x-b.char.position.x,a.char.position.z-b.char.position.z);}
function transfer(a,b,waitSec=2.2){if(Math.hypot(a.char.position.x-b.char.position.x,a.char.position.z-b.char.position.z)>2.2){mark('handoff-too-far',a.id+'→'+b.id);return false;}face(a,b);face(b,a);a.offerUntil=time+Math.max(1,waitSec+.2);b.receiveUntil=time+Math.max(1.2,waitSec+1.8);b.documentUntil=time+6;carry(a,false);carry(b,true,a.paper.userData.tint||a.color);layout.transferPaper.material=a.paper.material;enqueue(a,wait(waitSec,I18n.raw('strings.menyerahkan_tugas')));enqueue(b,wait(waitSec,I18n.raw('v10.receiving')));a.char.updateMatrixWorld(true);b.char.updateMatrixWorld(true);layout.handoff={from:a,to:b,start:time,duration:Math.min(1.8,Math.max(.5,waitSec*.82))};mark('handoff',a.id+'→'+b.id);return true;}
function sit(a){const p=a.char.position,seat=[...world.items.values()].find(o=>{if(!o.enabled||!o.soft||!o.footprint)return false;const r=world.rect(o);return Math.abs(p.x-r.x)<=r.w/2+.01&&Math.abs(p.z-r.z)<=r.d/2+.01;});a.seated=!!seat;if(seat)a.char.rotation.y=world.point(a.usingObject?.id,a.usingObject?.index)?.facing??seat.node.rotation.y;}
// [Diubah oleh Gemini - 2026-11-20] + V19 [2026-11-21] Lepas objek santai saat yield dibatalkan, dukung paksa minggir (force), dan pastikan langkah pertama rute menghindar benar-benar bebas dari penghalang agar tidak livelock.
function stepFree(a,from,to){if(!to)return false;const d=Math.hypot(to.x-from.x,to.z-from.z);if(d<1e-4)return true;const s=Math.min(d,.2),tx=from.x+(to.x-from.x)*s/d,tz=from.z+(to.z-from.z)*s/d;return !actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-tx,b.char.position.z-tz)<.73);}
function giveWay(other,requester,force=false){if(other.lifted||other.resuming||other.yielding||(!force&&time<(other.yieldUntil||0))||other.seated)return false;if(!force&&other.moving&&actors.indexOf(requester)>actors.indexOf(other))return false;const origin={x:Math.round(other.char.position.x*2)/2,z:Math.round(other.char.position.z*2)/2},position=requester.char.position,planned=new Set(requester.path.slice(0,8).map(p=>key(p.x,p.z))),maxD=force?4.5:3,options=[...reachableNodes.values()].filter(p=>{const d=Math.hypot(p.x-origin.x,p.z-origin.z);return d>=1&&d<=maxD&&Math.hypot(p.x-position.x,p.z-position.z)>1.45&&!occupiedGoal(p,other);}).sort((a,b)=>(planned.has(key(a.x,a.z))?4:0)+Math.hypot(a.x-origin.x,a.z-origin.z)-(planned.has(key(b.x,b.z))?4:0)-Math.hypot(b.x-origin.x,b.z-origin.z));const target=options.find(p=>{const r=pathTo(other.char.position,p,other,true);return r?.length&&stepFree(other,other.char.position,r[0]);});if(!target)return false;const saved={seated:other.seated,rotation:other.char.rotation.y,activity:other.activity};other.yielding=true;other.yieldUntil=time+7;other.path=[];for(const q of other.queue)if(q.type==='walk')q.started=false;other.queue.unshift(walk(target,I18n.raw('strings.memberi_jalan')),wait(.85,I18n.raw('strings.memberi_jalan')),walk(origin,I18n.raw('strings.kembali_ke_jalur')),action(()=>{other.yielding=false;if(other.usingObject&&!other.busy&&Math.hypot(other.char.position.x-origin.x,other.char.position.z-origin.z)>.45){world.release(other);other.chat=null;other.seated=false;other.queue=[];other.path=[];other.activity=I18n.raw('strings.santai');other.nextIdle=time+2;return;}other.seated=saved.seated;other.char.rotation.y=saved.rotation;other.activity=saved.activity;}));return true;}
function updateActor(a,dt){if(a.removed||a.hidden)return;if(a.lifted){animateLift(a);return;}if(a.landHeight>0){const f=Math.min(1,(time-a.landAt)/.28);a.char.position.y=a.landHeight*(1-f*f);animateVoxelChar(a.char,'idle',false,false,0,a.phase);a.paper.visible=a.carrying;a.char.userData.legs.forEach(l=>l.shin.rotation.x=-.2);if(time<a.reactionUntil)reactVoxelChar(a.char,a.expression,0,a.reactionKind);if(f<1)return;a.landHeight=0;a.char.position.y=0;if(a.shadow)a.shadow.visible=false;}if(a.sulkUntil>time){animateVoxelChar(a.char,'idle',false,false,motionOff()?0:time,a.phase);a.char.rotation.y=Math.PI;return;}if(!a.flowTravel)a.moving=false;let q=a.queue[0];
 if(a.flowTravel){a.activity=I18n.raw('strings.menuju_meja');animateVoxelChar(a.char,'working',!!a.moving,false,motionOff()?0:a.steps*1.4,a.phase);a.paper.visible=false;return;}
 if(q?.type==='action'){a.queue.shift();q.fn();q=a.queue[0];}
 if(q?.type==='walk'){
  const goal=typeof q.goal==='function'?q.goal():q.goal;
  if(!goal){a.queue.shift();a.path=[];a.activity=I18n.raw('strings.mencari_tujuan_baru');return;}
  if(q.started&&q.goalPoint&&(Math.hypot(goal.x-q.goalPoint.x,goal.z-q.goalPoint.z)>.1)){q.started=false;a.path=[];}
  if(!q.started){q.started=true;a.seated=false;a.activity=q.activity;a.path=pathTo(a.char.position,goal,a,true)||pathTo(a.char.position,goal,a);if(a.path){a.softAllow=a.path.allow;if(q.targetSeconds>0&&a.path.length){let len=0,prev=a.char.position;for(const p of a.path){len+=Math.hypot(p.x-prev.x,p.z-prev.z);prev=p;}q.speed=Math.max(2.35,Math.min(18,len/q.targetSeconds));}}q.startedAt=time;q.goalPoint=goal;if(!a.path){collisions.routeFailures++;a.path=[];q.started=false;q.failure={from:{x:a.char.position.x,z:a.char.position.z},goal};return;}}
  if(a.path.length){const speed=q.speed||2.35;let budget=dt*speed,hit=null;
   while(budget>1e-6&&a.path.length){const next=a.path[0],pos=a.char.position,dx=next.x-pos.x,dz=next.z-pos.z,d=Math.hypot(dx,dz),step=Math.min(d,budget,.2),nx=pos.x+(d?dx/d*step:0),nz=pos.z+(d?dz/d*step:0);
    const other=actors.find(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-nx,b.char.position.z-nz)<.73);
    if(other){hit=other;break;}
    let mx=nx,mz=nz;if(blocked(mx,mz)){if(Math.abs(nx-pos.x)>1e-5&&!blocked(nx,pos.z))mz=pos.z;else if(Math.abs(nz-pos.z)>1e-5&&!blocked(pos.x,nz))mx=pos.x;}
    pos.x=mx;pos.z=mz;a.moving=a.moving||d>.001;if(d>.001)a.char.rotation.y=Math.atan2(-dx,-dz);a.blocked=0;a.steps+=step;budget-=step;if(Math.hypot(next.x-pos.x,next.z-pos.z)<=.02||(mx===nx&&mz===nz&&d<=step+.001))a.path.shift();
   }
   // [Diubah oleh Gemini - 2026-11-20] + V19 [2026-11-21] Cegah deadlock permanen pada langkah yield/arsip & livelock rute memutar yang langkah pertamanya masih terhalang.
   if(hit){a.blocked+=dt;if(a.blocked>.55){const pos=a.char.position,route=pathTo(pos,q.goalPoint,a,true);if(route&&route.length&&stepFree(a,pos,route[0])){a.path=route;a.softAllow=route.allow;q.retries=0;}else{q.retries=(q.retries||0)+1;if(!giveWay(hit,a,q.retries>=2)){if(q.retries>=2&&(q.activity===I18n.raw('strings.kembali_ke_jalur')||q.activity===I18n.raw('strings.memberi_jalan'))){a.path=[];}else if(q.archiveStep&&q.retries>=2&&Math.hypot(pos.x-q.goalPoint.x,pos.z-q.goalPoint.z)<=1.8){a.path=[];}}}a.blocked=0;}}
  }
  if(!a.path.length){a.queue.shift();routes.push({actor:a.id,goal:q.goalPoint,seconds:time-q.startedAt});if(routes.length>800)routes.shift();}
 }else if(q?.type==='wait'){a.activity=q.activity||a.activity;if(!q.logged){q.logged=true;a.history.push({time,activity:a.activity});if(a.history.length>100)a.history.shift();}q.duration-=dt;if(q.duration<=0)a.queue.shift();}
 // [Diubah oleh Gemini - 2026-11-20] Animasi mengetik untuk Trader MT5 aktif, prompt langsung V13, gestur presenter untuk tahap render studio, dan cangkir minum untuk dispenser air.
 const motionTime=motionOff()?0:time,status=a.workflowWorking&&a.workflowStage==='render'&&!a.moving?'meeting':(a.activity.startsWith(I18n.raw('strings.mengetik'))||a.tradingActive&&!a.moving&&a.seated||a.workflowWorking&&!a.moving||a.promptWorking&&!a.moving)?'working':a.activity===I18n.raw('strings.berbincang')?'meeting':a.activity===I18n.raw('strings.membaca_tugas')?'thinking':'idle';animateVoxelChar(a.char,status,a.moving,a.seated,motionOff()?0:a.moving?a.steps*1.4:time,a.phase);a.char.userData.head.rotation.x=0;
 if(time<a.reactionUntil)reactVoxelChar(a.char,a.expression,motionOff()?0:time,a.reactionKind);
 if(a.pickupUntil>time&&!motionOff()){a.char.userData.body.rotation.x=.25;a.char.userData.arms[1].rotation.x=1.6;}else a.char.userData.body.rotation.x=0;
 a.paper.visible=a.carrying;a.cigarette.visible=a.activity===I18n.raw('strings.merokok_animasi')&&!a.moving;a.smoke.visible=a.cigarette.visible;
 if(a.offerUntil>time||a.receiveUntil>time){a.char.userData.arms[1].rotation.x=1.6;a.char.userData.head.rotation.x=a.receiveUntil>time?Math.sin(time*5)*.12:0;}
 if(a.documentUntil>time){a.label.classList.add('has-document');}else a.label.classList.remove('has-document');
 if(a.carrying){a.char.userData.arms[1].rotation.x=1.35;a.char.userData.mug.visible=false;}
 if(a.cigarette.visible){a.char.userData.arms[1].rotation.x=2.1;a.char.userData.mug.visible=false;for(let i=0;i<5;i++){const f=(motionTime*.3+i/5)%1;const p=a.smoke.children[i];p.position.set(.25+Math.sin(f*8+i)*.1,1.9+f*.7,-.3);p.scale.setScalar(.08*(1-f));}}
 if(a.activity===I18n.raw('strings.meregang')){a.char.userData.arms[0].rotation.z=2+Math.sin(motionTime)*.2;a.char.userData.arms[1].rotation.z=-2-Math.sin(motionTime)*.2;}
 if(a.activity===I18n.raw('strings.minum_kopi')||a.activity===I18n.raw('strings.minum_teh')||a.activity===I18n.raw('strings.minum_air')){a.char.userData.mug.visible=true;a.char.userData.arms[1].rotation.x=1.9+Math.sin(motionTime)*.4;}
 if(a.activity===I18n.raw('strings.membaca_buku')||a.kind==='boss'&&a.activity===I18n.raw('strings.membaca_laporan')){a.paper.visible=true;a.char.userData.arms[1].rotation.x=1.5;}
 if(a.activity===I18n.raw('strings.tenis_meja')||a.activity===I18n.raw('strings.bermain_dart'))a.char.userData.arms[0].rotation.x=1.2+Math.sin(motionTime*3)*.7;
 if(a.activity===I18n.raw('strings.menyiram_tanaman')||a.activity===I18n.raw('strings.mengecap_arsip')){a.char.userData.arms[1].rotation.x=1+Math.sin(motionTime*4)*.45;}
 if(a.receiver)a.receiver.visible=a.activity===I18n.raw('strings.menelepon')&&!a.moving;if(a.receiver?.visible){a.char.userData.arms[1].rotation.x=2.5;}if(a.activity===I18n.raw('strings.menulis_catatan')||a.activity===I18n.raw('v10.learning')){a.char.userData.arms[1].rotation.x=1.05+Math.sin(motionTime*8)*.08;a.char.userData.head.rotation.x=-.15;}if(a.activity===I18n.raw('v10.checking'))a.char.userData.head.rotation.x=-.12;
}
const jokes=[I18n.raw('strings.kopi_ini_lebih_cepat_dari_kompilasi'),I18n.raw('strings.rapat_lima_menit_kita_catat_dulu'),I18n.raw('strings.tanaman_juga_butuh_waktu_istirahat'),I18n.raw('strings.siapa_yang_menyembunyikan_sendok'),I18n.raw('strings.meja_rapi_pikiran_masih_memuat'),I18n.raw('strings.tenis_meja_satu_ronde_saja_ya'),I18n.raw('strings.tadi_printer_minta_cuti'),I18n.raw('strings.kursi_ini_tahu_semua_ide_bagus'),I18n.raw('strings.kalau_hujan_kopi_terasa_lebih_enak'),I18n.raw('strings.aku_merapikan_kabel_kabelnya_protes'),I18n.raw('strings.biskuit_terakhir_kita_bagi_dua'),I18n.raw('strings.jam_dinding_paling_rajin_di_kantor'),I18n.raw('strings.buku_ini_belum_minta_pembaruan'),I18n.raw('strings.tugas_pertama_mencari_tutup_pulpen'),I18n.raw('strings.jendela_hari_ini_bagus_sekali'),I18n.raw('strings.semoga_teh_tidak_ikut_rapat'),I18n.raw('strings.tanaman_sebelah_sudah_naik_pangkat'),I18n.raw('strings.tadi_bolanya_masuk_bawah_sofa'),I18n.raw('strings.aku_lupa_menghitung_cangkir_tadi'),I18n.raw('strings.printer_sehat_semua_ikut_senang'),I18n.raw('strings.kursi_rapat_selalu_kurang_satu'),I18n.raw('strings.hari_ini_kita_pulang_tepat_waktu'),I18n.raw('strings.istirahat_dulu_ide_menyusul'),I18n.raw('strings.laci_ini_museum_kabel_lama')];
let jokeIndex=0;
// [Diubah oleh Gemini - 2026-11-20] Tambah fasilitas santai penuh 48x32 m (termasuk coffee-2, water-cooler, sofa-2, window) untuk semua residen, persona, Manajer Mutu, Trader MT5 & Manajer Keuangan, serta hentikan langkah jalan jauh secara cepat pada stopAmbient.
function occupiedGoal(p,a){return actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&(Math.hypot(b.char.position.x-p.x,b.char.position.z-p.z)<.9||b.queue.some(q=>{const g=q.goalPoint||q.reservedGoal;return g&&Math.hypot(g.x-p.x,g.z-p.z)<.9;})));}
function chooseObject(a,affordance,id){const raw=world.available(affordance,a).filter(v=>(!id||v.object.id===id)&&(id||v.object.affordances[affordance]?.idle!==false)&&!blocked(v.point.x,v.point.z)&&!occupiedGoal(v.point,a));if(!raw.length)return null;if(id)return raw.find(v=>pathTo(a.char.position,v.point,a))||null;const pool=raw.slice(0,Math.min(raw.length,6)),start=Math.floor(random()*pool.length);for(let i=0;i<pool.length;i++){const v=pool[(start+i)%pool.length];if(pathTo(a.char.position,v.point,a))return v;}return raw.slice(pool.length).find(v=>pathTo(a.char.position,v.point,a))||null;}
function useObject(a,affordance,id,duration){const v=chooseObject(a,affordance,id);if(!v)return false;const row=world.reserve(v,a,affordance);row.time=time;a.currentAudit=row;const spec=v.object.affordances[affordance],step=walk(()=>world.point(v.object.id,v.point.index),I18n.source('messages.toward',{place:v.object.type}));step.reservedGoal=v.point;enqueue(a,step,action(()=>{row.arrivedAt=time;row.position={x:a.char.position.x,z:a.char.position.z};row.objectPosition={x:v.object.node.position.x,z:v.object.node.position.z};row.existsOnArrival=v.object.enabled;a.char.rotation.y=world.point(v.object.id,v.point.index)?.facing||0;a.seated=v.slot.kind==='sit';}),wait(duration||spec.duration+random()*4,spec.activity),action(()=>{world.release(a);a.activity=I18n.raw('strings.santai');a.seated=false;}));return true;}
const IDLE_AMENITIES=['coffee','drink','sit','read','play_pong','play_dart','browse_fridge','water','stretch_zone','chat_spot','window','smoke'];
function roamIdle(a){const available=IDLE_AMENITIES.filter(k=>world.available(k,a).some(v=>v.object.affordances[k]?.idle!==false));if(!available.length)return false;let pick=available[Math.floor(random()*available.length)];if(pick===a.lastIdle&&available.length>1)pick=available[(available.indexOf(pick)+1)%available.length];a.lastIdle=pick;if(pick==='chat_spot'){const b=actors.find(b=>b!==a&&!b.hidden&&!b.removed&&!b.busy&&!b.qualityWorking&&!b.qualityActive&&!b.workflowWorking&&!b.tradingActive&&!b.lifted&&idle(b)&&!b.chat&&!['worker','boss'].includes(b.kind));const v=chooseObject(a,'chat_spot');if(b&&v){if(useObject(a,pick,v.object.id,12)&&useObject(b,pick,v.object.id,12)){const chat={a,b,start:time,lines:[jokes[jokeIndex++%jokes.length],jokes[jokeIndex++%jokes.length]]};a.chat=b.chat=chat;enqueue(a,action(()=>a.chat=null));enqueue(b,action(()=>b.chat=null));return true;}world.release(a);a.queue=[];a.path=[];}pick='stretch_zone';}return useObject(a,pick)||useObject(a,'stretch_zone')||useObject(a,'sit');}
function ambient(a){if(specialists.ambient(a))return;if(a.busy||a.lifted||!idle(a)||time<a.nextIdle)return;a.nextIdle=time+8+random()*14;
 if(a.kind==='worker')return;
 if(a.kind==='boss'){useObject(a,'sit',layout.bossChairId)||useObject(a,'window');return;}
 if(a.kind==='secretary'){useObject(a,'phone','phone')||useObject(a,'coffee');return;}
 if(a.kind==='archivist'){useObject(a,'file_archive',random()<.5?'server':undefined);return;}
 if(a.kind==='trader'){if(a.tradingActive||mt5HandoffOp)return;if(random()<.18&&useObject(a,'read','mt5-board',9))return;roamIdle(a);return;}
 if(a.kind==='finance'){if(mt5HandoffOp)return;const r=random();if(r<.22&&useObject(a,'read','finance-board',10))return;if(r<.36&&layout.financeSeat){enqueue(a,walk(()=>layout.financeSeat),action(()=>sit(a)),wait(10,I18n.raw('strings.membaca_laporan')));return;}roamIdle(a);return;}
 roamIdle(a);
}

function stopAmbient(a){a.flowTravel=null;world.release(a);a.busy=true;a.yielding=false;a.resuming=false;if(a.lifted){a.liftSaved.queue=[];a.liftSaved.busy=true;a.queue=[{type:'lift'}];a.path=[];return;}a.chat=null;if(a.queue[0]?.type==='walk'&&a.queue[0].started&&a.path.length){a.path=a.path.slice(0,1);a.queue=a.queue.slice(0,1);}else{a.queue=[];a.path=[];}}
// [Diubah oleh Gemini - 2026-11-20] Hentikan aktivitas santai/yield saja saat pekerjaan laporan selesai siap dilanjutkan agar pemimpin langsung mencetak laporan tanpa memutus state duduk di meja.
function startJob(e){if(e.resume){job=e;if([...liveWorkers.values()].some(w=>w.provider===e.provider&&!w.removed)){e.pendingReport=true;job=null;backgroundJobs.push(e);secretary.busy=false;return;}if(!e.a.lifted&&(e.a.usingObject||e.a.yielding)){world.release(e.a);e.a.busy=true;e.a.yielding=false;e.a.resuming=false;e.a.chat=null;e.a.queue=[];e.a.path=[];}if(e.queuedInInbox){e.a.inbox=Math.max(0,(e.a.inbox||1)-1);e.queuedInInbox=false;enqueue(e.a,action(()=>carry(e.a,true,e.a.color)),wait(2.5,I18n.raw('v10.takingInbox')),action(()=>carry(e.a,false)));updateInboxStacks();}finishResident(job);return;}const provider=providers.includes(e.provider)?e.provider:providers[0],a=residents[providers.indexOf(provider)];if(!e.live){a.category=screenCategories[(serial*3+providers.indexOf(provider))%11];a.taskStatus='working';a.displayFile=({code:'tugas.js',video:'video.mp4',render:'video.mp4',audio:'narasi.wav',notes:'Catatan.md',data:'Rekap.csv'})[a.category]||I18n.raw('strings.tugas_lokal');}const inbox=!!backgroundJobs.find(j=>j.a===a&&(!j.completed||j.pendingReport));if(!inbox)stopAmbient(a);stopAmbient(secretary);job={inbox,provider,a,phase:'settle',task:I18n.raw('strings.tugas_kantor_contoh'),workers:[],multi:!!e.multi,count:Math.min(8,e.count||3),session:e.session||'demo-'+(++serial),start:time,live:!!e.live,completed:e.completed??!e.live,tokens:e.live?(e.tokens??null):(e.tokens||1200),agent:e.agent,reportId:e.reportId};log(I18n.source('messages.bossCall',{name:a.name}));mark('call',provider);}
function goPhase(next,...steps){enqueue(secretary,...steps);job.phase=next;}
function reportToTray(j){let r;
 if(j.live){r=reports.find(r=>r.id===j.reportId);if(!r){scheduleSync();return;}}
 else{r={id:'demo-'+(++serial),provider:j.provider,time:new Date().toISOString(),task:j.multi?I18n.raw("strings.laporan_gabungan"):I18n.raw('strings.ringkasan_tugas_kantor'),tokens:j.tokens,duration_s:Math.round(time-j.start),read:false,archived:false,inTray:true,deliveredAt:time};reports.push(r);totalTokens+=r.tokens;}
 mark('tray',r.id);log(I18n.source('messages.trayDelivered',{name:j.a.name}));j.a.busy=false;j.a.nextIdle=time+4;secretary.busy=false;secretary.nextIdle=time+1;carry(secretary,false);job=null;nextCall=time+30+random()*15;updateStacks();}

function printSteps(a,seconds){const v=world.available('print',a).find(v=>pathTo(a.char.position,v.point,a));if(!v)return[];return[walk(()=>world.point(v.object.id,v.point.index),I18n.raw('strings.menuju_printer')),action(()=>{const p=world.point(v.object.id,v.point.index);if(p&&Math.hypot(p.x-a.char.position.x,p.z-a.char.position.z)<.6)a.queue.unshift(wait(seconds,I18n.raw('strings.mencetak_laporan')));})];}
function finishResident(j){j.a.collected=0;updateStacks();enqueue(j.a,...printSteps(j.a,2),action(()=>carry(j.a,true,j.a.color)),walk(()=>world.point('secretary-desk',1),I18n.raw('strings.mengantar_laporan')),wait(.8,I18n.raw('strings.menyerahkan_laporan')));enqueue(secretary,walk(()=>layout.secretarySeat),action(()=>sit(secretary)));j.phase='resident-report';mark('report',j.provider);}
function spawnWorkers(j,count=3){const desks=layout.projects.filter(d=>world.get(d.objectId)?.enabled);if(!desks.length){enqueue(j.a,wait(6,I18n.raw('strings.mengetik')));j.phase='work';return;}for(let i=0;i<Math.min(count,8,desks.length);i++){const d=desks[i],w=createActor(j.session+'-w'+i,I18n.raw('strings.pekerja_2')+(i+1),layout.entry.x,layout.entry.z,colors[providers.indexOf(j.provider)],['short','hood','ponytail'][i%3],'worker');w.parent=j.a.id;w.desk=d;w.category=screenCategories[(i+serial*3)%11];w.taskStatus='working';w.displayFile=({code:'tugas.js',video:'klip.mp4',audio:'narasi.wav',data:'Rekap.csv'})[w.category]||I18n.raw('strings.tugas_lokal');w.busy=true;w.hidden=true;j.workers.push(w);}j.workerIndex=0;enqueue(j.a,walk(()=>world.point('entry',1),I18n.raw('strings.menyambut_pekerja')));j.phase='workers-enter';log(I18n.source('messages.workerCall',{name:j.a.name,count:j.workers.length}));mark('spawn',j.provider);}
function updateJob(){if(!job){if(jobs.length&&!archiveJob)startJob(jobs.shift());return;}const j=job,a=j.a;if(a.lifted||a.resuming||a.yielding||secretary.lifted||secretary.resuming||secretary.yielding||j.workers?.some(w=>w.lifted||w.resuming||w.yielding))return;
 if(j.phase==='settle'&&!a.hidden&&(j.inbox||idle(a))&&idle(secretary))goPhase('phone',walk(()=>world.point('phone')),action(()=>sit(secretary)),wait(1.8,'menelepon'),wait(1.3,I18n.raw('strings.menulis_catatan')),action(()=>carry(secretary,true,a.color)));
 else if(j.phase==='phone'&&idle(secretary)){goPhase('deliver',walk(()=>deskHandoff(a),I18n.raw('strings.membawa_kertas_tugas')),action(()=>{if(!j.inbox){enqueue(a,walk(()=>a.desk.seat),action(()=>sit(a)));}secretary.offerUntil=time+2.8;face(secretary,a);}),wait(2.8,I18n.raw('strings.menyerahkan_tugas')));mark('secretary-paper',j.provider);}
 else if(j.phase==='deliver'&&idle(secretary)&&(j.inbox||idle(a))){if(j.inbox){carry(secretary,false);a.inbox=(a.inbox||0)+1;mark('task-inbox',a.id);j.queuedInInbox=true;backgroundJobs.push(j);enqueue(secretary,walk(()=>layout.secretarySeat),action(()=>{sit(secretary);secretary.busy=false;}));job=null;updateInboxStacks();return;}transfer(secretary,a);mark('task-received',j.provider);enqueue(a,wait(1.8,I18n.raw('strings.membaca_tugas')),wait(1.2,I18n.raw('strings.merapikan_cangkir_mematikan_rokok')),action(()=>{a.cigarette.visible=false;a.char.userData.mug.visible=false;}),walk(()=>a.desk.seat,I18n.raw('strings.menuju_meja')),action(()=>{carry(a,false);sit(a);}));enqueue(secretary,walk(()=>layout.secretarySeat),action(()=>sit(secretary)));j.phase='resident-seat';}
 else if(j.phase==='resident-seat'&&idle(a)){mark('working',j.provider);if(j.multi&&!j.live)spawnWorkers(j,j.count);else{enqueue(a,wait(6,I18n.raw('strings.mengetik')));j.phase='work';}}
 else if(j.phase==='work'&&j.live&&idle(secretary)&&(!j.completed||[...liveWorkers.values()].some(w=>w.provider===j.provider&&!w.removed))){j.pendingReport=!!j.completed;backgroundJobs.push(j);job=null;secretary.busy=false;}
 else if(j.phase==='work'&&idle(a)&&j.completed&&![...liveWorkers.values()].some(w=>w.provider===j.provider&&!w.removed))finishResident(j);
 else if(j.phase==='workers-enter'&&idle(a)){
  const w=j.workers[j.workerIndex];if(w.hidden&&actors.every(b=>b===w||b.hidden||b.removed||b.lifted||Math.hypot(b.char.position.x-layout.entry.x,b.char.position.z-layout.entry.z)>.9)){w.hidden=false;enqueue(w,walk(()=>world.point('entry',2),I18n.raw('strings.masuk_lewat_pintu')),wait(.7,I18n.raw('strings.menerima_tugas')));j.phase='worker-brief';mark('worker-entry',w.id);}
 }
 else if(j.phase==='worker-brief'){const w=j.workers[j.workerIndex];if(idle(w)){carry(a,true,a.color);transfer(a,w);mark('worker-task',w.id);enqueue(w,walk(()=>w.desk.seat,I18n.raw('strings.membawa_tugas_ke_meja_proyek')),action(()=>{carry(w,false);sit(w);}),wait(9+j.workerIndex*2,I18n.raw('strings.mengetik')));j.workerIndex++;if(j.workerIndex<j.workers.length)j.phase='workers-enter';else{enqueue(a,walk(()=>a.desk.seat),action(()=>sit(a)),wait(5,I18n.raw('strings.mengetik')));j.phase='workers-work';}}}
 else if(j.phase==='workers-work'&&idle(a)&&j.workers.every(idle)){enqueue(a,walk(()=>world.point('entry',1),I18n.raw('strings.menerima_laporan_pekerja')));j.workerIndex=0;j.phase='workers-return';}
 else if(j.phase==='workers-return'&&idle(a)){const w=j.workers[j.workerIndex];enqueue(w,...printSteps(w,1),action(()=>carry(w,true,a.color)),walk(()=>world.point('entry',2),I18n.raw('strings.membawa_laporan_ke_pemimpin')),wait(.8,I18n.raw('strings.menyerahkan_laporan')));j.phase='worker-report';}
 else if(j.phase==='worker-report'){const w=j.workers[j.workerIndex];if(idle(w)){transfer(w,a);carry(a,false);a.collected=(a.collected||0)+1;mark('worker-report',w.id);enqueue(w,walk(()=>layout.entry,I18n.raw('strings.pulang_lewat_pintu')),action(()=>{w.hidden=true;w.removed=true;w.label.remove();batchDirty=true;mark('retire',w.id);}));j.workerIndex++;if(j.workerIndex<j.workers.length)j.phase='workers-return';else{enqueue(a,walk(()=>a.desk.seat),action(()=>sit(a)),wait(2,I18n.raw('strings.menggabungkan_laporan')));j.phase='merge';}updateStacks();}}
 else if(j.phase==='merge'&&idle(a)&&j.completed){a.collected=0;updateStacks();mark('merged-report',j.provider);finishResident(j);}
 else if(j.phase==='resident-report'&&idle(a)&&idle(secretary)){// serah tangan harus berdekatan, sekretaris menjemput satu langkah terakhir.
  enqueue(secretary,walk(()=>near(secretary,a),I18n.raw('strings.menjemput_laporan')),wait(.7,I18n.raw('strings.menerima_laporan')));j.phase='secretary-report';}
 else if(j.phase==='secretary-report'&&idle(secretary)){transfer(a,secretary);enqueue(a,walk(()=>a.desk.seat),action(()=>sit(a)));enqueue(secretary,walk(()=>layout.trayApproach,I18n.raw('strings.membawa_laporan_ke_bos')),wait(1,I18n.raw('strings.meletakkan_laporan')));j.phase='boss-tray';mark('report-handoff',j.provider);}
 else if(j.phase==='boss-tray'&&idle(secretary)){boss.activity=I18n.raw('strings.membaca_laporan');reportToTray(j);}
}
// V19 [Diubah oleh Gemini - 2026-11-21] Mesin arsip anti-macet: pisahkan mode off/fast (Arsiparis langsung ke rak server <=3 dtk tanpa membajak Sekretaris V16) & full (<=12 dtk), validasi transfer/parsial server, dan penjaga kemajuan (watchdog) dengan pemulihan aman.
let archiveJobSerial=0;
const archiveStats={completed:0,watchdogTriggers:0,lastWarning:null,warnings:[],lastDuration:null,maxDuration:0};
const archiveWalk=(goal,activity,targetSeconds)=>walk(goal,activity,{targetSeconds,archiveStep:true});
function archiveServerPoint(a){
 const pts=[world.point('server',0),world.point('server',1)].filter(p=>p&&!blocked(p.x,p.z));
 return pts.find(p=>!actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-p.x,b.char.position.z-p.z)<.78))||pts[0]||layout.archivistSeat;
}
function safeArchivePlace(a,preferred=[]){
 const free=p=>p&&reachableNodes.has(key(p.x,p.z))&&!blocked(p.x,p.z)&&!actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-p.x,b.char.position.z-p.z)<.8);
 const direct=preferred.find(free);
 if(direct){a.char.position.set(direct.x,0,direct.z);a.char.rotation.y=direct.facing??0;a.seated=false;a.softAllow=[];return direct;}
 const anchor=preferred.find(Boolean)||world.point('server',0)||{x:17.5,z:-13};
 const fallback=[...reachableNodes.values()].filter(free).sort((u,v)=>Math.hypot(u.x-anchor.x,u.z-anchor.z)-Math.hypot(v.x-anchor.x,v.z-anchor.z))[0];
 if(fallback){a.char.position.set(fallback.x,0,fallback.z);a.char.rotation.y=anchor.facing??0;a.seated=false;a.softAllow=[];return fallback;}
 return null;
}
function prepArchiveActor(a){
 a.flowTravel=null;flowActors.delete(a);a.flowWorking=false;
 world.release(a);a.chat=null;a.busy=true;a.yielding=false;a.resuming=false;a.blocked=0;
 if(a.lifted){a.liftSaved.queue=[];a.liftSaved.busy=true;a.queue=[{type:'lift'}];a.path=[];return;}
 a.queue=[];a.path=[];a.seated=false;
}
function setArchivePhase(j,next){j.phase=next;j.phaseSince=time;j.lastProgressAt=time;}
function recordArchiveWarning(j,reason,recovery){
 const entry={time:+time.toFixed(2),jobId:j?.id||0,phase:j?.phase||null,reason,recovery};
 archiveStats.watchdogTriggers++;archiveStats.lastWarning=entry;archiveStats.warnings.push(entry);
 if(archiveStats.warnings.length>32)archiveStats.warnings.shift();
 mark('archive-watchdog',(j?.phase||'none')+':'+reason);
 log(I18n.raw('strings.arsiparis_mengarsipkan_laporan_terbaca'));
}
function recoverArchiveJob(j,reason){
 j.recoveries=(j.recoveries||0)+1;
 const rec=j.phase==='saving'?'retry-save':j.usesSecretary&&['settle','handoff'].includes(j.phase)&&j.recoveries===1?'reposition-handoff':'teleport-server';
 recordArchiveWarning(j,reason,rec);
 j.deadline=time+(j.usesSecretary?6:3);
 if(j.phase==='saving'){
  j.saveToken++;j.saveRetries=(j.saveRetries||0)+1;
  if(j.saveRetries<=2){setArchivePhase(j,'stamp');j.retryAt=0;scheduleSync();return;}
  carry(archivist,false);
  for(const r of j.batch)if(!r.archived){r.animating=false;r.inTray=true;r.archiveFailedAt=time;}
  archivist.busy=false;archivist.yielding=false;archivist.resuming=false;archivist.queue=[];archivist.path=[];archivist.nextIdle=time+4;
  archiveJob=null;updateStacks();updateUI();scheduleSync();return;
 }
 j.batch.forEach(r=>{if(!r.archived)r.inTray=false;});updateStacks();
 if(j.usesSecretary&&['settle','handoff'].includes(j.phase)&&j.recoveries===1){
  if(!secretary.lifted){prepArchiveActor(secretary);carry(secretary,true,0xd6b883);safeArchivePlace(secretary,[world.point('archive-desk',1),world.point('archive-desk',2)]);}
  if(!archivist.lifted){prepArchiveActor(archivist);carry(archivist,false);safeArchivePlace(archivist,[world.point('archive-desk',2),world.point('archive-desk',1)]);}
  setArchivePhase(j,'handoff');return;
 }
 if(j.usesSecretary&&!secretary.lifted){prepArchiveActor(secretary);carry(secretary,false);secretary.busy=false;flowApplyActors();}
 if(!archivist.lifted){
  prepArchiveActor(archivist);carry(archivist,true,0xd6b883);
  safeArchivePlace(archivist,[archiveServerPoint(archivist),world.point('server',0),world.point('server',1)]);
  if(j.recoveries<=1)enqueue(archivist,wait(.25,I18n.raw('strings.memasukkan_arsip')));
 }
 setArchivePhase(j,'stamp');j.retryAt=0;
}
async function updateReports(action,rows){
 const updated=new Set();
 for(let i=0;i<rows.length;i+=300){
  const ids=rows.slice(i,i+300).map(r=>r.id);
  try{
   if(ids.length===1){
    await panels.api('/reports/'+ids[0]+'/'+action,{});
    updated.add(ids[0]);continue;
   }
   const result=await panels.api('/reports/batch/'+action,{ids});
   for(const id of Array.isArray(result?.updated)?result.updated:[])updated.add(id);
   if((result?.updated?.length||0)!==ids.length)log(I18n.raw('strings.report_batch_incomplete'));
  }catch(e){log(e.message);break;}
 }
 return updated;
}
async function markRead(ids){
 const requested=new Set(ids),rows=reports.filter(r=>requested.has(r.id)&&r.inTray&&!r.read&&!readPending.has(r.id));
 if(!rows.length)return;
 for(const r of rows)readPending.add(r.id);
 updateUI();
 let updated;
 try{updated=mode==='live'?await updateReports('read',rows):requested;}
 finally{for(const r of rows)readPending.delete(r.id);}
 const current=new Set(reports),changed=rows.filter(r=>updated.has(r.id)&&current.has(r));
 for(const r of changed){r.read=true;mark('read',r.id);}
 if(changed.length){
  stopAmbient(boss);boss.queue=[];boss.path=[];
  enqueue(boss,walk(()=>layout.bossSeat,I18n.raw('strings.menuju_laporan')),action(()=>sit(boss)),wait(2,I18n.raw('strings.membaca_laporan')),action(()=>{boss.busy=false;}));
 }
 updateUI();
}
function markAllRead(){return markRead(reports.filter(r=>r.inTray&&!r.read).map(r=>r.id));}

function archiveTick(){
 if(!archiveJob){
  const walkMode=flowWalking(),usesSecretary=walkMode==='full';
  if(!usesSecretary||(!job&&!specialists.busy&&!v13PromptHandoff)){
   const batch=reports.filter(r=>r.read&&r.inTray&&!r.archived&&(!r.archiveFailedAt||time-r.archiveFailedAt>=10));
   if(batch.length){
    batch.forEach(r=>{r.animating=true;});
    if(usesSecretary)prepArchiveActor(secretary);
    prepArchiveActor(archivist);
    archiveJob={
     id:++archiveJobSerial,batch,mode:walkMode,usesSecretary,
     phase:'settle',startedAt:time,phaseSince:time,lastProgressAt:time,
     deadline:time+(usesSecretary?11:4.5),
     lastSec:{x:secretary.char.position.x,z:secretary.char.position.z},
     lastArch:{x:archivist.char.position.x,z:archivist.char.position.z},
     recoveries:0,saveRetries:0,handoffRetries:0,saveToken:0,saveStartedAt:0,retryAt:0
    };
   }
  }
 }
 if(!archiveJob)return;
 const j=archiveJob,secActive=j.usesSecretary&&(j.phase==='settle'||j.phase==='handoff');
 // Watchdog kemajuan: pantau pergerakan & batas fase termasuk kondisi macet yielding/resuming/antrean panjang
 const archMoved=Math.hypot(archivist.char.position.x-j.lastArch.x,archivist.char.position.z-j.lastArch.z)>.05;
 const secMoved=secActive&&Math.hypot(secretary.char.position.x-j.lastSec.x,secretary.char.position.z-j.lastSec.z)>.05;
 if(archMoved){j.lastArch={x:archivist.char.position.x,z:archivist.char.position.z};j.lastProgressAt=time;}
 if(secMoved){j.lastSec={x:secretary.char.position.x,z:secretary.char.position.z};j.lastProgressAt=time;}
 const validWait=a=>!a.yielding&&!a.resuming&&a.queue[0]?.type==='wait'&&a.queue[0].duration>0&&a.queue[0].duration<=6;
 if(validWait(archivist)||(secActive&&validWait(secretary)))j.lastProgressAt=time;
 if(archivist.lifted||(secActive&&secretary.lifted)){j.lastProgressAt=time;return;}
 const stallLimit=j.usesSecretary?4.5:2.5;
 const phaseLimit=j.phase==='saving'?6:(j.usesSecretary?7.5:3.5);
 if(time-j.lastProgressAt>stallLimit){recoverArchiveJob(j,'stall');return;}
 if(time-j.phaseSince>phaseLimit){recoverArchiveJob(j,'phase-timeout');return;}
 if(j.phase!=='saving'&&time>j.deadline){recoverArchiveJob(j,'total-timeout');return;}
 if(archivist.resuming||archivist.yielding||(secActive&&(secretary.resuming||secretary.yielding)))return;

 if(j.phase==='settle'){
  if(!j.usesSecretary){
   if(!idle(archivist))return;
   j.batch.forEach(r=>{r.inTray=false;});updateStacks();
   carry(archivist,true,0xd6b883);
   if(j.mode==='off'){
    safeArchivePlace(archivist,[archiveServerPoint(archivist),world.point('server',0),world.point('server',1)]);
    enqueue(archivist,wait(.25,I18n.raw('strings.memasukkan_arsip')));
   }else{
    enqueue(archivist,archiveWalk(()=>archiveServerPoint(archivist),I18n.raw('strings.menyimpan_ke_server'),1.1),wait(.65,I18n.raw('strings.memasukkan_arsip')));
   }
   mark('archive-pickup');mark('archive-stamp');
   setArchivePhase(j,'stamp');
  }else if(idle(secretary)&&idle(archivist)){
   enqueue(secretary,archiveWalk(()=>layout.trayApproach,I18n.raw('strings.mengambil_laporan_terbaca'),1.0),wait(.35,I18n.raw('strings.mengangkat_laporan')),action(()=>{j.batch.forEach(r=>{r.inTray=false;});carry(secretary,true,0xd6b883);updateStacks();}),archiveWalk(()=>world.point('archive-desk',1),I18n.raw('strings.membawa_laporan_ke_arsiparis'),3.4));
   enqueue(archivist,archiveWalk(()=>world.point('archive-desk',2),I18n.raw('strings.menjemput_arsip'),1.5));
   setArchivePhase(j,'handoff');mark('archive-pickup');
  }
 }else if(j.phase==='handoff'&&idle(secretary)&&idle(archivist)){
  const transferred=transfer(secretary,archivist,.9);
  if(!transferred){
   j.handoffRetries=(j.handoffRetries||0)+1;
   if(j.handoffRetries<=2){
    enqueue(secretary,archiveWalk(()=>near(secretary,archivist)||world.point('archive-desk',1),I18n.raw('strings.membawa_laporan_ke_arsiparis'),.8));
    return;
   }
   carry(secretary,false);carry(archivist,true,0xd6b883);
   safeArchivePlace(archivist,[world.point('archive-desk',2),archiveServerPoint(archivist)]);
  }
  enqueue(secretary,archiveWalk(()=>layout.secretarySeat,I18n.raw('strings.berjalan'),2.5),action(()=>{sit(secretary);secretary.busy=false;flowApplyActors();}));
  enqueue(archivist,archiveWalk(()=>layout.archivistSeat,I18n.raw('strings.berjalan'),.8),action(()=>sit(archivist)),wait(.8,I18n.raw('strings.mengecap_arsip')),archiveWalk(()=>archiveServerPoint(archivist),I18n.raw('strings.menyimpan_ke_server'),1.1),wait(.7,I18n.raw('strings.memasukkan_arsip')));
  setArchivePhase(j,'stamp');mark('archive-stamp');
 }else if(j.phase==='stamp'&&idle(archivist)&&time>=(j.retryAt||0)){
  setArchivePhase(j,'saving');
  const token=++j.saveToken;j.saveStartedAt=time;
  const finish=()=>{
   carry(archivist,false);
   j.batch.forEach(r=>{r.archived=true;r.animating=false;r.inTray=false;delete r.archiveFailedAt;});
   archived=reports.filter(r=>r.archived).length;
   archivist.busy=false;archivist.activity=I18n.raw('strings.menjaga_arsip');archivist.nextIdle=time+6;
   layout.archiveFlash=time+3;
   const dur=+(time-j.startedAt).toFixed(2);
   archiveStats.completed++;archiveStats.lastDuration=dur;archiveStats.maxDuration=Math.max(archiveStats.maxDuration,dur);
   if(j.usesSecretary&&secretary.busy&&!secretary.queue.length&&!job&&!specialists.busy){secretary.busy=false;flowApplyActors();}
   archiveJob=null;mark('archived');log(I18n.raw('strings.arsiparis_laporan_tersimpan_di_rak_server'));updateStacks();updateUI();
  };
  const pending=j.batch.filter(r=>!r.archived);
  if(mode==='demo'||!pending.length){finish();return;}
  updateReports('archive',pending).then(updated=>{
   if(archiveJob!==j||j.saveToken!==token)return;
   for(const r of pending)if(updated.has(r.id)){r.archived=true;r.animating=false;r.inTray=false;delete r.archiveFailedAt;}
   archived=reports.filter(r=>r.archived).length;
   const remaining=j.batch.filter(r=>!r.archived);
   if(!remaining.length){finish();return;}
   j.saveRetries=(j.saveRetries||0)+1;
   if(j.saveRetries<=2){setArchivePhase(j,'stamp');j.retryAt=time+1.5;scheduleSync();return;}
   recordArchiveWarning(j,'server-rejected','release-remaining');
   carry(archivist,false);
   for(const r of remaining){r.animating=false;r.inTray=!r.archived;r.archiveFailedAt=time;}
   archivist.busy=false;archivist.nextIdle=time+4;
   archiveJob=null;updateStacks();updateUI();scheduleSync();
  }).catch(()=>{
   if(archiveJob!==j||j.saveToken!==token)return;
   j.saveRetries=(j.saveRetries||0)+1;
   setArchivePhase(j,'stamp');j.retryAt=time+1.5;
  });
 }
}
function updateStacks(){for(const [id,p] of flowPendingReports){if(performance.now()-p.at>1200||flowSettings.paused||flowSettings.enabled===false){flowReleaseReport(id);continue;}const row=reports.find(r=>r.id===id);if(row&&!row.archived&&!(archiveJob&&archiveJob.batch.includes(row))){row.inTray=false;row.animating=true;}}const latestQuality=reports.filter(r=>r.inTray&&r.persona).at(-1);layout.updateReportStamp?.(latestQuality,latestQuality&&preferences.personas.find(p=>p.id===latestQuality.persona)?.name);for(const m of [...layout.stacks.children]){layout.stacks.remove(m);m.dispose?.();}const rows=reports.filter(r=>r.inTray),count=rows.length*2+residents.reduce((n,a)=>n+(a.collected||0),0);if(!count)return;const mesh=new THREE.InstancedMesh(voxelGeometry,shared,count),t=new THREE.Object3D();let index=0;for(let i=0;i<rows.length;i++){const r=rows[i];t.position.set(layout.tray.x+i%2*.035,1.34+i*.09,layout.tray.z);t.scale.set(.96,.065,.66);t.updateMatrix();mesh.setMatrixAt(index,t.matrix);mesh.setColorAt(index++,new THREE.Color(0xf4eddb));t.position.y+=.041;t.scale.y=.018;t.updateMatrix();mesh.setMatrixAt(index,t.matrix);mesh.setColorAt(index++,new THREE.Color(r.result==='escalate'?0xc56750:r.result==='pass'?0x6aab7b:providerColor(r.provider,0xd2b98c)));}for(const a of residents)for(let i=0;i<(a.collected||0);i++){t.position.set(a.desk.x+.9,1.3+i*.05,a.desk.z);t.scale.set(.36,.045,.44);t.updateMatrix();mesh.setMatrixAt(index,t.matrix);mesh.setColorAt(index++,new THREE.Color(a.color));}layout.stacks.add(mesh);}

const screenCategories=['code','terminal','video','render','doc','notes','browse','data','design','chat','audio','idle'],taskMeta=new Map();
function taskCategory(e){if(screenCategories.includes(e.category))return e.category;const text=String(e.filename||e.file||e.task||'').toLowerCase();return /render/.test(text)?'render':/video|editing|\.(mp4|mov|prproj|mkv)\b/.test(text)?'video':/audio|suara|\.(wav|mp3|flac)\b/.test(text)?'audio':/terminal|perintah|shell/.test(text)?'terminal':/\.(js|ts|py|html|css|jsx|tsx|rs|go)\b|koding|kode|coding/.test(text)?'code':/\.(csv|xlsx)|data|tabel/.test(text)?'data':/\.md|catatan|notes/.test(text)?'notes':/desain|design|\.svg/.test(text)?'design':/browse|web|mencari/.test(text)?'browse':/chat|percakapan/.test(text)?'chat':'doc';}
function applyTaskMeta(e,a){const id=e.agent||a?.id||providerFor(e),old=taskMeta.get(id)||{},category=taskCategory(e),raw=String(e.task||'').split(/[\\/]/).pop(),file=(raw.match(/[a-zA-Z0-9_.-]{1,48}\.[a-zA-Z0-9]{1,8}\b/)||[])[0],hasHint=!!e.category||!!file||/kode|perintah|koding|render|video|desain|suara|catatan/.test(String(e.task||'').toLowerCase());const next=hasHint?category:old.category||a?.category||'doc',last=next==='idle'?(old.lastCategory||a?.category||'doc'):next;const m={category:next,lastCategory:last,status:['working','thinking','idle','done','error','meeting'].includes(e.status)?e.status:old.status||'working',file:file||old.file||I18n.raw('strings.tugas_lokal')};taskMeta.set(id,m);if(a)Object.assign(a,{category:last,taskStatus:m.status,displayFile:m.file});return m;}

function drawTaskScreen(s,category,file,phase=0,boot=false){const c=s.ctx,W=512,H=256,ink='#f0f4f7',muted='#b2c2d2';I18n.begin(c);const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);},text=(str,x,y,color=ink,size=12)=>{c.fillStyle=color;let width=500-x;
 if(boot)width=368;else if(y<=23)width=310;else if(category==='code')width=x<130?122-x:y<=40?165:y>=245?360:x<165?24:303;else if(category==='video'||category==='render')width=x<120?112-x:x>=399?107:x>=183&&y<=118?170:255;else if(category==='audio')width=x<93?77-x:390;else if(category==='doc'||category==='notes')width=y<=47?470:y===184?42:category==='notes'&&y>=170?214:266;else if(category==='browse')width=y===193?133:458;else if(category==='data')width=y<=40?480:40;else if(category==='design')width=x>=399?91:x>=128?169:330;else if(category==='chat')width=x<119?99:227;
 I18n.draw(c,str,x,Math.max(2,y-size),Math.max(12,Math.min(width,500-x)),Math.max(14,size*1.25),{size,lines:1});};rect(0,0,W,H,'#111722');
 if(boot){s.displayText=I18n.raw('strings.menyalakan_komputer');text(I18n.raw('strings.menyalakan_komputer_2'),72,124,ink,18);rect(154,140,202,4,'#253745');rect(154,140,Math.min(202,phase*300),4,'#78bfb1');s.texture.needsUpdate=true;return;}
 const names={code:I18n.raw('strings.editor_kode'),terminal:I18n.raw('strings.terminal_lokal'),video:I18n.raw('strings.studio_video'),render:I18n.raw('strings.render_video'),doc:I18n.raw('strings.dokumen'),notes:I18n.raw('strings.catatan'),browse:I18n.raw('strings.peramban'),data:I18n.raw('strings.lembar_data'),design:I18n.raw('strings.kanvas_desain'),chat:I18n.raw('strings.percakapan'),audio:I18n.raw('strings.studio_audio')};
 rect(0,0,W,23,'#26313f');for(let i=0;i<3;i++)rect(10+i*12,8,6,6,['#d38378','#ddbd73','#75ad91'][i]);text(names[category]||I18n.raw('strings.tugas_lokal'),190,15,ink,11);const f=motionOff()?0:phase;
 if(category==='code'){rect(0,23,25,220,'#202c3a');rect(26,23,105,220,'#18232f');text(I18n.raw('strings.berkas'),34,42,muted,10);['▸ src','  '+file.slice(0,12),'  index.html','  style.css','▸ qa','  test.js'].forEach((t,i)=>text(t,34,64+i*20,i===1?'#e1c88f':muted,10));rect(132,23,180,24,'#293440');text(file.slice(0,23),142,39,ink,11);const rows=['const kantor = {','  tugas: "lokal",','  aktif: true','};','','function proses(data) {','  return data.map(item =>','    hitung(item));','}','','await proses(antrean);',I18n.raw('messages.codeComment')];for(let i=0;i<10;i++){const k=(i+Math.floor(f/2))%rows.length;text(String(k+1).padStart(2,' '),141,68+i*16,muted,10);text(rows[k],168,68+i*16,k%3===0?'#bc9bdc':k%3===1?'#94cda3':'#82b4e4',11);}for(let i=0;i<28;i++)rect(477,53+i*6,14+(i%4)*3,2,'#526475');rect(132,239,380,17,'#2672a5');text(I18n.raw('strings.utf_8_javascript_siap'),146,251,'#f3f9ff',10);if(Math.floor(f*2)%2===0)rect(232,119,1,12,ink);}
 else if(category==='terminal'){rect(8,30,496,215,'#080e14');const rows=[I18n.raw('messages.terminalCheck'),I18n.raw('strings.membaca_berkas_lokal'),I18n.raw('strings.modul_siap'),I18n.raw('strings.pemeriksaan_selesai'),I18n.raw('strings.3_tugas_dalam_antrean'),I18n.raw('messages.terminalRun'),I18n.raw('strings.memproses_tugas_kantor'),I18n.raw('strings.selesai_tanpa_galat')];for(let i=0;i<9;i++){const k=(i+Math.floor(f))%rows.length;text(rows[k],20,49+i*21,rows[k].startsWith('$')?'#8ed6a4':'#a8b6c6',13);}if(Math.floor(f*2)%2===0)rect(22,231,8,13,'#8ed6a4');}
 else if(category==='video'||category==='render'){rect(8,31,112,113,'#26313e');text(I18n.raw('strings.media_proyek'),16,46,muted,10);for(let i=0;i<4;i++){rect(17,56+i*20,26,15,['#81aaa5','#b6a079','#8fa7ba'][i%3]);text(I18n.raw('strings.klip')+(i+1),49,67+i*20,ink,10);}rect(132,31,255,111,'#416477');rect(147,94,226,35,'#6c9383');rect(235,48,40,41,'#d7b57e');text(I18n.raw('strings.pratinjau'),213,138,ink,9);text(I18n.raw('strings.efek_warna'),403,48,muted,10);rect(399,58,103,84,'#25313e');rect(8,153,496,96,'#1b2532');for(let i=0;i<4;i++){text(['V2','V1','A1','A2'][i],15,179+i*20,muted,10);for(let j=0;j<4;j++)rect(43+j*111+i*4,165+i*20,93-(j%2)*25,14,['#69a9b7','#ae91c6','#7eb292','#c5a77c'][i]);}rect(45+(f*19%435),156,2,89,'#edcd7e');if(category==='render'){const p=Math.floor(f*7%101);rect(152,54,217,64,'#15222e');text(I18n.raw('strings.merender')+p+'%',183,78,ink,16);rect(166,91,190,8,'#384a58');rect(166,91,p*1.9,8,'#83c4b6');}}
 else if(category==='audio'){rect(8,30,85,218,'#23313c');for(let i=0;i<5;i++){text(I18n.raw('strings.track')+(i+1),17,52+i*40,ink,11);rect(18,58+i*40,62,4,'#7fafb1');}for(let r=0;r<5;r++){rect(100,31+r*42,401,37,'#1c2a36');c.strokeStyle=['#8ccfba','#b4a2d2','#83b0db'][r%3];c.beginPath();for(let x=104;x<497;x+=3){const yy=50+r*42+Math.sin(x*.24+r)*Math.sin(x*.047)*15;c.lineTo(x,yy);}c.stroke();}rect(105+f*23%385,30,2,214,'#f1d28a');}
 else if(category==='doc'||category==='notes'){rect(0,23,512,24,'#d3dedf');text(category==='notes'?I18n.raw("strings.catatan_hari_ini"):I18n.raw('strings.berkas_edit_tata_letak'),20,39,'#35515b',11);rect(0,47,512,209,category==='notes'?'#e0d7b6':'#566878');rect(104,55,302,201,'#f2f0e7');text(category==='notes'?I18n.raw("strings.catatan_kantor"):file.slice(0,24),126,82,'#34535a',16);const rows=[I18n.raw('strings.ringkasan_kegiatan_hari_ini'),I18n.raw('strings.tugas_diproses_secara_lokal'),I18n.raw('strings.periksa_hasil_sebelum_disimpan'),'',I18n.raw('strings.langkah_berikutnya'),I18n.raw('strings.tinjau_pekerjaan'),I18n.raw('strings.simpan_laporan')];rows.forEach((r,i)=>text(r,126,107+i*18,'#56676e',11));if(category==='notes'){rect(346,167,52,57,'#e6ce87');text(I18n.raw('strings.ide'),356,184,'#6e5f3e',11);}else rect(129,240,Math.floor(f*8%180)+12,1,'#768997');}
 else if(category==='browse'){rect(0,23,512,31,'#d5dfe3');rect(57,29,398,17,'#f1f4f3');text(I18n.raw('strings.halaman_lokal_pratinjau'),74,42,'#4a5e6a',11);rect(0,54,512,202,'#f0f3ee');rect(17,68,478,41,'#426c74');text(I18n.raw('strings.pusat_informasi_kantor'),33,94,'#f0f5ee',19);for(let i=0;i<3;i++){rect(18+i*162,124,152,109,'#dde6e0');rect(28+i*162,133,132,44,['#97b7b0','#c4b691','#95aebe'][i]);text(I18n.raw('strings.artikel')+(i+1),30+i*162,193,'#3e5a63',12);for(let j=0;j<2;j++)rect(29+i*162,205+j*10,107-j*27,3,'#9aacac');}}
 else if(category==='data'){rect(0,24,512,22,'#42776a');text(I18n.raw('strings.lembar_1_rumus_grafik'),16,40,'#f1f5ee',11);rect(0,47,512,209,'#eef1e9');c.strokeStyle='#b7c8c3';for(let i=0;i<9;i++){c.beginPath();c.moveTo(i*60,47);c.lineTo(i*60,256);c.stroke();text(String.fromCharCode(65+i),i*60+23,62,'#49616b',10);}for(let j=0;j<10;j++){c.beginPath();c.moveTo(0,69+j*19);c.lineTo(512,69+j*19);c.stroke();if(j<7)for(let i=0;i<5;i++)text(String((i+2)*(j+3)*17),i*60+17,83+j*19,'#3e5b65',10);}rect(323,89,178,142,'#f5f7f1');for(let i=0;i<5;i++)rect(337+i*30,210-(i*19+27),18,i*19+27,['#629e8c','#83b7ad'][i%2]);}
 else if(category==='design'){rect(0,23,54,233,'#283644');rect(399,23,113,233,'#263441');text(I18n.raw('strings.lapisan'),410,43,muted,10);[I18n.raw('strings.bingkai'),I18n.raw('strings.judul'),I18n.raw('strings.kartu'),I18n.raw('strings.lingkaran')].forEach((t,i)=>text(t,413,67+i*25,ink,11));rect(65,34,322,210,'#4c5d6b');rect(107,51,235,172,'#eee4cb');rect(128,71,187,32,'#547f79');text(I18n.raw('strings.ide_baru'),146,94,'#faf6e9',22);rect(129,119,83,79,'#c99b77');c.fillStyle='#8ba9a0';c.beginPath();c.arc(270,157,40,0,7);c.fill();c.strokeStyle='#79c7ed';c.lineWidth=2;c.strokeRect(124,66,196,137);}
 else if(category==='chat'){rect(0,23,119,233,'#223340');text(I18n.raw('strings.tim_kantor'),13,43,muted,11);[I18n.raw('strings.umum'),I18n.raw('strings.tugas'),I18n.raw('strings.catatan')].forEach((t,i)=>text(t,18,76+i*28,ink,12));rect(121,23,391,233,'#e5ebe6');for(let i=0;i<4;i++){const x=i%2?249:140;rect(x,40+i*43,247,33,i%2?'#96bfb0':'#f6f5eb');text([I18n.raw('strings.tugas_sudah_diterima'),I18n.raw('strings.saya_periksa_dulu_ya'),I18n.raw('strings.hasil_siap_ditinjau'),I18n.raw('strings.terima_kasih')][i],x+10,61+i*43,'#36535c',12);}rect(137,223,358,22,'#faf9f0');text(Math.floor(f)%2?I18n.raw("strings.menulis"):I18n.raw('strings.pesan_untuk_tim'),149,239,'#738789',11);}
 s.displayText=(names[category]||I18n.raw('strings.tugas_lokal'))+' · '+file;s.texture.needsUpdate=true;s.draws=(s.draws||0)+1;}
// [Diubah oleh Gemini - 2026-11-20] Nyalakan monitor kubikel persona saat mengerjakan tahap alur Video Short (workflowWorking) dan monitor residen saat Prompt Bos V13 aktif (promptWorking).
function updateScreens(){for(const s of design.screens){const a=actors.find(a=>a.desk?.screen===s&&!a.hidden&&!a.removed);const atDesk=a&&a.seated&&!a.moving&&!a.lifted&&Math.hypot(a.char.position.x-a.desk.seat.x,a.char.position.z-a.desk.seat.z)<.9;const assigned=!!a&&(backgroundJobs.some(j=>j.a===a&&!j.completed&&!j.queuedInInbox)||job&&job.a===a&&job.phase==='work');const isWork=atDesk&&a.queue[0]?.type==='wait'&&(a.qualityWorking||a.qualityActive||a.workflowWorking||a.promptWorking||/mengetik|membaca tugas|membaca laporan|menggabungkan|mengecap|menulis catatan|menelepon|menyusun berkas/.test(a.activity))&&(assigned||a.promptWorking||!['idle','done'].includes(a.taskStatus));
  if(isWork){if(!s.powered){s.powered=true;s.bootAt=time;s.dirty=true;}s.lastUsed=time;}
  else if(!atDesk||time-(s.lastUsed??-100)>2.5){if(s.powered!==false){s.powered=false;s.dirty=true;}}
  if(!s.powered){if(s.dirty||!s.initialized){I18n.begin(s.ctx);s.ctx.fillStyle='#000000';s.ctx.fillRect(0,0,512,256);s.ctx.fillStyle='#294039';s.ctx.fillRect(499,246,3,2);s.texture.needsUpdate=true;s.displayText=I18n.raw('strings.mati');s.initialized=true;s.dirty=false;}continue;}
  if(time-(s.lastDraw??-100)<(motionOff()?1:.25)&&!s.dirty)continue;const pos=s.mesh.getWorldPosition(new THREE.Vector3()),p=project(pos);if((p.z< -1||p.z>1||p.x<0||p.x>stage.clientWidth||p.y<0||p.y>stage.clientHeight||isOccluded(pos,true))&&!s.dirty)continue;s.lastDraw=time;s.dirty=false;const category=screenCategories.includes(a.category)&&a.category!=='idle'?a.category:'doc';drawTaskScreen(s,category,a.displayFile||I18n.raw('strings.tugas_lokal'),motionOff()?0:time-s.bootAt,time-s.bootAt<.65);s.category=category;if(a.kind==='manager'&&a.qualityActive){const c=s.ctx;c.fillStyle='#173e45';c.fillRect(8,28,496,210);c.fillStyle='#f3dc9c';I18n.draw(c,t('v10.checking'),18,30,470,38,{size:27,min:16});for(let i=0;i<4;i++){const y=78+i*38;c.strokeStyle='#89bd9b';c.strokeRect(20,y,17,17);if((Math.floor(time)+i)%5<3){c.fillStyle='#89bd9b';c.fillRect(24,y+4,9,9);}c.fillStyle='#d8e7dc';I18n.draw(c,t(['v10.tasks','v10.inspection','v10.quality','v10.learnings'][(i+Math.floor(time/3))%4]),48,y-3,435,30,{size:23,min:14});}s.texture.needsUpdate=true;}if(a.screenGlitch>time){s.ctx.fillStyle='#d88471';s.ctx.fillRect(0,24,512,3);s.texture.needsUpdate=true;}
  if(!isWork){s.ctx.fillStyle='rgba(0,0,0,.70)';s.ctx.fillRect(0,0,512,256);s.texture.needsUpdate=true;}
 }}

// v6-C: event -> kunci residen. Cocok id agen roster, lalu provider (+ sumber/akun bila agen memetakan akun tertentu).
// null = sumber tak terdaftar: tidak membuat meja, dicatat untuk opsi "Tambahkan sebagai agen".
const unregistered=new Map();
function providerOf(e){const p=String(e.provider||'').toLowerCase();if(p&&p!=='other')return p;const s=(String(e.role||'')+' '+String(e.agent||'')).toLowerCase();return ['claude','codex','gemini','hermes','opencode'].find(x=>s.includes(x))||p||'other';}
function providerFor(e){if(!e)return null;const direct=residents.find(a=>a.id===e.agent);if(direct)return direct.id;const p=providerOf(e),list=residents.filter(a=>a.provider===p);if(!list.length)return null;const acc=typeof e.account==='string'?e.account:'';const hit=acc&&list.find(a=>a.source===acc)||list.find(a=>a.source==='auto')||(!acc?list[0]:null);return hit?hit.id:null;}
function residentFor(e){const k=providerFor(e);return k?residents[providers.indexOf(k)]:null;}
function noteUnregistered(e){const p=providerOf(e),acc=typeof e.account==='string'?e.account:'',k=p+'|'+acc,row=unregistered.get(k)||{provider:p,account:acc,count:0,last:0};row.count++;row.last=Date.now();unregistered.set(k,row);if(unregistered.size>24)unregistered.delete(unregistered.keys().next().value);}
function providerLabel(p){const list=residents.filter(a=>a.provider===p);return list.length?list.map(a=>a.name).join(' · '):({claude:'Claude',codex:'Codex',gemini:'Gemini',hermes:'Hermes',opencode:'OpenCode'})[p]||p;}
function providerColor(p,fallback=0x8aa0aa){return residents.find(a=>a.provider===p)?.color??fallback;}
// Token/biaya hari ini per residen: sumber tertentu = baris akun; otomatis = total provider dikurangi akun milik agen lain.
function rosterUsage(day){if(!day)return[];const rows=[],claimedBy=new Set();for(const a of residents){const v=day[a.provider];if(!v||v.tokens==null)continue;let tokens,cost;if(a.source!=='auto'){const s=v.accounts?.[a.source];tokens=s?.tokens||0;cost=s?s.cost_idr:0;}else{const autos=residents.filter(b=>b.provider===a.provider&&b.source==='auto');if(autos[0]!==a)continue;const claimed=residents.filter(b=>b.provider===a.provider&&b.source!=='auto').map(b=>v.accounts?.[b.source]).filter(Boolean);tokens=Math.max(0,v.tokens-claimed.reduce((s,x)=>s+(x.tokens||0),0));cost=v.cost_idr===null?null:Math.max(0,v.cost_idr-claimed.reduce((s,x)=>s+(x.cost_idr||0),0));}claimedBy.add(a.provider);rows.push({key:a.id,label:a.name,color:a.color,tokens,cost});}
 for(const [p,v] of Object.entries(day))if(!claimedBy.has(p)&&v&&v.tokens)rows.push({key:p,label:providerLabel(p),color:0x8a9aa8,tokens:v.tokens,cost:v.cost_idr,unregistered:true});return rows;}
const seen=new Set();
// [Diubah oleh Gemini - 2026-11-20] Runtime otonom V12: koreografi 3D Trader MT5 & Manajer Keuangan, alur Video Short 6 tahap (studio filming + kubikel), sinkron SSE /events & hidrasi awal.
const V12_EVENT_TYPES=new Set(['mt5_heartbeat','mt5_state','mt5_deal_closed','finance_updated','finance_update','workflow_update','workflow_deleted','workflow_config']);
const V12_STAGE_PERSONAS={brief:'project-shepherd',research:'reality-checker',script:'technical-writer',storyboard:'ui-designer',render:'short-video-editing-coach',qa_publish:'social-media-strategist'};
const V12_STAGE_CATS={brief:'doc',research:'browse',script:'notes',storyboard:'design',render:'render',qa_publish:'video'};
let v12UI=null,setupUI=null,mt5HandoffOp=null,activeShortWorkflow=null;
const mt5CloseQueue=[],seenV12Deals=new Set();
let mt5LiveState={connected:false,status:'idle',activePositions:[],activeSide:null,floatingProfit:0,currency:'USD'};
let financeSummaryState={totalIncomeIdr:0,totalLossIdr:0,netBalanceIdr:0,bySource:{mt5:0,youtube:0,affiliate:0,freelance:0,other:0},entryCount:0};
function formatTradingLabel(st){const pos=st?.activePositions?.[0],side=String(pos?.side||st?.activeSide||'BUY').toUpperCase(),sym=String(pos?.symbol||'XAUUSD'),pl=Number(st?.netFloating??st?.floatingProfit??pos?.profit??0),sign=pl>=0?'+':'-';return['Trading',side,sym,'('+sign+(st?.currency||'USD')+' '+Math.abs(pl).toFixed(2)+')'].join(' ');}
function applyFinanceSummary(summary){if(!summary||typeof summary!=='object')return;financeSummaryState={...financeSummaryState,...summary,bySource:{...financeSummaryState.bySource,...(summary.bySource||{})}};layout.financeBoard?.update(financeSummaryState);}
function applyMt5State(nextState){
 if(nextState&&typeof nextState==='object')mt5LiveState={...mt5LiveState,...nextState,activePositions:Array.isArray(nextState.activePositions)?nextState.activePositions:(Array.isArray(nextState.positions)?nextState.positions:mt5LiveState.activePositions||[])};
 const positions=mt5LiveState.activePositions||[],isTrading=mt5LiveState.status==='trading'||positions.length>0,activeSide=positions[0]?.side||mt5LiveState.activeSide||(isTrading?'BUY':null);
 layout.mt5Board?.update({...mt5LiveState,activePositions:positions,activeSide});
 layout.setMt5Beacon?.(isTrading?activeSide:mt5LiveState.connected?'connected':'idle');
 if(isTrading){
  const label=formatTradingLabel(mt5LiveState);
  mt5Trader.tradingActive=true;mt5Trader.tradingLabel=label;mt5Trader.taskStatus='working';
  if(!mt5HandoffOp){
   const seat=layout.mt5Seat,atDesk=seat&&mt5Trader.seated&&Math.hypot(mt5Trader.char.position.x-seat.x,mt5Trader.char.position.z-seat.z)<.7&&mt5Trader.busy;
   if(atDesk){mt5Trader.activity=label;if(!mt5Trader.queue.length)enqueue(mt5Trader,wait(6,label));}
   else if(flowWalking()==='fast'&&!mt5Trader.lifted&&seat){
    // [Diubah oleh Codex - 2026-11-21] Immediate telemetry projection; walking preference still available.
    stopAmbient(mt5Trader);mt5Trader.queue=[];mt5Trader.path=[];mt5Trader.char.position.set(seat.x,0,seat.z);sit(mt5Trader);mt5Trader.char.rotation.y=seat.facing||0;mt5Trader.busy=true;mt5Trader.activity=label;enqueue(mt5Trader,wait(6,label));
   }else{stopAmbient(mt5Trader);enqueue(mt5Trader,walk(()=>layout.mt5Seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(mt5Trader);mt5Trader.busy=true;mt5Trader.taskStatus='working';mt5Trader.activity=mt5Trader.tradingLabel||label;}),wait(6,label));}
   mark('mt5-trading',activeSide||'BUY');
  }
 }else{
  const wasTrading=mt5Trader.tradingActive;
  mt5Trader.tradingActive=false;mt5Trader.tradingLabel=null;
  if(!mt5HandoffOp){
   if(wasTrading||mt5Trader.busy){mt5Trader.queue=[];mt5Trader.path=[];mt5Trader.busy=false;mt5Trader.taskStatus='idle';mt5Trader.activity=I18n.raw('v12.world.mt5Idle');mt5Trader.nextIdle=time+2;}
   mark('mt5-idle','');
  }
 }
}
function handleMt5DealClosed(evt){
 if(!evt||typeof evt!=='object')return;
 const dealKey=evt.entry?.id||(evt.deal?.ticket?'ticket-'+evt.deal.ticket:null);
 if(evt.mt5||evt.summary?.mt5)applyMt5State(evt.mt5||evt.summary.mt5);
 if(dealKey){if(seenV12Deals.has(dealKey)){if(evt.summary)applyFinanceSummary(evt.summary);return;}seenV12Deals.add(dealKey);if(seenV12Deals.size>200)seenV12Deals.delete(seenV12Deals.values().next().value);}
 const profitUsd=Number(evt.deal?.net_profit??evt.deal?.profit??evt.deal?.profitUsd??evt.profitUsd??evt.entry?.amountOriginal??0);
 const rawIdr=Number(evt.entry?.amountIdr??evt.amountIdr??0),signedIdr=(evt.entry?.type==='expense'||profitUsd<0)?-Math.abs(rawIdr):Math.abs(rawIdr);
 const isProfit=profitUsd>0||(profitUsd===0&&signedIdr>0);
 const symbol=String(evt.deal?.symbol||evt.entry?.symbol||evt.symbol||'XAUUSD'),side=String(evt.deal?.side||evt.side||'BUY');
 mt5CloseQueue.push({isProfit,profitUsd,amountIdr:signedIdr,symbol,side,summary:evt.summary||null});
 mark('mt5-deal-closed',isProfit?'profit':'loss');
}
function mt5FinanceTick(){
 if(mt5Trader.tradingActive&&!mt5HandoffOp&&!mt5Trader.lifted&&!mt5Trader.yielding&&!mt5Trader.resuming&&idle(mt5Trader)){
  const seat=layout.mt5Seat,label=mt5Trader.tradingLabel||formatTradingLabel(mt5LiveState);
  if(seat&&Math.hypot(mt5Trader.char.position.x-seat.x,mt5Trader.char.position.z-seat.z)>.7)enqueue(mt5Trader,walk(()=>layout.mt5Seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(mt5Trader);mt5Trader.activity=label;}),wait(6,label));
  else{if(!mt5Trader.seated)sit(mt5Trader);enqueue(mt5Trader,wait(6,label));}
 }
 if(!mt5HandoffOp){
  if(!mt5CloseQueue.length)return;
  if(mt5Trader.lifted||mt5Trader.yielding||mt5Trader.resuming||financeManager.lifted||financeManager.yielding||financeManager.resuming)return;
  const op=mt5CloseQueue.shift(),slipColor=op.isProfit?0x58c98f:0xd96b5b;
  stopAmbient(mt5Trader);stopAmbient(financeManager);
  mt5Trader.busy=true;financeManager.busy=true;
  enqueue(financeManager,walk(()=>layout.financeSeat,I18n.raw('strings.menuju_meja')),action(()=>{sit(financeManager);financeManager.taskStatus='working';}));
  enqueue(mt5Trader,action(()=>{carry(mt5Trader,true,slipColor);mark('mt5-slip-carry',op.isProfit?'profit':'loss');}),walk(()=>layout.financeDesk?.handoff||near(mt5Trader,financeManager),I18n.raw('strings.mengantar_laporan')),action(()=>{mt5Trader.offerUntil=time+2.4;face(mt5Trader,financeManager);}),wait(1,I18n.raw('strings.menyerahkan_laporan')));
  mt5HandoffOp={...op,slipColor,phase:'approach'};return;
 }
 if(mt5Trader.lifted||mt5Trader.yielding||mt5Trader.resuming||financeManager.lifted||financeManager.yielding||financeManager.resuming)return;
 const op=mt5HandoffOp;
 if(op.phase==='approach'&&idle(mt5Trader)&&idle(financeManager)){
  if(transfer(mt5Trader,financeManager)===false){enqueue(mt5Trader,walk(()=>near(mt5Trader,financeManager),I18n.raw('strings.mengantar_laporan')));return;}
  mark('mt5-finance-handoff',op.isProfit?'profit':'loss');
  const stillTrading=mt5LiveState.status==='trading'||(mt5LiveState.activePositions?.length>0);
  if(stillTrading){
   const label=formatTradingLabel(mt5LiveState);mt5Trader.tradingActive=true;mt5Trader.tradingLabel=label;mt5Trader.taskStatus='working';
   enqueue(mt5Trader,walk(()=>layout.mt5Seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(mt5Trader);mt5Trader.busy=true;mt5Trader.activity=label;}),wait(6,label));
  }else{
   mt5Trader.tradingActive=false;mt5Trader.tradingLabel=null;
   enqueue(mt5Trader,action(()=>{mt5Trader.busy=false;mt5Trader.taskStatus='idle';mt5Trader.activity=I18n.raw('v12.world.mt5Idle');mt5Trader.nextIdle=time+2.5;}));
  }
  financeManager.taskStatus='working';
  enqueue(financeManager,wait(2.2,I18n.raw('strings.menulis_catatan')),action(()=>{if(op.summary)applyFinanceSummary(op.summary);else layout.financeBoard?.redraw();mark('finance-logged',op.isProfit?'profit':'loss');}));
  if(op.isProfit&&world.get('finance-safe')?.enabled){
   enqueue(financeManager,action(()=>carry(financeManager,true,0x58c98f)),walk(()=>world.point('finance-safe'),I18n.raw('strings.memasukkan_arsip')),wait(2,I18n.raw('strings.memasukkan_arsip')),action(()=>{carry(financeManager,false);mark('finance-safe-stored',op.symbol);}),walk(()=>layout.financeSeat,I18n.raw('strings.menuju_meja')),action(()=>sit(financeManager)),wait(1.6,I18n.raw('strings.membaca_laporan')));
  }else{
   enqueue(financeManager,action(()=>carry(financeManager,false)),wait(1.6,I18n.raw('strings.membaca_laporan')));
  }
  op.phase='record';
 }else if(op.phase==='record'&&idle(financeManager)){
  carry(financeManager,false);financeManager.busy=false;financeManager.taskStatus='idle';financeManager.activity=I18n.raw('strings.santai');financeManager.nextIdle=time+6;
  mt5HandoffOp=null;updateUI();
 }
}
function releaseWorkflowPersonas(keepId=null){
 for(const p of specialists.actors){
  if(p.id===keepId||!p.workflowWorking)continue;
  p.workflowWorking=false;p.workflowStage=null;p.workflowActivity=null;
  if(!p.qualityWorking){p.busy=false;p.taskStatus='idle';p.queue=[];p.path=[];p.activity=I18n.raw('strings.santai');p.nextIdle=time+2;}
 }
}
function handleWorkflowEvent(evt){
 if(!evt||typeof evt!=='object')return;
 if(evt.type==='workflow_deleted'){
  if(!activeShortWorkflow||activeShortWorkflow.id===evt.deletedId){releaseWorkflowPersonas(null);activeShortWorkflow=null;layout.studioBoard?.update(null);}
  return;
 }
 if(evt.type==='workflow_config')return;
 const wf=evt.workflow;if(!wf||typeof wf!=='object')return;
 activeShortWorkflow=wf;
 layout.studioBoard?.update(wf);
 // V14-A [Diubah oleh Codex - 2026-11-21] Berhenti/limit/persetujuan tidak menampilkan kerja palsu.
 if(wf.version===14&&wf.status!=='running'){releaseWorkflowPersonas(null);return;}
 const stageId=wf.currentStageId||wf.currentStage||evt.stage||evt.action?.stageId||'brief';
 const wfStatus=wf.status||'in_progress';
 if(wfStatus==='completed'||wfStatus==='ready_to_publish'){
  const finisher=specialists.actors.find(a=>a.id===V12_STAGE_PERSONAS.qa_publish&&!a.hidden&&!a.removed);
  releaseWorkflowPersonas(null);
  if(finisher){finisher.reactionText=t('v12.wfStatus.ready_to_publish');finisher.reactionUntil=time+4.5;finisher.reactionKind='drop';finisher.expression='laugh';}
  mark('v12-workflow-done',wf.id||'short');return;
 }
 const personaId=V12_STAGE_PERSONAS[stageId]||evt.persona||evt.action?.persona;
 releaseWorkflowPersonas(personaId);
 const actor=specialists.actors.find(a=>a.id===personaId&&!a.hidden&&!a.removed);
 if(!actor)return;
 const stageTitle=t('v12.stage.'+stageId);
 const statusKey=wfStatus==='awaiting_approval'?'v12.stageStatus.awaiting_approval':(wfStatus==='revision'||wfStatus==='revision_requested')?'v12.stageStatus.revision':'v12.stageStatus.running';
 const label=stageTitle+' · '+t(statusKey);
 actor.category=V12_STAGE_CATS[stageId]||'video';
 actor.displayFile=wf.title?String(wf.title).slice(0,22):I18n.raw('strings.tugas_lokal');
 actor.workflowWorking=true;actor.workflowStage=stageId;actor.workflowActivity=label;actor.taskStatus='working';
 if(actor.qualityWorking)return;
 stopAmbient(actor);
 if(stageId==='render'&&layout.studioStandPoint){
  for(const other of actors)if(other!==actor&&other.usingObject?.id==='studio-set'&&!other.busy){world.release(other);other.queue=[];other.path=[];other.nextIdle=time+.5;}
  enqueue(actor,walk(()=>layout.studioStandPoint,I18n.source('messages.toward',{place:I18n.raw('v12.world.studioSet')})),action(()=>{const sp=layout.studioStandPoint;if(sp)actor.char.rotation.y=sp.facing??-Math.PI/2;actor.seated=false;actor.activity=label;mark('v12-workflow-render-studio',actor.id);}),wait(14,label));
 }else{
  enqueue(actor,walk(()=>actor.desk?.seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(actor);actor.activity=label;if(wfStatus==='awaiting_approval'){actor.reactionText=label;actor.reactionUntil=time+6;actor.reactionKind='idle';}mark('v12-workflow-stage',stageId+':'+actor.id);}),wait(14,label));
 }
}
function v12WorkflowTick(){
 for(const a of specialists.actors){
  if(!a.workflowWorking||a.qualityWorking||a.hidden||a.removed||a.lifted||a.yielding||a.resuming||!idle(a))continue;
  const label=a.workflowActivity||t('v12.stage.'+(a.workflowStage||'brief'));
  if(a.workflowStage==='render'&&layout.studioStandPoint){
   const sp=layout.studioStandPoint;
   if(Math.hypot(a.char.position.x-sp.x,a.char.position.z-sp.z)>.7)enqueue(a,walk(()=>layout.studioStandPoint,I18n.source('messages.toward',{place:I18n.raw('v12.world.studioSet')})),action(()=>{a.char.rotation.y=sp.facing??-Math.PI/2;a.seated=false;a.activity=label;}),wait(8,label));
   else enqueue(a,wait(8,label));
  }else if(a.desk?.seat){
   if(Math.hypot(a.char.position.x-a.desk.seat.x,a.char.position.z-a.desk.seat.z)>.7)enqueue(a,walk(()=>a.desk.seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(a);a.activity=label;}),wait(8,label));
   else{if(!a.seated)sit(a);enqueue(a,wait(8,label));}
  }
 }
}
function handleDemoTrade(payload){
 if(!payload||typeof payload!=='object'||mode!=='demo')return;
 if(payload.phase==='reset'){
  mt5HandoffOp=null;mt5CloseQueue.length=0;seenV12Deals.clear();
  for(const a of [mt5Trader,financeManager]){world.release(a);a.queue=[];a.path=[];a.busy=false;a.taskStatus='idle';carry(a,false);a.nextIdle=time+3;}
  mt5Trader.tradingActive=false;mt5Trader.tradingLabel=null;
  applyMt5State(payload.mt5||{connected:false,status:'idle',activePositions:[],activeSide:null,floatingProfit:0});
  applyFinanceSummary(payload.summary||{totalIncomeIdr:0,totalLossIdr:0,netBalanceIdr:0,bySource:{mt5:0,youtube:0,affiliate:0,freelance:0,other:0},entryCount:0});
  return;
 }
 if(payload.phase==='open'){
  if(payload.summary)applyFinanceSummary(payload.summary);
  applyMt5State(payload.mt5||{connected:true,status:'trading',activePositions:payload.position?[payload.position]:[],activeSide:payload.side||'BUY',floatingProfit:payload.position?.profit||0});
  return;
 }
 if(payload.phase==='close'){handleMt5DealClosed(payload);}
}
// [Diubah oleh Gemini - 2026-11-20] Runtime otonom V13: sinkron SSE YouTube 00:00, pembaruan pemakaian Gemini, dan koreografi 3D Sekretaris -> Residen saat Prompt Bos AI langsung berjalan.
// V14-B [Diubah oleh Gemini - 2026-11-21] Tambah event Dasbor YouTube tertanam (status, ringkasan, komentar baru, peringatan login)
const V13_EVENT_TYPES=new Set(['prompt_run_started','prompt_run_chunk','prompt_run_done','youtube_analytics_updated','usage_updated','youtube_dashboard_status','youtube_dashboard_summary','youtube_new_comment','youtube_login_warning']);
let v13UI=null,youtubeUI=null,v13PromptHandoff=null;
const activePromptRuns=new Map();
function promptProviderFor(e){const raw=String(e?.residentProvider||e?.target||e?.provider||e?.agentId||e?.run?.residentProvider||e?.run?.provider||e?.run?.agentId||'').toLowerCase();if(raw==='antigravity'||raw==='gemini-api'||raw==='gemini')return 'gemini';if(raw==='opencode'||raw==='codex')return 'codex';if(raw==='hermes')return 'hermes';return 'claude';}
function handleV13PromptStart(e){
 const runId=String(e.runId||e.run?.id||('prompt-'+Date.now()));
 const provider=promptProviderFor(e);
 const target=residents.find(r=>r.provider===provider)||residents.find(r=>r.id===provider)||residents[0];
 if(!target||target.removed||target.hidden)return;
 const agentName=String(e.agentName||e.run?.agentName||e.agentId||target.name);
 const label=I18n.source('v13.world.bossPrompt',{agent:agentName});
 activePromptRuns.set(runId,{actor:target,agentName,label,startedAt:time});
 target.promptWorking=true;target.promptLabel=label;target.category='terminal';target.taskStatus='working';
 log(I18n.source('v13.promptStartedToast',{agent:target.name}));
 mark('v13-prompt-started',provider);
 if(flowWalking()!=='full'){if(!target.flowWorking)flowSeat(target);return;}
 if(!job&&!archiveJob&&!specialists.busy&&!v13PromptHandoff&&!secretary.lifted&&!target.lifted){
  stopAmbient(secretary);stopAmbient(target);
  secretary.busy=true;target.busy=true;
  enqueue(target,walk(()=>target.desk?.seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(target);target.activity=label;}));
  enqueue(secretary,action(()=>carry(secretary,true,target.color)),walk(()=>deskHandoff(target),I18n.raw('strings.membawa_kertas_tugas')),action(()=>{face(secretary,target);secretary.offerUntil=time+2.2;}),wait(1.1,I18n.raw('strings.menyerahkan_tugas')));
  v13PromptHandoff={runId,actor:target,label,phase:'deliver'};
 }else if(!target.lifted){
  stopAmbient(target);
  enqueue(target,walk(()=>target.desk?.seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(target);target.busy=true;target.activity=label;}),wait(6,label));
 }
}
function handleV13PromptDone(e){
 const runId=String(e.runId||e.run?.id||'');
 const rec=activePromptRuns.get(runId);
 if(rec)activePromptRuns.delete(runId);
 const target=rec?.actor||residents.find(r=>r.provider===promptProviderFor(e))||null;
 if(v13PromptHandoff&&v13PromptHandoff.runId===runId){
  v13PromptHandoff=null;
  if(secretary.busy&&!job&&!archiveJob){carry(secretary,false);secretary.queue=[];secretary.path=[];enqueue(secretary,walk(()=>layout.secretarySeat),action(()=>{sit(secretary);secretary.busy=false;}));}
 }
 if(target&&![...activePromptRuns.values()].some(v=>v.actor===target)){
  target.promptWorking=false;target.promptLabel=null;
  // V16-C [Diubah oleh Gemini - 2026-11-21] Jangan matikan status sibuk bila aktor masih menjalankan alur aktif lain
  if(!target.lifted&&!job&&!target.flowWorking){target.queue=[];target.path=[];target.busy=false;target.taskStatus='idle';target.activity=I18n.raw('strings.siap_menerima_tugas');target.nextIdle=time+2;}
 }
 mark('v13-prompt-done',String(e.agentId||e.provider||''));
 if(mode==='live')scheduleSync();
}
function v13PromptTick(){
 if(flowWalking()!=='full')return;
 if(v13PromptHandoff){
  const op=v13PromptHandoff,a=op.actor;
  if(secretary.lifted||secretary.yielding||secretary.resuming||a.lifted||a.yielding||a.resuming)return;
  if(op.phase==='deliver'&&idle(secretary)&&idle(a)){
   if(transfer(secretary,a)===false){enqueue(secretary,walk(()=>near(secretary,a),I18n.raw('strings.membawa_kertas_tugas')));return;}
   mark('v13-prompt-handoff',a.id);
   enqueue(secretary,walk(()=>layout.secretarySeat),action(()=>{sit(secretary);secretary.busy=false;}));
   enqueue(a,walk(()=>a.desk?.seat,I18n.raw('strings.menuju_meja')),action(()=>{carry(a,false);sit(a);a.activity=op.label;}),wait(6,op.label));
   v13PromptHandoff=null;
  }
 }
 for(const a of residents){
  if(!a.promptWorking||a.lifted||a.yielding||a.resuming||(v13PromptHandoff?.actor===a)||!idle(a))continue;
  const label=a.promptLabel||I18n.raw('strings.mengetik');
  if(a.desk?.seat&&Math.hypot(a.char.position.x-a.desk.seat.x,a.char.position.z-a.desk.seat.z)>.7){
   enqueue(a,walk(()=>a.desk.seat,I18n.raw('strings.menuju_meja')),action(()=>{sit(a);a.activity=label;}),wait(6,label));
  }else{
   if(!a.seated)sit(a);
   enqueue(a,wait(6,label));
  }
 }
}
function handleV13Event(e){
 v13UI?.handleEvent(e);
 youtubeUI?.handleEvent(e);
 if(e.type==='prompt_run_started')handleV13PromptStart(e);
 else if(e.type==='prompt_run_done')handleV13PromptDone(e);
 else if(e.type==='youtube_analytics_updated'){v13UI?.updateSidebar();if(!activeShortWorkflow)layout.studioBoard?.redraw?.();mark('v13-yt-updated',String(e.trigger||''));}
 // V14-B [Diubah oleh Gemini - 2026-11-21] Reaksi 3D untuk komentar baru & login YouTube hampir kedaluwarsa
 else if(e.type==='youtube_new_comment'){
  const ch=String(e.channelTitle||e.channel||'YouTube');
  const cnt=Number(e.count)||1;
  log(I18n.source('yt14.toastNewComment',{channel:ch,count:cnt}));
  const target=actors.find(a=>a.id==='social-media-strategist'&&!a.hidden&&!a.removed)||residents.find(r=>r.provider==='gemini')||secretary;
  if(target){target.reactionText=I18n.source('yt14.worldCommentBubble',{channel:ch,count:cnt});target.reactionUntil=time+7;target.expression='surprised';}
  mark('v14-yt-new-comment',String(e.channel||''));
 }
 else if(e.type==='youtube_login_warning'){
  const ch=String(e.channelTitle||e.channel||'YouTube');
  log(I18n.source('yt14.toastLoginWarn',{channel:ch}));
  const target=secretary||boss;
  if(target){target.reactionText=I18n.source('yt14.worldLoginBubble',{channel:ch});target.reactionUntil=time+8;target.expression='annoyed';}
  mark('v14-yt-login-warning',String(e.channel||''));
 }
 else if(e.type==='usage_updated'){scheduleSync();}
}
function handleV12Event(e){
 // [Diubah oleh Codex - 2026-11-21] Demo events never overwrite the real office projection.
 if(e.demo&&mode!=='demo')return;
 v12UI?.handleEvent(e);
 if(e.type==='mt5_state'){setupUI?.handleMt5State?.(e.state||e.mt5||e);applyMt5State(e.state||e.mt5||e);}
 else if(e.type==='mt5_deal_closed')handleMt5DealClosed(e);
 else if(e.type==='finance_updated'||e.type==='finance_update'){if(e.summary)applyFinanceSummary(e.summary);}
 else if(e.type==='workflow_update'||e.type==='workflow_deleted'||e.type==='workflow_config')handleWorkflowEvent(e);
}
async function hydrateV12(){
 if(forcedDemo||mode!=='live')return;
 try{
  const [mt5Res,sumRes,wfRes]=await Promise.all([panels.api('/mt5/status').catch(()=>null),panels.api('/finance/summary').catch(()=>null),panels.api('/workflows/shorts').catch(()=>null)]);
  if(forcedDemo||mode!=='live')return;
  if(mt5Res)applyMt5State(mt5Res);else if(sumRes?.mt5)applyMt5State(sumRes.mt5);
  if(sumRes)applyFinanceSummary(sumRes);
  if(wfRes&&Array.isArray(wfRes.workflows)){
   const active=wfRes.workflows.find(w=>!['completed','ready_to_publish'].includes(w.status))||wfRes.workflows[0]||null;
   activeShortWorkflow=active;layout.studioBoard?.update(active);
   if(active&&!['completed','ready_to_publish'].includes(active.status))handleWorkflowEvent({type:'workflow_update',workflow:active});
  }
  // V15 [Diubah oleh Gemini - 2026-11-21] Jalankan maybeAutoOpen paralel agar Pusat Setup langsung terbuka tanpa menunggu probe CLI lambat
  await Promise.all([v12UI?.refresh(),youtubeUI?.refresh(),v13UI?.refresh(),setupUI?.maybeAutoOpen?.()]);
 }catch{}
}
function clearStory(){officeFlow.clear();flowActors.clear();flowClearPendingReports();specialists.reset();mt5HandoffOp=null;mt5CloseQueue.length=0;seenV12Deals.clear();activeShortWorkflow=null;v13PromptHandoff=null;activePromptRuns.clear();mt5Trader.tradingActive=false;mt5Trader.tradingLabel=null;mt5LiveState={connected:false,status:'idle',activePositions:[],activeSide:null,floatingProfit:0,currency:'USD'};financeSummaryState={totalIncomeIdr:0,totalLossIdr:0,netBalanceIdr:0,bySource:{mt5:0,youtube:0,affiliate:0,freelance:0,other:0},entryCount:0};layout.mt5Board?.update(mt5LiveState);layout.financeBoard?.update(financeSummaryState);layout.studioBoard?.update(null);if(liftedActor)finishLift(true);job=null;archiveJob=null;jobs.length=0;backgroundJobs.length=0;reports.length=0;archived=0;totalTokens=0;costToday=null;providerToday=null;for(const a of actors){world.release(a);a.activity=a.kind==='boss'?I18n.raw("strings.menunggu_laporan"):a.kind==='secretary'?I18n.raw("strings.menunggu_panggilan"):a.kind==='archivist'?I18n.raw("strings.menjaga_arsip"):a.kind==='trader'?I18n.raw('v12.world.mt5Idle'):I18n.raw('strings.siap_menerima_tugas');a.queue=[];a.path=[];a.busy=false;a.workflowWorking=false;a.workflowStage=null;a.workflowActivity=null;a.promptWorking=false;a.promptLabel=null;a.resuming=false;a.yielding=false;a.landHeight=0;a.char.position.y=0;if(a.shadow)a.shadow.visible=false;carry(a,false);if(a.kind==='worker'){a.removed=true;a.hidden=true;a.label.remove();}}liveWorkers.clear();batchDirty=true;updateStacks();v12UI?.updateSidebar();youtubeUI?.updateSidebar();v13UI?.updateSidebar();}
function liveMode(){if(mode!=='live'){clearStory();mode='live';}autoDemo=false;}
function scheduleSync(){if(forcedDemo)return;if(syncTimer)return;syncTimer=setTimeout(()=>{syncTimer=null;syncData();},30);}
// V19 [Diubah oleh Gemini - 2026-11-21] Jaga konsistensi inTray/animating terhadap archiveJob dan flowPendingReports saat syncData()
async function syncData(){if(syncRunning){syncAgain=true;return;}syncRunning=true;try{const [r,d,st]=await Promise.all([panels.api('/reports'),panels.refreshDaily(),panels.api('/state').catch(()=>null)]);if(forcedDemo)return;liveMode();for(const event of [...(st?.agents||[])].sort((a,b)=>(a.updated_at||0)-(b.updated_at||0))){const actor=actors.find(a=>a.id===event.agent&&!a.removed)||(event.kind==='subagent'?null:residentFor(event));applyTaskMeta(event,actor);}for(const row of r.reports){const existing=reports.find(r=>r.id===row.id);const inFlowHold=flowPendingReports.has(row.id);if(existing){const animating=existing.animating,visible=existing.inTray,inArchive=!!(archiveJob&&archiveJob.batch.includes(existing));Object.assign(existing,row);if(row.archived){existing.animating=false;existing.inTray=false;delete existing.archiveFailedAt;}else if(inArchive){existing.animating=true;existing.inTray=visible;}else if(inFlowHold){existing.animating=true;existing.inTray=false;}else{existing.animating=animating&&!row.read;existing.inTray=existing.animating?visible:true;}}else reports.push({...row,inTray:!row.archived&&!inFlowHold,animating:!row.archived&&inFlowHold,deliveredAt:time});}archived=reports.filter(r=>r.archived).length;const today=d.days?.at(-1),tokens=Number(today?.tokens),cost=Number.isFinite(st?.cost_idr_today)?st.cost_idr_today:today?.cost_idr;totalTokens=Number.isFinite(tokens)?Math.max(0,tokens):0;costToday=Number.isFinite(cost)?Math.max(0,cost):null;providerToday=today?.providers||null;updateStacks();updateUI();$('connection').textContent=I18n.text(I18n.raw('strings.terhubung_lokal_laporan_tersimpan_estimasi_setara_tarif_api_bukan_tagi'));}catch(e){$('connection').textContent=I18n.text(e.message);}finally{syncRunning=false;if(syncAgain){syncAgain=false;scheduleSync();}}}
function findLiveJob(e){const matches=[job,...jobs,...backgroundJobs].filter(j=>j?.live&&!j.completed&&j.provider===providerFor(e)&&(!e.session||j.session===e.session));return matches.find(j=>!j.inbox&&!j.queuedInInbox)||matches[0];}
// V14-A [Diubah oleh Codex - 2026-11-21] Serah berkas dan inspeksi berasal dari event runner nyata.
function handleShortPipelineEvent(e){
 if(flowWalking()!=='full')return;
 const r=e.run,s=r?.stages?.[r.current];if(!s||forcedDemo)return;
 const manager=specialists.manager;
 if(e.phase==='started'&&r.current>0){
  const previous=specialists.actors.find(a=>a.id===r.stages[r.current-1].persona&&!a.hidden&&!a.removed);
  const next=specialists.actors.find(a=>a.id===s.persona&&!a.hidden&&!a.removed);
  if(previous&&next&&previous!==next&&!previous.qualityWorking){stopAmbient(previous);enqueue(previous,action(()=>carry(previous,true,previous.color)),walk(()=>near(previous,next),I18n.raw('strings.menyerahkan_laporan')),action(()=>{transfer(previous,next);carry(previous,false);carry(next,false);mark('v14-short-handoff',s.id);}),walk(()=>previous.desk.seat),action(()=>{sit(previous);if(!previous.workflowWorking&&!previous.qualityWorking)previous.busy=false;}));}
 }
 if(s.id==='qa'&&manager&&!specialists.busy){
  if(e.phase==='started'){stopAmbient(manager);manager.pipelineInspect=true;manager.taskStatus='working';mark('v14-short-qa-start',r.id);enqueue(manager,walk(()=>world.point('inspection-in')),action(()=>{carry(manager,true,manager.color);mark('v14-short-qa-inspect',r.id);}),walk(()=>manager.desk.seat),action(()=>sit(manager)),wait(5,I18n.raw('v10.checking')));}
  else if(manager.pipelineInspect){stopAmbient(manager);manager.pipelineInspect=false;carry(manager,false);manager.taskStatus='idle';enqueue(manager,walk(()=>manager.desk.seat),action(()=>{sit(manager);manager.busy=false;}));manager.reactionText=I18n.raw(e.phase==='gate'?'short14.status.awaiting_approval':'short14.status.failed');manager.reactionUntil=time+5;mark('v14-short-qa-verdict',e.phase);}
 }
}
function acceptEvent(e){if(!e||typeof e!=='object')return;
 // V16-C: metadata projection is never queued behind a walk, paper or UI dispatcher.
 if(e.type==='flow_event'){if(!forcedDemo)liveMode();officeFlow.emit(e.event);flowDrawImmediate();return;}
 if(!forcedDemo&&['call','report','spawn','retire'].includes(e.type))liveMode();
 const observedFlow=officeFlow.acceptObserved(e);
 if(['call','report','spawn','retire'].includes(e.type))flowDrawImmediate();
 if(e.type==='short_log')return;if(e.type==='short_stage'){handleShortPipelineEvent(e);return;}if(V12_EVENT_TYPES.has(e.type)){handleV12Event(e);return;}if(V13_EVENT_TYPES.has(e.type)){handleV13Event(e);return;}if(specialists.event(e))return;const provider=providerFor(e),a=actors.find(a=>a.id===e.agent&&!a.removed)||(e.kind==='subagent'||e.parent?null:residents[providers.indexOf(provider)]);applyTaskMeta(e,a);if(forcedDemo)return;liveMode();latestLive=Date.now();
 if(!provider&&!['report-read','report-archive','usage'].includes(e.type)){noteUnregistered(e);mark('unregistered',providerOf(e));scheduleSync();return;}
 if(e.type==='report-read'||e.type==='report-archive'){scheduleSync();return;}
 if(e.type==='usage'){scheduleSync();return;}
 if(flowWalking()!=='full'){
  if(e.type==='call'){mark('live-call',e.agent);mark('task-received',provider);if(preferences.followTask&&a?.desk?.seat){desired.target.set(a.desk.seat.x,1,a.desk.seat.z);desired.distance=16;}}
  if(e.type==='report'){mark('live-report',e.report_id);flowHoldReport(e.report_id,observedFlow?.flowId);}
  if(e.type==='spawn')mark('live-spawn',e.agent);if(e.type==='retire')mark('live-retire',e.agent);
  scheduleSync();return;
 }
 if(e.type==='call'){jobs.push({provider,session:e.session,agent:e.agent,live:true});mark('live-call',e.agent);}
 else if(e.type==='spawn'){if(observedFlow){scheduleSync();return;}if(!liveWorkers.has(e.agent)||liveWorkers.get(e.agent).removed){liveWorkers.set(e.agent,{id:e.agent,provider,parent:e.parent,phase:'pending',role:e.role,retired:false});mark('live-spawn',e.agent);}}
 else if(e.type==='retire'){if(observedFlow){scheduleSync();return;}const w=liveWorkers.get(e.agent);if(w)w.retired=true;mark('live-retire',e.agent);}
 else if(e.type==='report'){let j=findLiveJob(e);if(!j){j={provider,session:e.session,agent:e.agent,live:true};jobs.push(j);}j.completed=true;j.reportId=e.report_id;j.tokens=e.tokens;const bi=backgroundJobs.indexOf(j);if(bi>=0){if([...liveWorkers.values()].some(w=>w.provider===j.provider&&!w.removed))j.pendingReport=true;else{backgroundJobs.splice(bi,1);j.resume=true;jobs.push(j);}}mark('live-report',e.report_id);}
 else if(e.kind!=='subagent'){let j=findLiveJob(e);if(!j&&e.status!=='done'&&e.status!=='idle'){j={provider,session:e.session,agent:e.agent,live:true};jobs.push(j);}}
 scheduleSync();
}
function workerTick(){for(const w of liveWorkers.values()){
 const leader=residents[providers.indexOf(w.provider)];if(!leader){if(w.phase!=='orphan'){if(w.actor&&!w.actor.removed){w.actor.queue=[];w.actor.path=[];w.actor.busy=true;enqueue(w.actor,walk(()=>layout.entry,I18n.raw('strings.pulang_lewat_pintu')),action(()=>{w.actor.hidden=true;w.actor.removed=true;w.actor.label.remove();batchDirty=true;}));}w.phase='orphan';}continue;}if(leader.lifted||leader.resuming||leader.yielding||w.actor?.lifted||w.actor?.resuming||w.actor?.yielding)continue;
 if(w.phase==='pending'){const busy=[...liveWorkers.values()].some(v=>v!==w&&v.provider===w.provider&&!['pending','work','exit','removed'].includes(v.phase));const used=actors.filter(a=>a.kind==='worker'&&!a.removed).map(a=>a.slot),slot=layout.projects.findIndex((d,i)=>!used.includes(i));if(busy||slot<0||(!idle(leader)&&leader.queue[0]?.activity!==I18n.raw('strings.mengetik'))||job&&job.a===leader&&job.phase!=='work')continue;
 const a=createActor(w.id,(({Researcher:I18n.raw('strings.peneliti'),Designer:I18n.raw('strings.perancang'),'Backend Dev':I18n.raw('strings.pengembang_server'),'Frontend Dev':I18n.raw('strings.pengembang_antarmuka'),'Full-Stack Dev':I18n.raw('strings.pengembang'),'QA Engineer':I18n.raw('strings.penguji'),DevOps:I18n.raw('strings.operasional'),Pentester:I18n.raw('strings.penguji_keamanan'),'Project Manager':I18n.raw('strings.koordinator')})[w.role]||I18n.raw('strings.pekerja'))+' '+(slot+1),layout.entry.x,layout.entry.z,leader.color,'short','worker');if(actors.some(b=>b!==a&&!b.hidden&&!b.removed&&!b.lifted&&Math.hypot(b.char.position.x-layout.entry.x,b.char.position.z-layout.entry.z)<.85)){a.hidden=true;a.removed=true;a.label.remove();batchDirty=true;continue;}a.slot=slot;const meta=taskMeta.get(w.id);if(meta)Object.assign(a,{category:meta.lastCategory,taskStatus:meta.status,displayFile:meta.file});else a.category=leader.category;a.parent=leader.name;a.busy=true;a.desk=layout.projects[slot];w.actor=a;stopAmbient(leader);enqueue(leader,walk(()=>world.point('entry',1),I18n.raw('strings.menyambut_pekerja')));enqueue(a,walk(()=>world.point('entry',2),I18n.raw('strings.masuk_lewat_pintu')));w.phase='brief';mark('worker-entry',w.id);
 }else if(w.phase==='brief'&&idle(leader)&&idle(w.actor)){carry(leader,true,leader.color);transfer(leader,w.actor);enqueue(w.actor,walk(()=>w.actor.desk.seat,I18n.raw('strings.membawa_tugas_ke_meja_proyek')),action(()=>{carry(w.actor,false);sit(w.actor);}));enqueue(leader,walk(()=>leader.desk.seat),action(()=>{sit(leader);if(!job||job.a!==leader)leader.busy=false;}));w.phase='work';mark('worker-task',w.id);
 }else if(w.phase==='work'){if(idle(w.actor))enqueue(w.actor,wait(2,I18n.raw('strings.mengetik')));if(w.retired&&(idle(leader)||leader.queue[0]?.activity===I18n.raw('strings.mengetik'))&&![...liveWorkers.values()].some(v=>v!==w&&v.provider===w.provider&&['return','brief'].includes(v.phase))){w.actor.queue=[];w.actor.path=[];carry(w.actor,true,leader.color);stopAmbient(leader);enqueue(w.actor,walk(()=>near(w.actor,leader),I18n.raw('strings.membawa_laporan_ke_pemimpin')),wait(.8,I18n.raw('strings.menyerahkan_laporan')));w.phase='return';}}
 else if(w.phase==='return'&&idle(w.actor)){transfer(w.actor,leader);carry(leader,false);leader.collected=(leader.collected||0)+1;if(!job||job.a!==leader)leader.busy=false;enqueue(w.actor,walk(()=>layout.entry,I18n.raw('strings.pulang_lewat_pintu')),action(()=>{w.actor.hidden=true;w.actor.removed=true;w.actor.label.remove();w.removed=true;w.phase='removed';batchDirty=true;mark('retire',w.id);}));w.phase='exit';mark('worker-report',w.id);updateStacks();}
 }}
// [Diubah oleh Gemini - 2026-11-20] Panggil hydrateV12() saat boot live dan perluas kamera, batas pan/zoom, sudut gedung, serta 13 preset zona V12 (48x32 m + Teras Barat).
function connect(){source?.close();if(forcedDemo||location.protocol==='file:')return;liveMode();specialists.hydrate();hydrateV12();syncData();source=new EventSource(location.origin+'/events');source.addEventListener('open',()=>{void flowHydrate();scheduleSync();});source.addEventListener('state',()=>scheduleSync());source.addEventListener('office-event',message=>{try{const e=JSON.parse(message.data),id=e.event_revision||e.revision;if(id&&seen.has(id))return;if(id){seen.add(id);if(seen.size>2000)seen.delete(seen.values().next().value);}acceptEvent(e);}catch(e){log(I18n.raw('strings.event_lokal_tidak_dapat_ditampilkan'));}});source.onerror=()=>{$('connection').textContent=I18n.text(I18n.raw('strings.server_lokal_belum_tersambung_pilih_demo_untuk_simulasi'));};}
// Kamera bebas: target dunia independen, orbit, pan tanah dan zoom ke kursor.
const cam={yaw:.67,tilt:1.08,distance:62,target:new THREE.Vector3(-2,0,0)},desired={yaw:.67,tilt:1.08,distance:62,target:new THREE.Vector3(-2,0,0)};
const keys=Settings.held,raycaster=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
let selectedActor=null,hoverActor=null,touring=false,lowWalls=false;
function clampTarget(){desired.target.x=THREE.MathUtils.clamp(desired.target.x,-76,76);desired.target.z=THREE.MathUtils.clamp(desired.target.z,-64,64);desired.target.y=THREE.MathUtils.clamp(desired.target.y,0,42);}
try{const c=JSON.parse(localStorage.getItem('office-v4b-camera'));if(c&&c.target?.length===3&&[c.yaw,c.tilt,c.distance,...c.target].every(Number.isFinite)){desired.yaw=c.yaw;desired.tilt=THREE.MathUtils.clamp(!c.version&&c.yaw===.67&&c.tilt===.75&&c.distance===56?1.08:c.tilt,.0873,1.536);desired.distance=THREE.MathUtils.clamp(c.distance,.6,140);desired.target.fromArray(c.target);clampTarget();}}catch{}
function saveCamera(){try{localStorage.setItem('office-v4b-camera',JSON.stringify({...desired,version:4,target:desired.target.toArray()}));}catch{}}
const presets={iso:[.67,1.08,62,-2,0,0],top:[0,1.536,62,-2,0,0],front:[0,.73,64,-2,0,0],back:[Math.PI,.73,64,-2,0,0],left:[-Math.PI/2,.73,72,-2,0,0],right:[Math.PI/2,.73,72,-2,0,0],boss:[2.18,.57,6.8,-18.5,1.30,-11.42],server:[-.52,.58,10.5,18.0,1.0,-11.8],engineering:[.62,.66,13.5,-17.0,1.0,1.5],studio:[2.38,.62,14.5,-17.6,1.0,12.0],quality:[-.62,.64,14.5,17.2,1.0,-1.6],mt5:[-2.05,.58,15.5,18.0,1.0,9.8],terrace:[-.85,.62,15.0,-25.8,.9,7.2]};
// v5/v12: preset gedung menyesuaikan rasio/ukuran jendela supaya seluruh gedung 48x32 m + Teras Barat masuk layar.
const fitCam=new THREE.PerspectiveCamera(42,1,.1,800),buildingCorners=[];for(const x of [worldBounds.minX-.2,worldBounds.maxX+.2])for(const z of [worldBounds.minZ-.2,worldBounds.maxZ+.2])for(const y of [0,3.8])buildingCorners.push(new THREE.Vector3(x,y,z));
function fitDistance(yaw,tilt,target){const W=stage.clientWidth,H=stage.clientHeight;if(!W||!H)return 62;fitCam.fov=camera.fov;fitCam.aspect=W/H;fitCam.updateProjectionMatrix();const m={l:24,r:24,t:Math.min(110,H*.15),b:Math.min(126,H*.18)};let lo=6,hi=260;for(let i=0;i<28;i++){const d=(lo+hi)/2;fitCam.position.set(target.x+Math.sin(yaw)*Math.cos(tilt)*d,target.y+Math.sin(tilt)*d,target.z+Math.cos(yaw)*Math.cos(tilt)*d);fitCam.lookAt(target);fitCam.updateMatrixWorld();const ok=buildingCorners.every(c=>{const v=c.clone().project(fitCam),x=(v.x*.5+.5)*W,y=(-.5*v.y+.5)*H;return v.z<1&&x>=m.l&&x<=W-m.r&&y>=m.t&&y<=H-m.b;});if(ok)hi=d;else lo=d;}return hi;}
function preset(name,instant=false){actors.forEach(a=>a.occlusionDue=0);const p=[...(presets[name]||presets.iso)];if(['iso','top','front','back','left','right'].includes(name)||!presets[name]){p[3]=(worldBounds.minX+worldBounds.maxX)/2;p[5]=(worldBounds.minZ+worldBounds.maxZ)/2;p[2]=fitDistance(p[0],p[1],new THREE.Vector3(p[3],p[4],p[5]));}desired.yaw=p[0];desired.tilt=p[1];desired.distance=p[2];desired.target.set(p[3],p[4],p[5]);if(instant){cam.yaw=desired.yaw;cam.tilt=desired.tilt;cam.distance=desired.distance;cam.target.copy(desired.target);}saveCamera();}
function focus(point){desired.target.copy(point);desired.distance=Math.min(desired.distance,8);clampTarget();saveCamera();}
function cameraFrame(dt){
 const step=Math.min(dt,.1)*(keys.has('fast')?18:6)*preferences.camera.keyboardSpeed,right=Number(keys.has('right'))-Number(keys.has('left')),forward=Number(keys.has('forward'))-Number(keys.has('backward'));
 if(right||forward||keys.has('up')||keys.has('down')){desired.target.x+=(Math.cos(cam.yaw)*right-Math.sin(cam.yaw)*forward)*step;desired.target.z+=(-Math.sin(cam.yaw)*right-Math.cos(cam.yaw)*forward)*step;desired.target.y+=(Number(keys.has('up'))-Number(keys.has('down')))*step;clampTarget();}
 if(touring&&!document.querySelector('dialog[open]'))desired.yaw+=Math.min(dt,.1)*.12;
 const k=preferences.camera.smoothing===0?1:1-Math.exp(-dt*(18-20*preferences.camera.smoothing+4*preferences.camera.smoothing));cam.yaw+=(desired.yaw-cam.yaw)*k;cam.tilt+=(desired.tilt-cam.tilt)*k;cam.distance+=(desired.distance-cam.distance)*k;cam.target.lerp(desired.target,k);
 camera.position.set(cam.target.x+Math.sin(cam.yaw)*Math.cos(cam.tilt)*cam.distance,Math.max(.4,cam.target.y+Math.sin(cam.tilt)*cam.distance),cam.target.z+Math.cos(cam.yaw)*Math.cos(cam.tilt)*cam.distance);camera.lookAt(cam.target);camera.updateMatrixWorld();
 // Hanya saat lensa tepat di bidang dinding: cegah sayatan near clip.
 for(const w of layout.walls){const tangent=w.axis==='z'?'x':'z';w.nearCamera=Math.abs(camera.position[w.axis]-w[w.axis])<.3&&Math.abs(camera.position[tangent]-w[tangent])<w.length/2+.2&&camera.position.y<w.height+.15;w.group.visible=!w.nearCamera;w.group.scale.y=lowWalls?.25:1;}
}
function project(p){const v=p.clone().project(camera);return{x:(v.x*.5+.5)*stage.clientWidth,y:(-.5*v.y+.5)*stage.clientHeight,z:v.z};}
function resize(){
 const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
 const ratio=preferences.appearance.economy?1:Math.min(devicePixelRatio||1,2,Math.sqrt(8294400/(w*h)));
 if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
 renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
}
const pointers=new Map();let drag=null,pinch=null,singleClickTimer=null;
const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute("aria-label",I18n.text(I18n.raw('strings.kamera_kantor_tahan_dan_seret_karakter_dengan_klik_kiri_saat_pemetaan_')));
function floorPoint(x,y,height=0){const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);ground.constant=-height;return raycaster.ray.intersectPlane(ground,new THREE.Vector3());}
function pan(dx,dy){[dx,dy]=Settings.vector('pan',dx,dy);const scale=2*cam.distance*Math.tan(camera.fov*Math.PI/360)/stage.clientHeight;desired.target.x+=(-Math.cos(cam.yaw)*dx+Math.sin(cam.yaw)*dy)*scale;desired.target.z+=(Math.sin(cam.yaw)*dx+Math.cos(cam.yaw)*dy)*scale;clampTarget();}
// [Diubah oleh Gemini - 2026-11-20] Perluas jarak zoom maksimum ke 140 dan batas drag-angkat karakter ke 48x32 m + Teras Barat.
function zoomAt(x,y,factor){const anchor=floorPoint(x,y,cam.target.y),old=desired.distance;desired.distance=THREE.MathUtils.clamp(old*factor,.6,140);if(preferences.camera.zoomCursor&&anchor&&anchor.distanceTo(cam.target)<240)desired.target.add(anchor.sub(cam.target).multiplyScalar(1-desired.distance/old));clampTarget();}
function visibleActorAt(x,y){const r=canvas.getBoundingClientRect();return actors.filter(a=>!a.hidden&&!a.removed).map(a=>{const head=a.char.userData.head.getWorldPosition(new THREE.Vector3()),p=project(head);return{a,head,p,d:Math.hypot(p.x-(x-r.left),p.y-(y-r.top))};}).filter(o=>o.p.z>-1&&o.p.z<1&&o.d<28&&!isOccluded(o.head)).sort((a,b)=>a.d-b.d)[0]?.a||null;}
// v6-B: hit-test karakter mengikuti instansi voxel yang benar-benar terlihat.
let liftedActor=null,liftTimer=null;
function actorHit(x,y){
 const r=canvas.getBoundingClientRect();
 raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);
 for(const hit of raycaster.intersectObjects(figureBatches,false)){
  const actor=hit.object.userData.drawn?.[hit.instanceId]?.actor;
  if(actor&&!isOccluded(hit.point,true))return actor;
 }
 return null;
}
const reactionLines={work:[I18n.raw('strings.eh_lagi_ngerjain_tugas_nih'),I18n.raw('strings.sebentar_belum_disimpan'),I18n.raw('strings.kursinya_ikut_boleh')],coffee:[I18n.raw('strings.waduh_kopinya'),I18n.raw('strings.cangkirku_miring'),I18n.raw('strings.kopi_terbang_aku_juga')],play:[I18n.raw('strings.skornya_jadi_berantakan'),I18n.raw('strings.bolanya_ke_mana'),I18n.raw('strings.giliran_siapa_sekarang')],smoke:[I18n.raw('strings.abunya_hampir_jatuh'),I18n.raw('strings.aku_matikan_dulu_ya'),I18n.raw('strings.terbang_tanpa_asap')],chat:[I18n.raw('strings.obrolannya_belum_selesai'),I18n.raw('strings.teman_teman_aku_terbang'),I18n.raw('strings.nanti_ceritanya_dilanjut')],paper:[I18n.raw('strings.kertasnya_ikut_terbang'),I18n.raw('strings.laporannya_jangan_jatuh'),I18n.raw('strings.aku_pegang_erat_erat')],idle:[I18n.raw('strings.wah_naik_lift_pribadi'),I18n.raw('strings.pelan_pelan_bos'),I18n.raw('strings.lantainya_jauh_juga')],boss:[I18n.raw('strings.bos_sedang_inspeksi_udara'),I18n.raw('strings.wah_kantor_terlihat_rapi'),I18n.raw('strings.parkirkan_saya_yang_nyaman')],drop:[I18n.raw('strings.mendarat_lanjut_dulu_ya'),I18n.raw('strings.oke_kembali_ke_kegiatan'),I18n.raw('strings.kaki_sudah_di_lantai_lagi')]};
function react(a,drop=false){const kind=drop?'drop':a.kind==='boss'?'boss':a.carrying?'paper':/mengetik|tugas/.test(a.activity)?'work':/kopi|teh/.test(a.activity)?'coffee':/tenis|dart/.test(a.activity)?'play':/merokok/.test(a.activity)?'smoke':a.chat?'chat':'idle';const opts=reactionLines[kind];let line=opts[Math.floor(random()*opts.length)];if(line===a.lastReaction)line=opts[(opts.indexOf(line)+1)%opts.length];a.lastReaction=line;a.reactionText=a.dragCount>=4&&!drop?I18n.raw("strings.cukup_aku_pusing"):line;a.reactionUntil=time+4.5;a.reactionKind=kind;a.expression=a.dragCount>=4?'dizzy':({work:'annoyed',coffee:'surprised',paper:'surprised',play:'angry',chat:'laugh',boss:'laugh',smoke:'resigned',drop:'laugh'})[kind]||'surprised';if(a.chat){const b=a.chat.a===a?a.chat.b:a.chat.a;b.reactionText=I18n.raw('strings.hahaha_hati_hati_di_atas');b.reactionUntil=time+3;b.expression='laugh';face(b,a);}a.screenGlitch=kind==='work'?time+.7:0;}
function beginLift(a,e){if(!a||a.hidden||a.removed||liftedActor)return;clearTimeout(singleClickTimer);liftedActor=a;selectedActor=a;a.dragCount=time-(a.lastDragged??-100)<12?(a.dragCount||0)+1:1;a.lastDragged=time;a.liftSaved={position:a.char.position.clone(),rotation:a.char.rotation.y,seated:a.seated,queue:a.queue,busy:a.busy,usingObject:a.usingObject,activity:a.activity};a.queue=[{type:'lift'}];a.path=[];a.lifted=true;a.seated=false;a.liftGround=a.char.position.clone();a.liftPointer=e.pointerId;react(a);if(!a.shadow){a.shadow=voxelBox(layout.dynamic,[.7,.012,.45],[0,.06,0],0x7c8170);batchDirty=true;}a.shadow.visible=true;document.body.classList.add('agent-dragging');moveLift(e);}
function animateLift(a){const t=motionOff()?0:time;animateVoxelChar(a.char,'idle',false,false,t,a.phase);const u=a.char.userData;a.char.rotation.y=Math.atan2(a.char.position.x-camera.position.x,a.char.position.z-camera.position.z);u.body.rotation.z=motionOff()?0:Math.sin(t*3)*.1;u.legs.forEach((l,i)=>{l.leg.rotation.x=Math.sin(t*4+i)*.18;l.shin.rotation.x=-.2;});u.arms.forEach((arm,i)=>{arm.rotation.z=(i?1:-1)*.9;arm.rotation.x=a.carrying&&i===1?1.2:0;});a.paper.visible=a.carrying;u.mug.visible=a.reactionKind==='coffee';a.char.position.y=motionOff()?1.2:1.5+Math.sin(t*2)*.07;a.shadow.position.set(a.char.position.x,.06,a.char.position.z);reactVoxelChar(a.char,a.expression,t,a.reactionKind);}
function moveLift(e){if(!liftedActor)return;const p=floorPoint(e.clientX,e.clientY,1.5);if(p){const a=liftedActor;a.char.position.x=THREE.MathUtils.clamp(p.x,worldBounds.minX+.5,worldBounds.maxX-.5);a.char.position.z=THREE.MathUtils.clamp(p.z,worldBounds.minZ+.5,worldBounds.maxZ-.5);a.liftGround.set(a.char.position.x,0,a.char.position.z);animateLift(a);a.occlusionDue=0;}updateBatch();labels();}
function landingPoint(p,a){if(!a.liftSaved.busy){const allowed=['coffee','water','play_pong','play_dart','read','smoke','sit'];for(const o of [...world.items.values()].filter(o=>o.enabled&&Math.hypot(o.node.position.x-p.x,o.node.position.z-p.z)<1.1)){for(const affordance of allowed)if(o.affordances[affordance]){const v=chooseObject(a,affordance,o.id);if(v)return {...v.point,dropObject:o.id,dropAffordance:affordance};}}}const candidates=[...reachableNodes.values()].filter(q=>!occupiedGoal(q,a)).sort((u,v)=>Math.hypot(u.x-p.x,u.z-p.z)-Math.hypot(v.x-p.x,v.z-p.z));return candidates[0]||{x:a.liftSaved.position.x,z:a.liftSaved.position.z};}
function finishLift(cancel=false){clearTimeout(liftTimer);if(!liftedActor)return;const a=liftedActor,s=a.liftSaved,point=landingPoint(cancel?s.position:a.liftGround,a);a.char.position.set(point.x,0,point.z);a.char.rotation.y=s.rotation;a.lifted=false;liftedActor=null;a.shadow.visible=false;a.char.userData.body.rotation.z=0;a.queue=[...s.queue,...a.queue.filter(q=>q.type!=='lift')];a.busy=s.busy;a.seated=false;a.path=[];for(const q of a.queue)if(q.type==='walk')q.started=false;const duty=s.busy||s.queue.some(q=>q.type==='walk'&&/tugas|laporan|arsip|pintu/.test(q.activity||''));
 if(duty){a.resuming=true;const back=landingPoint(s.position,a),target=!a.carrying&&a.desk&&/mengetik|menggabungkan/.test(s.activity)?()=>a.desk.seat:()=>back;a.queue.unshift(walk(target,I18n.raw('strings.kembali_melanjutkan_tugas')),action(()=>{a.resuming=false;a.seated=s.seated;a.activity=s.activity;}));}
 else {world.release(a);a.queue=[];a.chat=null;a.nextIdle=time+2;const nearUse=world.available('sit',a).find(v=>Math.hypot(v.point.x-point.x,v.point.z-point.z)<.7&&!blocked(v.point.x,v.point.z));if(point.dropObject)useObject(a,point.dropAffordance,point.dropObject,8);else if(nearUse)useObject(a,'sit',nearUse.object.id,6);}
 a.landAt=time;a.landHeight=!cancel&&!motionOff()?1.5:0;a.char.position.y=a.landHeight;if(a.shadow){a.shadow.visible=a.landHeight>0;a.shadow.position.set(point.x,.06,point.z);}a.landing={x:point.x,z:point.z,valid:!blocked(point.x,point.z),cancel};react(a,true);if(a.carrying)a.pickupUntil=time+.8;if(a.dragCount>=4){a.sulkUntil=time+(motionOff()?.5:2.5);a.reactionText=I18n.raw('strings.cukup_istirahat_sebentar');a.expression='annoyed';}a.occlusionDue=0;document.body.classList.remove('agent-dragging');if(drag)drag.moved=100;updateBatch();labels();}

canvas.oncontextmenu=e=>e.preventDefault();
canvas.onpointerdown=e=>{e.preventDefault();pressHover=hoverState.target&&Math.hypot(hoverState.x-e.clientX,hoverState.y-e.clientY)<6?hoverState.target:null;hideHover();keys.clear();document.body.classList.add('camera-dragging');pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);drag={px:e.clientX,py:e.clientY,action:Settings.mouseAction(e),plain:!e.ctrlKey&&!e.shiftKey&&!e.altKey,button:e.button,moved:0};if(e.button===0&&drag.plain&&drag.action==='orbit'){drag.actor=actorHit(e.clientX,e.clientY);if(drag.actor)liftTimer=setTimeout(()=>{if(drag?.actor)beginLift(drag.actor,e);},200);}if(pointers.size===2){const p=[...pointers.values()];pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),angle:Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x),x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};}};
canvas.onpointermove=e=>{if(liftedActor){moveLift(e);return;}if(drag?.actor&&Math.hypot(e.clientX-drag.px,e.clientY-drag.py)>5){clearTimeout(liftTimer);beginLift(drag.actor,e);return;}if(!pointers.has(e.pointerId)||!drag){hoverState.pending={x:e.clientX,y:e.clientY};return;}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),angle=Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x),x=(p[0].x+p[1].x)/2,y=(p[0].y+p[1].y)/2;if(pinch){zoomAt(x,y,pinch.distance/Math.max(distance,1));pan(x-pinch.x,y-pinch.y);desired.yaw-=Math.atan2(Math.sin(angle-pinch.angle),Math.cos(angle-pinch.angle));}pinch={distance,angle,x,y};drag.moved=100;return;}const dx=e.clientX-drag.px,dy=e.clientY-drag.py;drag.moved+=Math.abs(dx)+Math.abs(dy);drag.px=e.clientX;drag.py=e.clientY;if(drag.action==='pan')pan(dx,dy);else if(drag.action==='orbit'){const [x,y]=Settings.vector('orbit',dx,dy);desired.yaw-=x*.006;desired.tilt=THREE.MathUtils.clamp(desired.tilt+y*.005,.0873,1.536);}else if(drag.action==='zoom')zoomAt(e.clientX,e.clientY,Math.exp(dy*.01*preferences.camera.zoomSpeed));};
canvas.onpointerup=e=>{clearTimeout(liftTimer);if(liftedActor)finishLift();if(drag&&drag.moved<6&&drag.button===0&&drag.plain){clearTimeout(singleClickTimer);singleClickTimer=setTimeout(()=>pick(e,false),230);}pointers.delete(e.pointerId);pinch=null;if(!pointers.size){drag=null;document.body.classList.remove('camera-dragging');}else if(drag){const p=[...pointers.values()][0];drag.px=p.x;drag.py=p.y;drag.moved=100;}saveCamera();};
canvas.onpointercancel=e=>{clearTimeout(liftTimer);finishLift(true);pointers.delete(e.pointerId);drag=null;pinch=null;document.body.classList.remove('camera-dragging');};canvas.ondblclick=e=>{e.preventDefault();clearTimeout(singleClickTimer);if(!e.ctrlKey&&!e.shiftKey&&!e.altKey)pick(e,true);};
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(e.deltaY*.001*preferences.camera.zoomSpeed*(preferences.camera.scrollInvert?-1:1)));saveCamera();},{passive:false});
window.addEventListener('blur',()=>{clearTimeout(liftTimer);finishLift(true);pointers.clear();drag=null;pinch=null;document.body.classList.remove('camera-dragging');});
let lastPick=null,pressHover=null;function pick(e,double){// Klik menjalankan apa yang ditunjukkan kartu hover saat tombol ditekan (kamera bisa sedikit bergeser sesudahnya).
 const pressed=pressHover&&Math.hypot(hoverState.x-e.clientX,hoverState.y-e.clientY)<6?pressHover:null;pressHover=null;if(!double&&pressed?.action){lastPick={x:e.clientX,y:e.clientY,hover:pressed.object?.id||pressed.actor?.id||"stacks",pressed:true};pressed.action();return;}
 const actor=visibleActorAt(e.clientX,e.clientY);lastPick={x:e.clientX,y:e.clientY,actor:actor?.id||null,double};if(actor){selectedActor=actor;if(double)focus(actor.char.position.clone().add(new THREE.Vector3(0,1,0)));else showActor(actor);return;}
 if(double){const p=floorPoint(e.clientX,e.clientY);if(p){focus(p);}return;}
 {const h=hoverPick(e.clientX,e.clientY);lastPick.hover=h?(h.object?.id||h.actor?.id||"stacks"):null;if(h&&h.action){h.action();return;}}
 const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;const best=layout.clicks.map(c=>({...c,p:project(c.point)})).map(c=>({...c,d:Math.hypot(c.p.x-mx,c.p.y-my)})).filter(c=>c.p.z>-1&&c.p.z<1&&c.d<30&&!isOccluded(c.point)).sort((a,b)=>a.d-b.d)[0];if(best)openPanel(best.kind);
}

// v6-C: hover/mouseover. Benda = item registri dunia (kotak voxel tanpa karpet) + tumpukan laporan; karakter = instansi voxel.
// Raycast dibatasi ~30 Hz, hanya saat pointer bergerak, tidak saat orbit/seret/pinch/modal. Sorotan = 1 garis kotak (1 draw call).
const hoverTip=document.createElement('div');hoverTip.id='hoverTip';hoverTip.className='hover-tip';hoverTip.setAttribute('role','tooltip');hoverTip.hidden=true;for(const [tag,cls] of [['b','ht-name'],['span','ht-status'],['small','ht-hint']]){const e=document.createElement(tag);e.className=cls;hoverTip.append(e);}document.body.append(hoverTip);
const hoverLines=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:0xffd27a,transparent:true,opacity:.9,depthTest:false}));hoverLines.renderOrder=999;hoverLines.visible=false;scene.add(hoverLines);
const hoverBoxes=new Map(),lastUse=new Map(),hoverState={pending:null,last:0,target:null,since:0,shown:false,x:0,y:0,count:0};
{const reserve=world.reserve.bind(world);world.reserve=(choice,actor,affordance)=>{lastUse.set(choice.object.id,{at:Date.now(),affordance,actor:actor.name});return reserve(choice,actor,affordance);};}
function objectBox(o){const k=o.version+':'+world.revision,c=hoverBoxes.get(o.id);if(c&&c.k===k)return c.box;const box=new THREE.Box3();o.node.updateWorldMatrix(true,true);o.node.traverse(m=>{if(m.isMesh&&!m.userData.noHit&&m.geometry){m.geometry.boundingBox||m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));}});hoverBoxes.set(o.id,{k,box});return box;}
const usersOf=o=>[...new Set(o.usePoints.flatMap(p=>[...p.users]))].map(id=>actors.find(a=>a.id===id&&!a.removed)?.name).filter(Boolean);
const ago=at=>Math.max(0,Math.round((Date.now()-at)/60000));
function tokenText(a){const r=mode==='demo'?null:rosterUsage(providerToday||{}).find(r=>r.key===a.id);return r?fmtTokShort(r.tokens):'n/a';}
function sessionsOf(a){let n=0;for(const [id,m] of taskMeta)if(['working','thinking'].includes(m.status)&&(id===a.id||actors.some(b=>b.id===id&&!b.removed&&(b===a||b.parent===a.name))||residentFor({agent:id,provider:id.replace(/^(main|sub)-/,'').split('-')[0]})===a))n++;return n;}
function deskOwner(o){return residents.find(a=>a.desk?.objectId===o.id)||actors.find(a=>!a.removed&&a.desk?.objectId===o.id);}
function categoryName(c){return t('hover.category.'+(screenCategories.includes(c)?c:'doc'));}
function describeActor(a){const role=a.kind==='resident'?[a.provider,a.agent?.account].filter(Boolean).join(' · '):a.kind==='worker'?t('hover.workerOf',{name:a.parent||''}):null;
 const lines=[I18n.text(activityText(a))];if(a.kind==='persona')lines.push(t('v10.department.'+a.department),t('v10.engine',{engine:a.engine}));if(a.kind==='resident'||a.kind==='worker')lines.push(t('hover.actorWork',{category:categoryName(a.category),tokens:a.kind==='resident'?tokenText(a):'—',sessions:a.kind==='resident'?sessionsOf(a):1}));
 return {name:I18n.text(a.name),role,status:lines.join(' · '),hint:t('hover.hintActor'),actor:a,box:new THREE.Box3().setFromObject(a.char),action:()=>showActor(a)};}
// [Diubah oleh Gemini - 2026-11-20] Tambah tooltip & aksi klik 3D untuk zona MT5, Keuangan, Studio Video Short, Meja Manajer Mutu, coffee-2, dan water-cooler.
function describeObject(o){const name=I18n.text(o.type),users=usersOf(o),busy=users.length?t('hover.usedBy',{names:users.join(', ')}):t('hover.available');let status=busy,hint=t('hover.hintFocus'),action=()=>focus(objectBox(o).getCenter(new THREE.Vector3())),title=name;
 if(/^desk-\d$/.test(o.id)){const a=residents.find(r=>r.desk?.objectId===o.id);title=a?t('hover.deskOf',{name:a.name}):name;status=a?t('hover.deskStatus',{category:categoryName(a.category),file:a.displayFile||I18n.text(I18n.raw('strings.tugas_lokal')),tokens:tokenText(a)}):t('hover.available');if(a){hint=t('hover.hintDesk');action=()=>showActor(a);}}
 else if(o.id.startsWith('persona-desk-')||/^project-\d$/.test(o.id)||['boss-desk','secretary-desk','archive-desk','quality-manager-desk'].includes(o.id)){const a=deskOwner(o);status=a?t('hover.usedBy',{names:a.name})+' · '+I18n.text(activityText(a)):t('hover.available');if(a){hint=t('hover.hintDesk');action=()=>showActor(a);}}
 else if(['mt5-desk','mt5-desk-ret','mt5-board','mt5-beacon'].includes(o.id)){const trading=mt5LiveState.status==='trading'||(mt5LiveState.activePositions?.length>0);status=trading?formatTradingLabel(mt5LiveState):t('v12.world.mt5Idle');hint=t('v12.world.hintMt5');action=()=>v12UI?.openFinance('mt5');}
 else if(['finance-desk','finance-safe','finance-board'].includes(o.id)){status=t('v12.world.financeNet')+': '+I18n.moneyIDR(financeSummaryState.netBalanceIdr||0,{maximumFractionDigits:0});hint=t('v12.world.hintFinance');action=()=>v12UI?.openFinance('finance');}
 else if(['studio-set','studio-board','studio-greenscreen'].includes(o.id)){const stg=activeShortWorkflow?.currentStageId||activeShortWorkflow?.currentStage;status=activeShortWorkflow?.title?(activeShortWorkflow.title+' · '+t('v12.stage.'+(stg||'brief'))):t('v12.world.studioIdle');hint=t('v12.world.hintShorts');action=()=>v12UI?.openShorts();}
 else if(o.id==='quality-kanban'||o.id==='learning-cabinet'||o.id==='inspection'){hint=t('v10.quality');action=()=>qualityUI.open();}
 else if(o.id==='server'){status=t('hover.vault');hint=t('hover.hintVault');action=()=>openPanel('server');}
 else if(o.id==='tray'){const n=reports.filter(r=>!r.read&&r.inTray).length;status=t('hover.unread',{count:n});hint=t('hover.hintReports');action=()=>openPanel('reports');}
 else if(o.id==='daily-board'){status=t('hover.dailyCost',{cost:mode==='demo'||costToday===null?'n/a':fmtRp(costToday),tokens:fmtTokShort(totalTokens||0)});hint=t('hover.hintDaily');action=()=>openPanel('daily');}
 else if(o.id==='inbox'){status=t('hover.queue',{count:jobs.length+(job?1:0)});}
 else if(o.id==='phone'){status=job&&['phone','settle'].includes(job.phase)?t('hover.usedBy',{names:secretary.name}):t('hover.phoneIdle');}
 else if(o.id==='entry'){status=t('hover.inside',{count:actors.filter(a=>!a.hidden&&!a.removed).length});}
 else if(/^plant-|^atrium-island$/.test(o.id)){const u=lastUse.get(o.id);status=(users.length?busy+' · ':'')+(u&&u.affordance==='water'?t('hover.watered',{minutes:ago(u.at)}):t('hover.notWatered'));}
 else if(['coffee','coffee-2','fridge','water-cooler'].includes(o.id)){const u=lastUse.get(o.id);if(!users.length&&u)status=t('hover.lastUsed',{name:u.actor,minutes:ago(u.at)});}
 return {name:title,status,hint,object:o,box:objectBox(o),action};}
function describeStacks(){if(!layout.stacks.children.length)return null;const box=new THREE.Box3().setFromObject(layout.stacks);if(box.isEmpty())return null;const n=reports.filter(r=>r.inTray&&!r.archived).length;return {name:t('hover.stacks'),status:t('hover.stacksStatus',{count:n}),hint:t('hover.hintReports'),box,action:()=>openPanel('reports')};}
const hoverPoint=new THREE.Vector3();
function hoverPick(x,y,objectsOnly=false){const a=!objectsOnly&&(actorHit(x,y)||visibleActorAt(x,y));if(a&&!a.hidden&&!a.removed)return describeActor(a);const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);const ray=raycaster.ray;const hits=[];
 // Kumpulkan semua kotak yang kena; benda kecil di atas/di dalam benda besar (baki di meja bos, telepon) didahulukan.
 const consider=(get,box)=>{if(!box||box.isEmpty())return;if(!ray.intersectBox(box,hoverPoint))return;const d=hoverPoint.distanceTo(ray.origin);if(!isOccluded(hoverPoint.clone(),true))hits.push({get,box,d});};
 for(const o of world.items.values())if(o.enabled&&!['stretch'].includes(o.id))consider(()=>describeObject(o),objectBox(o));
 if(layout.stacks.children.length)consider(describeStacks,new THREE.Box3().setFromObject(layout.stacks));if(!hits.length)return null;hits.sort((p,q)=>p.d-q.d);const vol=b=>{const v=b.getSize(hoverPoint);return v.x*v.y*v.z;};let best=hits[0];for(const h of hits.slice(1))if(h.d-best.d<2.5&&h.box.intersectsBox(best.box)&&vol(h.box)<vol(best.box)*.35)best=h;return best.get();}
function hoverBlocked(){return !!(drag||pinch||liftedActor||document.querySelector('dialog[open]')||document.body.classList.contains('camera-dragging'));}
function hideHover(){hoverState.target=null;hoverState.shown=false;hoverState.pending=null;hoverTip.classList.remove('show');hoverTip.hidden=true;hoverLines.visible=false;if(canvas.style.cursor)canvas.style.cursor='';hoverActor=null;}
function placeTip(){const W=innerWidth,H=innerHeight,m=8,tw=hoverTip.offsetWidth,th=hoverTip.offsetHeight,target=hoverState.target;let x=hoverState.x+16,y=hoverState.y+18;
 // Jangan menutup benda: pakai proyeksi kotaknya, taruh kartu di sisi yang kosong.
 let rect=null;if(target?.box&&!target.box.isEmpty()){const b=target.box,ps=[];for(const px of [b.min.x,b.max.x])for(const py of [b.min.y,b.max.y])for(const pz of [b.min.z,b.max.z]){const p=project(new THREE.Vector3(px,py,pz)),cr=canvas.getBoundingClientRect();ps.push({x:p.x+cr.left,y:p.y+cr.top});}rect={l:Math.min(...ps.map(p=>p.x)),r:Math.max(...ps.map(p=>p.x)),t:Math.min(...ps.map(p=>p.y)),b:Math.max(...ps.map(p=>p.y))};if(rect.r-rect.l>W*.6||rect.b-rect.t>H*.6)rect=null;}
 const over=(x,y)=>rect&&x<rect.r&&x+tw>rect.l&&y<rect.b&&y+th>rect.t;
 const options=[[x,y],rect&&[rect.r+12,Math.min(Math.max(m,hoverState.y-th/2),H-th-m)],rect&&[rect.l-tw-12,Math.min(Math.max(m,hoverState.y-th/2),H-th-m)],rect&&[hoverState.x-tw/2,rect.t-th-12],rect&&[hoverState.x-tw/2,rect.b+12],[hoverState.x-tw-16,hoverState.y-th-18]].filter(Boolean);
 let pick=options.find(([px,py])=>px>=m&&py>=m&&px+tw<=W-m&&py+th<=H-m&&!over(px,py))||options[0];x=Math.min(Math.max(m,pick[0]),W-tw-m);y=Math.min(Math.max(m,pick[1]),H-th-m);hoverTip.style.left=Math.round(x)+'px';hoverTip.style.top=Math.round(y)+'px';hoverState.rect=rect;hoverState.tip={x,y,w:tw,h:th};}
function fillTip(h){const n=hoverTip.querySelector('.ht-name'),s=hoverTip.querySelector('.ht-status'),k=hoverTip.querySelector('.ht-hint');n.textContent=h.role?h.name+' · '+h.role:h.name;if(s.textContent!==h.status)s.textContent=h.status;const L=h.object&&layoutEditor?.state?.active?layoutEditor.lockInfo(h.object.id):null;k.textContent=L?L.text:h.hint;k.classList.toggle('lock-note',!!L?.locked);}
function hoverFrame(){if(layoutEditor?.frame())return;hoverLines.material.color.setHex(0xffd27a);const now=performance.now();if(hoverBlocked()){if(hoverState.target||hoverState.shown)hideHover();return;}
 if(hoverState.pending&&now-hoverState.last>=33){const p=hoverState.pending;hoverState.pending=null;hoverState.last=now;hoverState.count++;hoverState.x=p.x;hoverState.y=p.y;const h=hoverPick(p.x,p.y),key=h?(h.actor?.id||h.object?.id||'stacks'):null;
  if(key!==(hoverState.key||null)){hoverState.key=key;hoverState.since=now;hoverState.shown=false;hoverTip.classList.remove('show');hoverTip.hidden=true;}hoverState.target=h;hoverActor=h?.actor||null;canvas.style.cursor=h?(h.actor?'grab':'pointer'):'';}
 const h=hoverState.target;if(!h){hoverLines.visible=false;return;}
 // Status diperbarui tiap ~0,5 dtk saat kartu tampil (kegiatan/token berubah).
 if(hoverState.shown&&now-(hoverState.refresh||0)>500){hoverState.refresh=now;const fresh=h.actor?describeActor(h.actor):h.object?describeObject(h.object):describeStacks();if(fresh){hoverState.target=fresh;fillTip(fresh);}}
 const box=(h.actor?new THREE.Box3().setFromObject(h.actor.char):h.box);if(box&&!box.isEmpty()){box.getCenter(hoverLines.position);box.getSize(hoverLines.scale).addScalar(.08);hoverLines.visible=true;}
 if(!preferences.appearance.tooltips)return;if(!hoverState.shown&&now-hoverState.since>=preferences.appearance.tooltipDelay){hoverState.shown=true;fillTip(h);hoverTip.hidden=false;placeTip();requestAnimationFrame(()=>hoverTip.classList.add('show'));hoverState.refresh=now;}else if(hoverState.shown)placeTip();}
canvas.addEventListener('pointerleave',hideHover);canvas.addEventListener('wheel',hideHover,{passive:true});window.addEventListener('blur',hideHover);
const occlusionRay=new THREE.Ray(),occlusionHit=new THREE.Vector3();
function isOccluded(point,wallsOnly=false){const distance=camera.position.distanceTo(point);occlusionRay.set(camera.position,point.clone().sub(camera.position).normalize());return layout.occluders.some(o=>{if(o.owner&&!o.owner.enabled||o.wall?.nearCamera||wallsOnly&&!o.wall)return false;if(lowWalls&&o.wall){const box=o.box.clone();box.max.y*=.25;box.min.y*=.25;const hit=occlusionRay.intersectBox(box,occlusionHit);return hit&&camera.position.distanceTo(hit)<distance-.16;}const hit=occlusionRay.intersectBox(o.box,occlusionHit);return hit&&camera.position.distanceTo(hit)<distance-.16;});}
// [Diubah oleh Gemini - 2026-11-20] Tampilkan label aktivitas Trading MT5, alur Video Short, dan status siaga Trader MT5 secara jelas.
function activityText(a){
 if(a.lifted)return I18n.raw('strings.sedang_diangkat');if(a.receiveUntil>time)return t('v10.receiving');
 const raw=a.activity;
 if(a.moving){if(raw&&raw!==I18n.raw('strings.berjalan'))return raw;const q=a.queue.find(q=>q.type==='walk'),g=q?.goalPoint;let dest=I18n.raw('strings.tujuan');if(g){dest=world.get(g.objectId)?.type.toLowerCase()||I18n.raw('strings.tujuan_kantor');}return I18n.source(a.carrying?'messages.carryTo':'messages.walkTo',{place:dest});}
 if(a.tradingActive&&a.tradingLabel)return a.tradingLabel;
 if(a.workflowWorking&&a.workflowActivity)return a.workflowActivity;
 if(a.promptWorking&&a.promptLabel)return a.promptLabel;
 if(raw===I18n.raw('strings.berbincang')&&a.chat)return I18n.source('messages.chatWith',{name:a.chat.a===a?a.chat.b.name:a.chat.a.name});
 if(a.kind==='persona'&&raw===I18n.raw('strings.mengetik')&&a.taskNumber)return I18n.source('v10.workingTask',{n:a.taskNumber});
  if(raw===I18n.raw('strings.mengetik'))return I18n.source('messages.workingFile',{file:a.displayFile||I18n.raw('strings.tugas_kantor')});
 if(raw===I18n.raw('strings.merokok_animasi'))return I18n.raw('strings.merokok_di_teras');
 if(raw===I18n.raw('strings.santai')||raw===I18n.raw('strings.berjalan'))return a.kind==='boss'?I18n.raw("strings.menunggu_laporan"):a.kind==='secretary'?I18n.raw("strings.menunggu_panggilan"):a.kind==='archivist'?I18n.raw("strings.menjaga_arsip"):a.kind==='trader'?I18n.raw('v12.world.mt5Idle'):I18n.raw('strings.siap_menerima_tugas');
 return raw;
}
function labels(){
 const now=performance.now(),rects=[];for(const sel of ['header','.top-controls','.controls','#officeMenu','#notify','#trayBadge']){const e=stage.querySelector(sel);if(e&&e.offsetWidth){const r=e.getBoundingClientRect(),sr=stage.getBoundingClientRect();rects.push({x:r.x-sr.x,y:r.y-sr.y,w:r.width,h:r.height});}}
 const intersects=(a,b)=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
 const ordered=actors.filter(a=>!a.hidden&&!a.removed).map((a,index)=>{const head=a.char.userData.head.localToWorld(new THREE.Vector3(0,.3,0)),p=project(head),foot=project(a.char.position),distance=camera.position.distanceTo(head);return{a,index,head,p,distance,pixels:Math.max(Math.hypot(foot.x-p.x,foot.y-p.y),1.9*stage.clientHeight/(2*Math.tan(camera.fov*Math.PI/360)*distance))};});
 ordered.sort((a,b)=>Number(b.a===selectedActor||b.a===hoverActor)-Number(a.a===selectedActor||a.a===hoverActor)||Number(b.a.moving||b.a.busy)-Number(a.a.moving||a.a.busy)||a.distance-b.distance);
 // v5: status label dihitung dulu lalu diterapkan SEKALI per frame. Dulu label disetel opacity 0 -> reflow (offsetWidth) -> 1
 // setiap frame, sehingga transisi opacity 150 ms terus diulang dan label tidak pernah terlihat di jendela nyata.
 const show=(a,on)=>{if(a.labelOn===on)return;a.labelOn=on;a.label.style.visibility=on?'visible':'hidden';a.label.style.opacity=on?'1':'0';a.label.dataset.visible=String(on);};
 for(const a of actors)if(a.hidden||a.removed)show(a,false);
 for(const {a,index,p,distance,pixels}of ordered){
  const hovered=a===hoverActor,active=a.moving||a.busy||a===selectedActor||hovered;
  const labelMode=preferences.appearance.labels,offscreen=p.z<=-1||p.z>=1||p.x<0||p.x>stage.clientWidth||p.y<0||p.y>stage.clientHeight;
  const text=activityText(a),near=pixels>=Math.max(32,stage.clientHeight*.073);
  a.labelMetric={id:a.id,head:{x:p.x,y:p.y,z:p.z},pixels,distance,occluded:false,offscreen,full:false,visible:false,activity:text};
  if(offscreen||labelMode==='off'||!hovered&&!near||labelMode==='active'&&!active){show(a,false);continue;}
  if(!a.occlusionDue||now>=a.occlusionDue){
   a.occluded=isOccluded(a.char.userData.head.getWorldPosition(new THREE.Vector3()),true);a.occlusionDue=now+90+(index%5)*5;
  }
  a.labelMetric.occluded=a.occluded;
  if(a.occluded&&!hovered){show(a,false);continue;}
  const showActivity=labelMode!=='name',line=a.label.querySelector('.activity-line');
  if(a.labelAct!==showActivity){a.labelAct=showActivity;a.label.classList.toggle('name-only',!showActivity);line.hidden=!showActivity;}
  if(a.nameplateColor!==a.color){a.nameplateColor=a.color;a.label.style.setProperty('--actor-color','#'+new THREE.Color(a.color).getHexString());}
  const reaction=a.reactionText&&time<a.reactionUntil?a.reactionText:a.chat&&time-a.chat.start<18?a.chat.lines[a.chat.a===a?0:1]:null;
  const activity=I18n.text(reaction||text);
  if(line.textContent!==activity)line.textContent=activity;
  a.label.classList.toggle('show-meta',hovered&&showActivity);
  const w=a.label.offsetWidth,h=a.label.offsetHeight;
  const x=Math.max(4,Math.min(stage.clientWidth-w-4,p.x-w/2));
  const candidates=[{x,y:p.y-h-9,w,h},{x,y:p.y-h-24,w,h}];
  if(hovered)candidates.push({x,y:p.y+9,w,h});
  const found=candidates.find(r=>r.y>=4&&r.y+r.h<=stage.clientHeight-4&&!rects.some(o=>intersects(r,o)));
  if(!found){show(a,false);continue;}
  a.label.style.left=found.x+'px';a.label.style.top=found.y+'px';a.label.style.transform='none';
  a.label.style.setProperty('--lead',Math.round(Math.max(0,p.y-found.y-h))+'px');
  a.label.style.setProperty('--lead-x',Math.round(Math.max(6,Math.min(w-6,p.x-found.x))-w/2)+'px');
  show(a,true);rects.push(found);
  Object.assign(a.labelMetric,{full:true,visible:true,label:found,anchorDistance:Math.hypot(found.x+w/2-p.x,found.y+h-p.y),bubble:showActivity});
 }
 const unread=reports.filter(r=>!r.read&&r.inTray).length,point=layout.tray.clone().add(new THREE.Vector3(0,1.2+reports.filter(r=>r.inTray).length*.06,0)),p=project(point);$('trayBadge').hidden=!unread||p.z<=-1||p.z>=1||p.x<0||p.x>stage.clientWidth||p.y<80||p.y>stage.clientHeight-120||isOccluded(point);$('trayBadge').textContent=t('messages.unread',{count:unread});$('trayBadge').style.left=Math.max(4,Math.min(stage.clientWidth-$('trayBadge').offsetWidth-4,p.x-65))+'px';$('trayBadge').style.top=p.y+'px';
}

const rosterRows=new Map();
function updateRoster(){const current=actors.filter(a=>!a.hidden&&!a.removed);for(const [id,row]of rosterRows)if(!current.some(a=>a.id===id)){row.remove();rosterRows.delete(id);}for(const a of current){let row=rosterRows.get(a.id);if(!row){row=document.createElement('div');row.className='row';const b=document.createElement('button');b.className='person';const dot=document.createElement('i');dot.className='avatar';dot.setAttribute('aria-hidden','true');dot.style.setProperty('--actor-color','#'+new THREE.Color(a.color).getHexString());dot.textContent=I18n.text(a.name.trim()[0].toUpperCase());const name=document.createElement('span');name.className='who';name.textContent=I18n.text(a.name);const tag=document.createElement('em');tag.className='status-chip';const small=document.createElement('small');b.append(dot,name,tag,small);b.onclick=()=>{selectedActor=a;focus(a.char.position.clone().add(new THREE.Vector3(0,1,0)));};row.append(b);rosterRows.set(a.id,row);$('roster').append(row);}
 // [Diubah oleh Gemini - 2026-11-20] Tampilkan status 'kerja' di roster untuk Trader MT5 aktif, persona tahap alur Video Short, dan residen Prompt Bos V13.
 row.querySelector('.who').textContent=I18n.text(a.name);const status=a.moving?'moving':a.activity===I18n.raw('strings.berbincang')?'meeting':(a.activity.includes(I18n.raw('strings.mengetik'))||a.tradingActive||a.workflowWorking||a.promptWorking)?'working':a.busy?'busy':'idle';if(row.dataset.status!==status||row.dataset.locale!==I18n.language){row.dataset.status=status;row.dataset.locale=I18n.language;row.querySelector('.status-chip').textContent=I18n.text({moving:I18n.raw('strings.jalan'),meeting:I18n.raw('strings.ngobrol'),working:I18n.raw('strings.kerja'),busy:I18n.raw('strings.sibuk'),idle:I18n.raw('strings.santai')}[status]);}const t=I18n.text(activityText(a)),sm=row.querySelector('small');if(sm.textContent!==t)sm.textContent=t;}}
// V16-C [Diubah oleh Gemini - 2026-11-21] Header status mengikuti alur aktif dan fase paket kembali (termasuk indikator titik hijau aktif) agar tidak menampilkan "Kantor santai" saat garis/paket sedang berjalan
function flowActiveSummary(){
 const active=flowSnapshot.find(f=>f.status==='working');
 if(active)return {busy:true,text:(flowMap?.providers[active.provider]?.label||active.provider)+' \u00b7 '+t('flow16.status.working')};
 const returningPackets=(flowRenderer?.stats?.().packets||0)>0||flowPendingReports.size>0;
 if(returningPackets){
  const recent=flowSnapshot.find(f=>f.endedAt!==null)||flowSnapshot[0];
  const pLabel=recent?(flowMap?.providers[recent.provider]?.label||recent.provider):t('flow16.role.agent');
  return {busy:true,text:pLabel+' \u00b7 '+t('flow16.result')};
 }
 if(activePromptRuns.size){
  const first=activePromptRuns.values().next().value;
  return {busy:true,text:(first?.agentName||t('flow16.role.agent'))+' \u00b7 '+t('flow16.status.working')};
 }
 return null;
}
function statusText(){const fStatus=flowActiveSummary();if(fStatus)return fStatus.text;const q=specialists.debug().phase;if(q)return (actors.find(a=>a.id===q.persona)?.name||t('v10.personas'))+' · '+t('v10.quality');const unread=reports.filter(r=>!r.read&&r.inTray).length;if(job)return job.a.name+' · '+activityText(job.a);if(archiveJob)return I18n.raw('strings.arsiparis_mengarsipkan_laporan_terbaca');if(unread)return I18n.source('messages.waiting',{count:unread});return I18n.raw('strings.kantor_santai_menunggu_panggilan_bos');}
function updateUI(){
 $('quickReadAll').disabled=!reports.some(r=>r.inTray&&!r.read&&!readPending.has(r.id));$('tokenLabel').textContent=t(mode==='demo'?'strings.token_simulasi':'strings.token_hari_ini');const unread=reports.filter(r=>!r.read&&r.inTray).length;countUp($('unread'),unread,fmtInt);if(unread>lastUnread){trayShake=time+.9;if(!motionOff()){const c=$('trayCard');c.classList.remove('new');void c.offsetWidth;c.classList.add('new');}}lastUnread=unread;$('trayCard').classList.toggle('has-unread',unread>0);$('archived').textContent=I18n.text(archived);countUp($('tokens'),totalTokens,fmtInt);
 const live=mode!=='demo';countUp($('cost'),live?costToday:null,fmtRp);$('costNote').textContent=I18n.text(live?I18n.raw("strings.estimasi_setara_tarif_api_bukan_tagihan"):I18n.raw('strings.biaya_dihitung_di_mode_live'));$('tokenCard').classList.remove('loading');
 const mini=$('providerMini'),rows=live&&providerToday?rosterUsage(providerToday).filter(r=>r.tokens).map(r=>[r.key,{tokens:r.tokens,cost_idr:r.cost,label:r.label,color:r.color}]):[],sig=I18n.language+preferences.currency+JSON.stringify(rows.map(([p,v])=>[p,v.tokens,v.cost_idr,v.label,v.color]));if(mini.dataset.sig!==sig){mini.dataset.sig=sig;if(!rows.length&&live){const p=document.createElement('p');p.className='empty-note';p.textContent=I18n.text(I18n.raw('strings.belum_ada_pemakaian_tercatat_hari_ini'));mini.replaceChildren(p);}else{const max=Math.max(1,...rows.map(([,v])=>v.tokens));mini.replaceChildren(...rows.sort((x,y)=>y[1].tokens-x[1].tokens).map(([p,v])=>{const r=document.createElement('div');r.className='pm-row';const n=document.createElement('span');n.textContent=v.label;const bar=document.createElement('i');bar.style.setProperty('--w',(v.tokens/max*100).toFixed(1)+'%');bar.style.setProperty('--actor-color','#'+new THREE.Color(v.color??0x8aa).getHexString());const val=document.createElement('b');val.textContent=I18n.text(fmtTokShort(v.tokens)+' · '+(v.cost_idr===null?'n/a':fmtRp(v.cost_idr)));r.append(n,bar,val);return r;}));}}
 const st=I18n.text(statusText());if($('storyText').textContent!==st)$('storyText').textContent=st;$('story').dataset.busy=String(!!(job||archiveJob||flowActiveSummary()?.busy));$('workers').textContent=I18n.text(actors.filter(a=>a.kind==='worker'&&!a.hidden&&!a.removed).length+' / 8');$('mode').textContent=I18n.text(mode==='demo'?I18n.raw("strings.demo_simulasi"):I18n.raw('strings.live_data_nyata'));$('clock').textContent=I18n.text(I18n.time(new Date()));
 updateRoster();$('activity').replaceChildren(...events.slice(0,4).map(e=>{const p=document.createElement('p');p.textContent=I18n.text(e.text);return p;}));}
let panelTrigger=null;
function dialog(title){if(!$('panel').open)panelTrigger=document.activeElement;keys.clear();$('panelTitle').textContent=I18n.text(title);$('panelContent').replaceChildren();$('panel').scrollTop=0;if(!$('panel').open)$('panel').showModal();}
// [Diubah oleh Gemini - 2026-11-21] Tutup semua panel termasuk Pusat Setup & Settings agar modal tidak bertumpuk
function closeAllPanels(){qualityUI.close();panels.close();setupUI?.close();v12UI?.close();youtubeUI?.close();v13UI?.close();if(typeof settingsUI!=='undefined'&&settingsUI.isOpen())settingsUI.close();}
function focusPreset(zone){preset(zone);if($('preset')&&[...$('preset').options].some(o=>o.value===zone))$('preset').value=zone;}
function showActor(a){closeAllPanels();selectedActor=a;dialog(a.name);const p=document.createElement('p');p.textContent=I18n.text((a.kind==='boss'?I18n.raw("strings.anda_adalah_bos_kantor"):a.kind==='worker'?I18n.raw('strings.pekerja_sementara_pemimpin')+a.parent+'. ':I18n.raw('strings.penghuni_tetap_kantor'))+a.activity+'.');$('panelContent').append(p);}
function drawDaily(d){const changed=dailyData?.days.at(-1).date!==d.days.at(-1).date;dailyData=d;if(changed&&!archivist.busy&&!archiveJob){stopAmbient(archivist);enqueue(archivist,walk(()=>world.point('daily-board')),wait(2,I18n.raw('strings.menempel_laporan_harian')),action(()=>{archivist.busy=false;}));mark('daily-board',d.days.at(-1).date);}const day=d.days.at(-1),c=layout.board.ctx;I18n.begin(c);c.fillStyle='#243f47';c.fillRect(0,0,512,256);const line=(value,x,y,w,h,size=22,color='#f5eddb')=>{c.fillStyle=color;return I18n.draw(c,value,x,y,w,h,{size,lines:1});};
 line(t('messages.headingToday',{date:I18n.date(day.date+'T12:00:00',{dateStyle:'medium'})}),16,12,480,32,25,'#ebc983');line(t('messages.tokens',{count:day.tokens??0}),16,48,480,31,25);line(t('messages.estimated',{value:I18n.moneyIDR(day.cost_idr)}),16,85,480,27,20);
 let y=118;for(const r of rosterUsage(day.providers).filter(r=>r.tokens!==null).slice(0,4)){line(r.label+': '+I18n.number(r.tokens),16,y,232,23,18);y+=24;}const max=Math.max(1,...d.days.map(r=>r.tokens||0));for(let i=0;i<d.days.length;i++){const r=d.days[i],h=(r.tokens||0)/max*95;c.fillStyle='#9cc4aa';c.fillRect(258+i*34,215-h,23,Math.max(2,h));line(I18n.number(Number(r.date.slice(8))),258+i*34,216,28,16,11);}line(t('strings.setara_api_bukan_tagihan_langganan'),16,235,480,18,13,'#ebc983');layout.board.texture.needsUpdate=true;}
const panels=OfficePanels.create({dialog,preset,reports:()=>reports,markRead,markAllRead,isDemo:()=>mode==='demo',onDaily:drawDaily,label:(p,acc)=>{const r=acc&&residents.find(a=>a.provider===p&&a.source===acc);return r?r.name:providerLabel(p);}});
function openPanel(kind){if(kind==='setup'){setupUI?.openSetup();return;}if(kind==='mt5'){v12UI?.openFinance('mt5');return;}if(kind==='finance'){v12UI?.openFinance('finance');return;}if(kind==='analytics'){v12UI?.openFinance('analytics');return;}if(kind==='shorts'){v12UI?.openShorts();return;}if(kind==='youtube'){youtubeUI?youtubeUI.openYoutube():v13UI?.openYoutube();return;}if(kind==='prompt'){v13UI?.openPrompt();return;}qualityUI.close();setupUI?.close();v12UI?.close();youtubeUI?.close();v13UI?.close();panels.open(kind);}
$('panel').addEventListener('close',()=>{if(!$('panel').open){panels.close();setupUI?.close();v12UI?.close();youtubeUI?.close();v13UI?.close();if(document.activeElement===document.body||$('panel').contains(document.activeElement))panelTrigger?.focus();}});
{
 const trigger=$('officeMenuButton'),menu=$('officeMenu');
 const setMenu=(open,focus=false)=>{
  menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
  if(open)hideHover();
  if(focus)trigger.focus();
 };
 trigger.onclick=()=>setMenu(menu.hidden);
 document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!trigger.contains(e.target)&&!menu.contains(e.target))setMenu(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden&&!e.defaultPrevented){e.preventDefault();setMenu(false,true);}});
 document.addEventListener('focusin',e=>{if(!menu.hidden&&!trigger.contains(e.target)&&!menu.contains(e.target))setMenu(false);});
 menu.addEventListener('click',e=>{
  if(e.target.closest('#openSetup,#reset,#openServer,#openQuality,#openDaily,#openFinance,#openShorts,#openYoutube,#openPrompt,#layoutButton'))setMenu(false,true);
 },true);
}
$('closePanel').onclick=()=>$('panel').close();$('readAll').onclick=()=>openPanel('reports');$('openReports').onclick=()=>openPanel('reports');$('quickReadAll').onclick=markAllRead;$('trayBadge').onclick=()=>openPanel('reports');$('openServer').onclick=()=>openPanel('server');$('openDaily').onclick=()=>openPanel('daily');$('costButton').onclick=()=>openPanel('daily');$('reset').onclick=()=>{preset('iso');$('preset').value='iso';};$('preset').onchange=e=>preset(e.target.value);$('pause').onclick=()=>{paused=!paused;$('pause').setAttribute('aria-pressed',paused);setText('pause',paused?I18n.raw("strings.lanjut"):I18n.raw('strings.jeda'));};$('panels').onclick=()=>{document.body.classList.toggle('cinema');$('panels').setAttribute('aria-pressed',document.body.classList.contains('cinema'));resize();};$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{log(I18n.raw('strings.layar_penuh_tidak_tersedia'));}};$('daynight').onclick=()=>{const v=Settings.get(),modes=['auto','day','dusk','night'];v.appearance.light=modes[(modes.indexOf(v.appearance.light)+1)%modes.length];Settings.set(v);};$('demo').onclick=()=>{clearStory();mode='demo';$('tokenLabel').textContent=I18n.text(I18n.raw('strings.token_simulasi'));forcedDemo=true;autoDemo=true;source?.close();nextCall=time+2;v12UI?.updateSidebar();v13UI?.updateSidebar();log(I18n.raw('strings.demo_lokal_aktif_alur_berikutnya_segera_dimulai'));};$('live').onclick=()=>{forcedDemo=false;autoDemo=false;$('tokenLabel').textContent=I18n.text(I18n.raw('strings.token_hari_ini'));v12UI?.updateSidebar();v13UI?.updateSidebar();connect();};
function textures(){const hour=new Date().getHours()+new Date().getMinutes()/60,period=timeMode==='day'?'day':timeMode==='dusk'?'dusk':timeMode==='night'?'night':hour>=17&&hour<19?'dusk':hour>=6&&hour<17?'day':'night',daylight=period==='day'?1:period==='dusk'?.5:0;hemi.intensity=.5+daylight*.45;sun.intensity=.2+daylight*.65;fill.intensity=.5-daylight*.15;sun.color.set(period==='day'?0xffddb1:period==='dusk'?0xffbc91:0x8ba7de);stage.style.background='linear-gradient(var(--scene-'+period+'-start),var(--scene-'+period+'-end))';
 updateScreens();}

function simulate(dt){if(paused)return;time+=dt;flowWorkersTick();flowActorsTick(dt);if(autoDemo&&mode==='demo'&&!job&&!archiveJob&&!jobs.length&&!specialists.busy&&time>=nextCall){const provider=providers[serial%providers.length];jobs.push({provider,multi:serial%3===2});nextCall=Infinity;}
 if(autoDemo&&mode==='demo')for(const r of reports)if(!r.read&&time-r.deliveredAt>8)markRead([r.id]);
 // [Diubah oleh Gemini - 2026-11-20] Jalankan mt5FinanceTick(), v12WorkflowTick(), v13PromptTick(), dan animasi denyut layout.mt5Beacon berbasis layout.mt5BeaconBase di dalam simulate().
 for(let i=backgroundJobs.length-1;i>=0;i--){const j=backgroundJobs[i];if(j.pendingReport&&!j.queuedInInbox&&![...liveWorkers.values()].some(w=>w.provider===j.provider&&!w.removed)){backgroundJobs.splice(i,1);j.pendingReport=false;j.resume=true;jobs.push(j);}}if(!specialists.busy)updateJob();specialists.tick();mt5FinanceTick();v12WorkflowTick();v13PromptTick();for(const j of backgroundJobs)if(!j.queuedInInbox&&!j.completed&&idle(j.a)&&![...liveWorkers.values()].some(w=>w.provider===j.provider&&['brief','return'].includes(w.phase)))enqueue(j.a,wait(3,I18n.raw('strings.mengetik')));workerTick();archiveTick();joinTick();for(const a of residents)if(a.inbox>0&&!a.busy&&idle(a)){a.inbox--;const waiting=backgroundJobs.find(j=>j.a===a&&j.queuedInInbox);if(waiting){waiting.queuedInInbox=false;waiting.inbox=false;a.busy=true;a.taskStatus='working';if(waiting.completed&&waiting.reportId){backgroundJobs.splice(backgroundJobs.indexOf(waiting),1);waiting.resume=true;jobs.push(waiting);}}a.documentUntil=time+6;enqueue(a,action(()=>carry(a,true,a.color)),wait(2.5,I18n.raw('v10.takingInbox')),action(()=>carry(a,false)));updateInboxStacks();mark('task-inbox-picked',a.id);}for(const a of actors){ambient(a);updateActor(a,dt);}if(job&&job.phase==='work'&&!job.completed&&idle(job.a)&&![...liveWorkers.values()].some(w=>w.provider===job.provider&&['brief','return'].includes(w.phase)))enqueue(job.a,wait(3,I18n.raw('strings.mengetik')));

 if(preferences.followTask&&job&&['phone','deliver','resident-seat'].includes(job.phase)){const p=secretary.char.position;desired.target.set(p.x,1,p.z);desired.distance=12;}
 if(layout.handoff){const h=layout.handoff,f=Math.min(1,(time-h.start)/(h.duration||1.8)),p=layout.transferPaper;p.visible=f<1;h.to.paper.visible=f>=1;h.from.char.updateMatrixWorld(true);h.to.char.updateMatrixWorld(true);const a=h.from.paper.getWorldPosition(new THREE.Vector3()),b=h.to.paper.getWorldPosition(new THREE.Vector3());p.position.lerpVectors(a,b,f);p.position.y+=Math.sin(f*Math.PI)*.12;p.rotation.set(1.35,h.from.char.rotation.y,0);if(f>=1)layout.handoff=null;}
 const coffeeObject=world.get('coffee');layout.steam.forEach((p,i)=>{const f=(time*.4+i/6)%1;p.visible=coffeeObject.enabled&&!motionOff();p.position.copy(coffeeObject.node.localToWorld(new THREE.Vector3(Math.sin(f*9)*.07,2.05+f*.55,0)));p.scale.setScalar(.08*(1-f));});

 if(layout.stacks){const k=trayShake-time;layout.stacks.position.x=k>0&&!motionOff()?Math.sin(time*55)*.025*k:0;}layout.phone.visible=!secretary.receiver?.visible;layout.phone.rotation.y=!motionOff()&&job&&['settle','phone'].includes(job.phase)?Math.sin(time*22)*.28:0;layout.leds.forEach((l,i)=>{const o=world.get('server');l.visible=o.enabled;l.position.copy(o.node.localToWorld(l.userData.serverLocal.clone()));l.scale.y=time<layout.archiveFlash?.12:Math.sin(time*4+i)>0?.05:.018;});
 if(layout.mt5Beacon&&layout.mt5BeaconBase){const b=layout.mt5BeaconBase,trading=mt5LiveState.status==='trading'||(mt5LiveState.activePositions?.length>0),k=motionOff()?1:trading?1+Math.sin(time*5.2)*.18:1+Math.sin(time*1.4)*.04;layout.mt5Beacon.scale.set(b.x*k,b.y*k,b.z*k);}
 for(const a of actors)if(!a.hidden&&!a.removed&&!a.lifted){if(blocked(a.char.position.x,a.char.position.z))collisions.static++;for(const b of actors)if(b!==a&&!b.hidden&&!b.removed){const d=a.char.position.distanceTo(b.char.position);collisions.minDistance=Math.min(collisions.minDistance,d);if(d<.7)collisions.actors++;}}
}
function render(dt=.016){const flowNow=performance.now();if(flowModel&&flowNow-flowLastTick>=250){flowLastTick=flowNow;flowModel.tick(Date.now());flowNotify();}flowRenderer?.frame(flowNow,rendering);cameraFrame(dt);if(deskAnims.length)stepDeskAnims();hoverFrame();physOverlay.frame();textures();updateBatch();renderer.info.reset();renderer.render(scene,camera);flowWorldCalls=renderer.info.render.calls;renderer.autoClear=false;renderer.render(flowScene,camera);renderer.autoClear=true;flowRenderer?.didRender(performance.now());labels();flowRenderer?.projectLabels(camera,stage.clientWidth,stage.clientHeight,[...document.querySelectorAll('.label[data-visible="true"],#trayBadge,#notify,header,.top-controls,.controls')].map(el=>{const r=el.getBoundingClientRect(),s=stage.getBoundingClientRect();return{x:r.x-s.x,y:r.y-s.y,w:r.width,h:r.height};}));if(time-lastUI>.5){lastUI=time;updateUI();}}
let lastDraw=0;
function frame(now){requestAnimationFrame(frame);const real=Math.max(.001,(now-lastFrame)/1000);lastFrame=now;if(!rendering)return;simulate(Math.min(real,.15));if(preferences.appearance.economy&&now-lastDraw<1000/15)return;const drawDt=lastDraw?(now-lastDraw)/1000:real;lastDraw=now;render(drawDt);samples.push(drawDt);if(samples.length>60)samples.shift();}

function showFocusTip(h,color=0xffd27a){hoverState.target=h;hoverState.key=h.actor?.id||h.object?.id||'stacks';hoverState.shown=true;hoverState.pending=null;fillTip(h);hoverTip.hidden=false;hoverTip.classList.add('show');const box=h.box||new THREE.Box3().setFromObject(h.actor.char);box.getCenter(hoverLines.position);box.getSize(hoverLines.scale).addScalar(.08);hoverLines.visible=true;hoverLines.material.color.setHex(color);const p=project(box.getCenter(new THREE.Vector3())),r=canvas.getBoundingClientRect();hoverState.x=p.x+r.left;hoverState.y=p.y+r.top;placeTip();}
// v9: overlay "Garis fisik". Mati = tidak ada objek dibuat. Hidup: 1 LineSegments warna per verteks (tapak biru, titik pakai hijau,
// kaki putih, konflik merah) + 1 LineSegments putus-putus (zona kosong kuning) + 1 bidang hantu editor; dibangun ulang ~7 Hz.
const physOverlay=(()=>{let on=false,lines=null,dashed=null,ghost=null,last=-1,sig='',edit=null,state={count:0,items:[]};const panel=document.createElement('section');panel.id='physicsPanel';panel.classList.add('physics-panel','glass');panel.hidden=true;panel.setAttribute('aria-live','polite');const head=document.createElement('p'),legend=document.createElement('p'),list=document.createElement('ul');head.className='pp-count';legend.className='pp-legend';panel.append(head,legend,list);document.body.append(panel);
 const C={fp:[.35,.62,1],wall:[.5,.6,.75],use:[.3,.9,.5],foot:[1,1,1],bad:[1,.28,.33],ok:[.21,.84,.53]};
 function ensure(){if(lines)return;lines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,opacity:.95}));dashed=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xffd24a,dashSize:.18,gapSize:.12,depthTest:false,transparent:true}));lines.renderOrder=dashed.renderOrder=20;lines.frustumCulled=dashed.frustumCulled=false;scene.add(lines,dashed);}
 const rect=(a,r,c,y=.09)=>{const x0=r.x-r.w/2,x1=r.x+r.w/2,z0=r.z-r.d/2,z1=r.z+r.d/2;for(const [x,z] of [[x0,z0],[x1,z0],[x1,z0],[x1,z1],[x1,z1],[x0,z1],[x0,z1],[x0,z0]])a.push(x,y,z,...c);};
 const ring=(a,x,z,r,c)=>{for(let i=0;i<16;i++){const u=i/16*Math.PI*2,v=(i+1)/16*Math.PI*2;a.push(x+Math.cos(u)*r,.1,z+Math.sin(u)*r,...c,x+Math.cos(v)*r,.1,z+Math.sin(v)*r,...c);}};
 const seg=(a,x0,z0,x1,z1,c)=>a.push(x0,.1,z0,...c,x1,.1,z1,...c);
 const geo=(obj,a,colors)=>{obj.geometry.dispose();const g=new THREE.BufferGeometry(),n=a.length/6,pos=new Float32Array(n*3),col=colors?new Float32Array(n*3):null;for(let i=0,j=0;i<a.length;i+=6,j+=3){pos[j]=a[i];pos[j+1]=a[i+1];pos[j+2]=a[i+2];if(col){col[j]=a[i+3];col[j+1]=a[i+4];col[j+2]=a[i+5];}}g.setAttribute('position',new THREE.BufferAttribute(pos,3));if(col)g.setAttribute('color',new THREE.BufferAttribute(col,3));obj.geometry=g;obj.visible=n>0;};
 function build(){const fps=physics.footprints(),k=physics.conflicts(fps),bad=new Set(),a=[],d=[];for(const o of k.overlaps){bad.add(o.a.id);bad.add(o.b.id);}for(const c of k.clear)bad.add(c.other.id);for(const h of k.actors)bad.add(h.f.id);
  if(on){for(const z of OfficeLayoutRules.catalog.zones)rect(d,z,[1,1,1],.085);for(const f of fps){rect(a,f,bad.has(f.id)?C.bad:f.kind==='wall'?C.wall:C.fp);for(const c of f.clearance||[])rect(d,c,[1,1,1],.085);}
   for(const o of world.items.values()){if(!o.enabled)continue;o.usePoints.forEach((p,i)=>{const q=world.point(o,i);if(!q)return;const fx=-Math.sin(q.facing)*.42,fz=-Math.cos(q.facing)*.42;seg(a,q.x-.12,q.z,q.x+.12,q.z,C.use);seg(a,q.x,q.z-.12,q.x,q.z+.12,C.use);seg(a,q.x,q.z,q.x+fx,q.z+fz,C.use);seg(a,q.x+fx,q.z+fz,q.x+fx*.6-fz*.3,q.z+fz*.6+fx*.3,C.use);seg(a,q.x+fx,q.z+fz,q.x+fx*.6+fz*.3,q.z+fz*.6-fx*.3,C.use);});}
   const hit=new Set(k.actors.map(h=>h.actor));for(const ac of actors)if(!ac.hidden&&!ac.removed&&!ac.lifted)ring(a,ac.char.position.x,ac.char.position.z,.25,hit.has(ac)?C.bad:C.foot);}
  if(edit){for(const r of edit.rects)rect(a,r,edit.ok?C.ok:C.bad,.11);for(const c of edit.clear||[])rect(d,c,[1,1,1],.1);if(edit.other?.w)rect(a,edit.other,C.bad,.12);}
  ensure();geo(lines,a,true);geo(dashed,d,false);dashed.computeLineDistances();
  const nm=v=>I18n.text(String(v||''));const items=[...k.overlaps.map(o=>({text:t('physics.overlap',{a:nm(o.a.name),b:nm(o.b.name)}),x:(o.a.x+o.b.x)/2,z:(o.a.z+o.b.z)/2})),...k.clear.map(c=>({text:t('physics.clear',{a:nm(c.owner.name),b:nm(c.other.name)}),x:c.zone.x,z:c.zone.z})),...k.actors.map(h=>({text:t('physics.actor',{a:h.actor.name,b:nm(h.f.name)}),x:h.actor.char.position.x,z:h.actor.char.position.z}))];state={count:items.length,items:items.map(i=>i.text),footprints:fps.length};
  if(on){const s2=state.items.join('|')+I18n.language;if(s2!==sig){sig=s2;head.textContent=items.length?t('physics.count',{count:items.length}):t('physics.clean');head.classList.toggle('bad',items.length>0);legend.textContent=t('physics.legend');list.replaceChildren(...items.slice(0,8).map(i=>{const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=i.text;b.onclick=()=>focus(new THREE.Vector3(i.x,1,i.z));li.append(b);return li;}));}}}
 function frame(){if(!on&&!edit){if(lines&&lines.visible){lines.visible=false;dashed.visible=false;}if(ghost)ghost.visible=false;return;}const now=performance.now();if(now-last<140)return;last=now;build();}
 function set(v){on=!!v;panel.hidden=!on;sig='';last=-1;const b=document.getElementById('physicsButton');if(b)b.setAttribute('aria-pressed',String(on));frame();}
 function preview(p){edit=p||null;if(p&&p.ghost){if(!ghost){ghost=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0x36d588,transparent:true,opacity:.26,depthWrite:false,depthTest:false}));ghost.rotation.x=-Math.PI/2;ghost.renderOrder=19;scene.add(ghost);}const r=p.rects[0];ghost.position.set(r.x,.07,r.z);ghost.scale.set(r.w,r.d,1);ghost.material.color.setHex(p.ok?0x36d588:0xff5967);ghost.visible=true;}else if(ghost)ghost.visible=false;last=-1;frame();}
 return{set,toggle:()=>{const v=Settings.get();v.appearance.physics=!on;Settings.set(v);},preview,frame,refresh:()=>{sig='';last=-1;frame();},get on(){return on;},state:()=>({on,...state,objects:!!lines,ghost:!!ghost?.visible})};})();
{const b=document.getElementById('physicsButton');if(b)b.onclick=()=>physOverlay.toggle();}
if(preferences.appearance.physics)physOverlay.set(true);
layoutEditor=OfficeLayoutEditor.create({canvas,world,scene,layout,actors,objectBox,describeObject,describeActor,describeStacks,pick:hoverPick,floor:floorPoint,keys,show:showFocusTip,hide:hideHover,physics,overlay:physOverlay});
// [Diubah oleh Gemini - 2026-11-20] Berikan helper roam:roamIdle ke OfficeSpecialists, instansiasi OfficeV12UI + tombol menu/kartu sidebar, dan jaga refreshLocale saat panel V12 terbuka.
const specialists=OfficeSpecialists.create({world,layout,actors,secretary,archivist,createActor,walk,wait,action,enqueue,idle,stopAmbient,carry,transfer,sit,mark,face,time:()=>time,settings:()=>preferences,mode:()=>mode,autoDemo:()=>autoDemo,forcedDemo:()=>forcedDemo,live:liveMode,sync:scheduleSync,random,look:lookOf,hex:hexNum,restyle,resit,leaveOffice,dirty:()=>{batchDirty=true;},join:a=>pendingJoins.push({a,after:time+.9}),canReach:(a,p)=>!!pathTo(a.char.position,p,a),use:useObject,roam:roamIdle,canStaff:()=>!job&&!archiveJob&&!jobs.length,follow:p=>{desired.target.set(p.x,1,p.z);desired.distance=12;},reports:()=>reports,learning:()=>{updateUI();},report:(task,id)=>{let r=id&&reports.find(r=>r.id===id);if(!r){r={id:id||crypto.randomUUID(),provider:task.engine,persona:task.persona,number:task.number,round:task.round,result:task.stage==='passed'?'pass':'escalate',time:new Date().toISOString(),task:I18n.raw('strings.tugas_selesai'),tokens:null,duration_s:0,read:false,archived:false};reports.push(r);}r.inTray=true;r.animating=false;r.deliveredAt=time;updateStacks();updateUI();},update:updateUI});
const qualityUI=OfficeQualityUI.create({runtime:specialists,before:()=>{panels.close();setupUI?.close();v12UI?.close();youtubeUI?.close();v13UI?.close();},dialog,api:panels.api,isDemo:()=>mode==='demo',settings:()=>preferences});
// V15 [Diubah oleh Gemini - 2026-11-21] Instansiasi Pusat Setup (OfficeSetupUI) & tautkan lintas panel
setupUI=window.OfficeSetupUI?.create({dialog,isDemo:()=>mode==='demo',before:closeAllPanels,onOpenShorts:()=>v12UI?.openShorts(),onOpenYoutube:()=>youtubeUI?youtubeUI.openYoutube():v13UI?.openYoutube(),onOpenPrompt:()=>v13UI?.openPrompt(),onOpenFinance:()=>v12UI?.openFinance('mt5'),onOpenSettings:()=>settingsUI?.open(),onConfigChanged:()=>{void youtubeUI?.refresh();void v13UI?.refresh();}})||null;
v12UI=window.OfficeV12UI?.create({dialog,api:panels.api,isDemo:()=>mode==='demo',before:closeAllPanels,onDemoTrade:handleDemoTrade,onWorkflowEvent:handleWorkflowEvent,onFocusZone:focusPreset,onOpenSetup:()=>setupUI?.openSetup(),onOpenPrompt:()=>v13UI?.openPrompt()})||null;
// V14-B + V15 [Diubah oleh Gemini - 2026-11-21] Instansiasi OfficeYoutubeUI (dasbor tertanam utuh) & tautkan ke Pusat Setup + OfficeV13UI
youtubeUI=window.OfficeYoutubeUI?.create({dialog,isDemo:()=>mode==='demo',before:closeAllPanels,onFocusZone:focusPreset,onOpenSetup:()=>setupUI?.openSetup(),onSummaryUpdate:()=>{if(!activeShortWorkflow)layout.studioBoard?.redraw?.();}})||null;
v13UI=window.OfficeV13UI?.create({dialog,api:panels.api,isDemo:()=>mode==='demo',before:closeAllPanels,getYoutubeUI:()=>youtubeUI,onOpenSetup:()=>setupUI?.openSetup(),onOpenShorts:(createdId,rec)=>{if(createdId){v12UI?.openShorts(createdId);return;}const demoWf=rec?v12UI?.createDemoWorkflowFromRecommendation?.(rec):null;v12UI?.openShorts(demoWf?.id||null);},onPromptRun:evt=>handleV13Event(evt),onFocusZone:focusPreset,onYoutubeSync:()=>{if(!activeShortWorkflow)layout.studioBoard?.redraw?.();}})||null;
if($('openSetup'))$('openSetup').onclick=()=>setupUI?.openSetup();
$('openQuality').onclick=()=>qualityUI.open();$('qualityCardButton').onclick=()=>qualityUI.open();$('followTask').onclick=()=>{const v=Settings.get();v.followTask=!v.followTask;Settings.set(v);};
if($('openFinance'))$('openFinance').onclick=()=>v12UI?.openFinance('mt5');
if($('financeCardButton'))$('financeCardButton').onclick=()=>v12UI?.openFinance('mt5');
if($('openShorts'))$('openShorts').onclick=()=>v12UI?.openShorts();
if($('shortsCardButton'))$('shortsCardButton').onclick=()=>v12UI?.openShorts();
if($('openYoutube'))$('openYoutube').onclick=()=>youtubeUI?youtubeUI.openYoutube():v13UI?.openYoutube();
if($('youtubeCardButton'))$('youtubeCardButton').onclick=()=>youtubeUI?youtubeUI.openYoutube():v13UI?.openYoutube();
if($('openPrompt'))$('openPrompt').onclick=()=>v13UI?.openPrompt();
if($('promptCardButton'))$('promptCardButton').onclick=()=>v13UI?.openPrompt();
const settingsUI=OfficeSettingsUI.create({run:runAction,roster:{unregistered:()=>[...unregistered.values()],personas:()=>specialists.unknown()}});
function runAction(action){if(action==='quality'){qualityUI.open();return;}if(action==='followTask'){$('followTask').click();return;}if(action==='physics'){physOverlay.toggle();return;}if(action==='layout'){layoutEditor.toggle();return;}if(action==='objects'){layoutEditor.openList();return;}if(action==='rotate'){if(layoutEditor.state.active)layoutEditor.rotate();return;}if(action==='close'&&liftedActor){finishLift(true);return;}const buttons={pause:'pause',mode:mode==='demo'?'live':'demo',fullscreen:'fullscreen',sidebar:'panels',vault:'openServer',reports:'openReports',daily:'openDaily'};if(buttons[action]){$(buttons[action]).click();return;}if(['iso','top','front','back','boss','server','engineering','studio','quality','mt5','terrace'].includes(action)){focusPreset(action);return;}if(action==='reload'){location.reload();return;}if(action==='home')focusPreset('iso');else if(action==='settings')settingsUI.open();else if(action==='help')settingsUI.help();else if(action==='close'){if(settingsUI.isOpen())settingsUI.close();else if($('panel').open)$('panel').close();}else if(action==='tour'){touring=!touring;log(touring?I18n.raw("strings.tur_otomatis_aktif"):I18n.raw('strings.tur_otomatis_berhenti'));}else if(action==='walls'){lowWalls=!lowWalls;log(lowWalls?I18n.raw("strings.dinding_rendah_aktif"):I18n.raw('strings.dinding_normal_aktif'));}else if(action==='light'){const v=Settings.get();v.appearance.light=v.appearance.light==='night'?'day':'night';Settings.set(v);}else if(action==='economy'||action==='sound'){const v=Settings.get();v.appearance[action]=!v.appearance[action];Settings.set(v);}}
$('settingsButton').onclick=()=>settingsUI.open();$('helpButton').onclick=()=>settingsUI.help();Settings.keyboard(runAction,()=>!!document.querySelector('dialog[open]'));
Settings.subscribe(v=>{const previous=preferences.appearance,oldEconomy=previous.economy;preferences=v;
 if(previous.modelQuality!==v.appearance.modelQuality){
  for(const actor of actors)if(!actor.removed)setFigureQuality(actor.char,v.appearance.modelQuality);
  batchDirty=true;
 }
 if(oldEconomy!==v.appearance.economy)resize();officeFlow.configure(v.flow16||{});specialists.apply(v.personas,!motionOff());$('followTask').setAttribute('aria-pressed',String(v.followTask));if(physOverlay.on!==!!v.appearance.physics)physOverlay.set(v.appearance.physics);if(applyRoster.ready)applyRoster(v.agents,!motionOff());timeMode=v.appearance.light;setText('daynight',{auto:I18n.raw('strings.jam_nyata'),day:I18n.raw('strings.siang'),dusk:I18n.raw('strings.sore'),night:I18n.raw('strings.malam')}[timeMode]);document.documentElement.dataset.motion=motionOff()?'reduced':'full';});
const applyMotion=()=>{document.documentElement.dataset.motion=motionOff()?'reduced':'full';};applyMotion();reduceMotion.addEventListener('change',applyMotion);
let audioContext=null;document.addEventListener('pointerdown',()=>{if(preferences.appearance.sound&&!audioContext){try{audioContext=new (window.AudioContext||window.webkitAudioContext)();}catch{}}});
let lastSound=0;function soundNotice(){if(!preferences.appearance.sound||!audioContext||audioContext.state!=='running'||performance.now()-lastSound<500)return;lastSound=performance.now();const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=540;g.gain.setValueAtTime(.025,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.12);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.12);}
function refreshLocale(){I18n.apply();document.getElementById('uiTooltip')?.remove();for(const surface of design.textSurfaces||[])surface.redraw();for(const s of design.screens)s.dirty=true;for(const a of actors){a.occlusionDue=0;I18n.bind(a.label.querySelector('b'),a.name);}canvas.setAttribute('aria-label',t('strings.kamera_kantor_tahan_dan_seret_karakter_dengan_klik_kiri_saat_pemetaan_'));setText('pause',paused?I18n.raw('strings.lanjut'):I18n.raw('strings.jeda'));$('tokenLabel').textContent=t(mode==='demo'?'strings.token_simulasi':'strings.token_hari_ini');if(dailyData)drawDaily(dailyData);if($('panel').open){if(setupUI?.active||v12UI?.active||youtubeUI?.active||v13UI?.active){}else if(qualityUI.active)qualityUI.open();else if(panels.kind)panels.open(panels.kind);else if(selectedActor)showActor(selectedActor);}updateUI();render(1);}
for(const button of document.querySelectorAll('.top-controls button,.controls button')){const key=button.querySelector('[data-i18n]')?.dataset.i18n;if(key){button.dataset.i18nTitle=key;button.setAttribute('title',t(key));}}
function hideTooltip(){document.getElementById('uiTooltip')?.remove();}
document.addEventListener('pointerover',e=>{const target=e.target.closest('button[aria-label],button[title],select[aria-label]');if(!target||target.contains(e.relatedTarget))return;hideTooltip();const tip=document.createElement('div');tip.id='uiTooltip';tip.role='tooltip';tip.textContent=target.getAttribute('title')||target.getAttribute('aria-label');document.body.append(tip);const r=target.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.left))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,r.bottom+8))+'px';});
document.addEventListener('pointerout',e=>{if(e.target.closest('button,select'))hideTooltip();});document.addEventListener('pointerdown',hideTooltip);window.addEventListener('resize',hideTooltip);
I18n.subscribe(refreshLocale);
Settings.subscribe(()=>{if(typeof settingsUI!=='undefined'){updateUI();if(dailyData)drawDaily(dailyData);}});
fetch('/pricing').then(r=>r.ok?r.json():null).then(p=>{if(p){I18n.pricing(p);updateUI();if(dailyData)drawDaily(dailyData);}}).catch(()=>{});
window.addEventListener('resize',resize);resize();if(!localStorage.getItem('office-v4b-camera'))preset('iso',true);cameraFrame(1);updateUI();connect();requestAnimationFrame(frame);
// [Diubah oleh Gemini - 2026-11-20] + V19 [2026-11-21] Ekspos status V12, V13, dan archive watchdog pada officeDebug() + hook pengujian officeQA.archive.
window.officeDebug=()=>({version:16,flow:officeFlow.stats(),worldBounds,v12:{mt5:mt5LiveState,finance:financeSummaryState,handoff:mt5HandoffOp?{phase:mt5HandoffOp.phase,isProfit:mt5HandoffOp.isProfit}:null,workflow:activeShortWorkflow?{id:activeShortWorkflow.id,title:activeShortWorkflow.title,stage:activeShortWorkflow.currentStageId||activeShortWorkflow.currentStage,status:activeShortWorkflow.status}:null},v13:{activePrompts:[...activePromptRuns.keys()],handoff:v13PromptHandoff?{runId:v13PromptHandoff.runId,phase:v13PromptHandoff.phase,actor:v13PromptHandoff.actor?.id}:null},archive:{phase:archiveJob?.phase||null,mode:archiveJob?.mode||null,usesSecretary:!!archiveJob?.usesSecretary,batch:archiveJob?archiveJob.batch.map(r=>r.id):[],recoveries:archiveJob?.recoveries||0,phaseAge:archiveJob?+(time-archiveJob.phaseSince).toFixed(2):0,stallAge:archiveJob?+(time-archiveJob.lastProgressAt).toFixed(2):0,watchdogTriggers:archiveStats.watchdogTriggers,completed:archiveStats.completed,lastDuration:archiveStats.lastDuration,maxDuration:archiveStats.maxDuration,lastWarning:archiveStats.lastWarning,warnings:archiveStats.warnings.slice(-10)},navigation:{method:'A*',nodes:staticNodes.size+softNodes.size},quality:specialists.debug(),handoff:layout.handoff?{from:layout.handoff.from.id,to:layout.handoff.to.id,progress:Math.min(1,(time-layout.handoff.start)/(layout.handoff.duration||1.8))}:null,world:world.snapshot(),affordanceAudit:world.audit,screens:design.screens.map(s=>({index:s.index,category:s.category,powered:!!s.powered,text:s.displayText,draws:s.draws||0})),memory:{textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries},signs:design.signs.map(({text,x,y,z,w})=>({text,x,y,z,w})),settings:Settings.get(),touring,lowWalls,renderedFrames:renderer.info.render.frame,gpu:(()=>{const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);})(),daily:dailyData,liveWorkers:[...liveWorkers.values()].map(w=>({id:w.id,phase:w.phase,retired:w.retired})),windows:layout.windowCount,wallDecor:layout.wallDecor,occluders:layout.occluders.length,labelMetrics:actors.filter(a=>!a.removed).map(a=>a.labelMetric),mode,time,paused,job:job?{phase:job.phase,provider:job.provider,multi:job.multi}:null,archivePhase:archiveJob?.phase||null,inventory:layout.inventory,props:layout.inventory.length,propTypes:new Set(layout.inventory.map(p=>p.type)).size,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:samples.length/samples.reduce((a,b)=>a+b,0),camera:{yaw:cam.yaw,tilt:cam.tilt,distance:cam.distance,target:cam.target.toArray(),position:camera.position.toArray(),desiredTarget:desired.target.toArray(),desiredDistance:desired.distance,desiredYaw:desired.yaw,desiredTilt:desired.tilt},walls:layout.walls.map(w=>({axis:w.axis,normal:w.normal,opacity:w.material.opacity,nearCamera:!!w.nearCamera})),reports,archived,milestones,collisions,routes:routes.length,obstacles:layout.obstacles,actors:actors.filter(a=>!a.removed).map(a=>({id:a.id,kind:a.kind,category:a.category,taskStatus:a.taskStatus,displayFile:a.displayFile,lifted:!!a.lifted,yielding:!!a.yielding,resuming:!!a.resuming,flowWorking:!!a.flowWorking,landing:a.landing,reaction:a.reactionText,object:a.usingObject,soft:a.softAllow||[],x:a.char.position.x,z:a.char.position.z,y:a.char.position.y,activity:a.activity,activityText:activityText(a),moving:a.moving,carrying:a.carrying,paperVisible:a.paper.visible,phoneVisible:!!a.receiver?.visible,receiveUntil:a.receiveUntil,offerUntil:a.offerUntil,inbox:a.inbox||0,engine:a.engine,department:a.department,seated:a.seated,hidden:a.hidden,path:a.path.length,queue:a.queue.map(q=>({type:q.type,goal:q.goalPoint,activity:q.activity,failure:q.failure})),busy:a.busy,history:a.history,headScreen:project(a.char.userData.head.getWorldPosition(new THREE.Vector3())),screen:project(a.char.position.clone().add(new THREE.Vector3(0,1.3,0)))}))});
if(params.get('qa')==='1')window.officeQA={flow:officeFlow,archive:{state:()=>window.officeDebug().archive,injectStall(kind='yielding',who='archivist'){const a=who==='secretary'?secretary:archivist;if(kind==='yielding'){a.yielding=true;a.queue=[wait(3600,I18n.raw('strings.memberi_jalan'))];a.path=[];}else if(kind==='resuming'){a.resuming=true;a.queue=[wait(3600,I18n.raw('strings.kembali_melanjutkan_tugas'))];a.path=[];}else if(kind==='wait'){a.queue=[wait(3600,I18n.raw('strings.mengetik'))];a.path=[];}else if(kind==='far'){safeArchivePlace(a,[layout.secretarySeat,{x:-10,z:0}]);a.queue=[];a.path=[];}else if(kind==='saving'&&archiveJob){archiveJob.phase='saving';archiveJob.phaseSince=time;archiveJob.lastProgressAt=time;archiveJob.saveToken++;}return true;},resetStats(){archiveStats.completed=0;archiveStats.watchdogTriggers=0;archiveStats.lastWarning=null;archiveStats.warnings=[];archiveStats.lastDuration=null;archiveStats.maxDuration=0;}},v15:{setup:setupUI,openSetup:o=>setupUI?.openSetup(o)},v14:{youtube:youtubeUI,openYoutube:h=>youtubeUI?.openYoutube(h),ytEvent:e=>handleV13Event(e)},v13:{ui:v13UI,openYoutube:()=>youtubeUI?youtubeUI.openYoutube():v13UI?.openYoutube(),openPrompt:()=>v13UI?.openPrompt(),promptEvent:e=>handleV13Event(e),state:()=>({activePrompts:[...activePromptRuns.keys()],handoff:v13PromptHandoff?{runId:v13PromptHandoff.runId,phase:v13PromptHandoff.phase,actor:v13PromptHandoff.actor?.id}:null})},v12:{mt5(phase,opts={}){const side=String(opts.side||'BUY').toUpperCase(),symbol=opts.symbol||'XAUUSD',rate=Number(opts.usdToIdr||16200);if(phase==='open'||phase==='trading'){const profit=Number(opts.profit??(side==='SELL'?12.5:42.5)),pos={ticket:opts.ticket||920001,symbol,side,volume:opts.volume||.1,price_open:2642.1,price_current:2646.35,profit,time:new Date().toISOString()},st={connected:true,status:'trading',activePositions:[pos],activeSide:side,floatingProfit:profit,currency:'USD',lastUpdated:new Date().toISOString()};handleV12Event({type:'mt5_state',state:st,demo:true});return st;}if(phase==='close'){const profitUsd=Number(opts.profitUsd??opts.profit??42.5),amountIdr=Math.round(Math.abs(profitUsd)*rate),prev=financeSummaryState,totalIncomeIdr=(prev.totalIncomeIdr||0)+(profitUsd>=0?amountIdr:0),totalLossIdr=(prev.totalLossIdr||0)+(profitUsd<0?amountIdr:0),netBalanceIdr=totalIncomeIdr-totalLossIdr,bySource={...(prev.bySource||{mt5:0,youtube:0,affiliate:0,freelance:0,other:0})};bySource.mt5=(bySource.mt5||0)+(profitUsd>=0?amountIdr:-amountIdr);const summary={totalIncomeIdr,totalLossIdr,netBalanceIdr,bySource,entryCount:(prev.entryCount||0)+1},st={connected:true,status:'idle',activePositions:[],activeSide:null,floatingProfit:0,currency:'USD',lastUpdated:new Date().toISOString()},entry={id:'qa-mt5-'+Date.now()+'-'+Math.floor(random()*9999),source:'mt5',type:profitUsd>=0?'income':'expense',amountIdr,amountOriginal:profitUsd,currency:'USD',symbol,side,demo:true};handleV12Event({type:'mt5_deal_closed',deal:{symbol,side,profit:profitUsd},entry,summary,mt5:st,demo:true});return{mt5:st,summary,entry};}const st={connected:phase==='idle',status:'idle',activePositions:[],activeSide:null,floatingProfit:0,currency:'USD'};if(phase==='reset'){const zero={totalIncomeIdr:0,totalLossIdr:0,netBalanceIdr:0,bySource:{mt5:0,youtube:0,affiliate:0,freelance:0,other:0},entryCount:0};handleDemoTrade({phase:'reset',mt5:st,summary:zero});return{mt5:st,summary:zero};}handleV12Event({type:'mt5_state',state:st,demo:true});return st;},workflow(evt){const payload=evt&&evt.type?evt:{type:'workflow_update',workflow:evt};handleV12Event(payload);return activeShortWorkflow;},ui:v12UI,agents:()=>({mt5Trader,financeManager}),state:()=>({mt5:mt5LiveState,finance:financeSummaryState,handoff:mt5HandoffOp?{phase:mt5HandoffOp.phase,isProfit:mt5HandoffOp.isProfit}:null,workflow:activeShortWorkflow})},persona:(action,options)=>specialists.qa(action,options),quality:()=>specialists.debug(),layout:layoutEditor,hoverables:()=>{const out=[];for(const o of world.items.values()){if(!o.enabled||o.id==='stretch')continue;const b=objectBox(o);if(b.isEmpty())continue;const c=b.getCenter(new THREE.Vector3()),p=project(c),r=canvas.getBoundingClientRect();const ps=[];for(const px of [b.min.x,b.max.x])for(const py of [b.min.y,b.max.y])for(const pz of [b.min.z,b.max.z]){const q=project(new THREE.Vector3(px,py,pz));ps.push([q.x+r.left,q.y+r.top]);}out.push({id:o.id,type:o.type,center:c.toArray(),size:b.getSize(new THREE.Vector3()).toArray(),screen:{x:p.x+r.left,y:p.y+r.top,z:p.z},rect:{l:Math.min(...ps.map(q=>q[0])),r:Math.max(...ps.map(q=>q[0])),t:Math.min(...ps.map(q=>q[1])),b:Math.max(...ps.map(q=>q[1]))}});}for(const a of actors)if(!a.hidden&&!a.removed){const h=a.char.userData.head.getWorldPosition(new THREE.Vector3()),c=h.clone().add(new THREE.Vector3(0,-.55,0)),p=project(c),r=canvas.getBoundingClientRect();out.push({id:'actor:'+a.id,type:a.kind,center:c.toArray(),screen:{x:p.x+r.left,y:p.y+r.top,z:p.z}});}return out;},hoverState:()=>({key:hoverState.key||null,shown:hoverState.shown,count:hoverState.count,name:hoverTip.querySelector('.ht-name').textContent,status:hoverTip.querySelector('.ht-status').textContent,hint:hoverTip.querySelector('.ht-hint').textContent,visible:!hoverTip.hidden&&hoverTip.classList.contains('show'),tip:hoverTip.hidden?null:(r=>({x:r.left,y:r.top,w:r.width,h:r.height}))(hoverTip.getBoundingClientRect()),rect:hoverState.rect||null,lines:hoverLines.visible,cursor:canvas.style.cursor,action:!!hoverState.target?.action}),pickAt:(x,y)=>{const h=hoverPick(x,y);return h?{key:h.actor?'actor:'+h.actor.id:h.object?h.object.id:'stacks',name:h.name,status:h.status,hint:h.hint,action:!!h.action}:null;},deskAnims:()=>deskAnims.length,lastPick:()=>lastPick,findPoint:(id,W=innerWidth,H=innerHeight)=>{const it=window.officeQA.hoverables().find(i=>i.id===id);if(!it)return null;const want=k=>k===id||("actor:"+k)===id;const p0=window.officeQA.pickAt(it.screen.x,it.screen.y);if(p0&&want(p0.key))return {x:it.screen.x,y:it.screen.y};const R=it.rect||{l:it.screen.x-40,r:it.screen.x+40,t:it.screen.y-60,b:it.screen.y+20};let best=null,bd=Infinity;for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const x=R.l+(R.r-R.l)*i/12,y=R.t+(R.b-R.t)*j/12;if(x<12||y<70||x>W-12||y>H-12)continue;const p=window.officeQA.pickAt(x,y);if(p&&want(p.key)){const d=Math.hypot(x-it.screen.x,y-it.screen.y);if(d<bd){bd=d;best={x,y};}}}return best;},hoverDebug:(x,y)=>{const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);const out=[];for(const o of world.items.values()){if(!o.enabled)continue;const b=objectBox(o);if(b.isEmpty()||!raycaster.ray.intersectBox(b,hoverPoint))continue;const p=hoverPoint.clone();out.push({id:o.id,d:+p.distanceTo(raycaster.ray.origin).toFixed(2),occ:isOccluded(p.clone(),true),occluders:layout.occluders.filter(q=>q.wall&&!q.wall.nearCamera&&raycaster.ray.intersectBox(q.box,occlusionHit)&&camera.position.distanceTo(occlusionHit)<camera.position.distanceTo(p)-.16).map(q=>q.wall.id||q.wall.name||'wall')});}const a=actorHit(x,y)||visibleActorAt(x,y);return {actor:a?.id||null,hits:out.sort((p,q)=>p.d-q.d)};},jobs:()=>[job,...jobs].filter(Boolean).map(j=>j.provider),route:e=>providerFor(e),clearJobs:()=>{jobs.length=0;},debugRoster:()=>residents.map(a=>({id:a.id,name:a.name,provider:a.provider,source:a.source,desk:a.desk?.objectId,x:+a.char.position.x.toFixed(2),z:+a.char.position.z.toFixed(2),seated:!!a.seated,hidden:!!a.hidden,busy:!!a.busy,activity:a.activity})),unregistered:()=>[...unregistered.values()],bubble(id='claude',key='strings.waduh_kopinya'){const a=actors.find(a=>a.id===id);a.reactionText=I18n.raw(key);a.reactionUntil=time+3600;render(1);},toScreen:(x,y,z)=>{const p=project(new THREE.Vector3(x,y,z)),r=canvas.getBoundingClientRect();return{x:p.x+r.left,y:p.y+r.top};},floorAt:(x,y)=>{const p=floorPoint(x,y);return p&&{x:p.x,z:p.z};},physics:()=>({...physOverlay.state(),conflicts:physics.conflicts().count}),placement:spec=>{const r=physics.placement(spec);return r&&{reason:r.reason,other:r.other?.id||r.other?.name};},nav:(x,z)=>({key:key(x,z),static:staticNodes.has(key(x,z)),soft:softNodes.get(key(x,z))?.owners||null,blocked:blocked(x,z),reachable:reachableNodes.has(key(x,z))}),objects:()=>world.snapshot(),moveObject:(id,x,z,r)=>world.move(id,x,z,r),removeObject:id=>world.remove(id),audit:()=>world.audit,use(id,affordance,object){const a=actors.find(a=>a.id===id);stopAmbient(a);a.queue=[];a.path=[];a.busy=false;return useObject(a,affordance,object,30);},work(id='claude',category='code'){const a=actors.find(a=>a.id===id);stopAmbient(a);a.queue=[];a.path=[];a.resuming=false;a.yielding=false;a.landHeight=0;a.char.position.y=0;a.char.position.set(a.desk.seat.x,0,a.desk.seat.z);a.category=category;a.taskStatus='working';a.activity=I18n.raw('strings.mengetik');sit(a);enqueue(a,wait(3600,I18n.raw('strings.mengetik')));render(1);},screenImage(id='claude'){return actors.find(a=>a.id===id).desk.screen.canvas.toDataURL();},blockers(){return actors.filter(a=>!a.hidden&&!a.removed).map(a=>{const h=a.char.userData.head.localToWorld(new THREE.Vector3(0,.3,0)),ray=new THREE.Ray(camera.position,h.clone().sub(camera.position).normalize()),d=camera.position.distanceTo(h);return{id:a.id,head:h.toArray(),hits:layout.occluders.filter(o=>{const hit=ray.intersectBox(o.box,new THREE.Vector3());return hit&&hit.distanceTo(camera.position)<d-.16;}).map(o=>({wall:!!o.wall,box:{min:o.box.min.toArray(),max:o.box.max.toArray()}}))};});},testBubble(value){boss.carrying=value;boss.activity=value?I18n.raw("strings.membaca_laporan_contoh"):I18n.raw('strings.santai');},pose(yaw,tilt,distance,target){Object.assign(desired,{yaw,tilt,distance});desired.target=new THREE.Vector3(...target);clampTarget();Object.assign(cam,{yaw,tilt,distance});cam.target.copy(desired.target);actors.forEach(a=>a.occlusionDue=0);render(1);},tick(dt=.1){render(dt);},floor(x,y){return floorPoint(x,y)?.toArray();},project(x,y,z){return project(new THREE.Vector3(x,y,z));},occlusionAudit(){return actors.filter(a=>!a.hidden&&!a.removed).map(a=>{const head=a.char.userData.head.localToWorld(new THREE.Vector3(0,.3,0));return{id:a.id,blocked:isOccluded(a.char.userData.head.getWorldPosition(new THREE.Vector3())),metric:a.labelMetric};});},until(kind,value,limit=350){for(let i=0;i<limit*20;i++){simulate(.05);const done=kind==='phase'?job?.phase===value:kind==='reports'?reports.length>=value:kind==='archived'?archived>=value:kind==='activity'?actors.some(a=>a.id===value.id&&a.activity===value.activity&&!a.moving&&a.queue[0]?.type==='wait'):kind==='smoke'?residents[3].activity===I18n.raw('strings.merokok_animasi')&&residents[3].queue[0]?.type==='wait':false;if(done){render(1);updateUI();return window.officeDebug();}}throw Error('QA timeout '+kind+' '+value+' phase '+job?.phase);},freeze(value=true){rendering=!value;if(!value){lastFrame=performance.now();lastDraw=0;samples.length=0;}},sampleActors:()=>actors.filter(a=>!a.hidden&&!a.removed).map(a=>({id:a.id,modelQuality:a.char.userData.modelQuality,hidden:a.hidden||a.removed,lifted:a.lifted,object:a.usingObject,soft:a.softAllow,x:a.char.position.x,z:a.char.position.z,y:a.char.position.y,seated:a.seated,activity:a.activity,moving:a.moving,queue:a.queue.map(q=>({type:q.type,goal:q.goalPoint}))})),step(seconds=.05){for(let i=0;i<Math.round(seconds/.05);i++)simulate(.05);},advance(seconds=1){for(let i=0;i<Math.round(seconds/.05);i++)simulate(.05);render(1);updateUI();return window.officeDebug();},preset(name){preset(name,true);render(1);},event:acceptEvent,call(provider='claude',multi=false,count=3){autoDemo=false;jobs.push({provider,multi,count});},auto(value){autoDemo=value;},read(){markRead(reports.map(r=>r.id));},routes(){const endpoints=[...world.items.values()].filter(o=>o.enabled).flatMap(o=>o.usePoints.map((p,i)=>world.point(o,i))).filter(p=>p&&!blocked(p.x,p.z)),unique=[...new Map(endpoints.map(p=>[key(p.x,p.z),p])).values()],components=new Map();let component=0;for(const sk of staticNodes.keys())if(!components.has(sk)){component++;const open=[sk];components.set(sk,component);for(let i=0;i<open.length;i++){const p=point(open[i]);for(const [dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(p.x+dx,p.z+dz);if(staticNodes.has(nk)&&!components.has(nk)){components.set(nk,component);open.push(nk);}}}}const comp=p=>{const k=key(p.x,p.z);if(components.has(k))return components.get(k);const n=softNodes.get(k);if(!n)return undefined;const open=[k],seen=new Set(open);for(let i=0;i<open.length&&i<64;i++){const q=point(open[i]);for(const[dx,dz]of[[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nk=key(q.x+dx,q.z+dz);if(reachableNodes.has(nk))return components.get(nk);const m=softNodes.get(nk);if(m&&!seen.has(nk)&&m.owners.every(o=>n.owners.includes(o))){seen.add(nk);open.push(nk);}}}return undefined;},ids=new Map(endpoints.map(p=>[key(p.x,p.z),comp(p)]));const failures=[];let tested=0;for(const a of unique)for(const b of unique){tested++;const ca=ids.get(key(a.x,a.z)),cb=ids.get(key(b.x,b.z));if(ca===undefined||ca!==cb)failures.push({a,b});}return{tested,failures,blocked:unique.filter(p=>blocked(p.x,p.z)),objects:world.items.size,method:'komponen grid navigasi yang sama'};},log(text){log(text);},smoke(){const a=residents[3];stopAmbient(a);a.busy=false;useObject(a,'smoke','smoke-bench',30);},resetMetrics(){collisions.static=0;collisions.actors=0;collisions.minDistance=100;collisions.routeFailures=0;},focus(x,y,z){focus(new THREE.Vector3(x,y,z));cam.target.copy(desired.target);cam.distance=desired.distance;render(1);},labels(){return [...document.querySelectorAll('.label')].filter(e=>e.style.visibility==='visible').map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,text:e.textContent};});}};
})();
