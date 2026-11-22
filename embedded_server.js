// [Diubah oleh Codex - 2026-11-21] V17 MT5 stream diagnostics and isolated demo queries.
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto=require('node:crypto');
// V16-C [Diubah oleh Codex - 2026-11-21] Metadata-only live flow, separate from accounting.
const FlowModel=require('./office_flow_model');
const FLOW_MAP=require('./office_flow_map.json');
const {execFile}=require('node:child_process');
const {createData,tokenUsage,sum}=require('./office_data');
const createSettingsStore=require('./settings_store');
const Quality=require('./quality_store');
const {createCollector,createUsageImporter,CATEGORIES,categoryFor}=require('./collector');
// V22 [Diubah oleh Codex - 2026-11-22] Numeric history is isolated from flow accounting.
const {createUsageHistory}=require('./usage_history_store');
// [Diubah oleh Gemini - 2026-11-20] Integrasi penyimpanan Pemantau MT5, Buku Besar Keuangan Kantor, Alur Kerja Video Short V12, Analisa YouTube 00:00, dan Eksekutor Prompt Agen V13
const {createMt5FinanceStore}=require('./mt5_finance_store');
const {createShortWorkflowStore}=require('./short_workflow_store');
const {createYoutubeAnalyticsStore}=require('./youtube_analytics_store');
const {createAgentPromptStore}=require('./agent_prompt_store');
// V14-B [Diubah oleh Gemini - 2026-11-21] Host Dasbor YouTube Studio Manager tertanam utuh
const {createYoutubeDashboardHost}=require('./youtube_dashboard_host');
// V15 [Diubah oleh Gemini - 2026-11-21] Penemuan workspace otomatis & Pusat Setup onboarding
const {createWorkspaceDiscovery,YOUTUBE_DASHBOARD_REPO_URL}=require('./workspace_discovery');

