/* V16-C [Diubah oleh Codex - 2026-11-21] Real report rows must follow only their own return packet. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {open,root,sleep,lockBrowser}=require('./v16_3d_lib.cjs');
async function run(b){
 const checks=[];
 const check=(name,value,detail)=>{checks.push({name,ok:!!value,detail});assert.ok(value,name+': '+JSON.stringify(detail));};
 const post=async e=>{const r=await fetch(b.server.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)});assert.equal(r.status,200);return r.json();};
 const wait=async expression=>{const end=Date.now()+4000;while(Date.now()<end){if(await b.ev(expression))return;await sleep(20);}const state=await b.ev('({reports:officeDebug().reports,flows:OfficeFlow.snapshot(),stats:OfficeFlow.stats()})');throw Error('Report state timeout: '+expression+' '+JSON.stringify(state));};
 await b.ev('officeQA.freeze();OfficeFlow.clear();OfficeFlow.configure({...OfficeSettings.get().flow16,walkAnimation:"fast"});0');
 for(const sameSession of [false,true]){
  await b.ev('OfficeFlow.clear();0');
  const tag='delivery-'+(sameSession?'same':'different'),base={provider:'codex',source:'hook',agent:'main-delivery',kind:'main'};
  const a={...base,session:tag+'-a',flow_id:tag+'-a'},c={...base,session:sameSession?a.session:tag+'-b',flow_id:tag+'-b'};
  await post({...a,type:'call',event_id:tag+'-a-call'});await post({...c,type:'call',event_id:tag+'-b-call'});
  // A live subscriber must observe both calls before completion; initial hydration is a separate history path.
  await wait('OfficeFlow.snapshot().filter(f=>f.status==="working"&&('+[a.session,c.session].map(s=>'f.session==='+JSON.stringify(s)).join('||')+')).length===2');
  const ra=(await post({...a,type:'report',event_id:tag+'-a-report'})).report;
  await wait('officeDebug().reports.some(r=>r.id==='+JSON.stringify(ra.id)+'&&!r.inTray)');
  await b.ev('OfficeFlow.advance(200,true);0');
  const rb=(await post({...c,type:'report',event_id:tag+'-b-report'})).report;
  await wait('officeDebug().reports.some(r=>r.id==='+JSON.stringify(rb.id)+'&&!r.inTray)');
  const delivery=await b.ev('OfficeFlow.advance(300,true);({a:officeDebug().reports.find(r=>r.id==='+JSON.stringify(ra.id)+'),b:officeDebug().reports.find(r=>r.id==='+JSON.stringify(rb.id)+')})');
  check(tag+' first report reaches tray',delivery.a.inTray,delivery);
  check(tag+' sibling report waits for its own packet',!delivery.b.inTray,delivery);
  await b.ev('OfficeFlow.advance(200,true);0');
  check(tag+' second report reaches tray after its return',await b.ev('officeDebug().reports.some(r=>r.id==='+JSON.stringify(rb.id)+'&&r.inTray)'));
 }
 // No frame/advance is allowed here: fallback must keep the real quick action usable in a frozen/background tab.
 await b.ev('OfficeFlow.clear();0');
 const ids=await fetch(b.server.origin+'/reports').then(r=>r.json()).then(r=>r.reports.map(r=>r.id));
 const read=await fetch(b.server.origin+'/reports/batch/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});assert.equal(read.status,200);
 await wait('document.getElementById("quickReadAll").disabled');
 const frozen={provider:'codex',agent:'main-frozen',session:'delivery-frozen',flow_id:'delivery-frozen'};
 await post({...frozen,type:'call',event_id:'delivery-frozen-call'});
 await wait('OfficeFlow.snapshot().some(f=>f.session==="delivery-frozen"&&f.status==="working")');
 const rf=(await post({...frozen,type:'report',event_id:'delivery-frozen-report'})).report;
 await wait('officeDebug().reports.some(r=>r.id==='+JSON.stringify(rf.id)+'&&r.inTray)&&!document.getElementById("quickReadAll").disabled');
 check('frozen tab delivers report and enables quick action without a rendered frame',true);
 return checks;
}
async function main(){
 const before=process.argv.includes('--before'),unlock=await lockBrowser('v16_3d_reports_test');let b;const out={before};
 try{const sourceOverrides=before?{'/office.js':await fs.readFile(path.join(root,'cadangan/v16c-codex/office.js'),'utf8')}:{};b=await open({sourceOverrides});await b.go('?qa=1');out.checks=await run(b);out.ok=true;console.log(JSON.stringify({ok:true,checks:out.checks.length}));}
 catch(error){out.error=error.stack;throw error;}
 finally{try{await b?.close();}finally{await unlock();await fs.writeFile(path.join(__dirname,'v16_3d_reports_'+(before?'before':'results')+'.json'),JSON.stringify(out,null,2));}}
}
module.exports={run};
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
