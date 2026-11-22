'use strict';
// v4: tes kontrak publik; tidak mengekstrak fragmen implementasi frontend.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {startServer}=require('./embedded_server');
const exec=promisify(execFile),root=__dirname;
async function main(){
 for(const file of ['main.js','embedded_server.js','office.js','chars.js','furniture.js','verify_desktop.js'])await exec(process.execPath,['--check',path.join(root,file)],{cwd:root,windowsHide:true});
 let clock=new Date(2026,10,15,12).getTime();const portFile=path.join(root,'qa','v4-server-test','port.txt');const s=await startServer({root,port:0,maxPort:0,portFile,now:()=>clock});
 const post=async value=>fetch(s.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 const event={agent:'main-test',role:'Claude',status:'working',task:'mengedit office.js',tokens:20,cost_idr:4};
 const result={syntax:true,checks:[]};const check=name=>result.checks.push(name);
 let reader;
 try{
  assert.equal((await fs.readFile(portFile,'utf8')).trim(),String(s.port));check('port fixture workspace');
  const stream=await fetch(s.origin+'/events');reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: state/);check('SSE snapshot');
  assert.equal((await post(event)).status,200);const chunk=new TextDecoder().decode((await reader.read()).value);assert.match(chunk,/main-test/);check('SSE broadcast');
  let state=await(await fetch(s.origin+'/state')).json();assert.equal(state.total_tokens,20);assert.equal(state.tokens_today,20);assert.equal(state.agents[0].provider,'claude');check('status kompatibel dan inferensi provider');
  for(const extra of [{prompt:'PRIVATE_SENTINEL'},{command:'PRIVATE_SENTINEL'},{content:'PRIVATE_SENTINEL'},{unknown:1},{tokens:-1},{tokens:true},{duration_s:-1},{provider:'invalid'},{kind:'invalid'},{status:'invalid'},{task:null},{parent:'invalid space'}])assert.equal((await post({...event,...extra})).status,400);
  assert.equal((await post({...event,task:'PRIVATE_SENTINEL prompt atau perintah'})).status,200);state=await(await fetch(s.origin+'/state')).json();assert(!JSON.stringify(state).includes('PRIVATE_SENTINEL'));assert.equal(state.agents[0].task,'Aktivitas agen');check('bidang tak dikenal ditolak; teks bebas tidak disimpan');
  for(const type of ['call','report','spawn','retire'])assert.equal((await post({type,provider:'gemini',session:'qa-'+type,parent:'main-gemini',tokens:10})).status,200);check('metadata event v4 diterima tanpa endpoint fase 2');
  assert.equal((await fetch(s.origin+'/event',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(s.origin+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(17000)})).status,413);
  assert.equal((await fetch(s.origin+'/state',{headers:{Origin:'https://example.invalid'}})).status,403);
  assert.equal(await new Promise((resolve,reject)=>{const req=require('node:http').get(s.origin+'/state',{headers:{Host:'example.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);}),403);check('MIME, ukuran, Origin, Host');
  for(const name of ['index.html','office.js','chars.js','furniture.js','vendor/three.min.js'])assert.equal((await fetch(s.origin+'/'+name)).status,200);
  for(const route of ['/REPORT.md','/main.js','/private-nonpublic','/%2e%2e%2fpackage.json','/reports','/usage/daily'])assert.equal((await fetch(s.origin+route)).status,404);check('allowlist aset, traversal, fase 2 belum tersedia');
  for(let i=0;i<251;i++)assert.equal((await post({agent:'queue-'+i,role:'QA',status:'working'})).status,200);
  assert.equal((await post({agent:'overflow',role:'QA',status:'working'})).status,200); // Entri done boleh direklamasi.
  while((await(await fetch(s.origin+'/state')).json()).agents.length<256)await post({agent:'fill-'+Math.random(),role:'QA',status:'working'});
  // Semua entri done sudah diambil ulang sebelum kapasitas final diperiksa.
  for(let i=0;i<4;i++)await post({agent:'more-'+i,role:'QA',status:'working'});
  assert.equal((await post({agent:'full',role:'QA',status:'working'})).status,409);check('antrean terbatas 256, kursi frontend terpisah');
  clock+=601000;state=await(await fetch(s.origin+'/state')).json();assert(state.agents.every(a=>a.status==='idle'));assert.equal(state.cost_idr_today,8);check('idle 600 detik');
  clock+=86400000;state=await(await fetch(s.origin+'/state')).json();assert.equal(state.cost_idr_today,0);assert.equal(state.tokens_today,0);assert.equal(state.total_tokens,80);check('reset tanggal lokal, total tetap');
 }finally{if(reader)await reader.cancel();await s.close();}
 await assert.rejects(fs.access(portFile),{code:'ENOENT'});check('shutdown dan port.txt dibersihkan');
 await fs.writeFile(path.join(root,'qa','v4_desktop_results.json'),JSON.stringify(result,null,2));console.log('LULUS: '+result.checks.join('; '));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