const localeIndex=require('./locales/index.json');
const PUBLIC = Object.freeze({
  'personas.json':'application/json; charset=utf-8','persona_schema.js':'text/javascript; charset=utf-8','specialist_wing.js':'text/javascript; charset=utf-8','office_specialists.js':'text/javascript; charset=utf-8',
  'i18n_ready.js':'text/javascript; charset=utf-8',
  'i18n.js':'text/javascript; charset=utf-8',
  'locales/index.json':'application/json; charset=utf-8',
  ...Object.fromEntries(localeIndex.filter(l=>/^[A-Za-z0-9-]+$/.test(l.code)).map(l=>['locales/'+l.code+'.json','application/json; charset=utf-8'])),
  'index.html': 'text/html; charset=utf-8',
  'layout_catalog.js':'text/javascript; charset=utf-8',
  'layout_rules.js':'text/javascript; charset=utf-8',
  'office_layout.js':'text/javascript; charset=utf-8',
  'office_settings.js':'text/javascript; charset=utf-8',
  'office_settings_ui.js':'text/javascript; charset=utf-8',
  'office_ui.css':'text/css; charset=utf-8',
  'office_v12.css':'text/css; charset=utf-8',
  'office_panels.js':'text/javascript; charset=utf-8',
  // V15 [Diubah oleh Gemini - 2026-11-21] Pusat Setup & Onboarding pengguna baru
  'office_setup_ui.js':'text/javascript; charset=utf-8',
  'office_v12_ui.js':'text/javascript; charset=utf-8',
  // V14-B [Diubah oleh Gemini - 2026-11-21] UI Dasbor YouTube tertanam utuh
  'office_youtube_ui.js':'text/javascript; charset=utf-8',
  'office_v13_ui.js':'text/javascript; charset=utf-8',
  // V14-A [Diubah oleh Codex - 2026-11-21]
  'office_short_ui.js':'text/javascript; charset=utf-8',
  'office_short.css':'text/css; charset=utf-8',
  'office.js': 'text/javascript; charset=utf-8',
  'office_flow_model.js':'text/javascript; charset=utf-8',
  'office_flow_map.json':'application/json; charset=utf-8',
  'office_flow3d.js':'text/javascript; charset=utf-8',
  'office_flow_ui.js':'text/javascript; charset=utf-8',
  'office_flow.css':'text/css; charset=utf-8',
  'chars.js': 'text/javascript; charset=utf-8',
  'furniture.js': 'text/javascript; charset=utf-8',
  'vendor/three.min.js': 'text/javascript; charset=utf-8'
});
const STATUSES = new Set(['working', 'thinking', 'idle', 'meeting', 'error', 'done']);
function validate(data,configuredTypes={}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('objek');
  const allowed = new Set(['agent','role','task','status','tokens','cost_idr','kind','provider','parent','session','type','duration_s','model','event_id','category','account','source','agent_type','taskTitle','flow_id','at','limitDetected','flow_status']);
  if (Object.keys(data).some(key => !allowed.has(key))) throw new Error('bidang tidak dikenal');
  const types = new Set(['call','report','spawn','retire','usage']);
  if (data.type !== undefined && !types.has(data.type)) throw new Error('type');
  data = {...data};
  if (data.type) {
    data.agent ??= 'main-' + (data.session || data.provider || 'local');
    data.role ??= data.provider || 'Agent';
    data.status ??= ({call:'thinking',report:'done',spawn:'working',retire:'done',usage:'working'})[data.type];
  }
  const event = {};
  for (const name of ['provider','parent','session','model','event_id']) {
    if (data[name] !== undefined) {
      if (typeof data[name] !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(data[name])) throw new Error(name);
      event[name] = data[name];
    }
  }
  // v6-C: provider bawaan atau slug agen kustom (huruf kecil/angka/tanda hubung, maks 24); bidang bebas tetap ditolak.
  if (event.provider && !['claude','codex','gemini','hermes','opencode','other'].includes(event.provider) && !/^[a-z0-9-]{1,24}$/.test(event.provider)) throw new Error('provider');
  if (data.account !== undefined) { if (typeof data.account !== 'string' || !/^[a-z0-9-]{1,40}$/.test(data.account)) throw new Error('account'); event.account = data.account; }
  if (data.kind !== undefined && !['main','subagent'].includes(data.kind)) throw new Error('kind');
  if (data.duration_s !== undefined && (typeof data.duration_s !== 'number' || !Number.isFinite(data.duration_s) || data.duration_s < 0 || data.duration_s > 1e9)) throw new Error('duration_s');
  if (data.type) event.type = data.type;
  if (data.category !== undefined) { if (!CATEGORIES.includes(data.category)) throw new Error('category'); event.category = data.category; }
  if (data.duration_s !== undefined) event.duration_s = data.duration_s;
  for (const [name, limit] of [['agent', 64], ['role', 40], ['task', 100]]) {
    const value = data[name] === undefined ? (name === 'task' ? '' : null) : data[name];
    if (typeof value !== 'string' || [...value].length > limit ||
        (name !== 'task' && !value.trim()) || /[\x00-\x1f]/.test(value)) throw new Error(name);
    event[name] = value;
  }
  if (!STATUSES.has(data.status)) throw new Error('status');
  event.status = data.status;
  // V16-C: do not allow an HTTP sender to impersonate trusted internal sources.
  if(data.source!==undefined){if(data.source!=='hook')throw Error('source');event.source='hook';}
  if(data.flow_id!==undefined){if(typeof data.flow_id!=='string'||!/^[-a-zA-Z0-9_.:]{1,64}$/.test(data.flow_id))throw Error('flow_id');event.flow_id=data.flow_id;}
  if(data.at!==undefined){if(!Number.isSafeInteger(data.at)||data.at<0)throw Error('at');event.at=data.at;}
  if(data.limitDetected!==undefined){if(typeof data.limitDetected!=='boolean')throw Error('limitDetected');event.limitDetected=data.limitDetected;}
  if(data.flow_status!==undefined){if(!['failed','rate_limited','cancelled','timed_out'].includes(data.flow_status))throw Error('flow_status');event.flow_status=data.flow_status;}
  if(data.agent_type!==undefined){
    if(typeof data.agent_type!=='string'||[...data.agent_type].length>64||/[\x00-\x1f\x7f]/.test(data.agent_type))throw Error('agent_type');
    // V21 [Diubah oleh Codex - 2026-11-22] Preserve safe custom type labels; the model alone decides the general-persona fallback.
    const safeType=data.agent_type===''||/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,63}$/u.test(data.agent_type)&&!data.agent_type.includes('..')&&safeFlowTitle(data.agent_type)===data.agent_type;
    event.agent_type=safeType?data.agent_type:'general-purpose';
  }
  if(data.taskTitle!==undefined){
    if(typeof data.taskTitle!=='string'||[...data.taskTitle].length>120||/[\x00-\x1f\x7f]/.test(data.taskTitle))throw Error('taskTitle');
    event.taskTitle=safeFlowTitle(data.taskTitle);
  }
  event.usage=tokenUsage(data.tokens);
  event.tokens=sum(event.usage);
  if(!/^[a-zA-Z0-9_.:-]{1,64}$/.test(event.agent))throw Error('agent');
  const roles=new Set(['Claude','Codex','Gemini','Hermes','Backend Dev','Frontend Dev','Full-Stack Dev','QA Engineer','DevOps','Pentester','Designer','Researcher','Project Manager','Agent','claude','codex','gemini','hermes','other']);
  if(!roles.has(event.role))event.role='Agent';
  for (const name of ['cost_idr']) {
    const value = data[name] === undefined ? 0 : data[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12 ||
        (name === 'tokens' && !Number.isInteger(value))) throw new Error(name);
    event[name] = value;
  }
  // Ringkasan tidak meneruskan prompt, isi berkas atau perintah bebas.
  const summaries = /^(?:menyiapkan pekerjaan|menyiapkan rencana|memulai tugas agen|tugas selesai|mengedit berkas|membaca kode|menjalankan perintah|mendelegasikan tugas|meneliti referensi|menggunakan alat|Aktivitas agen)$/;
  const candidate = event.task.replace(/^selesai: /, '');
  const fileSummary = /^(?:mengedit|membaca) [\w. -]{1,48}\.(?:js|cjs|mjs|ts|tsx|jsx|py|md|html|css|json|txt|yaml|yml)$/;
  if (!summaries.test(candidate) && !fileSummary.test(candidate)) event.task = 'Aktivitas agen';
  // Event lama/hook tanpa category: turunkan dari ringkasan generik (nama berkas hanya untuk ekstensi).
  if (!event.category) { const t = event.task.replace(/^selesai: /, ''), f = t.match(/^(mengedit|membaca) (.+)$/);
    event.category = ['idle','done'].includes(event.status) ? 'idle' : f ? categoryFor(f[1] === 'mengedit' ? 'Edit' : 'Read', { file: f[2] }) : /^menjalankan/.test(t) ? 'terminal' : /^meneliti/.test(t) ? 'browse' : /^(membaca kode|mengedit berkas)$/.test(t) ? 'code' : 'chat'; }
  if (!event.provider) event.provider = ['claude','codex','gemini','hermes'].find(p => (event.agent+' '+event.role).toLowerCase().includes(p)) || 'other';
  event.kind = data.kind === "main" || event.agent.startsWith("main-") ? "main" : "subagent";
  return event;
}
// Never retain prompt/output/path/credential content in the flow projection.
function safeFlowTitle(value){return typeof value==='string'&&!/secret|password|token|api.?key|bearer|sk-|AIza|ya29\.|[\w.+-]+@[\w.-]+|[a-z]:[\\/]|(?:^|\s)[/~]|-----BEGIN/i.test(value)?[...value.trim()].slice(0,120).join('')||'Aktivitas agen':'Aktivitas agen';}
function localDay(ms) {
  const d = new Date(ms);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

async function startServer({ root = __dirname, port = 8770, maxPort = 8775,
  portFile, dataDir=path.join(root,'data'), now = Date.now, collector: collectorOptions = {}, shortPipelineOptions = {},
  // V14-B [Diubah oleh Gemini - 2026-11-21] Opsi injeksi pengujian host dasbor YouTube & eksekutor agen
  youtubeDashboard: youtubeDashboardOptions = {}, agentPrompt: agentPromptOptions = {}, mt5Options = {},
  // V15 [Diubah oleh Gemini - 2026-11-21] Opsi kontrol pemindaian drive & cwd untuk uji terisolasi
  allowDriveScan = process.env.OFFICE_AI_NO_DRIVE_SCAN !== '1', cwd = process.cwd(), flowHooksHome, usageOptions = {} } = {}) {
  root = path.resolve(root);
  const data=await createData({dataDir,now}),vaultToken=crypto.randomBytes(32).toString('hex');
  // V22: only fixed collector roots (or injected QA roots), never paths from HTTP input.
  const usageHistory=await createUsageHistory({dataDir,now,getPricing:()=>data.pricing()});
  await data.attachUsageHistory(usageHistory).catch(()=>{});
  const usageImporter=createUsageImporter({dataDir,now,store:usageHistory,getPricing:()=>data.pricing(),roots:usageOptions.roots||collectorOptions?.roots});
  const settings=await createSettingsStore(dataDir);
  const quality=await Quality.createQuality({dataDir,now,personas:()=>settings.get().personas});
  const agents = new Map(), clients = new Set();
  // V16-C: bounded, volatile journal; no prompt bodies and no second ledger.
  const flowModel=FlowModel.create({now,map:FLOW_MAP,maxEvents:1024,maxFlows:64,maxActiveFlows:16});
  let flowRevision=0;
  const pipelineRuns=new Map(),flowJournal=new Map(),flowActivities=new Map();
  function observeFlow(event,source,send=false){
    if(!event||event.type==='usage')return;
    flowModel.configure?.(settings.get().flow16,settings.get().personas);
    const clean={};
    for(const key of ['type','provider','agent','parent','kind','role','session','event_id','flow_id','agent_type','status','flow_status','limitDetected','persona','estimated'])if(event[key]!==undefined)clean[key]=event[key];
    clean.taskTitle=safeFlowTitle(event.taskTitle||event.task);clean.at=event.at??now();clean.source=source==='collector'?'log':source;
    const result=flowModel.ingest(clean);
    if(result.accepted||result.reason==='duplicate'&&clean.source==='hook'){flowRevision++;flowJournal.set(flowRevision,clean);if(flowJournal.size>1024)flowJournal.delete(flowJournal.keys().next().value);}
    if(send&&(result.accepted||result.reason==='duplicate'))for(const c of clients)push(c,{type:'flow_event',flow_revision:flowRevision,event:clean},'office-event');
  }
  function adaptFlow(payload){
    if(['prompt_run_started','prompt_run_done'].includes(payload.type)){
      const id=payload.runId||payload.run?.id;if(!id)return;
      const done=payload.type==='prompt_run_done',provider=payload.agentId||payload.provider||'other';
      const context=payload.flow?.source==='pipeline'?payload.flow:null;
      payload.flowObserved=true;
      if(context&&pipelineRuns.has(context.taskId))return;
      const source=context?'pipeline':'panel',flowId=context?.taskId||id,at=Date.parse(done?payload.finishedAt:payload.startedAt)||now();
      const common={provider,flow_id:flowId,session:flowId,agent:'main-'+provider,at,status:done?payload.status:'working',limitDetected:payload.limitDetected,flow_status:payload.cancelled?'cancelled':undefined};
      observeFlow({...common,type:done?'report':'call',event_id:id+(done?'-done':'-start')},source,true);
      if(payload.persona&&Object.hasOwn(FLOW_MAP.personas,payload.persona))observeFlow({...common,type:done?'retire':'spawn',agent:'persona-'+payload.persona,parent:'main-'+provider,persona:payload.persona,event_id:id+(done?'-persona-done':'-persona-start')},source,true);
    }
    if(payload.type==='short_agent'){
      const flowId=payload.runId+':'+payload.stageId+':'+payload.attempt,done=payload.phase==='finished',provider=payload.provider;
      if(!done){pipelineRuns.set(flowId,{flowId,persona:payload.persona,pending:true});if(pipelineRuns.size>128)pipelineRuns.delete(pipelineRuns.keys().next().value);}
      const common={provider,flow_id:flowId,session:flowId,agent:'main-'+provider,at:now(),status:done?payload.status:'working'};
      if(!done)observeFlow({...common,type:'call',event_id:flowId+'-start'},'pipeline',true);
      if(payload.persona&&Object.hasOwn(FLOW_MAP.personas,payload.persona))observeFlow({...common,type:done?'retire':'spawn',agent:'persona-'+payload.persona,parent:'main-'+provider,persona:payload.persona,event_id:flowId+(done?'-persona-done':'-persona-start')},'pipeline',true);
      if(done){observeFlow({...common,type:'report',event_id:flowId+'-done'},'pipeline',true);pipelineRuns.delete(flowId);}
    }
    if(payload.type==='short_stage'){
      const r=payload.run,s=r?.stages?.[r.current];if(!s)return;
      const id=r.id+':'+s.id+':'+(s.attempts||0);
      // A stage is activity, not proof that an AI persona was spawned.
      // The actual runAgent start below is the only source of persona branches.
      flowActivities.set(r.id,{runId:r.id,stageId:s.id,attempt:s.attempts||0,phase:payload.phase,status:r.status,at:now(),source:'pipeline'});
      if(flowActivities.size>64)flowActivities.delete(flowActivities.keys().next().value);
    }
  }
  function adaptQualityFlow(event,task){
    // V16-C: a real QA assignment has a root lifecycle, not an orphan inferred turn.
    const provider=event.engine||task.engine||'other',id=event.task_id,round=event.round||task.round||1;
    const common={provider,flow_id:id,session:id,agent:'main-'+provider,at:now()};
    const child={...common,agent:'persona-'+event.persona+'-r'+round,parent:common.agent,persona:event.persona};
    if(event.type==='persona_call')observeFlow({...common,type:'call',event_id:event.event_id+'-root'},'hook',true);
    if(['persona_call','revise'].includes(event.type))observeFlow({...child,type:'spawn',event_id:event.event_id+'-spawn'},'hook',true);
    if(event.type==='submit')observeFlow({...child,type:'retire',event_id:event.event_id+'-retire'},'hook',true);
    if(['verdict','escalate'].includes(event.type)&&['passed','escalated'].includes(task.stage))observeFlow({...common,type:'report',status:task.stage==='passed'?'completed':'failed',event_id:event.event_id+'-done'},'hook',true);
    event.flowObserved=true;
  }
  let mutations=Promise.resolve();
  const serial=fn=>{const task=mutations.then(fn);mutations=task.catch(()=>{});return task;};
  let revision=0,day=localDay(now());
  let activePort, heartbeat, closePromise;
  function snapshot() {
    const time = now(), today = localDay(time);
    day=today;
    const todayUsage=data.daily(1).days[0];
    return { agents: [...agents.values()].map(a => ({ ...a,
      status: time / 1000 - a.updated_at > 600 ? 'idle' : a.status })),
      total_tokens:data.total(),tokens_today:todayUsage.tokens,cost_idr_today:todayUsage.cost_idr,unread_reports:[...data.reports(),...quality.reports()].filter(r=>!r.read).length,
      date: day, revision };
  }
  // Event tervalidasi -> peta agen + SSE. usageOnly (kolektor) hanya menambah token agen, tidak mengubah statusnya.
  const recent=new Map(),time=()=>now()/1000;
  function publish(event,result,opts,source){
    const prev=agents.get(event.agent);
    if(!opts.usageOnly&&!prev&&agents.size>=256){for(const [id,a] of agents){if(time()-a.updated_at>600||a.status==='done'){agents.delete(id);break;}}if(agents.size>=256)return false;}
    event.agent_tokens=(prev?.agent_tokens||0)+(opts.count===false?0:(event.tokens||0));
    event.task_code=event.type==='report'?'completed':event.category||'activity';delete event.cost_idr;if(result.report)event.report_id=result.report.id;event.source=source;
    event.event_revision=revision+1;event.updated_at=time();revision++;
    if(!opts.usageOnly)observeFlow(event,source);
    if(opts.usageOnly){if(prev)prev.agent_tokens=event.agent_tokens;}else agents.set(event.agent,event);
    for(const client of clients)push(client,event,'office-event');return true;
  }
  // Hook dan kolektor menggerakkan agen Claude yang sama: call/spawn/retire kembar dalam 15 detik jadi status biasa.
  function twin(event,source){if(!['call','spawn','retire'].includes(event.type)||event.provider!=='claude')return;const key=event.agent+'|'+event.type,seen=recent.get(key);
    if(seen&&seen.source!==source&&now()-seen.at<15000){delete event.type;return;}recent.set(key,{source,at:now()});if(recent.size>2000)recent.delete(recent.keys().next().value);}
  async function collectorSink(items){return serial(async()=>{
    const valid=[];for(const it of items){if(it.opts?.replace){valid.push({replace:it.opts.replace});continue;}try{const event=validate(it.event,settings.get().flow16?.subagentTypes);if(!it.opts?.backfill){const original={...event};twin(event,'collector');if(original.type&&!event.type)observeFlow(original,'log',true);}valid.push({event,opts:it.opts||{}});}catch{/* event kolektor tak valid dibuang */}}
    if(!valid.length)return;snapshot();
    const results=await data.applyBatch(valid.map(v=>v.replace?{replace:v.replace}:{event:v.event,opts:{count:v.opts.count,date:v.opts.date}}));
    valid.forEach((v,i)=>{if(!v.replace&&!results[i].duplicate&&!v.opts.backfill)publish(v.event,results[i],v.opts,'collector');});
    const state=snapshot();for(const client of clients)push(client,state);
  });}
  const collector=collectorOptions===false||process.env.OFFICE_COLLECTOR==='0'?null:createCollector({dataDir,now,sink:collectorSink,roots:collectorOptions.roots,enabled:settings.get().collector,onUsageFile:(p,f)=>usageImporter.enqueue(p,f)});
  // V16-C [Diubah oleh Gemini - 2026-11-21] Hanya putus klien SSE yang benar-benar macet (>256 KB tertunda), jangan putus pada backpressure 16 KB sesaat saat burst/screenshot
  function push(client, state, name='state') {
    if (client.destroyed || client.writableEnded) { clients.delete(client); return; }
    if (client.writableLength > 262144) {
      clients.delete(client); client.destroy();
      return;
    }
    client.write('event: '+name+'\ndata: ' + JSON.stringify(state) + '\n\n');
  }
  // [Diubah oleh Gemini - 2026-11-20] Inisialisasi store MT5 & Keuangan, Video Short V12, YouTube 00:00 Analytics, & Prompt Runner V13 dengan pelacakan biaya token Gemini & siaran SSE office-event
  const broadcastV12Event = payload => {
    adaptFlow(payload);
    revision++;
    const msg = { ...payload, event_revision: revision, revision };
    for (const client of clients) push(client, msg, 'office-event');
  };
  const handleExternalGeminiUsage = async usagePayload => {
    if (typeof data.recordExternalUsage !== 'function') return null;
    const recorded = await serial(() => data.recordExternalUsage(usagePayload));
    const st = snapshot();
    for (const client of clients) push(client, st);
    broadcastV12Event({
      type: 'usage_updated',
      provider: usagePayload?.provider || 'gemini',
      model: recorded?.model || usagePayload?.model || 'gemini-2.5-flash',
      tokens: recorded?.tokens || 0,
      cost_idr: recorded?.cost_idr || 0,
      tokens_today: st.tokens_today,
      cost_idr_today: st.cost_idr_today
    });
    return recorded;
  };
  const mt5Finance = await createMt5FinanceStore({
    ...mt5Options,
    dataDir,
    root,
    now,
    onEvent: broadcastV12Event
  });
  const shortWorkflow = await createShortWorkflowStore({
    dataDir,
    now,
    onEvent: broadcastV12Event,
    onGeminiUsage: handleExternalGeminiUsage
  });
  // V15 [Diubah oleh Gemini - 2026-11-21] Penemuan workspace proyek & dasbor YouTube generik + state Pusat Setup persisten
  const workspaceDiscovery = createWorkspaceDiscovery({
    root,
    cwd,
    getSavedProjectDir: () => shortWorkflow.getConfig().localProjectDir || '',
    getSavedDashboardDir: () => shortWorkflow.getConfig().dashboardDir || '',
    allowDriveScan
  });
  const setupStateFile = path.join(dataDir, 'setup_state.json');
  let setupState = { version: 1, dismissed: false, completed: false, fullAccessAck: false, skipQuitConfirm: false, updatedAt: null };
  try {
    const rawSetup = JSON.parse(await fs.readFile(setupStateFile, 'utf8'));
    if (rawSetup && typeof rawSetup === 'object' && !Array.isArray(rawSetup)) {
      setupState = {
        version: 1,
        dismissed: Boolean(rawSetup.dismissed),
        completed: Boolean(rawSetup.completed),
        fullAccessAck: Boolean(rawSetup.fullAccessAck),
        skipQuitConfirm: Boolean(rawSetup.skipQuitConfirm),
        updatedAt: rawSetup.updatedAt || null
      };
    }
  } catch {}
  async function saveSetupState(patch = {}) {
    if (patch.dismissed !== undefined) setupState.dismissed = Boolean(patch.dismissed);
    if (patch.completed !== undefined) setupState.completed = Boolean(patch.completed);
    if (patch.fullAccessAck !== undefined) setupState.fullAccessAck = Boolean(patch.fullAccessAck);
    if (patch.skipQuitConfirm !== undefined) setupState.skipQuitConfirm = Boolean(patch.skipQuitConfirm);
    setupState.updatedAt = new Date(now()).toISOString();
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${setupStateFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(setupState, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, setupStateFile).catch(async () => {
      await fs.copyFile(tmp, setupStateFile);
      await fs.unlink(tmp).catch(() => {});
    });
    return { ...setupState };
  }
  const youtubeAnalytics = await createYoutubeAnalyticsStore({
    dataDir,
    now,
    getLocalProjectDir: () => shortWorkflow.getConfig().localProjectDir || '',
    getGeminiConfig: () => shortWorkflow.getInternalGeminiConfig(),
    onGeminiUsage: handleExternalGeminiUsage,
    onEvent: broadcastV12Event
  });
  const agentPrompt = await createAgentPromptStore({
    root,
    dataDir,
    now,
    getDefaultCwd: () => shortWorkflow.getConfig().localProjectDir || '',
    getGeminiConfig: () => shortWorkflow.getInternalGeminiConfig(),
    getPricing: () => data.pricing(),
    workspaceDiscovery,
    onGeminiUsage: handleExternalGeminiUsage,
    onEvent: broadcastV12Event,
    ...agentPromptOptions
  });
  // V14-B + V15 [Diubah oleh Gemini - 2026-11-21] Host Dasbor YouTube Studio Manager dengan dukungan dashboardDir terpisah & penemuan otomatis
  const youtubeDashboard = await createYoutubeDashboardHost({
    root,
    dataDir,
    now,
    getLocalProjectDir: () => shortWorkflow.getConfig().localProjectDir || '',
    getDashboardDir: () => shortWorkflow.getConfig().dashboardDir || '',
    workspaceDiscovery,
    getLegacyAnalyticsState: () => youtubeAnalytics.getState(),
    onEvent: broadcastV12Event,
    ...youtubeDashboardOptions
  });
  // V14-A + V15: factory terikat ke konfigurasi & penemuan otomatis folder proyek.
  const shortPipeline = await shortWorkflow.createPipeline({
    ...shortPipelineOptions, workspaceDiscovery, onEvent: broadcastV12Event,
    runAgent: typeof agentPrompt.runAgent === 'function' ? (...args) => agentPrompt.runAgent(...args) : undefined
  });
  // V15 [Diubah oleh Gemini - 2026-11-21] Agregasi status nyata Pusat Setup (6 item checklist + langkah berikutnya dinamis); pindai workspace lebih dulu agar tidak kalah I/O saat probe CLI paralel
  async function getSetupStatus({ forceRefresh = false } = {}) {
    const disc = await workspaceDiscovery.discover({ forceRefresh });
    const [agentsInfo, dashStatus, wfCfg] = await Promise.all([
      agentPrompt.detectAgents({ forceRefresh }).catch(() => ({ agents: [] })),
      youtubeDashboard.getStatus({ probe: true }).catch(() => ({ running: false, serverAvailable: false })),
      Promise.resolve(shortWorkflow.getConfig())
    ]);
    const channels = disc.effectiveProjectDir ? await shortPipeline.channels().catch(() => []) : [];
    const cliAgents = (agentsInfo.agents || []).filter(a => a.id !== 'gemini-api');
    const readyClis = cliAgents.filter(a => a.installed && a.status === 'ready');
    const mt5Status = mt5Finance.getStatus();
    const curSettings = settings.get();
    const dashSum = youtubeDashboard.getLastSummary();
    const geminiReady = Boolean(wfCfg.hasGeminiKey);
    const projectReady = Boolean(disc.effectiveProjectDir && channels.length > 0);
    const cliReady = readyClis.length > 0;
    const dashboardReady = Boolean(dashStatus.running || dashStatus.serverAvailable);
    const mt5Ready = Boolean(mt5Status.connected || mt5Status.config?.enabled);

    let nextStep = { code: 'configure_start', action: 'setup', channel: '' };
    if (projectReady) {
      nextStep = { code: 'create_first_short', action: 'shorts', channel: channels[0]?.name || '' };
    } else if (cliReady || geminiReady) {
      nextStep = { code: 'try_prompt_or_project', action: 'prompt', channel: '' };
    } else if (disc.projectCandidates.length > 0) {
      nextStep = { code: 'pick_discovered_project', action: 'project', channel: '' };
    }

    return {
      ok: true,
      setupState: { ...setupState },
      readyCount: [projectReady, cliReady, geminiReady, dashboardReady, mt5Ready, true].filter(Boolean).length,
      totalItems: 6,
      recommendedNextStep: nextStep,
      project: {
        ready: projectReady,
        savedDir: wfCfg.localProjectDir || '',
        effectiveDir: disc.effectiveProjectDir || '',
        displayPath: disc.effectiveProjectDisplay || '',
        source: disc.projectSource,
        needsConfirmation: Boolean(disc.projectNeedsConfirmation),
        channelsCount: channels.length,
        channels: channels.map(c => ({ key: c.key, name: c.name, formats: c.formats, inferred: Boolean(c.inferred) })),
        candidates: (disc.projectCandidates || []).map(c => ({
          path: c.path,
          displayPath: c.displayPath,
          name: c.name,
          channelsCount: c.channelsCount,
          hasChannelsJson: c.hasChannelsJson,
          hasDashboard: c.hasDashboard
        }))
      },
      agents: {
        ready: cliReady,
        readyCount: readyClis.length,
        totalCli: cliAgents.length,
        list: (agentsInfo.agents || []).map(a => ({
          id: a.id,
          name: a.name,
          installed: Boolean(a.installed),
          status: a.status,
          version: a.version || '',
          reasonCode: a.reasonCode || ''
        }))
      },
      gemini: {
        ready: geminiReady,
        hasKey: geminiReady,
        keyHint: wfCfg.keyHint || '',
        model: wfCfg.geminiModel || 'gemini-2.5-flash'
      },
      dashboard: {
        ready: dashboardReady,
        savedDir: wfCfg.dashboardDir || '',
        effectiveDir: dashStatus.resolvedDashboardDir || disc.effectiveDashboardDir || '',
        displayPath: dashStatus.dashboardDisplayPath || disc.effectiveDashboardDisplay || '',
        source: dashStatus.dashboardSource || disc.dashboardSource || 'none',
        serverAvailable: Boolean(dashStatus.serverAvailable),
        running: Boolean(dashStatus.running),
        mode: dashStatus.mode || 'stopped',
        port: dashStatus.port || 8765,
        connectedChannels: dashSum?.totals?.connectedChannels || 0,
        totalChannels: dashSum?.totals?.totalChannels || 0,
        needsConfirmation: Boolean(dashStatus.needsConfirmation || disc.dashboardNeedsConfirmation),
        candidates: (dashStatus.dashboardCandidates || disc.dashboardCandidates || []).map(c => ({
          path: c.path,
          displayPath: c.displayPath,
          name: c.name,
          layout: c.layout || '',
          hasVenv: Boolean(c.hasVenv)
        })),
        repoUrl: YOUTUBE_DASHBOARD_REPO_URL
      },
      mt5: {
        ready: mt5Ready,
        enabled: Boolean(mt5Status.config?.enabled),
        connected: Boolean(mt5Status.connected),
        status: mt5Status.status || 'disconnected',
        detection: mt5Status.detection,
        reason: mt5Status.reason,
        readonly: true
      },
      preferences: {
        ready: true,
        language: curSettings.language,
        currency: curSettings.currency,
        theme: curSettings.appearance?.theme || 'system'
      },
      discoveryStats: disc.stats
    };
  }
  async function readV12JsonBody(req, { allowEmpty = false, maxBytes = 32768 } = {}) {
    const rawLen = req.headers['content-length'];
    const length = rawLen !== undefined ? Number(rawLen) : undefined;
    if (length !== undefined && (!Number.isInteger(length) || length < 0 || length > maxBytes)) {
      const err = new Error('Ukuran payload melebihi batas');
      err.status = 413;
      throw err;
    }
    if (length === 0 && allowEmpty) return {};
    const chunks = [];
    let size = 0;
    let expired = false;
    const timer = setTimeout(() => { expired = true; req.destroy(); }, 2500);
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) {
          const err = new Error('Ukuran payload melebihi batas');
          err.status = 413;
          throw err;
        }
        chunks.push(chunk);
      }
      if (expired) {
        const err = new Error('Waktu baca payload habis');
        err.status = 400;
        throw err;
      }
      if (size === 0) {
        if (allowEmpty) return {};
        const err = new Error('Payload JSON wajib diisi');
        err.status = 400;
        throw err;
      }
      const ctype = (req.headers['content-type'] || '').split(';')[0].trim();
      if (ctype && ctype !== 'application/json') {
        const err = new Error('Gunakan application/json');
        err.status = 415;
        throw err;
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      return JSON.parse(text);
    } catch (e) {
      if (e.status) throw e;
      const err = new Error('Payload JSON tidak valid');
      err.status = 400;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  // V16-C [Diubah oleh Codex - 2026-11-21] Explicit preview + confirmation only.
  const hookPreviews=new Map();
  const hookError=(code,status=400)=>Object.assign(new Error(code),{status,code});
  async function safeHookPath(target){
    if(typeof target!=='string'||!path.isAbsolute(target)||target.split(/[\\/]+/).some((p,i)=>p==='..'||/[\x00-\x1f]/.test(p)||/[. ]$/.test(p)||p.includes(':')&&!(i===0&&/^[a-z]:$/i.test(p))||/^(?:secrets|\.git|\.env.*)$/i.test(p)))throw hookError('unsafe_hook_target');
    const absolute=path.resolve(target);
    for(let p=absolute;;p=path.dirname(p)){
      const stat=await fs.lstat(p).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
      if(stat?.isSymbolicLink())throw hookError('unsafe_hook_target');
      if(stat&&path.resolve(await fs.realpath(p)).toLowerCase()!==p.toLowerCase())throw hookError('unsafe_hook_target');
      if(path.dirname(p)===p)break;
    }
    return absolute;
  }
  async function hookFingerprint(target){
    await safeHookPath(target);
    const stat=await fs.stat(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(!stat)return 'absent';
    if(!stat.isFile()||stat.size>2*1024*1024)throw hookError('unsafe_hook_target');
    return crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
  }
  async function hookOperation(action,body){
    if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['provider','scope','folder','sendPromptText','confirm','previewId'].includes(k)))throw hookError('invalid_hook_request');
    if(!['claude','codex'].includes(body.provider)||!['project','global'].includes(body.scope)||body.sendPromptText!==undefined&&typeof body.sendPromptText!=='boolean')throw hookError('invalid_hook_request');
    if(body.scope==='project'&&typeof body.folder!=='string'||body.scope==='global'&&body.folder!==undefined)throw hookError('invalid_hook_request');
    const folder=await safeHookPath(body.scope==='project'?body.folder:flowHooksHome||require('node:os').homedir());
    const target=await safeHookPath(path.join(folder,body.provider==='claude'?'.claude/settings.json':'.codex/hooks.json'));
    const fingerprint=await hookFingerprint(target),key=JSON.stringify([body.provider,body.scope,folder,!!body.sendPromptText]);
    for(const [id,p] of hookPreviews)if(now()-p.at>300000)hookPreviews.delete(id);
    if(['install','uninstall'].includes(action)){
      const preview=hookPreviews.get(body.previewId);
      if(body.confirm!==true||!preview||preview.key!==key)throw hookError('hook_preview_required',409);
      if(preview.fingerprint!==fingerprint)throw hookError('hook_preview_stale',409);
      hookPreviews.delete(body.previewId);
    }
    let python=process.env.OFFICE_PYTHON||'python';
    if(process.platform==='win32'&&!process.env.OFFICE_PYTHON){
      for(const version of ['314','313','312','311','310']){
        const candidate=path.join(process.env.LOCALAPPDATA||'', 'Programs','Python','Python'+version,'python.exe');
        if(await fs.stat(candidate).then(s=>s.isFile()).catch(()=>false)){python=candidate;break;}
      }
    }
    const args=['-I','-B',path.join(root,'office_hooks.py'),action,'--provider',body.provider,'--scope',body.scope];
    if(['install','uninstall'].includes(action))args.push('--expected-hash',fingerprint);
    if(body.scope==='project')args.push(folder);else args.push('--home',folder);
    if(body.sendPromptText)args.push('--send-prompt-text');
    const result=await new Promise((resolve,reject)=>execFile(python,args,{cwd:root,windowsHide:true,timeout:5000,maxBuffer:3*1024*1024,encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}},(error,stdout)=>{
      let parsed;try{parsed=JSON.parse(stdout);}catch{reject(hookError('hook_runner_unavailable'));return;}
      if(error||!parsed.ok){reject(hookError(parsed.error||'hook_configuration_invalid'));return;}resolve(parsed);
    }));
    if(action==='preview'){
      if((result.writes||[]).some(w=>/password|api.?key|access.?token|refresh.?token|auth.?token|bearer\s|sk-[a-z0-9]{10}|AIza|ya29\./i.test(w.content)))throw hookError('hook_preview_sensitive');
      const previewId=crypto.randomBytes(24).toString('hex');
      hookPreviews.set(previewId,{key,fingerprint,at:now()});if(hookPreviews.size>32)hookPreviews.delete(hookPreviews.keys().next().value);
      result.previewId=previewId;
    }
    return result;
  }
  const limiter={tokens:240,at:Date.now()};
  function allowedRate(){const t=Date.now();limiter.tokens=Math.min(240,limiter.tokens+(t-limiter.at)*.03);limiter.at=t;if(limiter.tokens<1)return false;limiter.tokens--;return true;}
  function tokenMatches(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return false;return crypto.timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(vaultToken,'hex'));}
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const origins = new Set(['http://127.0.0.1:' + activePort, 'http://localhost:' + activePort]);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    // V14-B [Diubah oleh Gemini - 2026-11-21] Izinkan frame-src hanya ke origin loopback Dasbor YouTube sambil menjaga frame-ancestors 'none'
    const dashFrameOrigins = youtubeDashboard.getAllowedOrigins().join(' ');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self' " + dashFrameOrigins + "; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (origins.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    function reply(code, value) {
      const body = JSON.stringify(value);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    }
    if ((origin !== undefined && !origins.has(origin)) ||
        !['127.0.0.1:' + activePort, 'localhost:' + activePort].includes(req.headers.host)) {
      reply(403, { error: 'origin/host ditolak' }); return;
    }
    if(req.headers['sec-fetch-site']==='cross-site'){reply(403,{error:'situs lintas origin ditolak'});return;}
    if(!allowedRate()){res.setHeader('Retry-After','1');reply(429,{error:'terlalu banyak permintaan'});return;}
    const route = req.url.split('?')[0];
    try {
      const url=new URL(req.url,'http://127.0.0.1:'+activePort);
      // V16-C: no automatic reading of owner hook configuration on GET.
      if(route==='/flow/state'&&req.method==='GET'){
        flowModel.tick(now());reply(200,{ok:true,flow_revision:flowRevision,flows:flowModel.snapshot(),events:[...flowJournal.values()],activities:[...flowActivities.values()],stats:flowModel.stats(),map:FLOW_MAP,settings:settings.get().flow16||null});return;
      }
      if(route.startsWith('/flow/hooks/')){
        if(!tokenMatches(req.headers['x-office-token'])){reply(403,{ok:false,error:'token_required',code:'token_required'});return;}
        const action=route.slice('/flow/hooks/'.length);
        if(action==='status'&&req.method==='GET'){reply(200,{ok:true,providers:['claude','codex'],requiresTarget:true});return;}
        if(req.method!=='POST'||!['status','preview','install','uninstall'].includes(action)){reply(404,{ok:false,error:'not_found',code:'not_found'});return;}
        try{const body=await readV12JsonBody(req,{maxBytes:16384});const result=await serial(()=>hookOperation(action,body));reply(200,result);}catch(e){const code=e.code&&/^[a-z_]+$/.test(e.code)?e.code:'hook_configuration_invalid';reply(e.status||400,{ok:false,error:code,code});}return;
      }
      if(route.startsWith('/vault/')&&!tokenMatches(req.headers['x-office-token'])){reply(403,{error:'token vault diperlukan'});return;}
      // V14-A [Diubah oleh Codex - 2026-11-21] Tidak masuk antrean serial global: Cancel harus tetap instan.
      if(route.startsWith('/short/')) {
        if(!tokenMatches(req.headers['x-office-token'])){reply(403,{error:'token diperlukan'});return;}
        try {
          if(req.method==='GET'&&route==='/short/channels'){
            const chKey=url.searchParams.get('channel')||'';
            const fmt=url.searchParams.get('format')||'short';
            const info=await shortPipeline.resolveProjectInfo({forceRefresh:url.searchParams.get('refresh')==='1'});
            const list=info.projectDir?await shortPipeline.channels().catch(()=>[]):[];
            const tools=await shortPipeline.inspectTools(chKey||list[0]?.key||'',fmt);
            reply(200,{
              channels:list,
              stages:shortPipeline.stages,
              projectDir:info.projectDir,
              savedProjectDir:info.savedProjectDir,
              projectDisplayPath:workspaceDiscovery.formatPortablePath(info.projectDir),
              projectSource:info.projectSource,
              projectValid:Boolean(info.projectDir&&list.length>0),
              needsConfirmation:info.needsConfirmation,
              candidates:(info.candidates||[]).map(c=>({path:c.path,displayPath:c.displayPath,name:c.name,channelsCount:c.channelsCount,hasChannelsJson:c.hasChannelsJson})),
              stagePlans:tools.stagePlans,
              missingTools:tools.missingTools,
              readyCount:tools.readyCount
            });
            return;
          }
          if(req.method==='GET'&&route==='/short/runs'){reply(200,{runs:shortPipeline.list(),stages:shortPipeline.stages});return;}
          const match=route.match(/^\/short\/runs\/(short_[a-f0-9]{16})(?:\/(artifact|script|[a-z-]+))?$/);
          if(req.method==='GET'&&match&&!match[2]){reply(200,{run:shortPipeline.get(match[1])});return;}
          if(req.method==='GET'&&match?.[2]==='artifact') {
            const file=await shortPipeline.artifact(match[1],url.searchParams.get('name')||''),info=await fs.stat(file);
            const types={'.mp4':'video/mp4','.wav':'audio/wav','.jpg':'image/jpeg','.png':'image/png','.json':'application/json; charset=utf-8'};
            res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain; charset=utf-8','Content-Length':info.size});
            require('node:fs').createReadStream(file).on('error',()=>res.destroy()).pipe(res);return;
          }
          if(req.method==='POST') {
            if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json'){reply(415,{error:'gunakan application/json'});return;}
            const body=await readV12JsonBody(req,{allowEmpty:true,maxBytes:160000});
            if(route==='/short/runs'){reply(201,{run:await shortPipeline.create(body)});return;}
            if(match?.[2]){reply(200,match[2]==='script'?{run:await shortPipeline.editScript(match[1],body.text)}:{result:await shortPipeline.action(match[1],match[2],body)});return;}
          }
          reply(404,{error:'tidak ditemukan'});return;
        }catch(e){reply(e.status||400,{error:e.message,code:e.code||'short_error'});return;}
      }
      // V22: lifetime totals, rankings, chart and resumable read-only import.
      if(['/usage/total','/usage/breakdown','/usage/history','/usage/import'].includes(route)){
        if(!tokenMatches(req.headers['x-office-token'])){reply(403,{ok:false,error:'usage_token_required'});return;}
        try{
          if(req.method==='GET'&&route==='/usage/total'&&!url.search){reply(200,usageHistory.total());return;}
          if(req.method==='GET'&&route==='/usage/breakdown'&&[...url.searchParams.keys()].every(k=>['by','limit','offset'].includes(k))){reply(200,usageHistory.breakdown(url.searchParams.get('by')||'provider',Number(url.searchParams.get('limit')||8),Number(url.searchParams.get('offset')||0)));return;}
          if(req.method==='GET'&&route==='/usage/history'&&[...url.searchParams.keys()].every(k=>k==='days')){reply(200,usageHistory.daily(Number(url.searchParams.get('days')||30)));return;}
          if(req.method==='POST'&&route==='/usage/import'&&!url.search){
            if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json'){reply(415,{ok:false,error:'usage_json_required'});return;}
            const body=await readV12JsonBody(req,{maxBytes:1024});
            if(!body||Array.isArray(body)||Object.keys(body).some(k=>k!=='action')||!['start','pause','status'].includes(body.action)){reply(400,{ok:false,error:'invalid_usage_action'});return;}
            reply(200,{ok:true,import:await usageImporter.action(body.action)});return;
          }
          reply(400,{ok:false,error:'invalid_usage_request'});
        }catch{reply(400,{ok:false,error:'usage_unavailable'});}return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Office-Token', 'Content-Length': '0' }); res.end(); return;
      }
      if (req.method === 'PUT' && route === '/settings') {
        if(req.socket.remoteAddress!=='127.0.0.1'){reply(403,{error:'hanya loopback'});return;}
        if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json'){reply(415,{error:'gunakan application/json'});return;}
        const length=Number(req.headers['content-length']);if(req.headers['content-length']!==undefined&&(!Number.isInteger(length)||length<=0||length>32768)){res.setHeader('Connection','close');reply(413,{error:'maksimal 32 KB'});return;}
        const chunks=[];let size=0;const timer=setTimeout(()=>req.destroy(),2000);
        try{for await(const chunk of req){size+=chunk.length;if(size>32768){res.setHeader('Connection','close');reply(413,{error:'maksimal 32 KB'});req.resume();return;}chunks.push(chunk);}let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{reply(400,{error:'JSON tidak valid'});return;}await serial(async()=>{const saved=await settings.put(parsed);if(collector)collector.configure(saved.collector);reply(200,saved);});}finally{clearTimeout(timer);}return;
      }
      if (req.method === 'GET') {
        if(route==='/settings'){reply(200,settings.get());return;}
         if(route==='/quality'){reply(200,quality.summary());return;}
         if(route==='/quality/tasks'){const n=Number(url.searchParams.get('limit')||50);if(!Number.isInteger(n)||n<1||n>2000){reply(400,{error:'limit 1..2000'});return;}reply(200,{tasks:quality.tasks(n)});return;}
         if(route==='/learnings'){reply(200,{learnings:quality.learnings()});return;}
        if(route==='/collector/status'){const st=collector?collector.status(p=>data.daily(1).days[0].providers[p]?.tokens??null):{running:false,providers:{}};for(const p of Object.values(st.providers))p.reason_code=!p.enabled?'disabled':!p.found?'missing':p.reason?'format':null;const today=data.daily(1).days[0].providers;for(const s of st.sources||[])s.tokens_today=s.tokens==='n/a'?null:today[s.provider]?.accounts?.[s.id]?.tokens??0;reply(200,st);return;}
        if (route === '/state') { reply(200, snapshot()); return; }
        if(route==='/reports'){reply(200,{reports:[...data.reports(),...quality.reports()]});return;}
        if(route==='/pricing'){reply(200,data.pricing());return;}
        if(route==='/usage/daily'){const days=Number(url.searchParams.get('days')||7);if(!Number.isInteger(days)||days<1||days>90){reply(400,{error:'days 1..90'});return;}reply(200,data.daily(days));return;}
        if(route==='/vault/tree'){reply(200,await data.tree());return;}
        if(route==='/vault/note'){reply(200,await data.note(url.searchParams.get('p')));return;}
        if(route==='/vault/search'){reply(200,await data.search(url.searchParams.get('q')));return;}
        if(route==='/vault/sync'){reply(200,data.syncStatus());return;}
        // [Diubah oleh Gemini - 2026-11-20] Endpoint GET V12 & V13: MT5 (Status & Analytics + CSV), Keuangan, Video Short (+ Workspace Sync), YouTube 00:00 Analytics, dan Prompt Runner
        if(route==='/mt5/status'){reply(200,url.searchParams.get('demo')==='1'?(await mt5Finance.getDemoStore()).getStatus():mt5Finance.getStatus());return;}
        if(route==='/mt5/analytics'){reply(200,(url.searchParams.get('demo')==='1'?await mt5Finance.getDemoStore():mt5Finance).getMt5Analytics({days:url.searchParams.get('days')||30,symbol:url.searchParams.get('symbol')||''}));return;}
        if(route==='/mt5/analytics.csv'){
          const csv=(url.searchParams.get('demo')==='1'?await mt5Finance.getDemoStore():mt5Finance).exportMt5AnalyticsCsv({days:url.searchParams.get('days')||30,symbol:url.searchParams.get('symbol')||''});
          const body=Buffer.from(csv,'utf8');
          res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="mt5_analytics.csv"','Content-Length':body.length});
          res.end(body);return;
        }
        if(route==='/finance/demo'){reply(200,(await mt5Finance.getDemoStore()).getLedger());return;}
        if(route==='/finance/summary'){reply(200,mt5Finance.getSummary());return;}
        if(route==='/finance/ledger'){reply(200,mt5Finance.getLedger({source:url.searchParams.get('source')||'',limit:url.searchParams.get('limit')||100}));return;}
        if(route==='/workflows/shorts'){reply(200,shortWorkflow.listWorkflows());return;}
        if(route==='/workflows/config'){reply(200,shortWorkflow.getConfig());return;}
        if(route==='/workflows/workspace'){reply(200,await shortWorkflow.scanWorkspace());return;}
        if(route==='/youtube/analytics'){reply(200,youtubeAnalytics.getState());return;}
        // V14-B [Diubah oleh Gemini - 2026-11-21] Rute GET Dasbor YouTube tertanam & katalog model/cwd/laporan Prompt Agen
        if(route==='/youtube/dashboard/status'){reply(200,await youtubeDashboard.getStatus({probe:url.searchParams.get('probe')!=='0'}));return;}
        if(route==='/youtube/dashboard/summary'){reply(200,await youtubeDashboard.fetchOfficeSummary({autoStart:false,includeLiveMetrics:url.searchParams.get('live')==='1',checkHealth:url.searchParams.get('health')!=='0',checkComments:url.searchParams.get('comments')==='1'}));return;}
        if(route==='/prompt/agents'){reply(200,await agentPrompt.detectAgents({forceRefresh:url.searchParams.get('refresh')==='1'}));return;}
        if(route==='/prompt/models'){reply(200,await agentPrompt.getModels({agentId:url.searchParams.get('agent')||'',forceRefresh:url.searchParams.get('refresh')==='1'}));return;}
        if(route==='/prompt/cwds'){reply(200,await agentPrompt.listQuickCwds());return;}
        if(route==='/prompt/config'){reply(200,agentPrompt.getConfig());return;}
        if(route==='/prompt/runs'){reply(200,agentPrompt.listRuns());return;}
        // V15 [Diubah oleh Gemini - 2026-11-21] Rute GET Pusat Setup, penemuan workspace otomatis & daftar proses agen aktif
        if(route==='/setup/status'){reply(200,await getSetupStatus({forceRefresh:url.searchParams.get('refresh')==='1'}));return;}
        if(route==='/runtime/active'){reply(200,getActiveRuntime());return;}
        const promptOutputMatch=route.match(/^\/prompt\/runs\/([A-Za-z0-9_-]{1,64})\/output$/);
        if(promptOutputMatch){
          if(!tokenMatches(req.headers['x-office-token'])){reply(403,{error:'token office diperlukan'});return;}
          try{reply(200,await agentPrompt.getRunOutput(promptOutputMatch[1]));}catch(err){reply(err?.status||404,{error:err?.message||'tidak ditemukan',code:err?.code||'error'});}
          return;
        }
        if (route === '/events') {
          if (clients.size >= 24) { reply(503, { error: 'terlalu banyak klien' }); return; }
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
          res.flushHeaders(); clients.add(res);
          res.on('close', () => clients.delete(res));
          res.on('error', () => clients.delete(res));
          push(res, snapshot()); return;
        }
        const name = route === '/' ? 'index.html' : route.slice(1);
        // Tolak URL nonpublik sebelum melakukan akses filesystem apa pun.
        if (!Object.hasOwn(PUBLIC, name)) { reply(404, { error: 'tidak ditemukan' }); return; }
        const target = path.join(root, name);
        const info = await fs.lstat(target), parent = await fs.lstat(path.dirname(target));
        if (!info.isFile() || info.isSymbolicLink() || parent.isSymbolicLink()) {
          reply(404, { error: 'tidak ditemukan' }); return;
        }
        let body = await fs.readFile(target);
        if(name==='index.html')body=Buffer.from(body.toString('utf8').replace('<!--OFFICE_TOKEN-->','<meta name="office-vault-token" content="'+vaultToken+'">'));
        res.writeHead(200, { 'Content-Type': PUBLIC[name], 'Content-Length': body.length }); res.end(body); return;
      }
      // [Diubah oleh Gemini - 2026-11-20] Endpoint POST & DELETE V12/V13 dilindungi X-Office-Token & penjaga Read-Only 403
      if (
        route.startsWith('/mt5/') ||
        route.startsWith('/finance/') ||
        route.startsWith('/workflows/') ||
        route.startsWith('/youtube/') ||
        route.startsWith('/prompt/') ||
        route.startsWith('/setup/')
      ) {
        if (!tokenMatches(req.headers['x-office-token'])) {
          reply(403, { error: 'token office diperlukan' }); return;
        }
        const finDelMatch = req.method === 'DELETE' && route.match(/^\/finance\/entry\/([A-Za-z0-9_-]{1,64})$/);
        const wfStepMatch = req.method === 'POST' && route.match(/^\/workflows\/shorts\/([A-Za-z0-9_-]{1,64})\/(step|approve|reject)$/);
        const wfDelMatch = req.method === 'DELETE' && route.match(/^\/workflows\/shorts\/([A-Za-z0-9_-]{1,64})$/);
        const promptCancelMatch = req.method === 'POST' && route.match(/^\/prompt\/runs\/([A-Za-z0-9_-]{1,64})\/cancel$/);
        const promptDelMatch = req.method === 'DELETE' && route.match(/^\/prompt\/runs\/([A-Za-z0-9_-]{1,64})$/);

        try {
          if (finDelMatch) {
            const result = await serial(() => mt5Finance.deleteEntry(finDelMatch[1]));
            reply(200, result); return;
          }
          if (wfDelMatch) {
            const result = await serial(() => shortWorkflow.deleteWorkflow(wfDelMatch[1]));
            reply(200, result); return;
          }
          if (promptDelMatch) {
            // [Diubah oleh Gemini - 2026-11-20] Jalankan rute prompt langsung dengan writeQueue internal agar Cancel/Delete tidak tertahan serial() MT5/YouTube/kolektor
            const result = await agentPrompt.deleteRun(promptDelMatch[1]);
            reply(200, result); return;
          }
          if (promptCancelMatch) {
            await readV12JsonBody(req, { allowEmpty: true });
            const result = await agentPrompt.cancelRun(promptCancelMatch[1]);
            reply(200, result); return;
          }
          if (req.method === 'POST' && route === '/mt5/test') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            mt5Finance.assertReadOnlyPayload(body);
            reply(200, await mt5Finance.testNow()); return;
          }
          if (req.method === 'POST' && route === '/mt5/refresh') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            mt5Finance.assertReadOnlyPayload(body);
            const mt5 = await serial(() => mt5Finance.refresh({
              historyDays: body?.historyDays,
              historyHours: body?.historyHours
            }));
            reply(200, { ok: true, ...mt5, mt5, summary: mt5Finance.getSummary() }); return;
          }
          if (req.method === 'POST' && route === '/mt5/config') {
            const body = await readV12JsonBody(req, { allowEmpty: false });
            const mt5 = await serial(() => mt5Finance.updateConfig(body));
            reply(200, { ok: true, ...mt5, mt5 }); return;
          }
          if (req.method === 'POST' && route === '/finance/entry') {
            const body = await readV12JsonBody(req, { allowEmpty: false });
            const result = await serial(() => mt5Finance.addEntry(body));
            reply(200, result); return;
          }
          if (req.method === 'POST' && route === '/finance/demo-trade') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            const result = await serial(() => mt5Finance.simulateDemoTrade(body));
            reply(200, result); return;
          }
          if (req.method === 'POST' && route === '/workflows/shorts') {
            const body = await readV12JsonBody(req, { allowEmpty: false });
            const result = await serial(() => shortWorkflow.createWorkflow(body));
            reply(200, result); return;
          }
          if (wfStepMatch) {
            const [, wfId, action] = wfStepMatch;
            const body = await readV12JsonBody(req, { allowEmpty: action !== 'reject' });
            const result = await serial(() =>
              action === 'step'
                ? shortWorkflow.runStep(wfId, body)
                : action === 'approve'
                  ? shortWorkflow.approveStage(wfId, body)
                  : shortWorkflow.rejectStage(wfId, body)
            );
            reply(200, result); return;
          }
          if (req.method === 'POST' && route === '/workflows/config') {
            const body = await readV12JsonBody(req, { allowEmpty: false });
            const cfg = await serial(() => shortWorkflow.updateConfig(body));
            workspaceDiscovery.invalidate();
            if (body && body.localProjectDir) {
              youtubeAnalytics.checkMidnightAutoCycle().catch(() => {});
            }
            reply(200, { ok: true, ...cfg, config: cfg }); return;
          }
          // [Diubah oleh Gemini - 2026-11-20] Endpoint POST V13: Analisa YouTube 00:00, Demo, Recommend-to-Short, dan Eksekutor Prompt Agen Lokal
          if (req.method === 'POST' && route === '/youtube/sync') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            const st = await serial(() =>
              youtubeAnalytics.syncNow({
                liveFetch: Boolean(body?.liveFetch),
                channel: body?.channel || '',
                trigger: 'manual'
              })
            );
            reply(200, { ok: true, ...st, state: st }); return;
          }
          if (req.method === 'POST' && route === '/youtube/config') {
            const body = await readV12JsonBody(req, { allowEmpty: false });
            const st = await serial(() => youtubeAnalytics.updateConfig(body));
            reply(200, { ok: true, ...st, config: st.config, state: st }); return;
          }
          if (req.method === 'POST' && route === '/youtube/demo') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            const action = String(body?.action || 'seed').trim().toLowerCase();
            const st = await serial(() =>
              action === 'reset' ? youtubeAnalytics.resetDemo() : youtubeAnalytics.loadDemo()
            );
            reply(200, { ok: true, action: action === 'reset' ? 'reset' : 'seed', ...st, state: st }); return;
          }
          if (req.method === 'POST' && route === '/youtube/recommend-to-short') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            const rec = youtubeAnalytics.findRecommendation(body?.recommendationId);
            if (!rec && !body?.title) {
              reply(404, { error: 'Rekomendasi video tidak ditemukan', code: 'recommendation_not_found' });
              return;
            }
            const ytState = youtubeAnalytics.getState();
            const wfPayload = rec
              ? {
                  title: rec.title,
                  topic: `${rec.title} — Hook: ${rec.hook} | Angle: ${rec.angle} | Target: ${rec.targetDurationSec}s (${rec.rationale})`,
                  channel: body?.channel || rec.channel || ytState.selectedChannel || shortWorkflow.getConfig().defaultChannel || 'DemoStudio',
                  mode: body?.mode || 'auto'
                }
              : {
                  title: body.title,
                  topic: body.topic || body.title,
                  channel: body.channel || ytState.selectedChannel || shortWorkflow.getConfig().defaultChannel || 'DemoStudio',
                  mode: body.mode || 'auto'
                };
            const created = await serial(() => shortWorkflow.createWorkflow(wfPayload));
            reply(200, {
              ok: true,
              recommendation: rec || null,
              workflow: created.workflow,
              action: created.action
            }); return;
          }
          // V14-B [Diubah oleh Gemini - 2026-11-21] Rute POST kontrol siklus hidup & ringkasan baca-saja Dasbor YouTube tertanam
          if (req.method === 'POST' && route === '/youtube/dashboard/start') {
            await readV12JsonBody(req, { allowEmpty: true });
            const resStart = await youtubeDashboard.ensureRunning();
            reply(200, resStart); return;
          }
          if (req.method === 'POST' && route === '/youtube/dashboard/stop') {
            await readV12JsonBody(req, { allowEmpty: true });
            const resStop = await youtubeDashboard.stopOwned();
            const st = await youtubeDashboard.getStatus({ probe: false });
            reply(200, { ...resStop, status: st }); return;
          }
          if (req.method === 'POST' && route === '/youtube/dashboard/refresh') {
            const body = await readV12JsonBody(req, { allowEmpty: true });
            const sum = await youtubeDashboard.fetchOfficeSummary({
              autoStart: Boolean(body?.autoStart),
              includeLiveMetrics: Boolean(body?.includeLiveMetrics),
              checkHealth: body?.checkHealth !== false,
              checkComments: Boolean(body?.checkComments)
            });
            reply(200, { ok: true, summary: sum }); return;
          }
          // V15 [Diubah oleh Gemini - 2026-11-21] Rute POST pengaturan folder Dasbor YouTube terpisah & Pusat Setup
          if (req.method === 'POST' && route === '/youtube/dashboard/config') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 8192 });
            const rawDash = String(body?.dashboardDir || '').trim();
            if (rawDash && workspaceDiscovery.isBlockedPath(rawDash)) {
              reply(403, { error: 'blocked_path', message: 'Akses ke folder sensitif ditolak' }); return;
            }
            const cfg = await serial(() => shortWorkflow.updateConfig({ dashboardDir: rawDash }));
            workspaceDiscovery.invalidate();
            const st = await youtubeDashboard.getStatus({ probe: true });
            reply(200, { ok: true, dashboardDir: cfg.dashboardDir, status: st }); return;
          }
          if (req.method === 'POST' && route === '/setup/discover') {
            await readV12JsonBody(req, { allowEmpty: true });
            workspaceDiscovery.invalidate();
            const status = await getSetupStatus({ forceRefresh: true });
            reply(200, status); return;
          }
          if (req.method === 'POST' && route === '/setup/state') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 4096 });
            const saved = await serial(() => saveSetupState(body));
            reply(200, { ok: true, setupState: saved }); return;
          }
          if (req.method === 'POST' && route === '/setup/apply') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 16384 });
            if ((body.localProjectDir && workspaceDiscovery.isBlockedPath(body.localProjectDir)) ||
                (body.dashboardDir && workspaceDiscovery.isBlockedPath(body.dashboardDir))) {
              reply(403, { error: 'blocked_path', message: 'Akses ke folder sensitif ditolak' }); return;
            }
            const wfPatch = {};
            if (body.localProjectDir !== undefined) wfPatch.localProjectDir = body.localProjectDir;
            if (body.dashboardDir !== undefined) wfPatch.dashboardDir = body.dashboardDir;
            if (body.geminiApiKey !== undefined) wfPatch.geminiApiKey = body.geminiApiKey;
            if (body.clearGeminiKey !== undefined) wfPatch.clearGeminiKey = body.clearGeminiKey;
            if (body.geminiModel !== undefined) wfPatch.geminiModel = body.geminiModel;
            if (Object.keys(wfPatch).length) {
              await serial(() => shortWorkflow.updateConfig(wfPatch));
              workspaceDiscovery.invalidate();
            }
            if (body.dismissed !== undefined || body.completed !== undefined || body.fullAccessAck !== undefined || body.skipQuitConfirm !== undefined) {
              await serial(() => saveSetupState(body));
            }
            const status = await getSetupStatus({ forceRefresh: true });
            reply(200, status); return;
          }
          // V14-B [Diubah oleh Gemini - 2026-11-21] Rute POST konfigurasi agen/path, validasi cwd, uji koneksi minimal, & eksekusi prompt
          if (req.method === 'POST' && route === '/prompt/config') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 16384 });
            const cfg = await agentPrompt.updateConfig(body);
            reply(200, cfg); return;
          }
          if (req.method === 'POST' && route === '/prompt/validate-cwd') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 4096 });
            const check = await agentPrompt.validateCwd(body?.cwd);
            reply(200, check); return;
          }
          if (req.method === 'POST' && route === '/prompt/test') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 8192 });
            const result = await agentPrompt.testConnection(body);
            reply(200, result); return;
          }
          if (req.method === 'POST' && route === '/prompt/run') {
            const body = await readV12JsonBody(req, { allowEmpty: false, maxBytes: 49152 });
            // [Diubah oleh Gemini - 2026-11-20] Jangan tahan /prompt/run di dalam serial() global agar tidak memblokir Cancel/MT5/kolektor
            const result = await agentPrompt.startRun(body);
            reply(200, result); return;
          }
          reply(404, { error: 'tidak ditemukan' }); return;
        } catch (err) {
          if (err && err.status === 413) res.setHeader('Connection', 'close');
          reply(err?.status || 400, { error: err?.message || 'permintaan tidak valid', code: err?.code || 'error' });
          return;
        }
      }
      const learningRoute=route.match(/^\/learnings\/([a-f0-9]{16})\/decision$/);
       const reportRoute=route.match(/^\/reports\/([a-f0-9-]{36})\/(read|archive)$/);
      const reportBatch=route.match(/^\/reports\/batch\/(read|archive)$/);
      if (req.method !== 'POST' || !(route==='/event'||route==='/pricing'||route==='/vault/sync'||reportRoute||reportBatch||learningRoute)) { reply(404, { error: 'tidak ditemukan' }); return; }
      if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') {
        reply(415, { error: 'gunakan application/json' }); return;
      }
      const length = Number(req.headers['content-length']);
      if (!Number.isInteger(length) || length <= 0 || length > 16384) {
        res.setHeader('Connection', 'close'); reply(413, { error: 'ukuran payload tidak valid' }); return;
      }
      const chunks = []; let size = 0, expired = false;
      const timer = setTimeout(() => { expired = true; req.destroy(); }, 2000);
      let event;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) throw new Error('ukuran');
          chunks.push(chunk);
        }
        if (expired || size !== length) throw new Error('ukuran');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        event = JSON.parse(text);
      } catch {
        if (!res.destroyed) reply(400, { error: 'payload tidak valid' }); return;
      } finally { clearTimeout(timer); }
      await serial(async()=>{
      if(learningRoute){const result=await quality.decision(learningRoute[1],event);revision++;for(const c of clients)push(c,{type:'learning-decision',...result,revision},'office-event');reply(200,result);return;}
       if(route==='/event'&&(event?.persona!==undefined||Quality.TYPES.includes(event?.type))){let qe;try{qe=Quality.validate(event,settings.get().personas);}catch{reply(400,{error:'payload tidak valid'});return;}const result=await quality.apply(qe);if(result.duplicate){reply(200,{ok:true,duplicate:true,revision});return;}adaptQualityFlow(qe,result.task);qe.report_id=result.task.report?.id;qe.number=result.task.number;qe.quality_stage=result.task.stage;qe.learning=result.learning;qe.updated_at=time();qe.event_revision=++revision;delete qe.usage;for(const c of clients)push(c,qe,'office-event');reply(200,{ok:true,revision,task:result.task});return;}
       if(route==='/pricing'){reply(200,await data.setPricing(event));for(const c of clients)push(c,snapshot());return;}
      if(route==='/vault/sync'){reply(200,await data.setSync(event));return;}
      if(reportBatch){
        const ids=event?.ids;
        if(!event||Object.keys(event).length!==1||!Array.isArray(ids)||!ids.length||ids.length>300||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id))){reply(400,{error:'payload tidak valid'});return;}
        const wanted=[...new Set(ids)],qualityIds=new Set(quality.reports().map(r=>r.id));
        const action=reportBatch[1],legacy=wanted.filter(id=>!qualityIds.has(id)),specialists=wanted.filter(id=>qualityIds.has(id));
        const updated=[];
        for(const [rows,persist] of [[legacy,async ids=>(await data.updateReports(ids,action)).map(r=>r.id)],[specialists,ids=>quality.updateReports(ids,action)]]){
          if(!rows.length)continue;
          try{updated.push(...await persist(rows));}catch(e){console.error('report batch '+action+' failed',e.code||e.name);}
        }
        if(updated.length){revision++;for(const c of clients)push(c,snapshot());}
        reply(200,{updated});return;
      }
      if(reportRoute){if(!event||Array.isArray(event)||typeof event!=='object'||Object.keys(event).length){reply(400,{error:'gunakan objek kosong'});return;}const report=await (quality.reports().some(r=>r.id===reportRoute[1])?quality.updateReport(reportRoute[1],reportRoute[2]):data.updateReport(reportRoute[1],reportRoute[2]));revision++;for(const c of clients){push(c,{type:'report-'+reportRoute[2],report,revision},'office-event');push(c,snapshot());}reply(200,{report});return;}
      try{event=validate(event,settings.get().flow16?.subagentTypes);}catch{reply(400,{error:'payload tidak valid'});return;}
      // Kolektor = satu-satunya sumber token provider yang dicakupnya (lihat qa/v6_event_contract.md).
      if(collector&&collector.covers(event.provider)){
        if(event.provider!=='claude'||event.type==='usage'){observeFlow(event,'hook',true);reply(200,{ok:true,superseded:'collector',revision});return;}
        if(event.type==='report'){observeFlow(event,'hook',true);delete event.type;}
        const lifecycle={...event};
        event.usage=null;event.tokens=null;twin(event,'hook');
        if(lifecycle.type&&!event.type)observeFlow(lifecycle,'hook',true);
      }
      // Kursi dibatasi di frontend; server harus menerima agen yang antre.
      if (!agents.has(event.agent) && agents.size >= 256) {
        for (const [id, a] of agents) {
          if (now() / 1000 - a.updated_at > 600 || a.status === 'done') { agents.delete(id); break; }
        }
        if (agents.size >= 256) { reply(409, { error: 'antrean penuh (256)' }); return; }
      }
      snapshot();
      const result=await data.apply(event);
      if(result.duplicate){reply(200,{ok:true,duplicate:true,revision});return;}
      publish(event,result,{},'hook');
      const state = snapshot(); for (const client of clients)push(client,state);
      reply(200, { ok: true, revision,report:result.report });
      });
    } catch (e) {
      if (!res.headersSent) reply(e.status||500, { error: e.status?'permintaan ditolak':'gagal memproses data' });
      else res.destroy();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 64;server.maxRequestsPerSocket=256;server.keepAliveTimeout=5000;
  async function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      clearInterval(heartbeat);
      if(collector)await collector.stop().catch(()=>{});
      // V22: finish the current bounded chunk and persist a resumable pause.
      await usageImporter.stop().catch(()=>{});
      // [Diubah oleh Gemini - 2026-11-20] Hentikan timer polling MT5, YouTube 00:00 scheduler, proses CLI prompt aktif, & antrean tulis V12/V13 saat server ditutup
      await mt5Finance.stop().catch(()=>{});
      await shortWorkflow.stop().catch(()=>{});
      // V14-A: hentikan hanya proses milik run pipeline ini.
      await shortPipeline.stop().catch(()=>{});
      await youtubeAnalytics.stop().catch(()=>{});
      // V14-B [Diubah oleh Gemini - 2026-11-21] Hentikan server dasbor YouTube hanya jika Office AI yang menyalakannya
      await youtubeDashboard.stop().catch(()=>{});
      await agentPrompt.stop().catch(()=>{});
      for (const client of clients) client.destroy(); clients.clear();
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections(); await closed;await mutations;
      if (portFile) {
        try {
          if ((await fs.readFile(portFile, 'utf8')).trim() === String(activePort)) await fs.unlink(portFile);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
    })();
    return closePromise;
  }
  for (let candidate = port; candidate <= maxPort; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = err => { server.off('listening', onListen); reject(err); };
        const onListen = () => { server.off('error', onError); resolve(); };
        server.once('error', onError); server.once('listening', onListen);
        server.listen(candidate, '127.0.0.1');
      });
      activePort = server.address().port; break;
    } catch (e) { if (e.code !== 'EADDRINUSE' || candidate === maxPort) throw e; }
  }
  if (activePort === undefined) throw new Error('Rentang port tidak valid');
  try {
    if (portFile) {
      await fs.mkdir(path.dirname(portFile), { recursive: true });
      await fs.writeFile(portFile, String(activePort) + '\n', 'utf8');
    }
  } catch (e) { await close(); throw e; }
  heartbeat = setInterval(() => { const state = snapshot(); for (const client of clients) push(client, state); }, 10000);
  heartbeat.unref();
  // Kolektor tidak menahan start: backfill berjalan di latar dan hasilnya masuk lewat serial().
  const collectorReady=collector?collector.start().catch(()=>{}):Promise.resolve();
  // V15 [Diubah oleh Gemini - 2026-11-21] Daftar proses agen & pipeline aktif (tanpa isi prompt) untuk konfirmasi keluar
  function getActiveRuntime() {
    const promptItems = typeof agentPrompt.getActiveRuns === 'function' ? agentPrompt.getActiveRuns() : [];
    const shortItems = typeof shortPipeline.getActiveRuns === 'function' ? shortPipeline.getActiveRuns() : [];
    const items = [...promptItems, ...shortItems];
    return {
      ok: true,
      activeCount: items.length,
      promptCount: promptItems.length,
      shortCount: shortItems.length,
      items,
      skipQuitConfirm: Boolean(setupState.skipQuitConfirm)
    };
  }
  return { server, port: activePort, origin: 'http://127.0.0.1:' + activePort, close, collector, collectorReady, settings, mt5Finance, shortWorkflow, youtubeAnalytics, youtubeDashboard, agentPrompt, shortPipeline, workspaceDiscovery, getActiveRuntime, getSetupState: () => ({ ...setupState }), saveSetupState };
}
module.exports = { startServer };

// [Diubah oleh Gemini - 2026-11-21] Dukung OFFICE_AI_DATA_DIR selain OFFICE_DATA_DIR agar aman dari %APPDATA%
if(require.main===module){const dataDir=process.env.OFFICE_AI_DATA_DIR||process.env.OFFICE_DATA_DIR||path.join(__dirname,'data');startServer({dataDir,portFile:path.join(dataDir,'port.txt')}).then(s=>{console.log('Office AI: '+s.origin);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>s.close().finally(()=>process.exit(0)));}).catch(e=>{console.error(e.message);process.exitCode=1;});}
