'use strict';
// Data yang disimpan hanya metadata generik dan angka. Vault tidak pernah diindeks ke disk.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const PROVIDERS = ['claude','codex','gemini','hermes','other'];
const FIELDS = ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'];
const blockedName = name => /secret|token|password|\.env/i.test(name);
const localDay = ms => { const d=new Date(ms); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const fail = (code, message) => { const e=new Error(message);e.status=code;throw e; };
const object = x => x && typeof x==='object' && !Array.isArray(x);
const number = x => typeof x==='number' && Number.isFinite(x) && x>=0 && x<=1e12;
function tokenUsage(value) {
  if(value===undefined || value===null)return null;
  if(typeof value==='number'){if(!number(value)||!Number.isSafeInteger(value))fail(400,'tokens');return {unattributed_tokens:value};}
  if(!object(value)||!Object.keys(value).length||Object.keys(value).some(k=>!FIELDS.includes(k))||Object.values(value).some(v=>!number(v)||!Number.isSafeInteger(v)))fail(400,'tokens');
  return {...value};
}
const sum = u => u ? Object.values(u).reduce((a,b)=>a+b,0) : null;
// [Diubah oleh Gemini - 2026-11-20] Naikkan batas tabel model harga dari 40 ke 80 agar seluruh varian model Gemini & Claude V13 termuat aman
function validatePricing(p) {
  if(!object(p)||Object.keys(p).some(k=>!['usd_idr','rates','note','defaults','models'].includes(k))||!number(p.usd_idr)||p.usd_idr===0||!object(p.defaults)||!object(p.models)||Object.keys(p.models).length>80)fail(400,'harga tidak valid');
  const rates=p.rates||{USD:1,IDR:p.usd_idr,EUR:.92,JPY:150,CNY:7.2};if(!object(rates)||Object.keys(rates).some(k=>!['USD','IDR','EUR','JPY','CNY'].includes(k))||Object.values(rates).some(v=>!number(v)||v===0))fail(400,'rates');
  if(Object.keys(p.defaults).some(k=>!PROVIDERS.includes(k)))fail(400,'default tidak dikenal');const models={};
  for(const [id,m] of Object.entries(p.models)){
    if(['__proto__','constructor','prototype'].includes(id)||!/^[a-zA-Z0-9_.-]{1,64}$/.test(id)||!object(m)||Object.keys(m).some(k=>!['provider','input','output','cache_read','cache_write'].includes(k))||!PROVIDERS.includes(m.provider)||['input','output','cache_read','cache_write'].some(k=>m[k]!==null&&!number(m[k])))fail(400,'harga model tidak valid');
    models[id]={provider:m.provider,input:m.input,output:m.output,cache_read:m.cache_read,cache_write:m.cache_write};
  }
  const defaults={};for(const pvd of PROVIDERS){const id=p.defaults[pvd];if(typeof id!=='string'||!Object.hasOwn(models,id)||models[id].provider!==pvd)fail(400,'model bawaan tidak valid');defaults[pvd]=id;}
  return {usd_idr:p.usd_idr,rates:{...rates,USD:1,IDR:p.usd_idr},note:'Perkiraan, edit sesuai kurs. ESTIMASI setara tarif API, bukan tagihan langganan.',defaults,models};
}
async function atomic(file,value){const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
async function createData({dataDir,now=Date.now}){
  await fs.mkdir(dataDir,{recursive:true});
  async function read(file,fallback){try{const target=path.join(dataDir,file),st=await fs.lstat(target),limit=file==='state.json'?16*1024*1024:file==='pricing.json'?65536:4096;if(!st.isFile()||st.isSymbolicLink()||st.size>limit)throw Error('unsafe');return JSON.parse(await fs.readFile(target,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error('Data tidak dapat dibaca: '+file);}}
  const defaultPricing=JSON.parse(await fs.readFile(path.join(__dirname,'pricing.json'),'utf8'));
  // Model bawaan baru ditambahkan ke tabel tersimpan tanpa menimpa tarif yang sudah diedit user.
  const storedPricing=await read('pricing.json',defaultPricing);if(object(storedPricing)&&object(storedPricing.models))for(const[id,m]of Object.entries(defaultPricing.models))if(!Object.hasOwn(storedPricing.models,id)&&Object.keys(storedPricing.models).length<80)storedPricing.models[id]=m;
  let pricing=validatePricing(storedPricing);
  // [Diubah oleh Gemini - 2026-11-20] Gunakan os.homedir() generik tanpa nama pengguna pribadi untuk distribusi publik
  const config=await read('config.json',{vaultRoot:path.join(require('node:os').homedir(),'OneDrive','Documents','Obsidian Vault','AI Memory').replace(/\\/g,'/')});
  if(typeof config.vaultRoot!=='string'||!path.isAbsolute(config.vaultRoot))throw Error('vaultRoot tidak valid');
  let state=await read('state.json',{version:2,reports:[],usage:[],eventIds:[],owner:crypto.randomUUID()});
  if(state.version!==2||!Array.isArray(state.reports)||!Array.isArray(state.usage)||!Array.isArray(state.eventIds))throw Error('Format state tidak valid');
  let syncEnabled=false,syncError=null;
  await atomic(path.join(dataDir,'config.json'),{vaultRoot:config.vaultRoot});
  await atomic(path.join(dataDir,'pricing.json'),pricing);
  // [Diubah oleh Codex - 2026-11-22] V22 keeps the historical daily floor in step with committed usage.
  let usageHistory=null;
  const save=async()=>{await atomic(path.join(dataDir,'state.json'),state);if(usageHistory)await usageHistory.syncBaseline(state.usage).catch(()=>{});};
  const modelFor=e=>e.model||pricing.defaults[e.provider];
  // [Diubah oleh Gemini - 2026-11-20] Resolusi pintar tarif model (exact -> strip suffix tier/effort -> longest prefix -> provider default)
  function resolveModelRates(model,provider){
    const tbl=pricing.models||{};
    const raw=typeof model==='string'?model.trim():'';
    if(raw&&Object.hasOwn(tbl,raw))return tbl[raw];
    const lower=raw.toLowerCase();
    if(lower&&Object.hasOwn(tbl,lower))return tbl[lower];
    const stripped=lower.replace(/-(xhigh|high|medium|low|tiered|preview|latest)$/i,'');
    if(stripped&&Object.hasOwn(tbl,stripped))return tbl[stripped];
    if(lower){
      let bestKey='',bestLen=0;
      for(const k of Object.keys(tbl)){
        if(k==='local'||k==='unknown')continue;
        const kl=k.toLowerCase();
        if((lower.startsWith(kl)||stripped.startsWith(kl))&&kl.length>bestLen){bestKey=k;bestLen=kl.length;}
      }
      if(bestKey)return tbl[bestKey];
      for(const k of Object.keys(tbl)){
        if(k==='local'||k==='unknown')continue;
        const kl=k.toLowerCase();
        if((kl.startsWith(stripped+'-')||kl.startsWith(lower+'-'))&&kl.length>bestLen){bestKey=k;bestLen=kl.length;}
      }
      if(bestKey)return tbl[bestKey];
    }
    const inferredProvider=provider||(lower.startsWith('gemini')?'gemini':lower.startsWith('claude')?'claude':/^(gpt|o1|o3|o4|codex)/.test(lower)?'codex':lower.startsWith('herme')?'hermes':null);
    const defId=inferredProvider&&pricing.defaults?pricing.defaults[inferredProvider]:null;
    if(defId&&Object.hasOwn(tbl,defId))return tbl[defId];
    return null;
  }
  function cost(u,model,provider){if(!u)return null;const rates=resolveModelRates(model,provider);if(!rates)return null;let usd=0;for(const [k,v]of Object.entries(u)){const rate=rates[({input_tokens:'input',output_tokens:'output',cache_read_input_tokens:'cache_read',cache_creation_input_tokens:'cache_write',unattributed_tokens:'input'})[k]];if(v&&rate===null)return null;usd+=v*(rate||0)/1e6;}return Math.round(usd*pricing.usd_idr*1e4)/1e4;}
  function daily(days=7){
    const rows=[];for(let n=days-1;n>=0;n--){const d=new Date(now());d.setDate(d.getDate()-n);const date=localDay(d.getTime()),providers={};
      // v6-C: provider kustom (slug agen) ikut tampil bila punya baris pada tanggal itu.
      const extra=[...new Set(state.usage.filter(r=>r.date===date&&!PROVIDERS.includes(r.provider)).map(r=>r.provider))].slice(0,16);
      for(const p of [...PROVIDERS,...extra]){const entries=state.usage.filter(r=>r.date===date&&r.provider===p),known=entries.filter(r=>r.usage!==null);let usage=null;
        if(known.length){usage={};for(const r of known)for(const [k,v]of Object.entries(r.usage))usage[k]=(usage[k]||0)+v;}
        const costs=known.map(r=>cost(r.usage,r.model,r.provider||p)),estimate=costs.length&&costs.every(c=>c!==null)?Math.round(costs.reduce((a,b)=>a+b,0)*1e4)/1e4:null;
        providers[p]={tokens:sum(usage),usage,cost_idr:estimate,partial:entries.length>known.length,models:[...new Set(entries.map(e=>e.model))]};
        // v6-C: rincian per sumber/akun (id hash dari kolektor atau --account); baris tanpa akun tidak dirinci.
        const accounts={};for(const r of known.filter(r=>r.account)){const a=accounts[r.account]||(accounts[r.account]={tokens:0,cost_idr:0});a.tokens+=sum(r.usage)||0;const c=cost(r.usage,r.model,r.provider||p);a.cost_idr=a.cost_idr===null||c===null?null:Math.round((a.cost_idr+c)*1e4)/1e4;}if(Object.keys(accounts).length)providers[p].accounts=accounts;
      }
      const known=Object.values(providers).filter(p=>p.tokens!==null),priced=known.filter(p=>p.cost_idr!==null);
      rows.push({date,providers,tokens:known.length?known.reduce((s,p)=>s+p.tokens,0):null,cost_idr:priced.length?Math.round(priced.reduce((s,p)=>s+p.cost_idr,0)*1e4)/1e4:null,partial:Object.values(providers).some(p=>p.partial)||priced.length<known.length});
    }return {days:rows,estimate:true,methodology_code:'usage_delta',methodology:'Delta report + usage; kirim setiap pemakaian sekali. Angka total tanpa rincian ditaksir sebagai input. n/a berarti belum dilaporkan. Cache terpisah, tidak termasuk dalam input. Biaya dihitung ulang memakai tabel saat ini; tanpa pajak, alat, penyimpanan cache, tier konteks panjang, atau langganan.'};
  }
  // opts.count=false: token report hanya informasi (sudah dihitung lewat usage). opts.date: tanggal lokal baris log (kolektor).
  function applyOne(e,opts={}){
    if(e.event_id&&state.eventIds.includes(e.event_id))return {duplicate:true};
    let report;
    if(e.type==='report'){
      report={id:crypto.randomUUID(),provider:e.provider,model:modelFor(e),time:new Date(now()).toISOString(),task:'Tugas selesai',task_code:'completed',tokens:sum(e.usage),usage:e.usage,duration_s:e.duration_s||0,read:false,archived:false};if(e.account)report.account=e.account;state.reports.push(report);
      if(state.reports.length>5000)state.reports.splice(0,state.reports.length-5000);
    }
    if(opts.count!==false&&(e.type==='report'||e.type==='usage'||!e.type&&e.usage!==null)){const date=typeof opts.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(opts.date)?opts.date:localDay(now()),model=modelFor(e);let row=state.usage.find(r=>r.date===date&&r.provider===e.provider&&r.model===model&&(r.account||null)===(e.account||null)&&((r.usage===null)===(e.usage===null)));
      if(!row){row={date,provider:e.provider,model,usage:e.usage===null?null:{}};if(e.account)row.account=e.account;state.usage.push(row);}if(e.usage)for(const[k,v]of Object.entries(e.usage))row.usage[k]=(row.usage[k]||0)+v;
    }
    if(e.event_id){state.eventIds.push(e.event_id);if(state.eventIds.length>20000)state.eventIds.shift();}
    return {report};
  }
  async function apply(e,opts){const before=structuredClone(state);let result;try{result=applyOne(e,opts);if(result.duplicate)return result;await save();}catch(err){state=before;throw err;}await sync();return result;}
  // Satu transaksi + satu kali tulis untuk banyak event kolektor. {replace:{provider,from}} menghapus baris harian
  // provider itu sejak tanggal `from` (backfill kolektor menjadi sumber otoritatif untuk tanggal tersebut).
  async function applyBatch(items){const before=structuredClone(state),results=[];
    try{for(const it of items){if(it.replace){const {provider,from}=it.replace;if(!PROVIDERS.includes(provider)||!/^\d{4}-\d{2}-\d{2}$/.test(from))fail(400,'replace');state.usage=state.usage.filter(r=>!(r.provider===provider&&r.date>=from));results.push({replaced:true});continue;}results.push(applyOne(it.event,it.opts));}
      if(results.some(r=>!r.duplicate))await save();}catch(err){state=before;throw err;}
    await sync();return results;}
  async function updateReports(ids,action){
    const key=action==='read'?'read':'archived',requested=new Set(ids);
    const eligible=r=>requested.has(r.id)&&(key==='read'||r.read);
    const rows=state.reports.filter(eligible);
    if(rows.some(r=>!r[key])){
      const next={...state,reports:state.reports.map(r=>eligible(r)?{...r,[key]:true}:r)};
      await atomic(path.join(dataDir,'state.json'),next);
      state=next;
    }
    return rows.map(r=>({...r,[key]:true}));
  }
  async function updateReport(id,action){
    const r=state.reports.find(r=>r.id===id);
    if(!r)fail(404,'laporan tidak ditemukan');
    if(action==='archive'&&!r.read)fail(409,'laporan belum dibaca');
    return (await updateReports([id],action))[0];
  }
  // Tolak nama sensitif sebelum stat/read; tolak seluruh symlink/reparse anak.
  function clean(rel,folder=false){if(typeof rel!=='string'||rel.length>1024||rel.includes('\\')||rel.includes(':')||rel.includes('\0')||path.isAbsolute(rel)||rel.split('/').some(p=>p==='..'||p==='.'||blockedName(p)))fail(403,'path ditolak');if(!folder&&!/\.md$/i.test(rel))fail(403,'hanya .md');return rel.split('/').filter(Boolean);}
  async function vaultBase(){const base=path.resolve(config.vaultRoot);if(base.split(/[\\/]/).some(blockedName))fail(403,'akar ditolak');const real=await fs.realpath(base);if(real.split(/[\\/]/).some(blockedName))fail(403,'akar ditolak');return real;}
  async function resolveNote(rel,folder=false){const parts=clean(rel,folder),base=await vaultBase();let target=base;for(const part of parts){target=path.join(target,part);const st=await fs.lstat(target);if(st.isSymbolicLink())fail(403,'tautan filesystem ditolak');}const real=await fs.realpath(target);if(real!==base&&!real.startsWith(base+path.sep))fail(403,'di luar vault');return real;}
  async function tree(){const base=await vaultBase();let count=0,scanned=0,truncated=false;const files=[];
    async function visit(dir,rel,depth){const nodes=[];const handle=await fs.opendir(dir);for await(const entry of handle){if(++scanned>2000||count>=500){truncated=true;break;}if(blockedName(entry.name)||entry.isSymbolicLink())continue;const rp=rel?rel+'/'+entry.name:entry.name;if(entry.isDirectory()){if(depth>=6){truncated=true;continue;}count++;nodes.push({name:entry.name,path:rp,children:await visit(path.join(dir,entry.name),rp,depth+1)});}else if(entry.isFile()&&/\.md$/i.test(entry.name)){count++;nodes.push({name:entry.name,path:rp});files.push(rp);}}return nodes.sort((a,b)=>a.name.localeCompare(b.name));}
    const nodes=await visit(base,'',0);return {nodes,count,truncated,files};
  }
  async function note(rel){const target=await resolveNote(rel),handle=await fs.open(target,'r');try{const st=await handle.stat(),latest=await fs.lstat(target);if(!st.isFile()||latest.isSymbolicLink()||latest.ino!==st.ino||latest.dev!==st.dev||await fs.realpath(target)!==target)fail(403,'bukan catatan aman');const buffer=Buffer.alloc(Math.min(st.size,512*1024));const {bytesRead}=await handle.read(buffer,0,buffer.length,0);return {path:rel,content:buffer.subarray(0,bytesRead).toString('utf8'),truncated:st.size>512*1024};}finally{await handle.close();}}
  async function search(q){if(typeof q!=='string'||!q.trim()||q.length>100)fail(400,'kueri tidak valid');const t=await tree(),results=[],needle=q.toLocaleLowerCase();let bytes=0;for(const p of t.files){if(results.length>=30||bytes>=8*1024*1024)break;try{const n=await note(p);bytes+=Buffer.byteLength(n.content);if(p.toLocaleLowerCase().includes(needle)||n.content.toLocaleLowerCase().includes(needle))results.push({path:p,name:path.posix.basename(p)});}catch{}}return {results,truncated:t.truncated||results.length>=30||bytes>=8*1024*1024};}
  async function sync(){if(!syncEnabled)return;try{
    const base=await vaultBase(),dir=path.join(base,'Kantor');await fs.mkdir(dir).catch(e=>{if(e.code!=='EEXIST')throw e;});if((await fs.lstat(dir)).isSymbolicLink()||await fs.realpath(dir)!==dir)fail(403,'folder sinkron ditolak');
    const today=localDay(now()),file=path.join(dir,today+'.md'),marker='<!-- OfficeAI:'+state.owner+' -->',d=daily(1).days[0];
    const text=marker+'\n# Kantor '+today+'\n\nESTIMASI setara tarif API, bukan tagihan langganan.\n\n'+Object.entries(d.providers).map(([p,v])=>'- '+p+': '+(v.tokens??'n/a')+' token; Rp '+(v.cost_idr??'n/a')).join('\n')+'\n\n## Laporan generik\n'+state.reports.filter(r=>localDay(Date.parse(r.time))===today).map(r=>'- '+r.provider+' — Tugas selesai; '+(r.tokens??'n/a')+' token').join('\n')+'\n';
    let handle;try{handle=await fs.open(file,'wx');}catch(e){if(e.code!=='EEXIST')throw e;if((await fs.lstat(file)).isSymbolicLink())fail(403,'tautan ditolak');handle=await fs.open(file,'r+');const st=await handle.stat();if(!st.isFile()||st.nlink>1){await handle.close();fail(403,'berkas sinkron ditolak');}const b=Buffer.alloc(100);await handle.read(b,0,100,0);if(!b.toString().startsWith(marker+'\n')){await handle.close();fail(409,'berkas bukan milik Office AI');}}
    try{const current=await fs.lstat(file),opened=await handle.stat();if(current.isSymbolicLink()||current.ino!==opened.ino||current.dev!==opened.dev||await fs.realpath(file)!==file||await fs.realpath(dir)!==dir)fail(403,'tujuan sinkron berubah');await handle.write(text,0,'utf8');await handle.truncate(Buffer.byteLength(text));}finally{await handle.close();}syncError=null;
  }catch{syncError='Sinkron gagal: periksa folder Kantor dan kepemilikan berkas. Tidak ada catatan lain yang ditimpa.';}}
  // [Diubah oleh Gemini - 2026-11-20] Catat pemakaian token eksternal (BYOK Gemini REST API usageMetadata) ke state.usage
  async function recordExternalUsage({provider='gemini',model,usageMetadata,agent='gemini-api',task=''}={}){
    const clampInt=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.min(1e12,Math.floor(n)):0;};
    const pvd=typeof provider==='string'&&provider.trim()?provider.trim().toLowerCase():'gemini';
    const effModel=typeof model==='string'&&model.trim()?model.trim():(pricing.defaults[pvd]||'gemini-2.5-flash');
    let input_tokens=clampInt(usageMetadata?.promptTokenCount??usageMetadata?.input_tokens??0);
    const output_tokens=clampInt(usageMetadata?.candidatesTokenCount??usageMetadata?.output_tokens??0);
    const cache_read_input_tokens=clampInt(usageMetadata?.cachedContentTokenCount??usageMetadata?.cache_read_input_tokens??0);
    if(input_tokens===0&&output_tokens===0&&clampInt(usageMetadata?.totalTokenCount)>0){
      input_tokens=clampInt(usageMetadata.totalTokenCount);
    }
    const usage={input_tokens,output_tokens,cache_read_input_tokens};
    const date=localDay(now());
    const acct=typeof agent==='string'&&/^[a-z0-9-]{1,40}$/i.test(agent.trim())?agent.trim().toLowerCase():null;
    const before=structuredClone(state);
    try{
      let row=state.usage.find(r=>r.date===date&&r.provider===pvd&&r.model===effModel&&(r.account||null)===acct&&r.usage!==null);
      if(!row){
        row={date,provider:pvd,model:effModel,usage:{}};
        if(acct)row.account=acct;
        state.usage.push(row);
      }
      for(const [k,v]of Object.entries(usage))row.usage[k]=(row.usage[k]||0)+v;
      if(task&&typeof task==='string')void task;
      await save();
    }catch(err){state=before;throw err;}
    await sync();
    const tokens=sum(usage)||0;
    const cost_idr=cost(usage,effModel,pvd);
    return {tokens,cost_idr,model:effModel};
  }
  return {apply,applyBatch,daily,cost,recordExternalUsage,updateReport,updateReports,reports:()=>structuredClone(state.reports),pricing:()=>structuredClone(pricing),async setPricing(p){const next=validatePricing(p);await atomic(path.join(dataDir,'pricing.json'),next);pricing=next;await sync();return pricing;},tree:async()=>{const {files,...t}=await tree();return t;},note,search,syncStatus:()=>({enabled:syncEnabled,error:syncError}),async setSync(body){if(!object(body)||Object.keys(body).length!==1||typeof body.enabled!=='boolean')fail(400,'opsi tidak valid');syncEnabled=body.enabled;await sync();return this.syncStatus();},total:()=>state.usage.reduce((n,r)=>n+(sum(r.usage)||0),0),async attachUsageHistory(store){await store.syncBaseline(state.usage);usageHistory=store;}};
}
module.exports={createData,tokenUsage,sum,localDay};
