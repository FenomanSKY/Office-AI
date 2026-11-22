'use strict';
// V16-C [Diubah oleh Gemini - 2026-11-21] Perbarui asersi koreografi berjalan lama (liveWorkers/task-inbox-picked/tray milestone) ke mode V16 bawaan (walkAnimation: 'fast') sambil tetap menguji maksud asli: antrean provider tanpa menjatuhkan laporan, 2 laporan independen tiba di baki, 3 subagen aktif paralel, handoff provider lain paralel, dan 0 galat rute/konsol.
const fs=require('node:fs/promises'),path=require('node:path'),{open,sleep,root}=require('./v6c_lib.cjs');
(async()=>{
 const b=await open(),out={checks:[],fail:[]},check=(n,v,detail)=>{out.checks.push(n);if(!v)out.fail.push(detail!==undefined?n+': '+JSON.stringify(detail):n);};
 const post=async e=>{const r=await fetch(b.server.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)});if(!r.ok)throw Error('HTTP '+r.status);await sleep(80);return r.json();};
 const waitUntil=async(expr,ms=4000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await b.ev(expr))return true;await sleep(80);}return await b.ev(expr);};
 try{
  await b.go('?qa=1');
  const base={provider:'codex',agent:'main-queue',role:'Codex',kind:'main',category:'code'};
  await post({...base,type:'call',session:'one',flow_id:'q-one',event_id:'q-one-call'});
  await b.ev('officeQA.advance(5);0');
  await post({...base,type:'call',session:'two',flow_id:'q-two',event_id:'q-two-call'});
  await b.ev('officeQA.advance(5);0');
  check('second call deposited',await b.ev('officeDebug().actors.find(a=>a.id==="codex").inbox===1&&OfficeFlow.snapshot().filter(f=>f.provider==="codex"&&f.status==="working").length===2'));
  const rep1=await post({...base,type:'report',session:'one',flow_id:'q-one',event_id:'q-one-rep',tokens:10});
  await b.ev('OfficeFlow.advance(600);officeQA.advance(2);0');
  await waitUntil('officeDebug().reports.some(r=>r.id==='+JSON.stringify(rep1.report.id)+'&&r.inTray)');
  check('provider picks inbox after first report',await b.ev('officeDebug().actors.find(a=>a.id==="codex").inbox===0&&OfficeFlow.snapshot().filter(f=>f.provider==="codex"&&f.status==="working").length===1&&officeDebug().reports.some(r=>r.id==='+JSON.stringify(rep1.report.id)+'&&r.inTray)'));
  check('provider resumes typing',await b.ev('officeDebug().actors.find(a=>a.id==="codex").activity===I18n.raw("strings.mengetik")'));
  await b.ev('officeQA.tick(1);0');
  check('screen powered for queued task',await b.ev('design.world.get("desk-1").screen.powered===true'));
  const rep2=await post({...base,type:'report',session:'two',flow_id:'q-two',event_id:'q-two-rep',tokens:12});
  await b.ev('OfficeFlow.advance(600);officeQA.advance(2);0');
  await waitUntil('officeDebug().reports.filter(r=>r.inTray).length===2');
  check('two independent reports delivered',await b.ev('officeDebug().reports.filter(r=>r.inTray).length===2&&officeDebug().reports.some(r=>r.id==='+JSON.stringify(rep1.report.id)+'&&r.inTray)&&officeDebug().reports.some(r=>r.id==='+JSON.stringify(rep2.report.id)+'&&r.inTray)'));

  await b.go('?qa=1');
  await post({...base,type:'call',session:'workers',flow_id:'q-workers',event_id:'q-workers-call'});
  await b.ev('officeQA.advance(4);0');
  for(let i=0;i<3;i++)await post({type:'spawn',provider:'codex',agent:'sub-queue-'+i,parent:'main-queue',role:'Researcher',status:'working',category:'doc',session:'workers',flow_id:'q-workers',event_id:'q-workers-s'+i});
  await b.ev('OfficeFlow.advance(300);officeQA.advance(4);0');
  check('three workers entered',await b.ev('(()=>{const f=OfficeFlow.snapshot().find(x=>x.session==="workers");const ps=f?f.nodes.filter(n=>n.role==="persona"&&n.status==="working"):[];return ps.length===3;})()'));
  await post({type:'call',provider:'gemini',agent:'main-gemini-queue',role:'Gemini',kind:'main',session:'parallel',flow_id:'q-parallel',event_id:'q-parallel-call',category:'doc'});
  await b.ev('OfficeFlow.advance(300);officeQA.advance(4);0');
  check('other provider handoff while awaiting workers',await b.ev('officeDebug().milestones.some(m=>m.stage==="task-received"&&m.detail==="gemini")&&OfficeFlow.snapshot().some(f=>f.provider==="gemini"&&f.status==="working")'));
  for(let i=0;i<3;i++)await post({type:'retire',provider:'codex',agent:'sub-queue-'+i,parent:'main-queue',role:'Researcher',status:'done',session:'workers',flow_id:'q-workers',event_id:'q-workers-r'+i});
  const rep3=await post({...base,type:'report',session:'workers',flow_id:'q-workers',event_id:'q-workers-rep',tokens:20});
  await b.ev('OfficeFlow.advance(700);officeQA.advance(2);0');
  await waitUntil('officeDebug().reports.some(r=>r.id==='+JSON.stringify(rep3.report.id)+'&&r.inTray)');
  check('workers return before leader report',await b.ev('(()=>{const f=OfficeFlow.snapshot().find(x=>x.session==="workers");const ps=f?f.nodes.filter(n=>n.role==="persona"):[];return ps.length===3&&ps.every(n=>n.status==="completed")&&f.status==="completed"&&officeDebug().reports.some(r=>r.id==='+JSON.stringify(rep3.report.id)+'&&r.inTray);})()'));
  out.collisions=await b.ev('officeDebug().collisions');
  check('routes zero',out.collisions.routeFailures===0);
  out.console=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(e.params.type));
  check('console zero',!out.console.length);
 }catch(e){out.exception=e.stack;}finally{
  await fs.writeFile(path.join(root,'qa/v10_provider_queue_results.json'),JSON.stringify(out,null,2));
  await b.close();
  const f=path.resolve(b.fixture);
  if(path.dirname(f)===path.resolve(root,'qa'))await fs.rm(f,{recursive:true,force:true,maxRetries:15,retryDelay:100});
  console.log(JSON.stringify(out));
  if(out.fail.length||out.exception)process.exitCode=1;
 }
})();
