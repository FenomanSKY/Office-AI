// [Diubah oleh Codex - 2026-11-22] V22: permanent numeric-only daily history.
'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const FIELDS = ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens','unattributed_tokens'];
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,32);
const total = u => FIELDS.reduce((n,k)=>n+(u?.[k]||0),0);
const day = ms => {const d=new Date(ms);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const validDay = s => {if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const ms=Date.parse(s+'T12:00:00Z');return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s;};
const modelName = s => typeof s==='string' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(s) ? s : 'unknown';
const providerName = s => typeof s==='string' && /^[a-z][a-z0-9-]{0,39}$/.test(s) ? s : 'other';
const cleanUsage = u => Object.fromEntries(FIELDS.filter(k=>Number.isSafeInteger(u?.[k])&&u[k]>=0&&u[k]<=Number.MAX_SAFE_INTEGER).map(k=>[k,u[k]]));
function estimate(usage, model, provider, pricing) {
  const key=modelName(model), table=pricing.models||{}, lower=key.toLowerCase(), stripped=lower.replace(/-(xhigh|high|medium|low|tiered|preview|latest)$/,'');
  const best=Object.keys(table).filter(k=>table[k].provider===provider&&(lower===k.toLowerCase()||stripped===k.toLowerCase()||lower.startsWith(k.toLowerCase()+'-'))).sort((a,b)=>b.length-a.length)[0];
  const rate=best&&table[best];if(!rate)return null;
  let usd=0;for(const k of FIELDS){if(!usage[k])continue;const r=rate[({input_tokens:'input',output_tokens:'output',cache_read_input_tokens:'cache_read',cache_creation_input_tokens:'cache_write',unattributed_tokens:'input'})[k]];if(!Number.isFinite(r))return null;usd+=usage[k]*r/1e6;}return usd;
}
function rowKey(r){return [r.date,r.provider,r.model,r.source].join('|');}
function addRow(rows, entry, pricing) {
  if(!validDay(entry.date))return;
  const usage=cleanUsage(entry.usage);if(!total(usage))return;
  const row={date:entry.date,provider:providerName(entry.provider),model:modelName(entry.model),source:hash(entry.source||'default'),usage,cost_usd:estimate(usage,entry.model,entry.provider,pricing),estimatedDate:!!entry.estimatedDate,independent:!!entry.independent};
  const key=rowKey(row), old=rows[key];
  if(old){for(const k of FIELDS)old.usage[k]=(old.usage[k]||0)+(usage[k]||0);old.cost_usd=old.cost_usd===null||row.cost_usd===null?null:old.cost_usd+row.cost_usd;old.estimatedDate ||= row.estimatedDate;}
  else rows[key]=row;
}
async function createUsageHistory({dataDir,now=Date.now,getPricing}) {
  const dir=path.join(dataDir,'usage_history');await fs.mkdir(dir,{recursive:true});
  if((await fs.lstat(dir)).isSymbolicLink())throw Error('usage_history_unsafe');
  const sources=new Map(),recoveredFiles=new Set();let base={version:1,rows:{},import:{state:'idle',files:0,completed:0,bytes:0,errors:0}},recovered=false,storageError=null,chain=Promise.resolve();
  const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
  async function read(name) {
    const p=path.join(dir,name);let last;
    for(const suffix of ['', '.bak'])try{const st=await fs.lstat(p+suffix);if(!st.isFile()||st.isSymbolicLink()||st.nlink>1||st.size>32*1024*1024)throw Error('unsafe');const value=JSON.parse(await fs.readFile(p+suffix,'utf8'));if(value.version!==1||!value.rows||typeof value.rows!=='object'||Array.isArray(value.rows)||Object.keys(value).some(k=>!['version','rows',name==='index.json'?'import':'checkpoint'].includes(k)))throw Error('schema');
      for(const [key,r]of Object.entries(value.rows))if(key!==rowKey(r)||Object.keys(r).some(k=>!['date','provider','model','source','usage','cost_usd','estimatedDate','independent'].includes(k))||!validDay(r.date)||providerName(r.provider)!==r.provider||modelName(r.model)!==r.model||!/^([a-f0-9]{32})$/.test(r.source)||!r.usage||total(cleanUsage(r.usage))!==total(r.usage)||Object.keys(r.usage).some(k=>!FIELDS.includes(k))||r.cost_usd!==null&&(!Number.isFinite(r.cost_usd)||r.cost_usd<0))throw Error('schema');
      if(value.import){const v=value.import;if(Object.keys(v).some(k=>!['state','files','completed','bytes','errors','finished_at'].includes(k))||!['idle','discovering','running','paused','complete','error'].includes(v.state)||['files','completed','bytes','errors'].some(k=>!Number.isSafeInteger(v[k])||v[k]<0)||v.finished_at&&!Number.isFinite(Date.parse(v.finished_at)))throw Error('schema');}
      if(value.checkpoint){const cp=value.checkpoint;if(Object.keys(cp).some(k=>!['offset','size','mtime','ino','dev','skip','resets','skipped','seen','order','model','total','errors','maxIdx','rids','page','finished','walSig'].includes(k)))throw Error('schema');for(const k of ['offset','size','mtime','ino','dev','resets','skipped','errors','maxIdx','page'])if(cp[k]!==undefined&&(!Number.isFinite(cp[k])||cp[k]<(k==='maxIdx'?-1:0)))throw Error('schema');for(const k of ['skip','finished'])if(cp[k]!==undefined&&typeof cp[k]!=='boolean')throw Error('schema');if(cp.walSig!==undefined&&!/^(?:\d+:\d+(?:\.\d+)?)?$/.test(cp.walSig))throw Error('schema');if(cp.total&&(!Array.isArray(cp.total)||cp.total.length!==4||cp.total.some(n=>!Number.isSafeInteger(n)||n<0)))throw Error('schema');if(cp.model&&modelName(cp.model)!==cp.model)throw Error('schema');for(const [k,v]of Object.entries(cp.seen||{}))if(!/^[a-f0-9]{32}$/.test(k)||!Array.isArray(v)||v.length!==4||v.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('schema');for(const k of ['order','rids'])if(cp[k]&&(!Array.isArray(cp[k])||cp[k].some(v=>typeof v!=='string'||!/^[a-f0-9]{12,32}$/.test(v))))throw Error('schema');}
      if(suffix){recovered=true;recoveredFiles.add(name);}return value;
    }catch(e){last=e;}
    if(last?.code==='ENOENT'){try{await fs.lstat(p);storageError='history_corrupt';}catch(e){if(e.code!=='ENOENT')storageError='history_unreadable';}return null;}storageError='history_corrupt';return null;
  }
  async function write(name,value) {
    if(storageError)throw Error(storageError);
    const p=path.join(dir,name),tmp=p+'.'+crypto.randomUUID()+'.tmp';
    for(const s of ['', '.bak'])try{const st=await fs.lstat(p+s);if(st.isSymbolicLink()||!st.isFile()||st.nlink>1)throw Error('usage_history_unsafe');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{const handle=await fs.open(tmp,'wx');try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
      // Keep the previous valid generation; never replace a good backup with corrupt bytes.
      if(!recoveredFiles.has(name))await fs.copyFile(p,p+'.bak').catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rename(tmp,p);recoveredFiles.delete(name);
    }catch(e){storageError='history_unwritable';throw e;}finally{await fs.unlink(tmp).catch(()=>{});}
  }
  const loaded=await read('index.json');if(loaded)base={...base,...loaded};
  for(const e of await fs.readdir(dir,{withFileTypes:true}))if(e.isFile()&&/^source-[a-f0-9]{32}\.json$/.test(e.name)){const v=await read(e.name);if(v)sources.set(e.name.slice(7,-5),v);}
  if(['running','discovering'].includes(base.import.state))base.import.state='paused';
  function rows() {
    const imported=new Map(),baseline=new Map();
    for(const s of sources.values())for(const r of Object.values(s.rows)){const k=r.date+'|'+r.provider;if(!imported.has(k))imported.set(k,[]);imported.get(k).push(r);}
    const independent=[];for(const r of Object.values(base.rows)){if(r.independent){independent.push(r);continue;}const k=r.date+'|'+r.provider;if(!baseline.has(k))baseline.set(k,[]);baseline.get(k).push(r);}
    // The existing daily ledger is a floor, never an extra copy of the same logs.
    const out=[...independent];for(const k of new Set([...imported.keys(),...baseline.keys()])){const a=imported.get(k)||[],b=baseline.get(k)||[];out.push(...(a.reduce((n,r)=>n+total(r.usage),0)>=b.reduce((n,r)=>n+total(r.usage),0)?a:b));}return out;
  }
  function summary(values) {
    const pricing=getPricing(),tokens=values.reduce((n,r)=>n+total(r.usage),0),known=values.filter(r=>r.cost_usd!==null),pricedTokens=known.reduce((n,r)=>n+total(r.usage),0),cost_usd=known.reduce((n,r)=>n+r.cost_usd,0);
    return {tokens,cost_usd:values.length&&pricedTokens===tokens?cost_usd:null,cost_idr:values.length&&pricedTokens===tokens?cost_usd*pricing.usd_idr:null,known_cost_usd:cost_usd,unpriced_tokens:tokens-pricedTokens,estimate:true};
  }
  return {
    source:id=>structuredClone(sources.get(id)||{version:1,rows:{},checkpoint:{}}),
    fingerprint:id=>sources.get(id)?.checkpoint,
    commitSource(id,value){return serial(async()=>{if(!/^[a-f0-9]{32}$/.test(id)||value.version!==1)throw Error('source');await write('source-'+id+'.json',value);sources.set(id,structuredClone(value));});},
    syncBaseline(entries){return serial(async()=>{let changed=false;const next=structuredClone(base),combined={};for(const e of entries)addRow(combined,{...e,source:e.account||'daily',independent:e.account==='gemini-api'},getPricing());
      for(const [k,r]of Object.entries(combined)){const old=next.rows[k];if(!old||total(r.usage)>total(old.usage)){if(old){const delta=Object.fromEntries(FIELDS.map(f=>[f,Math.max(0,(r.usage[f]||0)-(old.usage[f]||0))]));const c=estimate(delta,r.model,r.provider,getPricing());r.cost_usd=old.cost_usd===null||c===null?null:old.cost_usd+c;}next.rows[k]=r;changed=true;}}
      if(changed){await write('index.json',next);base=next;}
    });},
    importStatus:()=>({...base.import,recovered,error:storageError,skipped_lines:[...sources.values()].reduce((n,s)=>n+(s.checkpoint?.skipped||0),0)}),
    setImport(patch){return serial(async()=>{const next={...base,import:{...base.import,...patch}};await write('index.json',next);base=next;return {...next.import};});},
    total(){const all=rows(),dates=[...new Set(all.map(r=>r.date))].sort();return {ok:true,...summary(all),first_date:dates[0]||null,last_date:dates.at(-1)||null,days:dates.length,recorded_since:dates[0]||null,import:this.importStatus(),time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone};},
    breakdown(by='provider',limit=8,offset=0){if(!['provider','model','month'].includes(by)||!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0||offset>100000)throw Error('invalid_breakdown');const all=rows(),grand=summary(all).tokens,groups=new Map();for(const r of all){const key=by==='month'?r.date.slice(0,7):r[by];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}const ranked=[...groups].map(([key,v])=>({key,...summary(v)})).sort((a,b)=>b.tokens-a.tokens||a.key.localeCompare(b.key));return {ok:true,by,total:ranked.length,rows:ranked.slice(offset,offset+limit).map(r=>({...r,percent:grand?r.tokens/grand*100:0})),offset,limit};},
    daily(days=30){if(!Number.isInteger(days)||days<1||days>90)throw Error('invalid_days');const all=rows(),out=[];for(let n=days-1;n>=0;n--){const d=new Date(now());d.setDate(d.getDate()-n);const date=day(d.getTime());out.push({date,...summary(all.filter(r=>r.date===date))});}return {ok:true,days:out};},
    idle:()=>chain
  };
}
module.exports={createUsageHistory,addRow,hash,total,day,estimate,validDay};
