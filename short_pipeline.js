// V14-A [Diubah oleh Codex - 2026-11-21] Orkestrator berkas, gerbang manusia, dan runner non-shell.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const STAGES = Object.freeze([
  ['brief','project-shepherd',null], ['research','reality-checker',null],
  ['script','technical-writer','G1'], ['voice','short-video-editing-coach',null],
  ['scene','ui-designer',null], ['render','short-video-editing-coach',null],
  ['qa','reality-checker','G2'], ['metadata','social-media-strategist','G3']
].map(([id,persona,gate])=>Object.freeze({id,persona,gate})));
const terminal = new Set(['completed','cancelled']);
const fail = (code,message,status=400)=>Object.assign(new Error(message),{code,status});
const clone = x=>JSON.parse(JSON.stringify(x));
const stamp = ()=>new Date().toISOString();
const limited = text=>/usage.?limit|SEMUA akun.*limit|rate.?limit|quota.*exceed|try again at|too many requests|\b429\b/i.test(text);
const retryTime = text=>(text.match(/(?:try again at|reset(?:s)?(?: at)?|retry after)\s*([^\r\n]{1,80})/i)||[])[1]||null;

async function safePath(root, target) {
  if(typeof target!=='string'||/[\x00-\x1f]/.test(target))throw fail('unsafe_path','Path tidak valid',403);
  const parts=target.replace(/\\/g,'/').split('/');
  if(parts.some(p=>p==='..'||/^(?:secrets|\.git|\.env(?:\..*)?|auth\.json)$/i.test(p)||/[. ]$/.test(p)))throw fail('unsafe_path','Path terlindungi atau traversal ditolak',403);
  const base=path.resolve(root), full=path.resolve(target), rel=path.relative(base,full);
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||rel.includes(':'))throw fail('unsafe_path','Path di luar proyek',403);
  let current=path.parse(full).root;
  for(const part of full.slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try { const s=await fs.lstat(current);if(s.isSymbolicLink())throw fail('unsafe_path','Symlink/junction ditolak',403); }
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return full;
}
async function atomic(file,data) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
  try {await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n');await fs.rename(tmp,file);}
  finally {await fs.unlink(tmp).catch(()=>{});}
}
async function regular(file) {try {const s=await fs.lstat(file);return s.isFile()&&!s.isSymbolicLink()&&s.size>0;}catch{return false;}}
async function digest(file) {const hash=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function killTree(child) {
  if(!child?.pid||child.exitCode!==null)return;
  if(process.platform==='win32')await new Promise(resolve=>{
    const k=spawn('C:/Windows/System32/taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});
    const finish=()=>{clearTimeout(timer);if(child.exitCode===null)child.kill();resolve();};
    const timer=setTimeout(()=>{k.kill();finish();},2000);
    k.once('error',finish);k.once('close',finish);
  });else child.kill('SIGKILL');
}

// V15 [Diubah oleh Gemini - 2026-11-21] Tambah fallback pemindaian Channels/*, deteksi otomatis workspace, pra-cek alat per tahap, dan hilangkan nama channel pribadi
const SAFE_TOOL_SCRIPT_RE = /^Tools\/(?:style-[a-z0-9_-]+\/(?:new_short|rekam|timing)\.(?:py|ps1)|voice[a-z0-9_-]*\/voice\.ps1|video_qa\.py|cx_run\.py|oc_run\.py)$/i;
function slugifyChannel(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function createShortPipeline({dataDir,getProjectDir=()=>'',workspaceDiscovery=null,runAgent,onEvent=()=>{},testAdapter=null,timeoutMs=3600000,pythonPath}={}) {
  const indexFile=path.join(dataDir,'short_pipeline.json');
  await safePath(dataDir,indexFile);
  let runs=[];try{const saved=JSON.parse(await fs.readFile(indexFile,'utf8'));runs=Array.isArray(saved.runs)?saved.runs:[];}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const r of runs)if(!r||r.version!==14||!/^short_[a-f0-9]{16}$/.test(r.id)||!Number.isInteger(r.current)||r.current<0||r.current>=STAGES.length||!Array.isArray(r.stages)||r.stages.length!==STAGES.length||r.stages.some((s,i)=>s.id!==STAGES[i].id))throw fail('invalid_manifest','Manifest pipeline rusak; data tidak ditimpa');
  const active=new Map(),creating=new Set(),acting=new Set();let writeQueue=Promise.resolve(),stopping=false;
  const emit=e=>{try{onEvent(clone(e));}catch{}};
  async function resolveProjectInfo({forceRefresh=false}={}) {
    const saved=String(getProjectDir()||'').trim();
    if(saved){
      try {
        const full=await safePath(saved,saved);
        return {projectDir:full,savedProjectDir:saved,projectSource:'saved',needsConfirmation:false,candidates:[]};
      } catch {
        return {projectDir:'',savedProjectDir:saved,projectSource:'saved_invalid',needsConfirmation:false,candidates:[]};
      }
    }
    if(workspaceDiscovery&&typeof workspaceDiscovery.discover==='function'){
      const d=await workspaceDiscovery.discover({forceRefresh});
      return {
        projectDir:d.effectiveProjectDir||'',
        savedProjectDir:d.savedProjectDir||'',
        projectSource:d.projectSource||'none',
        needsConfirmation:Boolean(d.projectNeedsConfirmation),
        candidates:Array.isArray(d.projectCandidates)?d.projectCandidates:[]
      };
    }
    return {projectDir:'',savedProjectDir:'',projectSource:'none',needsConfirmation:false,candidates:[]};
  }
  async function rootDir(){
    const info=await resolveProjectInfo();
    if(!info.projectDir)throw fail('project_required','Atur Folder Proyek Lokal terlebih dahulu');
    return safePath(info.projectDir,info.projectDir);
  }
  async function channels() {
    const root=await rootDir(),file=await safePath(root,path.join(root,'Tools/youtube/channels.json'));
    let raw=null;try{raw=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const out=[];
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)) {
      for(const [key,c] of Object.entries(raw)) {
        if(!/^[a-z0-9-]{1,40}$/.test(key)||!c||typeof c.projects!=='string')continue;
        const projects=await safePath(root,path.resolve(root,c.projects));
        if(!/^Channels[\\/][a-zA-Z0-9_-]+[\\/]Videos$/.test(path.relative(root,projects)))throw fail('unsafe_channel','Folder channel tidak valid',403);
        const formats=(Array.isArray(c.formats)&&c.formats.length?c.formats:['short']).filter(f=>['short','long'].includes(f));
        out.push({
          key,
          name:String(c.title||key).slice(0,100),
          projects:path.relative(root,projects).replace(/\\/g,'/'),
          language:String(c.language||'en'),
          formats:formats.length?formats:['short'],
          inferred:false,
          scaffold:typeof c.scaffold==='string'?c.scaffold:'',
          voiceTool:typeof c.voiceTool==='string'?c.voiceTool:'',
          timingTool:typeof c.timingTool==='string'?c.timingTool:'',
          dialogSync:Boolean(c.dialogSync)
        });
      }
    }
    // Fallback V15: bila channels.json tidak ada/kosong, baca langsung subfolder Channels/*
    if(!out.length) {
      const chRoot=await safePath(root,path.join(root,'Channels'));
      try {
        const entries=await fs.readdir(chRoot,{withFileTypes:true});
        const seen=new Set();
        for(const ent of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
          if(!ent.isDirectory()||ent.isSymbolicLink())continue;
          if(ent.name.startsWith('.')||ent.name.startsWith('_')||/^(secrets|\.git)$/i.test(ent.name))continue;
          if(!/^[a-zA-Z0-9_-]{1,64}$/.test(ent.name))continue;
          let key=slugifyChannel(ent.name);
          if(!key||seen.has(key))continue;
          seen.add(key);
          const relProjects=`Channels/${ent.name}/Videos`;
          await safePath(root,path.resolve(root,relProjects));
          out.push({
            key,
            name:ent.name.slice(0,100),
            projects:relProjects,
            language:'en',
            formats:['short','long'],
            inferred:true,
            scaffold:'',
            voiceTool:'',
            timingTool:'',
            dialogSync:false
          });
        }
      } catch(e){if(e.code!=='ENOENT')throw e;}
    }
    return out;
  }
  async function validateRun(r,{allowUploaded=false}={}) {
    const root=await rootDir();if(path.resolve(r.root)!==root)throw fail('project_changed','Pilih kembali folder proyek run ini',409);
    const ch=(await channels()).find(c=>c.key===r.channel);if(!ch)throw fail('channel_missing','Channel tidak ditemukan');
    if(!/^[a-z0-9][a-z0-9-]{0,95}$/.test(r.slug))throw fail('unsafe_slug','Slug tidak valid',403);
    const expected=path.join(root,ch.projects,r.slug);if(path.resolve(r.dir)!==path.resolve(expected))throw fail('unsafe_run','Folder run tidak sesuai channel',403);
    await safePath(root,r.dir);
    // Never reuse an uploaded project, including after an application restart.
    for(const name of ['uploaded.json','uploaded','youtube.json'])if(!allowUploaded&&await regular(await safePath(root,path.join(r.dir,name))))throw fail('already_uploaded','Video yang sudah diunggah tidak boleh diubah',403);
    const metadata=await safePath(root,path.join(r.dir,'upload.json'));
    if(!allowUploaded&&await regular(metadata)){const m=JSON.parse(await fs.readFile(metadata,'utf8'));if(m.uploaded||m.deleted_from_youtube)throw fail('already_uploaded','Video yang sudah diunggah/dihapus dari YouTube dilindungi',403);}
    return ch;
  }
  async function save(r) {
    r.updatedAt=stamp();const snapshot=clone(runs),copy=clone(r);
    const job=writeQueue.then(async()=>{
      await atomic(indexFile,{version:14,runs:snapshot});
      await safePath(r.root,path.join(r.dir,'office_pipeline/state.json'));
      if(await fs.stat(r.dir).then(s=>s.isDirectory()).catch(()=>false))await atomic(path.join(r.dir,'office_pipeline/state.json'),copy);
    });writeQueue=job.catch(()=>{});await job;
  }
  function get(id){const r=runs.find(r=>r.id===id);if(!r)throw fail('run_missing','Run tidak ditemukan',404);return r;}
  function stageEvent(r,phase) {
    const s=r.stages[r.current];
    const legacy=({voice:'render',scene:'storyboard',qa:'qa_publish',metadata:'qa_publish'})[s.id]||s.id;
    emit({type:'workflow_update',workflow:{...clone(r),currentStageId:legacy,currentStage:legacy,currentStageIndex:r.current},action:{type:phase,stageId:legacy,persona:s.persona,message:s.id}});
    emit({type:'short_stage',phase,run:clone(r),persona:s.persona});
  }
  async function log(r,s,chunk) {
    const text=String(chunk).replace(/\x1b\[[0-9;]*m/g,'');s.logTail=((s.logTail||'')+text).slice(-12000);
    const file=await safePath(r.root,path.join(r.dir,'office_pipeline/logs',s.id+'.log'));
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.appendFile(file,text);
    emit({type:'short_log',runId:r.id,stageId:s.id,chunk:text.slice(-8000)});
  }
// V15 [Diubah oleh Gemini - 2026-11-21] Fallback Python sistem Windows bila venv proyek belum ada (menghindari alias WindowsApps kosong)
let cachedSystemPython = null;
async function resolveRunnerPython(root, explicitPath) {
  if (explicitPath && await regular(explicitPath)) return explicitPath;
  const venvPy = path.join(root, 'Tools/youtube/.venv/Scripts/python.exe');
  if (await regular(venvPy)) return venvPy;
  if (cachedSystemPython && await regular(cachedSystemPython)) return cachedSystemPython;
  if (process.platform === 'win32') {
    const res = require('node:child_process').spawnSync('where.exe', ['python'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const lines = String(res.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const cand of lines) {
      if (/WindowsApps[\\/]python\.exe$/i.test(cand)) continue;
      if (await regular(cand)) { cachedSystemPython = cand; return cand; }
    }
    const probe = require('node:child_process').spawnSync('python', ['-c', 'import sys;print(sys.executable)'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const pyExe = String(probe.stdout || '').trim();
    if (pyExe && await regular(pyExe)) { cachedSystemPython = pyExe; return pyExe; }
  }
  return '';
}

async function exec(r,s,exe,args,{cwd=r.dir,signal,env={}}={}) {
    await safePath(r.root,cwd);if(signal?.aborted)throw fail('cancelled','Dibatalkan');
    const interpreterDir=/python\.exe$/i.test(exe)?path.dirname(exe):path.join(r.root,'Tools/youtube/.venv/Scripts');
    const childEnv={...process.env,...env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',PATH:interpreterDir+path.delimiter+(process.env.PATH||'')};
    if(process.platform==='win32') {
      const py=await resolveRunnerPython(r.root,pythonPath);
      if(!py)throw fail('python_required','Python diperlukan untuk runner Windows (Job Object)');
      args=['-I','-B',path.join(__dirname,'short_process_runner.py'),exe,...args];exe=py;
    }
    if(signal?.aborted)throw fail('cancelled','Dibatalkan');
    return new Promise((resolve,reject)=>{
      const child=spawn(exe,args,{cwd,env:childEnv,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
      child.stdin.on('error',()=>{});
      const slot=active.get(r.id);if(slot)slot.child=child;
      let output='',reason='',logs=Promise.resolve(),timer;
      const abort=()=>{reason='cancelled';clearTimeout(timer);child.stdin.end();void killTree(child);};
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{if(!reason)reason='timeout';child.stdin.end();void killTree(child);},timeoutMs);
      const chunk=b=>{const t=b.toString();output=(output+t).slice(-262144);logs=logs.then(()=>log(r,s,t));};
      child.stdout.on('data',chunk);child.stderr.on('data',chunk);
      child.once('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(fail('spawn_error',e.message));});
      child.once('close',async code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{await logs;
        if(reason)throw fail(reason,reason==='timeout'?'Batas waktu tahap habis':'Dibatalkan');
        if(limited(output)){const e=fail('usage_limit','Menunggu limit');e.retryAfter=retryTime(output);throw e;}
        if(code!==0)throw fail('tool_failed','Alat berhenti dengan exit '+code);
        resolve(output);
      }catch(e){reject(e);}});
    });
  }
  // [Diubah oleh Gemini - 2026-11-21] Deteksi skrip alat channel secara dinamis dari AGENTS.md channel / Tools/* tanpa hardcode nama channel pribadi
  async function resolveChannelToolMap(root, ch) {
    const channelDir = ch ? path.dirname(path.resolve(root, ch.projects)) : '';
    const map = { scaffold: '', voiceTool: '', timingTool: '', needsDialogSync: Boolean(ch?.dialogSync), styleV2: false };
    let agentsText = '';
    if (channelDir) {
      try {
        const af = await safePath(root, path.join(channelDir, 'AGENTS.md'));
        if (await regular(af)) agentsText = (await fs.readFile(af, 'utf8')).slice(0, 12000);
      } catch {}
    }
    const extractAllowed = re => {
      const m = agentsText.match(re);
      if (!m) return '';
      const rel = m[0].replace(/\\/g, '/');
      return SAFE_TOOL_SCRIPT_RE.test(rel) ? rel : '';
    };
    map.scaffold = (ch?.scaffold && SAFE_TOOL_SCRIPT_RE.test(ch.scaffold))
      ? ch.scaffold
      : extractAllowed(/Tools[\\/]style-[a-z0-9_-]+[\\/]new_short\.(?:py|ps1)/i);
    map.voiceTool = (ch?.voiceTool && SAFE_TOOL_SCRIPT_RE.test(ch.voiceTool))
      ? ch.voiceTool
      : extractAllowed(/Tools[\\/](?:style-[a-z0-9_-]+[\\/]rekam\.py|voice[a-z0-9_-]*[\\/]voice\.ps1)/i);
    map.timingTool = (ch?.timingTool && SAFE_TOOL_SCRIPT_RE.test(ch.timingTool))
      ? ch.timingTool
      : extractAllowed(/Tools[\\/]style-[a-z0-9_-]+[\\/]timing\.py/i);
    map.styleV2 = /style-v2\/new_short\.ps1$/i.test(map.scaffold);
    if (!map.needsDialogSync && /\bdialog\.json\b/i.test(agentsText)) map.needsDialogSync = true;
    // Fallback generik jika AGENTS.md tidak menyebut skrip suara: cek Tools/voicebox/voice.ps1 atau Tools/voice_id/voice.ps1
    if (!map.voiceTool) {
      for (const fallback of ['Tools/voicebox/voice.ps1', 'Tools/voice_id/voice.ps1']) {
        if (await regular(path.join(root, fallback))) { map.voiceTool = fallback; break; }
      }
    }
    return map;
  }

  async function tool(r,s,name,args=[],signal) {
    const fixed={
      qa:'Tools/video_qa.py',cx:'Tools/cx_run.py',oc:'Tools/oc_run.py',
      publish:path.relative(r.root,path.join(path.dirname(path.dirname(r.dir)),'publish.ps1')),
      make:path.relative(r.root,path.join(path.dirname(path.dirname(r.dir)),'make.ps1')),
      build:path.relative(r.root,path.join(r.dir,'build.ps1')),
      resume:path.relative(r.root,path.join(r.dir,'resume.ps1'))
    };
    if(name==='check')return exec(r,s,process.execPath,['--check',await safePath(r.root,args[0])],{signal});
    if(name==='preview')return exec(r,s,'ffmpeg',['-y','-v','error','-i',await safePath(r.root,args[0]),'-vf',r.format==='short'?'scale=720:-2':'scale=-2:720','-c:v','libx264','-preset','fast','-crf','26','-c:a','aac','-movflags','+faststart',await safePath(r.root,path.join(r.dir,'preview_720.mp4'))],{signal});
    let relScript = Object.hasOwn(fixed, name) ? fixed[name] : '';
    if(!relScript && typeof name === 'string' && SAFE_TOOL_SCRIPT_RE.test(name.replace(/\\/g,'/'))) {
      relScript = name.replace(/\\/g,'/');
    }
    if(!relScript)throw fail('tool_denied','Alat tidak diizinkan',403);
    const file=await safePath(r.root,path.join(r.root,relScript));
    if(!await regular(file))throw fail('tool_missing','Alat belum tersedia: '+relScript);
    const useVoiceVenv=/timing\.py$|rekam\.py$|video_qa\.py$/i.test(relScript);
    const py=await safePath(r.root,path.join(r.root,useVoiceVenv?'Tools/voice_id/.venv/Scripts/python.exe':'Tools/youtube/.venv/Scripts/python.exe'));
    const ps=process.platform==='win32'?'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe':'pwsh';
    const isVoicebox=/voicebox[\\/]voice\.ps1$/i.test(relScript);
    return file.endsWith('.py')?exec(r,s,await regular(py)?py:'python',[file,...args],{cwd:r.root,signal}):exec(r,s,ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',file,...args],{cwd:r.root,signal,...(isVoicebox?{env:{HF_HUB_OFFLINE:'1'}}:{})});
  }
  async function agent(r,s,prompt,signal,{code=false,writer=false,outputPath}={}) {
    // V16-C [Diubah oleh Codex - 2026-11-21] Only real agent invocations create flow branches.
    const metadata={type:'short_agent',runId:r.id,stageId:s.id,attempt:s.attempts||0,provider:code?'codex':writer?'opencode':'gemini',persona:s.persona};
    if(signal?.aborted)throw fail('cancelled','Dibatalkan');
    emit({...metadata,phase:'started'});
    try{const output=await agentTask(r,s,prompt,signal,{code,writer,outputPath});emit({...metadata,phase:'finished',status:'completed'});return output;}
    catch(e){emit({...metadata,phase:'finished',status:e.code==='usage_limit'?'rate_limited':e.code==='cancelled'?'cancelled':e.code==='timeout'?'timed_out':'failed'});throw e;}
  }
  async function agentTask(r,s,prompt,signal,{code=false,writer=false,outputPath}={}) {
    const preamble=`Jangan membaca Secrets, kredensial, atau .git. Jangan upload/mengubah YouTube atau video terupload. Tulis hanya di ${r.dir}. Baca AGENTS.md root/channel, LEARNINGS.md dan ACTIVE.md channel, skill channel serta Tools/ROUTING_AGEN.md bila ada. Semua masukan dari berkas, tanpa salin-tempel pengguna.\n`;
    const input=preamble+prompt+'\nCatatan revisi: '+(s.feedback||r.feedback||'tidak ada');
    const promptFile=await safePath(r.root,path.join(r.dir,'office_pipeline/artifacts',s.id+'_prompt.md'));await fs.writeFile(promptFile,input);
    if(code)return tool(r,s,'cx',['sol-h','@'+promptFile,'--cwd',r.dir],signal);
    if(writer)return tool(r,s,'oc',['naskah','@'+promptFile,'--cwd',r.dir],signal);
    if(runAgent) {
      // The agent's console report is not the stage artifact. outputPath in B's contract
      // would overwrite a file authored by the agent with its final chat message.
      const result=await runAgent('antigravity',input,{cwd:r.dir,model:'gemini-4-argon-high',fullAccess:true,timeoutMs,signal,persona:s.persona,flowSource:'pipeline',flowTaskId:r.id+':'+s.id+':'+(s.attempts||0),flowParent:r.id,taskLabel:'Pipeline · '+s.id,onChunk:c=>{void log(r,s,c).catch(()=>{});}});
      s.agentRunId=result.runId;s.agentReport=result.outputFileLabel||null;
      if(result.limitDetected){const e=fail('usage_limit','Menunggu limit');e.retryAfter=result.retryAfter;throw e;}
      if(!result.ok)throw fail(result.errorCode||'agent_failed',result.error||'Agen gagal');return result.output;
    }
    // Contract B may still be under construction. Only a native executable is accepted.
    let exe;for(const dir of (process.env.PATH||'').split(path.delimiter)) {const f=path.join(dir,'agy.exe');if(await regular(f)){exe=f;break;}}
    if(!exe)throw fail('agent_missing','Antigravity belum tersedia; pasang CLI atau selesaikan runAgent');
    const output=await exec(r,s,exe,['-p',input,'--model','gemini-4-argon-high','--dangerously-skip-permissions','--output-format','text'],{signal});
    return output;
  }
  async function requireFiles(r,groups) {
    const selected=[];for(const group of groups){let found;for(const name of group){const file=await safePath(r.root,path.resolve(r.dir,name));if(await regular(file)){found=name;break;}}if(!found)throw fail('missing_artifact','Hasil belum ada atau kosong: '+group.join(' / '));selected.push(found);}return selected;
  }
  async function provision(r,s,signal,toolMap) {
    if(await fs.stat(r.dir).then(x=>x.isDirectory()).catch(()=>false))return;
    if(toolMap?.scaffold && !toolMap.styleV2 && r.format==='short') {
      await tool(r,s,toolMap.scaffold,[r.slug],signal);
    } else {
      await fs.mkdir(r.dir,{recursive:true});
    }
    await safePath(r.root,r.dir);
  }
  async function liveStage(r,s,signal) {
    const a='office_pipeline/artifacts/';
    const ch=(await channels()).find(c=>c.key===r.channel);
    const toolMap=await resolveChannelToolMap(r.root,ch);
    if(s.id==='brief') {
      await provision(r,s,signal,toolMap);await fs.mkdir(path.join(r.dir,a),{recursive:true});
      await agent(r,s,`Topik: ${r.topic||'Usulkan 3 ide berbeda berdasarkan LEARNINGS.md, ACTIVE.md dan daftar video lama; pilih rekomendasi pertama sebagai brief.'}. Format ${r.format}, bahasa ${r.language}. Tulis ${a}brief.md (konsep, hook, durasi, sasaran, gaya, risiko, 3 usulan bila topik kosong). Siapkan scaffold resmi channel untuk proyek baru ini sesuai AGENTS.md channel. Jangan menyalin atau mengubah video lama.`,signal,{outputPath:path.join(r.dir,a,'brief.md')});
      if(toolMap.styleV2 && r.format==='short')await tool(r,s,toolMap.scaffold,[r.dir,await safePath(r.root,path.join(r.dir,'web/env2.js'))],signal);
    } else if(s.id==='research')await agent(r,s,`Baca ${a}brief.md. Cek klaim via pencarian Antigravity. Tulis ${a}fakta_report.md: klaim, hasil verifikasi, risiko dan minimal dua URL sumber kredibel berbeda.`,signal,{outputPath:path.join(r.dir,a,'fakta_report.md')});
    else if(s.id==='script')await agent(r,s,`Baca ${a}brief.md dan ${a}fakta_report.md. Tulis script.json sesuai format alat suara channel ${r.channel} pada AGENTS.md channel${toolMap.needsDialogSync?' (dan salin identik ke dialog.json)':''}. Sertakan naskah baca script.md. Jangan jalankan suara.`,signal,{writer:true});
    else if(s.id==='voice') {
      if(!toolMap.voiceTool)throw fail('tool_missing','Skrip suara channel belum ditemukan di folder Tools/. Siapkan skrip suara atau letakkan berkas audio secara manual lalu lanjutkan.');
      const voiceArgs = toolMap.voiceTool.endsWith('.ps1') && r.format==='long' ? [r.dir,'-Long'] : [r.dir];
      await tool(r,s,toolMap.voiceTool,voiceArgs,signal);
      if(toolMap.timingTool)await tool(r,s,toolMap.timingTool,[r.dir],signal);
      else await agent(r,s,'Jalankan alat alignment resmi channel pada audio yang baru dibuat. Hasil wajib audio/words_new.json (atau audio/words.json / timing.json) untuk scene. Jangan render video.',signal);
    } else if(s.id==='scene')await agent(r,s,`Baca brief, fakta, script.json, audio words/timing. Implementasikan scene.js atau web/shots.js beserta build.ps1 sesuai engine channel. Gunakan template/rig resmi dan ${r.format==='short'?'9:16':'16:9'}. Kepadatan visual: tempat nyata, objek latar bermakna, gerak tokoh/objek mengikuti ucapan, aksi baru tiap beat, kamera/parallax dan transisi; jangan sepi/monoton. Tidak boleh bagian panjang hanya teks atau gambar diam. Perbaiki temuan QA sebelumnya: ${r.feedback||'belum ada'}. Build harus menghasilkan Renders/${r.slug}.mp4 dan preview_720.mp4 di folder video. Jangan jalankan upload.`,signal,{code:true});
    else if(s.id==='render') {
      const channelDir=path.dirname(path.dirname(r.dir)),render=path.join(channelDir,'Renders',r.slug+'.mp4');
      if(await regular(path.join(r.dir,'build.ps1')))await tool(r,s,'build',[],signal);
      else if(await regular(path.join(r.dir,'resume.ps1')))await tool(r,s,'resume',[],signal);
      else await tool(r,s,'make',[path.join('Videos',r.slug)],signal);
      if(!await regular(render))throw fail('render_missing','Build belum menghasilkan Renders/'+r.slug+'.mp4');
      await tool(r,s,'preview',[render],signal);
    } else if(s.id==='qa') {
      const video=path.join(path.dirname(path.dirname(r.dir)),'Renders',r.slug+'.mp4');
      const numbers=await tool(r,s,'qa',[video,...(r.format==='long'?['--long']:[])],signal);await fs.writeFile(path.join(r.dir,a,'qa_numeric.txt'),numbers);
      await agent(r,s,`Baca Tools/qa/QA_ANTIGRAVITY.md dan aturan channel. Pemeriksaan KETAT video ${video}, preview_720.mp4 dan ${a}qa_numeric.txt. Tulis qa/qa_report.md dengan tabel setiap butir LOLOS/GAGAL/RAGU, bukti frame, perbaikan konkret. Akhiri VERDICT: LOLOS hanya bila seluruh butir lolos. Jangan menulis LOLOS tanpa memeriksa video.`,signal);
    } else if(s.id==='metadata') {
      const videoPath=path.relative(r.root,path.join(path.dirname(path.dirname(r.dir)),'Renders',r.slug+'.mp4')).replace(/\\/g,'/');
      await agent(r,s,`Baca naskah, QA dan standar upload channel. Buat upload.json (channel ${r.channel}, format ${r.format}, title, video persis "${videoPath}" relatif akar folder proyek), description.txt, localizations.json, thumbnail.jpg yang sesuai standar channel. Jangan upload/dry-run sendiri. Jangan mengubah privasi/jadwal sesudah dry-run.`,signal);
      await validateMetadata(r);
      const output=await tool(r,s,'publish',[path.join('Videos',r.slug),'-DryRun'],signal);await fs.writeFile(path.join(r.dir,a,'dry_run.txt'),output);
    }
  }
  async function validateMetadata(r) {
    await requireFiles(r,[['upload.json'],['description.txt'],['localizations.json'],['thumbnail.jpg']]);
    const m=JSON.parse(await fs.readFile(path.join(r.dir,'upload.json'),'utf8'));
    if(m.channel!==r.channel||!String(m.title||'').trim())throw fail('invalid_metadata','Judul/channel upload tidak cocok');
    if(m.format&&m.format!==r.format)throw fail('invalid_metadata','Format upload tidak cocok');
    const video=await safePath(r.root,path.resolve(r.root,String(m.video||'')));
    const expected=path.join(path.dirname(path.dirname(r.dir)),'Renders',r.slug+'.mp4');
    if(video!==expected||!await regular(video))throw fail('invalid_video','Metadata harus memakai hasil render run ini');
    return m;
  }
  async function verify(r,s) {
    const a='office_pipeline/artifacts/',spec={brief:[[a+'brief.md']],research:[[a+'fakta_report.md']],script:[['script.json']],voice:[['audio/vo_ryan.wav','audio/vo_gemini.wav','audio/vo.wav','audio/line_00.wav'],['audio/words_new.json','audio/words.json','timing.json']],scene:[['scene.js','web/shots.js']],render:[['../../Renders/'+r.slug+'.mp4'],['preview_720.mp4']],qa:[['qa/qa_report.md'],[a+'qa_numeric.txt']],metadata:[['upload.json'],['description.txt'],['localizations.json'],['thumbnail.jpg'],[a+'dry_run.txt']]};
    // Render path is generated internally, never accepted from an API payload.
    const groups=spec[s.id];if(s.id==='render')groups[0]=[path.join(path.dirname(path.dirname(r.dir)),'Renders',r.slug+'.mp4')];
    const selected=await requireFiles(r,groups);
    s.outputs=selected.map(name=>path.relative(r.dir,path.resolve(r.dir,name)).replace(/\\/g,'/'));
    if(s.id==='research') {const text=await fs.readFile(path.join(r.dir,selected[0]),'utf8'),sources=new Set([...text.matchAll(/https?:\/\/[^\s)\]>]+/g)].map(m=>{try{return new URL(m[0]).hostname;}catch{return '';}}).filter(Boolean));if(sources.size<2)throw fail('insufficient_sources','Riset perlu minimal dua sumber berbeda');}
    if(s.id==='script'){const script=JSON.parse(await fs.readFile(path.join(r.dir,'script.json'),'utf8'));validateScript(r,script);const dlgFile=await safePath(r.root,path.join(r.dir,'dialog.json'));if(await regular(dlgFile)){const dialog=JSON.parse(await fs.readFile(dlgFile,'utf8'));if(JSON.stringify(dialog)!==JSON.stringify(script))throw fail('invalid_script','script.json dan dialog.json harus sama sebelum G1');}}
    if(s.id==='scene')await tool(r,s,'check',[path.join(r.dir,selected[0])],active.get(r.id)?.controller.signal);
    if(s.id==='qa') {const report=await fs.readFile(path.join(r.dir,selected[0]),'utf8');if(!/VERDICT:\s*LOLOS/i.test(report)||/\|\s*(GAGAL|RAGU)\s*\|/i.test(report))throw fail('qa_failed','QA gagal/ragu: baca daftar perbaikan pada laporan');}
    if(s.id==='metadata')await validateMetadata(r);
    if(s.id==='metadata'){
      const dry=await fs.readFile(path.join(r.dir,'office_pipeline/artifacts/dry_run.txt'),'utf8');
      if(!/dry[\s-]*run\s+OK/i.test(dry))throw fail('dry_run_failed','Ringkasan dry-run sukses belum ditemukan');
      r.publishPlan={schedule:(dry.match(/publish:\s*([^\r\n]+)/i)||[])[1]||null,privacy:'private (scheduled)'};
    }
    s.artifacts=[];for(const name of selected){const file=await safePath(r.root,path.resolve(r.dir,name));s.artifacts.push({name:path.relative(r.dir,file).replace(/\\/g,'/'),size:(await fs.stat(file)).size,sha256:await digest(file)});}
  }
  async function gateFingerprint(r) {
    const hasDlg=await regular(await safePath(r.root,path.join(r.dir,'dialog.json')));
    const names=['script.json',...(hasDlg?['dialog.json']:[]),'qa/qa_report.md','upload.json','description.txt','localizations.json','thumbnail.jpg','preview_720.mp4',path.join(path.dirname(path.dirname(r.dir)),'Renders',r.slug+'.mp4')];
    const hash=crypto.createHash('sha256');for(const n of names){const file=await safePath(r.root,path.resolve(r.dir,n));if(await regular(file)){hash.update(n);hash.update(await digest(file));}}return hash.digest('hex');
  }
  async function scriptFingerprint(r) {
    const hasDlg=await regular(await safePath(r.root,path.join(r.dir,'dialog.json')));
    const h=crypto.createHash('sha256');for(const name of ['script.json',...(hasDlg?['dialog.json']:[])]){
      const file=await safePath(r.root,path.join(r.dir,name));if(!await regular(file))throw fail('missing_artifact','Naskah belum lengkap');h.update(await digest(file));
    }return h.digest('hex');
  }
  function validateScript(r,script){
    if(!Array.isArray(script)||!script.length)throw fail('invalid_script','Naskah harus daftar yang tidak kosong');
    if(script.some(line=>line&&typeof line==='object'&&!Array.isArray(line))){
      if(script.some(line=>!line||typeof line!=='object'||typeof line.who!=='string'||!line.who.trim()||typeof line.text!=='string'||!line.text.trim()))throw fail('invalid_script','Format dialog memerlukan bidang who dan text yang tidak kosong');
    }
  }
  async function qaFingerprint(r) {
    const h=crypto.createHash('sha256');for(const file of [path.join(r.dir,'qa/qa_report.md'),path.join(r.dir,'preview_720.mp4'),path.join(path.dirname(path.dirname(r.dir)),'Renders',r.slug+'.mp4')]){
      await safePath(r.root,file);if(!await regular(file))throw fail('missing_artifact','Hasil QA/video belum lengkap');h.update(await digest(file));
    }return h.digest('hex');
  }
  async function drive(r,slot) {
    try {
      await validateRun(r);
      for(;r.current<STAGES.length;) {
        const s=r.stages[r.current];s.status='running';s.startedAt=stamp();s.attempts++;s.error=null;r.status='running';r.gate=null;await save(r);stageEvent(r,'started');
        try {
          if(r.current>2&&(!r.g1?.scriptHash||await scriptFingerprint(r)!==r.g1.scriptHash))throw fail('script_changed','Naskah berubah sejak G1; ulangi tahap Naskah untuk persetujuan baru');
          if(r.current===7&&(!r.g2?.mediaHash||await qaFingerprint(r)!==r.g2.mediaHash))throw fail('qa_changed','Video/laporan berubah sejak G2; ulangi QA untuk persetujuan baru');
          if(testAdapter){await provisionTest(r);await testAdapter({run:clone(r),stage:clone(s),signal:slot.controller.signal,exec:(exe,args,opts)=>exec(r,s,exe,args,{...opts,signal:slot.controller.signal}),log:c=>log(r,s,c)});}
          else await liveStage(r,s,slot.controller.signal);
          if(slot.controller.signal.aborted)throw fail('cancelled','Dibatalkan');
          await verify(r,s);s.finishedAt=stamp();s.durationMs=Date.parse(s.finishedAt)-Date.parse(s.startedAt);s.status='completed';
          if(s.gate){r.gate=s.gate;r.status='awaiting_approval';s.status='awaiting_approval';r.gateHash=await gateFingerprint(r);await save(r);stageEvent(r,'gate');return;}
          await save(r);stageEvent(r,'finished');r.current++;
        } catch(e) {
          s.finishedAt=stamp();s.durationMs=Date.parse(s.finishedAt)-Date.parse(s.startedAt);s.error=e.message;s.errorCode=e.code||'stage_failed';
          r.status=e.code==='usage_limit'?'waiting_limit':e.code==='cancelled'?(stopping?'interrupted':'cancelled'):'failed';s.status=r.status;r.retryAfter=e.retryAfter||null;
          await save(r);stageEvent(r,'stopped');return;
        }
      }
    } catch(e){r.status='failed';r.error=e.message;await save(r);stageEvent(r,'stopped');}
    finally {active.delete(r.id);}
  }
  async function provisionTest(r) {await fs.mkdir(r.dir,{recursive:true});await fs.mkdir(path.join(r.dir,'office_pipeline/artifacts'),{recursive:true});}
  async function start(id) {
    const r=get(id);if(stopping)throw fail('stopping','Server sedang ditutup',409);await validateRun(r);
    if(active.has(id))return clone(r);
    if(r.status==='awaiting_approval')throw fail('approval_required','Selesaikan gerbang persetujuan terlebih dahulu',409);
    if(terminal.has(r.status)||['upload_unknown','uploading'].includes(r.status))throw fail('run_finished','Run sudah berakhir atau hasil upload perlu diperiksa',409);
    if(runs.some(x=>x.id!==id&&x.channel===r.channel&&!terminal.has(x.status)))throw fail('channel_busy','Satu run aktif per channel',409);
    const slot={controller:new AbortController(),child:null};active.set(id,slot);slot.promise=drive(r,slot);return clone(r);
  }
  async function create(payload={}) {
    const root=await rootDir(),ch=(await channels()).find(c=>c.key===payload.channel);if(!ch)throw fail('invalid_channel','Pilih channel yang terdaftar');
    if(creating.has(ch.key))throw fail('channel_busy','Channel sedang menyiapkan run baru',409);
    creating.add(ch.key);
    try {
    if(runs.some(r=>r.channel===ch.key&&!terminal.has(r.status)))throw fail('channel_busy','Satu run aktif per channel; lanjutkan atau batalkan run lama',409);
    const format=payload.format||'short';if(!ch.formats.includes(format))throw fail('invalid_format','Format tidak didukung channel');
    if(payload.cwd||payload.dir||payload.command||payload.tool||payload.root)throw fail('unsafe_payload','Path/perintah bebas ditolak',403);
    const topic=String(payload.topic||'').trim().slice(0,4000),id='short_'+crypto.randomBytes(8).toString('hex');
    const slug=payload.slug||((topic.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'ide')+'-'+id.slice(-6));
    if(!/^[a-z0-9][a-z0-9-]{0,95}$/.test(slug))throw fail('unsafe_slug','Slug hanya huruf kecil, angka dan tanda hubung',403);
    const dir=await safePath(root,path.join(root,ch.projects,slug));if(await fs.lstat(dir).catch(()=>null))throw fail('folder_exists','Gunakan folder video baru; folder lama tidak ditimpa',409);
    const r={id,version:14,root,dir,slug,channel:ch.key,channelName:ch.name,language:ch.language,format,topic,title:topic||'3 ide video',status:'ready',current:0,gate:null,qaRounds:0,createdAt:stamp(),stages:STAGES.map(s=>({...s,status:'pending',attempts:0,inputs:[],outputs:[],logTail:''}))};
    const a='office_pipeline/artifacts/';
    const inputs={brief:['topic','channel/AGENTS.md','channel/LEARNINGS.md','channel/ACTIVE.md'],research:[a+'brief.md'],script:[a+'brief.md',a+'fakta_report.md'],voice:['script.json'],scene:['script.json','audio/words_new.json | timing.json'],render:['scene.js | web/shots.js'],qa:['Renders/'+slug+'.mp4','preview_720.mp4'],metadata:['script.json','qa/qa_report.md']};
    const expected={brief:[a+'brief.md'],research:[a+'fakta_report.md'],script:['script.json'],voice:['audio/*.wav','audio/words_new.json | timing.json'],scene:['scene.js | web/shots.js'],render:['Renders/'+slug+'.mp4','preview_720.mp4'],qa:['qa/qa_report.md',a+'qa_numeric.txt'],metadata:['upload.json','description.txt','localizations.json','thumbnail.jpg',a+'dry_run.txt']};
    for(const s of r.stages){s.inputs=inputs[s.id];s.expectedOutputs=expected[s.id];}
    runs.unshift(r);await save(r);await start(id);return clone(r);
    }finally{creating.delete(ch.key);}
  }
  async function performAction(id,name,payload={}) {
    const r=get(id);await validateRun(r);const s=r.stages[r.current];
    if(name==='cancel'){const slot=active.get(id);if(slot){slot.controller.abort();await slot.promise;}else{r.status='cancelled';await save(r);stageEvent(r,'cancelled');}return clone(r);}
    if(active.has(id))throw fail('run_busy','Tahap masih berjalan',409);
    if(name==='resume')return start(id);
    if(name==='retry'){
      if(terminal.has(r.status)||r.status==='upload_unknown')throw fail('run_finished','Run tidak dapat diulang',409);
      const index=payload.stageId?STAGES.findIndex(s=>s.id===payload.stageId):r.current;
      if(index<0||index>r.current)throw fail('invalid_stage','Hanya tahap saat ini atau sebelumnya dapat diulang',409);
      if(index<=2)r.g1=null;if(index<=6)r.g2=null;
      r.current=index;r.gate=null;r.status='ready';delete r.confirmation;
      for(let i=index;i<r.stages.length;i++)r.stages[i].status='pending';await save(r);return start(id);
    }
    if(name==='repair') {
      if(s.id!=='qa'||!['failed','awaiting_approval','revision_requested'].includes(r.status))throw fail('invalid_repair','Perbaikan hanya dari QA',409);
      if(r.qaRounds>=3)throw fail('repair_limit','Maksimal tiga putaran; tinjau perbaikan secara manual',409);
      r.qaRounds++;r.feedback=String(payload.feedback||s.error||'Perbaiki seluruh GAGAL/RAGU di qa/qa_report.md');r.current=4;r.gate=null;r.status='ready';r.g2=null;for(let i=4;i<8;i++)r.stages[i].status='pending';await save(r);return start(id);
    }
    if(name==='skip') {
      if(s.gate)throw fail('gate_cannot_skip','Gerbang manusia tidak dapat dilewati',409);
      await verify(r,s);s.status='skipped';r.current++;r.status='ready';await save(r);return start(id);
    }
    if(name==='reject') {
      if(r.status!=='awaiting_approval')throw fail('not_at_gate','Tidak sedang di gerbang',409);
      const feedback=String(payload.feedback||'').trim();if(!feedback)throw fail('feedback_required','Tulis catatan revisi');s.feedback=feedback;r.feedback=feedback;r.gate=null;r.status='revision_requested';s.status='revision_requested';await save(r);return clone(r);
    }
    if(name==='approve') {
      if(r.status!=='awaiting_approval'||!['G1','G2'].includes(r.gate))throw fail('not_at_gate','Gerbang ini memerlukan tindakan berbeda',409);
      if(await gateFingerprint(r)!==r.gateHash)throw fail('gate_stale','Berkas berubah sejak pemeriksaan; ulangi tahap untuk ditinjau kembali',409);
      await verify(r,s);s.status='approved';
      r[r.gate.toLowerCase()]={at:stamp(),hash:await gateFingerprint(r),...(r.gate==='G1'?{scriptHash:await scriptFingerprint(r)}:{mediaHash:await qaFingerprint(r)})};
      r.current++;r.gate=null;r.status='ready';await save(r);return start(id);
    }
    if(name==='confirm-upload') {
      if(r.status!=='awaiting_approval'||r.gate!=='G3'||!r.g1||!r.g2)throw fail('upload_not_ready','Selesaikan G1, G2 dan dry-run sebelum upload',409);
      await verify(r,s);if(await gateFingerprint(r)!==r.gateHash)throw fail('dry_run_stale','Paket berubah; ulangi dry-run',409);
      const m=await validateMetadata(r);r.confirmation={nonce:crypto.randomBytes(24).toString('hex'),expires:Date.now()+300000,hash:r.gateHash};await save(r);
      return {run:clone(r),confirmation:{...r.confirmation,title:m.title,channel:r.channelName,schedule:r.publishPlan?.schedule||m.publish_at||'Slot berikutnya sesuai publish.ps1',privacy:r.publishPlan?.privacy||'private (scheduled)'}};
    }
    if(name==='upload') {
      const c=r.confirmation;if(payload.confirmed!==true||!c||c.nonce!==payload.nonce||c.expires<Date.now()||r.gate!=='G3'||r.status!=='awaiting_approval')throw fail('confirmation_required','Konfirmasi upload eksplisit diperlukan',403);
      if(await gateFingerprint(r)!==c.hash)throw fail('dry_run_stale','Paket berubah; ulangi dry-run',409);
      delete r.confirmation;r.status='uploading';await save(r);
      const slot={controller:new AbortController(),child:null};active.set(id,slot);
      slot.promise=(async()=>{try{if(testAdapter)await testAdapter({run:clone(r),stage:{id:'upload'},signal:slot.controller.signal,exec:(exe,args)=>exec(r,s,exe,args,{signal:slot.controller.signal}),log:c=>log(r,s,c)});else await tool(r,s,'publish',[path.join('Videos',r.slug)],slot.controller.signal);r.status='completed';s.status='approved';r.uploadedAt=stamp();r.gate=null;}catch(e){r.status='upload_unknown';r.error=e.message;}finally{await save(r);stageEvent(r,'upload_done');active.delete(id);}})();return clone(r);
    }
    throw fail('invalid_action','Tindakan tidak dikenal');
  }
  async function action(id,name,payload={}) {
    if(name==='cancel')return performAction(id,name,payload);
    if(acting.has(id))throw fail('run_busy','Tindakan run masih berjalan',409);
    acting.add(id);try{return await performAction(id,name,payload);}finally{acting.delete(id);}
  }
  async function artifact(id,name) {
    const r=get(id);await validateRun(r,{allowUploaded:true});
    const known=new Set(r.stages.flatMap(s=>s.outputs||[]));for(const s of STAGES)known.add('office_pipeline/logs/'+s.id+'.log');
    if(!known.has(name))throw fail('artifact_denied','Artefak tidak terdaftar',403);
    const file=await safePath(r.root,path.resolve(r.dir,name));if(!await regular(file))throw fail('artifact_missing','Artefak belum tersedia',404);return file;
  }
  async function performEditScript(id,text) {
    const r=get(id);await validateRun(r);if(r.gate!=='G1'||r.status!=='awaiting_approval')throw fail('not_at_script','Editor hanya tersedia di G1',409);
    if(typeof text!=='string'||text.length>128000)throw fail('invalid_script','Naskah terlalu besar');const parsed=JSON.parse(text);validateScript(r,parsed);
    await atomic(path.join(r.dir,'script.json'),parsed);
    if(await regular(await safePath(r.root,path.join(r.dir,'dialog.json'))))await atomic(path.join(r.dir,'dialog.json'),parsed);
    r.gateHash=await gateFingerprint(r);await save(r);return clone(r);
  }
  async function editScript(id,text){
    if(acting.has(id))throw fail('run_busy','Tindakan run masih berjalan',409);
    acting.add(id);try{return await performEditScript(id,text);}finally{acting.delete(id);}
  }
  // [Diubah oleh Gemini - 2026-11-21] Pra-inspeksi kesiapan alat per tahap sebelum produksi dimulai (ringkasan "yang akan dijalankan" & peringatan jujur alat hilang)
  async function inspectTools(channelKey='',format='short'){
    const info=await resolveProjectInfo();
    const list=info.projectDir?await channels().catch(()=>[]):[];
    const ch=list.find(c=>c.key===channelKey)||list[0]||null;
    const root=info.projectDir||'';
    const toolMap=root&&ch?await resolveChannelToolMap(root,ch):{scaffold:'',voiceTool:'',timingTool:'',needsDialogSync:false,styleV2:false};
    const chDir=root&&ch?path.dirname(path.resolve(root,ch.projects)):'';
    const hasFile=async rel=>{if(!root||!rel)return false;try{return await regular(await safePath(root,path.resolve(root,rel)));}catch{return false;}};
    const hasChFile=async name=>{if(!root||!chDir)return false;try{return await regular(await safePath(root,path.join(chDir,name)));}catch{return false;}};
    const [hasOc,hasCx,hasQa,hasVoice,hasTiming,hasMake,hasPublish]=await Promise.all([
      hasFile('Tools/oc_run.py'),
      hasFile('Tools/cx_run.py'),
      hasFile('Tools/video_qa.py'),
      hasFile(toolMap.voiceTool),
      toolMap.timingTool?hasFile(toolMap.timingTool):Promise.resolve(true),
      hasChFile('make.ps1'),
      hasChFile('publish.ps1')
    ]);
    const plans=[
      {id:'brief',persona:'project-shepherd',gate:null,toolKind:'agent',tools:['AI Agent (brief)',...(toolMap.scaffold?[toolMap.scaffold]:[])],outputs:['office_pipeline/artifacts/brief.md'],ready:Boolean(root),missingTools:root?[]:['project_folder']},
      {id:'research',persona:'reality-checker',gate:null,toolKind:'agent',tools:['AI Agent (fact-check)'],outputs:['office_pipeline/artifacts/fakta_report.md'],ready:Boolean(root),missingTools:root?[]:['project_folder']},
      {id:'script',persona:'technical-writer',gate:'G1',toolKind:'script',tools:['Tools/oc_run.py'],outputs:['script.json','script.md'],ready:hasOc,missingTools:hasOc?[]:['Tools/oc_run.py']},
      {id:'voice',persona:'short-video-editing-coach',gate:null,toolKind:'voice',tools:[toolMap.voiceTool||'Tools/voice*/voice.ps1',...(toolMap.timingTool?[toolMap.timingTool]:[])],outputs:['audio/*.wav','audio/words_new.json'],ready:hasVoice&&hasTiming,missingTools:[...(hasVoice?[]:[toolMap.voiceTool||'Tools/voice*/voice.ps1']),...(hasTiming?[]:[toolMap.timingTool])]},
      {id:'scene',persona:'ui-designer',gate:null,toolKind:'code',tools:['Tools/cx_run.py'],outputs:['scene.js | web/shots.js'],ready:hasCx,missingTools:hasCx?[]:['Tools/cx_run.py']},
      {id:'render',persona:'short-video-editing-coach',gate:null,toolKind:'render',tools:['make.ps1 / build.ps1','ffmpeg'],outputs:['Renders/<slug>.mp4','preview_720.mp4'],ready:hasMake,missingTools:hasMake?[]:[ch?`${path.relative(root,chDir).replace(/\\/g,'/')}/make.ps1`:'make.ps1']},
      {id:'qa',persona:'reality-checker',gate:'G2',toolKind:'qa',tools:['Tools/video_qa.py','AI Agent (QA)'],outputs:['qa/qa_report.md','office_pipeline/artifacts/qa_numeric.txt'],ready:hasQa,missingTools:hasQa?[]:['Tools/video_qa.py']},
      {id:'metadata',persona:'social-media-strategist',gate:'G3',toolKind:'publish',tools:['publish.ps1 -DryRun'],outputs:['upload.json','description.txt','thumbnail.jpg','dry_run.txt'],ready:hasPublish,missingTools:hasPublish?[]:[ch?`${path.relative(root,chDir).replace(/\\/g,'/')}/publish.ps1`:'publish.ps1']}
    ];
    const missingTools=[...new Set(plans.flatMap(p=>p.missingTools).filter(x=>x&&x!=='project_folder'))];
    return {
      projectDir:root,
      savedProjectDir:info.savedProjectDir,
      projectSource:info.projectSource,
      projectValid:Boolean(root&&list.length>0),
      needsConfirmation:info.needsConfirmation,
      candidates:info.candidates,
      channel:ch,
      format,
      stagePlans:plans,
      missingTools,
      readyCount:plans.filter(p=>p.ready).length,
      totalStages:plans.length
    };
  }
  // A persisted running state never silently restarts paid work or an upload.
  for(const r of runs)if(['running','uploading'].includes(r.status)) {r.status=r.status==='uploading'?'upload_unknown':'interrupted';const s=r.stages[r.current];if(s)s.status=r.status;}
  if(runs.length)await atomic(indexFile,{version:14,runs});
  // V15 [Diubah oleh Gemini - 2026-11-21] Daftar tahap pipeline aktif (non-rahasia) untuk konfirmasi sebelum menutup Office AI
  function getActiveRuns() {
    const list = [];
    for (const id of active.keys()) {
      const r = runs.find(x => x.id === id);
      if (!r) continue;
      const s = r.stages?.[r.current];
      list.push({
        id: r.id,
        kind: 'short',
        channel: r.channelName || r.channel,
        stage: s?.id || '',
        label: `${r.channelName || r.channel} · ${s?.id || 'short'}`,
        startedAt: s?.startedAt || r.createdAt || null
      });
    }
    return list;
  }
  return {channels,resolveProjectInfo,inspectTools,create,start,action,artifact,editScript,getActiveRuns,stages:STAGES,list:()=>clone(runs),get:id=>clone(get(id)),async wait(id){await active.get(id)?.promise;return clone(get(id));},async stop(){stopping=true;for(const slot of active.values())slot.controller.abort();await Promise.allSettled([...active.values()].map(s=>s.promise));await writeQueue;}};
}
module.exports={createShortPipeline,STAGES,safePath,limited};
