// [Diubah oleh Codex - 2026-11-21] QA V14-A: hanya shim lokal, tidak memanggil agen berbayar atau upload.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {createShortPipeline,safePath}=require('../short_pipeline');
const {startServer}=require('../embedded_server');
const base=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('OK '+name);}
// [Diubah oleh Gemini - 2026-11-21] Bersihkan nama channel & path pribadi untuk repo publik
function detectTestPython(){
  if(process.env.OFFICE_AI_PYTHON)return process.env.OFFICE_AI_PYTHON;
  const r=spawnSync('python',['-c','import sys;print(sys.executable)'],{encoding:'utf8',windowsHide:true,timeout:4000});
  const exe=String(r.stdout||'').trim();
  return exe||undefined;
}
async function setup(){
  const dir=await fs.mkdtemp(path.join(__dirname,'v14-a-test-')),root=path.join(dir,'Project'),dataDir=path.join(dir,'data');
  await fs.mkdir(path.join(root,'Tools/youtube'),{recursive:true});await fs.mkdir(dataDir);
  const registry={demostudio:{title:'Studio QA',projects:'Channels/DemoStudio/Videos',language:'en',formats:['short','long']}};
  await fs.writeFile(path.join(root,'Tools/youtube/channels.json'),JSON.stringify(registry));
  const shim=path.join(root,'shim.cjs');
  await fs.writeFile(shim,`const fs=require('fs'),p=require('path');const [stage,dir,slug,mode]=process.argv.slice(2);const put=(n,t)=>{const f=p.resolve(dir,n);fs.mkdirSync(p.dirname(f),{recursive:true});fs.writeFileSync(f,t);};console.log('shim '+stage+' '+mode);if(mode==='slow'){const {spawn}=require('child_process');spawn(process.execPath,['-e',"setTimeout(()=>require('fs').writeFileSync(process.argv[1],'orphan'),1000)",p.join(dir,'orphan.txt')],{stdio:'ignore'});setTimeout(()=>{},60000);return;}if(mode==='limit'){console.log('SEMUA akun codex kena limit; try again at 18:30');process.exit(0);}if(mode==='empty')return;switch(stage){case 'brief':put('office_pipeline/artifacts/brief.md','# Brief');break;case 'research':put('office_pipeline/artifacts/fakta_report.md','Klaim terverifikasi https://example.org/a https://example.net/b');break;case 'script':put('script.json',JSON.stringify(['A complete narration.']));break;case 'voice':put('audio/vo.wav','RIFF fixture');put('audio/words_new.json','[{"word":"hello","start":0,"end":1}]');break;case 'scene':put('scene.js',mode==='syntax'?'const = ;':'const scene = 1;');break;case 'render':put('../../Renders/'+slug+'.mp4','video fixture');put('preview_720.mp4','preview fixture');break;case 'qa':put('office_pipeline/artifacts/qa_numeric.txt','silence: 0; still: 0');put('qa/qa_report.md',mode==='qa_fail'?'| Gerak | GAGAL | Perbaiki gerak |\\nVERDICT: GAGAL':'| Gerak | LOLOS | Bukti |\\nVERDICT: LOLOS');break;case 'metadata':put('upload.json',JSON.stringify({channel:'demostudio',format:'short',title:'QA video',video:'Channels/DemoStudio/Renders/'+slug+'.mp4',privacyStatus:'private'}));put('description.txt','Description');put('localizations.json','{}');put('thumbnail.jpg','jpg fixture');put('office_pipeline/artifacts/dry_run.txt','DRY-RUN OK: scheduled, no upload');break;case 'upload':throw Error('UPLOAD MUST NOT RUN IN QA');}`);
  let mode='',modeStage='',events=[];
  const adapter=async({run,stage,exec})=>exec(process.execPath,[shim,stage.id,run.dir,run.slug,stage.id===modeStage?mode:'normal']);
  const options={dataDir,getProjectDir:()=>root,testAdapter:adapter,onEvent:e=>events.push(e),timeoutMs:3000,pythonPath:detectTestPython()};
  return {dir,root,dataDir,options,adapter,events,setMode:(s,m)=>{modeStage=s;mode=m;}};
}
async function run(){
  const f=await setup();let p=await createShortPipeline(f.options),server;
  try {
    await check('path traversal, Secrets, ADS dan symlink ditolak',async()=>{
      for(const target of [path.join(f.root,'Secrets/token.json'),f.root+'/../outside',f.root+'/file:stream',f.root+'/.git/config',f.root+'/Secrets./x'])await assert.rejects(safePath(f.root,target));
      const out=path.join(f.dir,'outside'),link=path.join(f.root,'junction');await fs.mkdir(out);await fs.symlink(out,link,'junction');await assert.rejects(safePath(f.root,path.join(link,'x')));await fs.unlink(link);
    });
    let r;
    await check('berkas otomatis sampai G1, manifest, log dan event',async()=>{
      r=await p.create({channel:'demostudio',topic:'Why does rain fall?'});r=await p.wait(r.id);assert.equal(r.gate,'G1');assert.equal(r.current,2);assert.equal(r.stages[3].attempts,0);assert(f.events.some(e=>e.type==='short_log'));assert(f.events.some(e=>e.type==='workflow_update'));assert.equal(JSON.parse(await fs.readFile(path.join(r.dir,'office_pipeline/state.json'))).gate,'G1');
    });
    await check('satu run per channel dan gerbang tidak dapat dilewati',async()=>{
      await assert.rejects(p.create({channel:'demostudio',topic:'Other'}),{code:'channel_busy'});await assert.rejects(p.action(r.id,'skip'),{code:'gate_cannot_skip'});await assert.rejects(p.create({channel:'demostudio',slug:'../../Secrets'}));
    });
    await check('revisi naskah dan editor G1',async()=>{
      await p.action(r.id,'reject',{feedback:'Hook lebih jelas'});await p.action(r.id,'resume');r=await p.wait(r.id);assert.equal(r.stages[2].feedback,'Hook lebih jelas');assert.equal(r.stages[2].attempts,2);await p.editScript(r.id,'["Naskah diedit user."]');assert.deepEqual(JSON.parse(await fs.readFile(path.join(r.dir,'script.json'))),['Naskah diedit user.']);
    });
    await check('QA gagal berhenti; laporan dan perbaikan scene-render-QA',async()=>{
      f.setMode('qa','qa_fail');await p.action(r.id,'approve');r=await p.wait(r.id);assert.equal(r.status,'failed');assert.equal(r.stages[6].errorCode,'qa_failed');assert(await p.artifact(r.id,'qa/qa_report.md'));f.setMode('','');await p.action(r.id,'repair');r=await p.wait(r.id);assert.equal(r.gate,'G2');assert.equal(r.qaRounds,1);assert.equal(r.stages[4].attempts,2);assert.equal(r.stages[5].attempts,2);
    });
    await check('G2 ke G3; dry-run tanpa upload dan konfirmasi eksplisit',async()=>{
      await p.action(r.id,'approve');r=await p.wait(r.id);assert.equal(r.gate,'G3');assert.equal(r.status,'awaiting_approval');assert(!r.uploadedAt);await assert.rejects(p.action(r.id,'upload',{}),{code:'confirmation_required'});const c=await p.action(r.id,'confirm-upload');assert.equal(c.confirmation.channel,'Studio QA');assert.equal(c.confirmation.privacy,'private (scheduled)');await fs.appendFile(path.join(r.dir,'description.txt'),'changed');await assert.rejects(p.action(r.id,'upload',{confirmed:true,nonce:c.confirmation.nonce}),{code:'dry_run_stale'});await assert.rejects(p.artifact(r.id,'../../Secrets/token.json'));await p.action(r.id,'cancel');
    });
    await check('limit exit 0 terdeteksi dan bisa dilanjutkan',async()=>{
      f.setMode('brief','limit');r=await p.create({channel:'demostudio',topic:'Quota'});r=await p.wait(r.id);assert.equal(r.status,'waiting_limit');assert.equal(r.retryAfter,'18:30');f.setMode('','');await p.action(r.id,'resume');r=await p.wait(r.id);assert.equal(r.gate,'G1');await p.action(r.id,'cancel');
    });
    await check('exit 0 dengan berkas kosong bukan sukses',async()=>{
      f.setMode('brief','empty');r=await p.create({channel:'demostudio',topic:'Empty'});r=await p.wait(r.id);assert.equal(r.status,'failed');assert.equal(r.stages[0].errorCode,'missing_artifact');await p.action(r.id,'cancel');
    });
    await check('batal membunuh pohon proses milik tahap',async()=>{
      f.setMode('brief','slow');r=await p.create({channel:'demostudio',topic:'Cancel'});await sleep(250);await p.action(r.id,'cancel');r=p.get(r.id);assert.equal(r.status,'cancelled');await sleep(1100);assert.equal(await fs.stat(path.join(r.dir,'orphan.txt')).catch(()=>null),null);
    });
    await check('resume setelah restart tanpa mengulang tahap selesai',async()=>{
      f.setMode('brief','slow');r=await p.create({channel:'demostudio',topic:'Restart'});await sleep(150);await p.stop();p=await createShortPipeline(f.options);assert.equal(p.get(r.id).status,'interrupted');f.setMode('','');await p.action(r.id,'resume');r=await p.wait(r.id);assert.equal(r.gate,'G1');await p.action(r.id,'cancel');
    });
    await check('timeout tahap tidak menggantung',async()=>{
      await p.stop();p=await createShortPipeline({...f.options,timeoutMs:100});f.setMode('brief','slow');r=await p.create({channel:'demostudio',topic:'Timeout'});r=await p.wait(r.id);assert.equal(r.status,'failed');assert.equal(r.stages[0].errorCode,'timeout');await p.action(r.id,'cancel');f.setMode('','');
    });
    await p.stop();p=await createShortPipeline(f.options);
    await check('sintaks scene diperiksa meski CLI exit 0',async()=>{
      f.setMode('scene','syntax');r=await p.create({channel:'demostudio',topic:'Syntax'});await p.wait(r.id);await p.action(r.id,'approve');r=await p.wait(r.id);assert.equal(r.current,4);assert.equal(r.status,'failed');assert.equal(r.stages[4].errorCode,'tool_failed');await p.action(r.id,'cancel');f.setMode('','');
    });
    await check('QA maksimal tiga putaran, laporan RAGU/GAGAL tidak diloloskan',async()=>{
      f.setMode('qa','qa_fail');r=await p.create({channel:'demostudio',topic:'Repair limit'});await p.wait(r.id);await p.action(r.id,'approve');await p.wait(r.id);
      for(let i=0;i<3;i++){await p.action(r.id,'repair');r=await p.wait(r.id);assert.equal(r.status,'failed');}
      assert.equal(r.qaRounds,3);await assert.rejects(p.action(r.id,'repair'),{code:'repair_limit'});await p.action(r.id,'cancel');f.setMode('','');
    });
    await check('perubahan berkas membatalkan persetujuan dan video terupload dilindungi',async()=>{
      r=await p.create({channel:'demostudio',topic:'Approval hashes'});await p.wait(r.id);await fs.writeFile(path.join(r.dir,'script.json'),'["changed outside editor"]');await assert.rejects(p.action(r.id,'approve'),{code:'gate_stale'});
      await p.editScript(r.id,'["approved script"]');await p.action(r.id,'approve');await p.wait(r.id);await fs.appendFile(path.join(r.dir,'preview_720.mp4'),'changed');await assert.rejects(p.action(r.id,'approve'),{code:'gate_stale'});
      await fs.writeFile(path.join(r.dir,'upload.json'),JSON.stringify({uploaded:{id:'fixture-only'}}));await assert.rejects(p.action(r.id,'retry'),{code:'already_uploaded'});await fs.unlink(path.join(r.dir,'upload.json'));await p.action(r.id,'cancel');
    });
    await check('kontrak runAgent tidak menimpa artefak dengan jawaban konsol',async()=>{
      const agent=async(_id,_prompt,opts)=>{assert.equal(opts.outputPath,undefined);const brief=opts.taskLabel.endsWith('brief');await fs.writeFile(path.join(opts.cwd,'office_pipeline/artifacts',brief?'brief.md':'fakta_report.md'),brief?'# Brief authored by agent':'Klaim https://example.org/1 https://example.net/2');return {ok:true,runId:'fake',output:'Done: files written.',outputFileLabel:'fake.md'};};
      const contract=await createShortPipeline({...f.options,dataDir:path.join(f.dir,'contract-data'),testAdapter:null,runAgent:agent});
      try{const c=await contract.create({channel:'demostudio',format:'long',topic:'Contract'});const done=await contract.wait(c.id);assert.equal(done.current,2);assert.equal(done.stages[1].status,'completed');assert.match(await fs.readFile(path.join(done.dir,'office_pipeline/artifacts/fakta_report.md'),'utf8'),/example.org/);}finally{await contract.stop();}
    });
    await check('upload terputus tidak pernah diulang otomatis',async()=>{
      r=await p.create({channel:'demostudio',topic:'Unknown upload'});await p.wait(r.id);await p.stop();const file=path.join(f.dataDir,'short_pipeline.json'),saved=JSON.parse(await fs.readFile(file,'utf8'));saved.runs.find(x=>x.id===r.id).status='uploading';await fs.writeFile(file,JSON.stringify(saved));p=await createShortPipeline(f.options);assert.equal(p.get(r.id).status,'upload_unknown');await assert.rejects(p.action(r.id,'resume'),{code:'run_finished'});await p.action(r.id,'cancel');
    });
    await p.stop();
    await fs.writeFile(path.join(f.dataDir,'short_workflows.json'),JSON.stringify({})); // config is set through the established API below
    server=await startServer({port:0,maxPort:0,collector:false,dataDir:f.dataDir,shortPipelineOptions:{testAdapter:f.adapter,pythonPath:f.options.pythonPath},youtubeDashboard:{autoStart:false}});
    const html=await(await fetch(server.origin)).text(),token=html.match(/name="office-vault-token" content="([a-f0-9]+)"/)[1];
    const request=async(route,body)=>{const response=await fetch(server.origin+route,{method:body===undefined?'GET':'POST',headers:{'X-Office-Token':token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
    await check('HTTP token, allowlist, pembuatan asinkron dan Cancel',async()=>{
      assert.equal((await fetch(server.origin+'/short/runs')).status,403);assert.equal((await request('/workflows/config',{localProjectDir:f.root})).status,200);assert.equal((await request('/short/channels')).data.channels.length,1);const created=await request('/short/runs',{channel:'demostudio',topic:'HTTP run'});assert.equal(created.status,201);r=await server.shortPipeline.wait(created.data.run.id);assert.equal(r.gate,'G1');assert.equal((await request('/short/runs/'+r.id+'/cancel',{})).status,200);assert.equal((await fetch(server.origin+'/short_pipeline.js')).status,404);
    });
    await check('restart server mempertahankan G1 tanpa mengulang tahap dan tidak auto-upload',async()=>{
      const created=await request('/short/runs',{channel:'demostudio',topic:'Server restart'});r=await server.shortPipeline.wait(created.data.run.id);const attempts=r.stages.map(s=>s.attempts);await server.close();server=await startServer({port:0,maxPort:0,collector:false,dataDir:f.dataDir,shortPipelineOptions:{testAdapter:f.adapter,pythonPath:f.options.pythonPath}});const after=server.shortPipeline.get(r.id);assert.equal(after.gate,'G1');assert.deepEqual(after.stages.map(s=>s.attempts),attempts);assert(!after.uploadedAt);
    });
    const result={ok:true,checks:checks.length,names:checks,fixture:f.dir,paidCalls:0,uploads:0};await fs.writeFile(path.join(__dirname,'v14_short_results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await p.stop();await server?.close();if(process.env.V14_KEEP_FIXTURE!=='1')await fs.rm(f.dir,{recursive:true,force:true});}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={setup,run};
