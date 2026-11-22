/* [Diubah oleh Codex - 2026-11-22] Synthetic log sources only; never discovers user homes. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
async function prepare(fixture){
 const roots=Object.fromEntries(['claude','codex','codexAccounts','gemini','hermes'].map(k=>[k,path.join(fixture,'logs',k)]));
 for(const dir of Object.values(roots))await fs.mkdir(dir,{recursive:true});
 await fs.mkdir(path.join(roots.gemini,'conversations'));
 const gems=['fixture-main','fixture-child'].map(n=>path.join(roots.gemini,'conversations',n+'.db'));
 for(const file of gems){const db=new DatabaseSync(file);db.exec('create table gen_metadata(idx integer primary key, data blob)');db.prepare('insert into gen_metadata values(?,?)').run(0,Buffer.from([0]));db.close();}
 const hermes=[path.join(roots.hermes,'state.db'),path.join(roots.hermes,'profiles','fixture-helper','state.db')];
 for(const file of hermes){await fs.mkdir(path.dirname(file),{recursive:true});const db=new DatabaseSync(file);db.exec('create table session_model_usage(session_id text, model text, input_tokens int, output_tokens int, cache_read_tokens int, cache_write_tokens int, reasoning_tokens int, last_seen real); create table messages(id integer primary key, role text, tool_name text, timestamp real)');db.prepare('insert into session_model_usage values(?,?,?,?,?,?,?,?)').run('fixture','fixture-model',0,0,0,0,0,Date.now()/1000);db.close();}
 let clock=Date.now();
 return {options:{collector:{roots},now:()=>clock},async update(){
  clock+=6000;
  for(const file of gems){const db=new DatabaseSync(file);db.prepare('insert into gen_metadata values(?,?)').run(1,Buffer.from([0]));db.close();await fs.utimes(file,new Date(clock),new Date(clock));}
  for(const file of hermes){const db=new DatabaseSync(file);db.prepare('insert into messages values(?,?,?,?)').run(1,'user',null,clock/1000);db.close();await fs.utimes(file,new Date(clock),new Date(clock));}
 },async retire(){clock+=40000;}};
}
module.exports={prepare};
if(require.main===module)(async()=>{
 process.env.OFFICE_MT5_AUTODETECT='0';
 const assert=require('node:assert/strict'),fixture=await fs.mkdtemp(path.join(__dirname,'v21-source-'));let server;
 try{
  const sources=await prepare(fixture);
  server=await require('../embedded_server').startServer({root:path.resolve(__dirname,'..'),cwd:fixture,dataDir:path.join(fixture,'data'),port:0,maxPort:0,allowDriveScan:false,...sources.options});
  await server.collectorReady;await sources.update();await server.collector.tick();
  const state=await fetch(server.origin+'/flow/state').then(r=>r.json());
  const result=state.flows.map(f=>({provider:f.provider,source:f.source,estimated:f.estimated,children:f.nodes.filter(n=>n.role==='persona').length}));
  for(const p of ['gemini','hermes'])assert.ok(result.some(f=>f.provider===p&&f.source==='log'&&f.children>0),p+' fixture child');
  let typeChecks=0;
  for(const [i,type] of ['custom-helper','任意助手','','../untrusted','api_key=fixture-only'].entries()){
   const r=await fetch(server.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'spawn',provider:'claude',agent:'v21-type-'+i,parent:'main-claude',kind:'subagent',session:'v21-types',agent_type:type,status:'working'})});assert.equal(r.status,200);
   const snapshot=await fetch(server.origin+'/flow/state').then(r=>r.json()),node=snapshot.flows.flatMap(f=>f.nodes).find(n=>n.agent==='v21-type-'+i);
   assert.equal(node.agentType,i<3?type:'general-purpose');typeChecks++;
   if(i>=3)assert.ok(!JSON.stringify(snapshot).includes(type),'unsafe labels do not enter flow state');
  }
  await fs.writeFile(path.join(__dirname,'v21_sources_results.json'),JSON.stringify({ok:true,typeChecks,flows:result},null,2));console.log(JSON.stringify({ok:true,typeChecks,flows:result}));
 }finally{await server?.close();assert.equal(path.dirname(path.resolve(fixture)),__dirname);await fs.rm(fixture,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
