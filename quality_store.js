'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./persona_schema'),{tokenUsage,sum}=require('./office_data'),{CATEGORIES}=require('./collector');
const TYPES=['persona_call','submit','inspect_start','verdict','revise','learn','escalate'];
const fail=(status=400)=>{const e=Error('metadata mutu tidak valid');e.status=status;throw e;},hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,16);
function validate(input,personas){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['type','persona','engine','task_id','round','result','checks_passed','checks_total','category','status','duration_s','tokens','event_id'].includes(k)))fail();
 const e={...input};if(e.type!=='verdict'&&['result','checks_passed','checks_total'].some(k=>Object.hasOwn(e,k))||e.type!=='learn'&&Object.hasOwn(e,'status'))fail();if(e.type==='call')e.type='persona_call';if(!TYPES.includes(e.type)||!P.slug(e.persona)||!P.engines.includes(e.engine)||!((typeof e.task_id==='string'&&/^[a-zA-Z0-9-]{1,32}$/.test(e.task_id))||(Number.isSafeInteger(e.task_id)&&e.task_id>=0&&e.task_id<=1e9)))fail();
 if(!Number.isInteger(e.round)||e.round<1||e.round>3)fail();
 if(e.category!==undefined&&!CATEGORIES.includes(e.category))fail();
 if(e.result!==undefined&&!['pass','fail','unsure'].includes(e.result)||e.status!==undefined&&!['pending','approved'].includes(e.status))fail();
 for(const k of ['checks_passed','checks_total'])if(e[k]!==undefined&&(!Number.isInteger(e[k])||e[k]<0||e[k]>200))fail();
 if((e.checks_passed===undefined)!==(e.checks_total===undefined)||e.checks_passed>e.checks_total||e.type==='verdict'&&(!e.result||e.checks_passed===undefined)||e.type==='learn'&&!e.status)fail();
 if(e.duration_s!==undefined&&(typeof e.duration_s!=='number'||!Number.isFinite(e.duration_s)||e.duration_s<0||e.duration_s>1e9))fail();
 if(e.event_id!==undefined&&(typeof e.event_id!=='string'||!/^[a-zA-Z0-9_.:-]{1,64}$/.test(e.event_id)))fail();
 e.usage=tokenUsage(e.tokens);e.tokens=sum(e.usage);e.task_id=hash(e.task_id);e.registered=personas.some(p=>p.id===e.persona);e.provider=e.engine;e.agent='persona-'+e.persona;e.kind='persona';return e;
}
// Restore only the same metadata shapes that HTTP validation can create.
function validState(s){
 const obj=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k)),integer=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max,hex=v=>typeof v==='string'&&/^[a-f0-9]{16}$/.test(v),date=v=>typeof v==='string'&&v.length<=30&&Number.isFinite(Date.parse(v)),round=v=>Number.isInteger(v)&&v>=1&&v<=3,result=v=>['pass','fail','unsure'].includes(v),checks=v=>integer(v.checks_passed,200)&&integer(v.checks_total,200)&&v.checks_passed<=v.checks_total;
 if(!obj(s,['version','serial','tasks','learnings','eventIds'])||s.version!==1||!integer(s.serial)||!Array.isArray(s.tasks)||s.tasks.length>2000||!Array.isArray(s.learnings)||s.learnings.length>2000||!Array.isArray(s.eventIds)||s.eventIds.length>2000||s.eventIds.some(v=>typeof v!=='string'||!/^[a-zA-Z0-9_.:-]{1,64}$/.test(v)))return false;
 const ids=new Set();for(const t of s.tasks){if(!obj(t,['id','number','persona','registered','engine','category','round','stage','result','rounds','created_at','updated_at','checks_passed','checks_total','report','tokens','duration_s'])||!hex(t.id)||!integer(t.number)||t.number<1||t.number>s.serial||!P.slug(t.persona)||typeof t.registered!=='boolean'||!P.engines.includes(t.engine)||!CATEGORIES.includes(t.category)||!round(t.round)||!['queued','working','inspection','checking','revision','passed','escalated'].includes(t.stage)||!(t.result===null||result(t.result))||!date(t.created_at)||!date(t.updated_at)||!Array.isArray(t.rounds)||t.rounds.length>3||t.rounds.some(r=>!obj(r,['round','result','time','checks_passed','checks_total'])||!round(r.round)||!result(r.result)||!date(r.time)||!checks(r))||(t.checks_passed!==undefined||t.checks_total!==undefined)&&!checks(t)||t.tokens!==undefined&&!integer(t.tokens)||t.duration_s!==undefined&&(typeof t.duration_s!=='number'||!Number.isFinite(t.duration_s)||t.duration_s<0))return false;const id=t.persona+'|'+t.id;if(ids.has(id))return false;ids.add(id);if(t.report&&(!obj(t.report,['id','read','archived','time'])||typeof t.report.id!=='string'||!/^[a-f0-9-]{36}$/.test(t.report.id)||typeof t.report.read!=='boolean'||typeof t.report.archived!=='boolean'||t.report.time!==undefined&&!date(t.report.time)))return false;}
 const learnIds=new Set();for(const l of s.learnings){if(!obj(l,['id','task_id','number','persona','round','status','time','decided_at'])||!hex(l.id)||!hex(l.task_id)||!integer(l.number)||l.number<1||!P.slug(l.persona)||!round(l.round)||!['pending','approved','rejected'].includes(l.status)||!date(l.time)||l.decided_at!==undefined&&!date(l.decided_at)||learnIds.has(l.id))return false;learnIds.add(l.id);}return true;
}
async function createQuality({dataDir,now=Date.now,personas}){
 const file=path.join(dataDir,'quality.json');let state={version:1,serial:0,tasks:[],learnings:[],eventIds:[]};
 try{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8*1024*1024)throw Error('unsafe');const v=JSON.parse(await fs.readFile(file,'utf8'));if(!validState(v))throw Error('format');state=v;}catch(e){if(e.code!=='ENOENT')throw Error('Data mutu tidak dapat dibaca');}
 async function save(next){const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(next)+'\n',{flag:'wx'});await fs.rename(tmp,file);state=next;}finally{await fs.unlink(tmp).catch(()=>{});}}
 const rows=()=>structuredClone(state.tasks),learnings=()=>structuredClone(state.learnings);
 async function apply(e){if(e.event_id&&state.eventIds.includes(e.event_id))return{duplicate:true};const next=structuredClone(state),at=new Date(now()).toISOString();let task=next.tasks.find(t=>t.id===e.task_id&&t.persona===e.persona);
 if(e.type==='persona_call'){if(!task){task={id:e.task_id,number:++next.serial,persona:e.persona,registered:e.registered,engine:e.engine,category:e.category||'doc',round:1,stage:'queued',result:null,rounds:[],created_at:at,updated_at:at};next.tasks.push(task);}else if(task.stage!=='queued')fail(409);if(e.round!==1)fail();}
 else{if(!task)fail(409);if(e.type==='revise'){if(!['fail','unsure'].includes(task.result)||task.round>=3||e.round!==task.round+1)fail(409);task.round=e.round;task.result=null;task.stage='revision';}
 else{if(e.round!==task.round)fail(409);if(e.type==='submit'){if(!['queued','working','revision'].includes(task.stage))fail(409);task.stage='inspection';task.result=null;}
 else if(e.type==='inspect_start'){if(task.stage!=='inspection')fail(409);task.stage='checking';}
 else if(e.type==='verdict'){if(task.stage!=='checking')fail(409);task.result=e.result;task.checks_passed=e.checks_passed;task.checks_total=e.checks_total;task.rounds.push({round:e.round,result:e.result,time:at,checks_passed:e.checks_passed,checks_total:e.checks_total});task.stage=e.result==='pass'?'passed':e.round===3?'escalated':'revision';}
 else if(e.type==='escalate'){if(e.round!==3||!['fail','unsure'].includes(task.result))fail(409);task.stage='escalated';}
 else if(e.type==='learn'){if(!task.rounds.some(r=>r.result!=='pass')&&task.stage!=='passed')fail(409);const id=hash(task.id+'|'+task.persona+'|'+e.round);if(!next.learnings.some(l=>l.id===id))next.learnings.push({id,task_id:task.id,number:task.number,persona:e.persona,round:e.round,status:e.status,time:at});}}
 }
 if(['passed','escalated'].includes(task.stage)&&!task.report)task.report={id:crypto.randomUUID(),read:false,archived:false,time:at};
 if(e.tokens!==null){const n=(task.tokens||0)+e.tokens;if(!Number.isSafeInteger(n))fail();task.tokens=n;}if(e.duration_s!==undefined)task.duration_s=(task.duration_s||0)+e.duration_s;task.updated_at=at;if(e.event_id){next.eventIds.push(e.event_id);next.eventIds=next.eventIds.slice(-2000);}next.tasks=next.tasks.slice(-2000);next.learnings=next.learnings.slice(-2000);await save(next);return{task:structuredClone(task),learning:e.type==='learn'?next.learnings.find(l=>l.id===hash(e.task_id+'|'+e.persona+'|'+e.round)):undefined};}
 function summary(){const list=[...new Set([...personas().map(p=>p.id),...state.tasks.map(t=>t.persona)])];const stats=tasks=>{const completed=tasks.filter(t=>['passed','escalated'].includes(t.stage)),first=completed.filter(t=>t.rounds[0]?.result==='pass').length;return{tasks:tasks.length,completed:completed.length,first_pass:first,first_pass_pct:completed.length?Math.round(first/completed.length*100):0,average_rounds:completed.length?Math.round(completed.reduce((s,t)=>s+t.round,0)/completed.length*100)/100:0,escalations:tasks.filter(t=>t.stage==='escalated').length};};return{overall:{...stats(state.tasks),learnings:state.learnings.filter(l=>l.status!=='rejected').length},personas:list.map(id=>({persona:id,registered:personas().some(p=>p.id===id),...stats(state.tasks.filter(t=>t.persona===id)),learnings:state.learnings.filter(l=>l.persona===id&&l.status!=='rejected').length})),retained:state.tasks.length,limit:2000};}
 async function decision(id,body){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!['approve','reject'].includes(body.decision))fail();const next=structuredClone(state),l=next.learnings.find(l=>l.id===id);if(!l)fail(404);if(l.status!=='pending')fail(409);l.status=body.decision==='approve'?'approved':'rejected';l.decided_at=new Date(now()).toISOString();await save(next);return{learning:structuredClone(l)};}
 const reports=()=>state.tasks.filter(t=>t.report).map(t=>({...t.report,persona:t.persona,provider:t.engine,number:t.number,round:t.round,result:t.stage==='passed'?'pass':'escalate',time:t.report.time||t.updated_at,task:'Tugas selesai',tokens:null,duration_s:0}));
 async function updateReports(ids,action){
  const key=action==='read'?'read':'archived',requested=new Set(ids),next=structuredClone(state);
  const rows=next.tasks.map(t=>t.report).filter(r=>r&&requested.has(r.id)&&(key==='read'||r.read));
  const changed=rows.filter(r=>!r[key]);
  if(changed.length){for(const r of changed)r[key]=true;await save(next);}
  return rows.map(r=>r.id);
 }
 async function updateReport(id,action){
  const r=state.tasks.find(t=>t.report?.id===id)?.report;
  if(!r)fail(404);
  if(action==='archive'&&!r.read)fail(409);
  await updateReports([id],action);
  return reports().find(r=>r.id===id);
 }
 return{apply,summary,reports,updateReport,updateReports,tasks:limit=>rows().reverse().slice(0,limit),learnings,decision};
}
module.exports={validate,createQuality,TYPES};
