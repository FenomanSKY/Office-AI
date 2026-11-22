// V14-A + V15 [Diubah oleh Gemini - 2026-11-21] Studio produksi berkas 8 tahap & tiga gerbang + keadaan kosong informatif, penemuan otomatis kandidat folder proyek, ringkasan alat per tahap, dan pesan galat yang bisa ditindaklanjuti
(function () {
  'use strict';
  const $=id=>document.getElementById(id),t=(key,params)=>window.I18n?.t?.('short14.'+key,params)||key,s15=(key,params)=>window.I18n?.t?.('setup15.'+key,params)||key;
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
  function field(parent,label,input){const wrap=el('label',null,'short14-field');wrap.append(el('span',label),input);parent.append(wrap);return input;}
  function create({dialog,before,onOpenSetup,onOpenPrompt}={}) {
    let opened=false,source=null,runs=[],channels=[],selected=null,viewStage=null,dirty=false,busy=false,notice='',noticeCode='',blobUrls=[],generation=0;
    let projectInfo={projectDir:'',savedProjectDir:'',projectDisplayPath:'',projectSource:'none',projectValid:false,needsConfirmation:false,candidates:[],stagePlans:[],missingTools:[],readyCount:0};
    let selectedChannelKey='',selectedFormat='short';
    const api=async(url,body)=>{const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{'X-Office-Token':document.querySelector('meta[name="office-vault-token"]')?.content||'',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok){let v={};try{v=await r.json();}catch{}const err=Error(v.error||r.statusText);err.code=v.code||'';throw err;}return r.json();};
    const run=()=>runs.find(r=>r.id===selected);
    async function loadChannels({refresh=false,channel='',format=''}={}){
      const q=new URLSearchParams();
      if(refresh)q.set('refresh','1');
      if(channel)q.set('channel',channel);
      if(format)q.set('format',format);
      const c=await api('/short/channels'+(q.toString()?'?'+q.toString():''));
      channels=Array.isArray(c.channels)?c.channels:[];
      projectInfo={
        projectDir:c.projectDir||'',
        savedProjectDir:c.savedProjectDir||'',
        projectDisplayPath:c.projectDisplayPath||c.projectDir||'',
        projectSource:c.projectSource||'none',
        projectValid:Boolean(c.projectValid),
        needsConfirmation:Boolean(c.needsConfirmation),
        candidates:Array.isArray(c.candidates)?c.candidates:[],
        stagePlans:Array.isArray(c.stagePlans)?c.stagePlans:[],
        missingTools:Array.isArray(c.missingTools)?c.missingTools:[],
        readyCount:Number(c.readyCount||0)
      };
      if(channels.length&&!channels.some(x=>x.key===selectedChannelKey))selectedChannelKey=channels[0].key;
      const activeCh=channels.find(x=>x.key===selectedChannelKey);
      if(activeCh&&!activeCh.formats.includes(selectedFormat))selectedFormat=activeCh.formats[0]||'short';
    }
    async function saveProjectFolder(dirPath){
      await operation(async()=>{
        await api('/workflows/config',{localProjectDir:String(dirPath||'').trim()});
        await loadChannels({refresh:true});
      });
    }
    async function pickFolderNative(currentPath){
      if(!window.officeDesktop?.pickFolder)return;
      try{
        const res=await window.officeDesktop.pickFolder({title:t('projectFolder'),defaultPath:currentPath||''});
        if(res&&!res.canceled&&res.path)await saveProjectFolder(res.path);
      }catch{}
    }
    // [Diubah oleh Gemini - 2026-11-21] Reset busy sebelum refresh() agar tombol Mulai produksi langsung aktif kembali setelah simpan folder proyek
    async function operation(fn){if(busy)return;busy=true;try{await fn();notice='';noticeCode='';dirty=false;busy=false;await refresh();}catch(e){busy=false;notice=e.message;noticeCode=e.code||'';render();}finally{if(busy){busy=false;render();}}}
    async function action(name,payload={}){await operation(()=>{viewStage=null;return api('/short/runs/'+selected+'/'+name,payload);});}
    async function refresh(){const g=generation;const d=await api('/short/runs');if(!opened||g!==generation)return;runs=d.runs;if(!selected||!run())selected=runs[0]?.id;if(!dirty)render();}
    async function readArtifact(r,name,blob=false){const response=await fetch('/short/runs/'+r.id+'/artifact?name='+encodeURIComponent(name),{headers:{'X-Office-Token':document.querySelector('meta[name="office-vault-token"]')?.content||''}});if(!response.ok)throw Error(t('artifactMissing'));if(blob){const url=URL.createObjectURL(await response.blob());blobUrls.push(url);return url;}return response.text();}
    function releaseBlobs(){for(const url of blobUrls)URL.revokeObjectURL(url);blobUrls=[];}
    function connect(){source?.close();source=new EventSource('/events');source.addEventListener('office-event',e=>{let v;try{v=JSON.parse(e.data);}catch{return;}if(v.type==='short_log'&&v.runId===selected){const p=$('short14LiveLog');if(p){p.textContent=(p.textContent+v.chunk).slice(-18000);p.scrollTop=p.scrollHeight;}}else if(v.type==='short_stage')void refresh().catch(e=>{notice=e.message;noticeCode=e.code||'';});});}
    async function open(){before?.();opened=true;generation++;dirty=false;selected=null;viewStage=null;notice='';noticeCode='';dialog?.(t('title'));$('panel')?.classList.add('short14-dialog');$('panelContent')?.classList.add('short14-panel');render();connect();try{await loadChannels();await refresh();}catch(e){notice=e.message;noticeCode=e.code||'';render();}}
    function close(){opened=false;generation++;source?.close();source=null;releaseBlobs();$('panel')?.classList.remove('short14-dialog');$('panelContent')?.classList.remove('short14-panel');}
    function sourceLabel(src){if(src==='saved')return s15('sourceSaved');if(src==='env')return s15('sourceEnv');return s15('sourceAuto');}
    function errorAdvice(code,rawText){
      const txt=String(rawText||'');
      if(code==='project_required'||/folder proyek|project/i.test(txt))return {hint:s15('shortErrProject'),cta:'setup'};
      if(code==='tool_missing'||/alat belum tersedia|tool/i.test(txt))return {hint:s15('shortErrTool'),cta:'setup'};
      if(code==='usage_limit'||/limit/i.test(txt))return {hint:s15('shortErrLimit'),cta:'prompt'};
      if(code==='agent_missing'||code==='cli_missing'||/cli|agen|antigravity/i.test(txt))return {hint:s15('shortErrAgent'),cta:'prompt'};
      return {hint:s15('shortErrGeneric'),cta:'setup'};
    }
    function buildErrorBox(text,code){
      const box=el('div',null,'short14-notice');box.setAttribute('role','alert');
      box.append(el('strong',text));
      const adv=errorAdvice(code,text);
      box.append(el('p',adv.hint,'short14-muted'));
      const row=el('div',null,'short14-actions');
      if(adv.cta==='prompt'&&typeof onOpenPrompt==='function')row.append(button(s15('row2Action'),()=>{close();onOpenPrompt();}));
      if(typeof onOpenSetup==='function')row.append(button(s15('btnOpenSetup'),()=>{close();onOpenSetup();}));
      if(row.childNodes.length)box.append(row);
      return box;
    }
    function composer(container) {
      const box=el('form',null,'short14-composer'),title=el('h3',t('newVideo'));box.append(title);
      const row=el('div',null,'short14-formrow'),channel=el('select'),format=el('select');
      channel.id='short14ChannelSelect';format.id='short14FormatSelect';
      if(!channels.length){
        const co=el('option',s15('shortNoChannelOpt'));co.value='';co.disabled=true;co.selected=true;channel.append(co);channel.disabled=true;channel.classList.add('short14-select-empty');
        const fo=el('option',s15('shortNoFormatOpt'));fo.value='';fo.disabled=true;fo.selected=true;format.append(fo);format.disabled=true;format.classList.add('short14-select-empty');
      } else {
        for(const c of channels){const o=el('option',c.name);o.value=c.key;if(c.key===selectedChannelKey)o.selected=true;channel.append(o);}
        const fillFormats=()=>{format.replaceChildren();const cur=channels.find(c=>c.key===channel.value);for(const f of cur?.formats||[]){const o=el('option',t(f));o.value=f;if(f===selectedFormat)o.selected=true;format.append(o);}if(format.value)selectedFormat=format.value;};
        channel.onchange=()=>{selectedChannelKey=channel.value;fillFormats();void loadChannels({channel:selectedChannelKey,format:selectedFormat}).then(()=>render()).catch(()=>{});};
        format.onchange=()=>{selectedFormat=format.value;void loadChannels({channel:selectedChannelKey,format:selectedFormat}).then(()=>render()).catch(()=>{});};
        fillFormats();
      }
      field(row,t('channel'),channel);field(row,t('format'),format);box.append(row);
      const topic=el('textarea');topic.rows=2;topic.placeholder=t('topicPlaceholder');field(box,t('topic'),topic);
      const actions=el('div',null,'short14-actions'),go=el('button',t('start'),'short14-primary');go.type='submit';go.id='short14StartBtn';go.disabled=!channels.length||busy;
      box.onsubmit=e=>{e.preventDefault();if(!channels.length)return;void operation(async()=>{const data=await api('/short/runs',{channel:channel.value,format:format.value,topic:topic.value});selected=data.run.id;viewStage=null;});};
      const suggest=button(t('suggest'),()=>{if(!channels.length)return;topic.value='';box.requestSubmit();});suggest.disabled=!channels.length||busy;actions.append(go,suggest);box.append(actions);
      if(!channels.length){const reason=el('p',s15('shortDisabledReason'),'short14-disabled-reason');reason.id='short14DisabledReason';box.append(reason);}
      container.append(box);
    }
    function settings(container) {
      const d=el('details',null,'short14-settings');d.open=!channels.length;d.append(el('summary',t('projectSettings')));
      const input=el('input');input.type='text';input.id='short14ProjectDirInput';input.placeholder=t('projectPlaceholder');input.value=projectInfo.savedProjectDir||projectInfo.projectDir||'';field(d,t('projectFolder'),input);
      const actRow=el('div',null,'short14-actions');
      if(window.officeDesktop?.pickFolder)actRow.append(button(s15('btnPickFolder'),()=>void pickFolderNative(input.value)));
      actRow.append(button(t('save'),()=>void saveProjectFolder(input.value),'short14-primary'));
      if(typeof onOpenSetup==='function')actRow.append(button(s15('btnOpenSetup'),()=>{close();onOpenSetup();}));
      d.append(actRow);
      container.append(d);
    }
    function renderEmptySetupGuide(main){
      const box=el('section',null,'short14-empty-guide');box.id='short14EmptyGuide';
      box.append(el('h3',s15('shortEmptyTitle')),el('p',s15('shortEmptyBody')));
      if(projectInfo.candidates.length>0){
        const candBox=el('div',null,'short14-candidates');
        candBox.append(el('p',s15(projectInfo.needsConfirmation?'ambiguousHint':'candidatesHint'),'short14-muted'));
        const row=el('div',null,'short14-actions');
        for(const cand of projectInfo.candidates){
          const b=button(`${cand.name} (${cand.channelsCount}) — ${cand.displayPath}`,()=>void saveProjectFolder(cand.path),'short14-primary');
          row.append(b);
        }
        candBox.append(row);box.append(candBox);
      }
      const formRow=el('div',null,'short14-inline-setup');
      const inp=el('input');inp.type='text';inp.id='short14EmptyProjectInput';inp.value=projectInfo.savedProjectDir||'';inp.placeholder=t('projectPlaceholder');
      formRow.append(inp);
      if(window.officeDesktop?.pickFolder)formRow.append(button(s15('btnPickFolder'),()=>void pickFolderNative(inp.value)));
      formRow.append(button(t('save'),()=>void saveProjectFolder(inp.value),'short14-primary'));
      if(typeof onOpenSetup==='function')formRow.append(button(s15('btnOpenSetup'),()=>{close();onOpenSetup();}));
      box.append(formRow);
      const structBox=el('div',null,'short14-struct-box');
      structBox.append(el('strong',s15('shortEmptyStructureTitle')),el('pre',s15('shortEmptyStructureCode'),'short14-file'));
      box.append(structBox);
      main.append(box);
    }
    function renderStagePlanPreview(main){
      const wrap=el('section',null,'short14-plan');wrap.id='short14StagePlan';
      wrap.append(el('h3',s15('shortPlanTitle')),el('p',s15('shortPlanSubtitle'),'short14-muted'));
      if(projectInfo.missingTools.length>0){
        const warn=el('div',s15('shortToolsWarn',{tools:projectInfo.missingTools.join(', ')}),'short14-notice');
        warn.id='short14ToolsWarn';warn.setAttribute('role','status');wrap.append(warn);
      } else if(projectInfo.stagePlans.length>0){
        const ok=el('p',s15('shortToolsAllOk'),'short14-ok-note');wrap.append(ok);
      }
      const table=el('table',null,'short14-plan-table');
      const thead=el('thead'),hr=el('tr');
      for(const k of ['shortPlanColStage','shortPlanColTools','shortPlanColOutputs','shortPlanColStatus'])hr.append(el('th',s15(k)));
      thead.append(hr);table.append(thead);
      const tbody=el('tbody');
      projectInfo.stagePlans.forEach((p,idx)=>{
        const trRow=el('tr');
        const stCell=el('td',String(idx+1).padStart(2,'0')+' · '+t('stage.'+p.id)+(p.gate?' ['+p.gate+']':''));
        const tlCell=el('td',(p.tools||[]).join(' + '));
        const outCell=el('td',(p.outputs||[]).join(', '));
        const badge=el('span',s15(p.ready?'shortPlanReady':'shortPlanMissing'),'short14-tag');badge.classList.add(p.ready?'is-ok':'is-warn');
        const rdCell=el('td');rdCell.append(badge);
        trRow.append(stCell,tlCell,outCell,rdCell);
        tbody.append(trRow);
      });
      table.append(tbody);wrap.append(table);
      main.append(wrap);
    }
    function render() {
      if(!opened)return;releaseBlobs();const container=$('panelContent');if(!container)return;container.replaceChildren();
      const top=el('div',null,'short14-top');
      const topLeft=el('div');topLeft.append(el('p',t('subtitle'),'short14-subtitle'));
      if(projectInfo.projectDir){
        const folderNote=el('p',s15('shortFolderActive',{path:projectInfo.projectDisplayPath||projectInfo.projectDir,source:sourceLabel(projectInfo.projectSource)}),'short14-muted');
        folderNote.id='short14FolderActive';topLeft.append(folderNote);
      }
      const topRight=el('div',null,'short14-actions');
      topRight.append(el('span',t('threeGates'),'short14-tag'));
      if(typeof onOpenSetup==='function')topRight.append(button(s15('btnOpenSetup'),()=>{close();onOpenSetup();}));
      top.append(topLeft,topRight);container.append(top);
      if(notice)container.append(buildErrorBox(notice,noticeCode));
      const layout=el('div',null,'short14-layout'),side=el('aside',null,'short14-sidebar'),main=el('section',null,'short14-main');layout.append(side,main);container.append(layout);
      composer(side);settings(side);side.append(el('h3',t('history')));
      for(const r of runs){const b=button(r.title,()=>{selected=r.id;viewStage=null;dirty=false;render();},'short14-run');b.classList.toggle('selected',r.id===selected);b.append(el('small',r.channelName+' · '+t('status.'+r.status)));side.append(b);}
      const r=run();
      if(!r){
        if(!channels.length){renderEmptySetupGuide(main);return;}
        const empty=el('div',null,'short14-empty');empty.append(el('span','01','short14-empty-number'),el('h3',t('emptyTitle')),el('p',t('emptyBody')));main.append(empty);
        if(projectInfo.stagePlans.length)renderStagePlanPreview(main);
        return;
      }
      const head=el('header',null,'short14-runhead');head.append(el('small',r.channelName+' / '+t(r.format)),el('h3',r.title),el('span',t('status.'+r.status),'short14-tag'));main.append(head);
      const steps=el('ol',null,'short14-steps');steps.setAttribute('aria-label',t('stages'));
      r.stages.forEach((s,i)=>{const li=el('li');const b=button('',()=>{viewStage=i;dirty=false;render();},'short14-step');b.classList.toggle('active',i===(viewStage??r.current));b.append(el('span',String(i+1).padStart(2,'0'),'short14-stepnum'),el('strong',t('stage.'+s.id)),el('small',t('status.'+s.status)+(s.gate?' · '+s.gate:'')+(s.durationMs?' · '+Math.round(s.durationMs/1000)+'s':'')));if(i===r.current)b.setAttribute('aria-current','step');li.append(b);steps.append(li);});main.append(steps);
      const index=viewStage??r.current,s=r.stages[index];if(!s)return;
      const work=el('section',null,'short14-work');work.append(el('h4',t('stage.'+s.id)),el('p',t('filesFlow'),'short14-muted'));
      if(s.inputs?.length)work.append(el('p',t('inputs')+': '+s.inputs.join(' · '),'short14-inputs'));
      if(s.error)work.append(buildErrorBox(s.error,s.errorCode||''));
      if(r.retryAfter)work.append(el('p',t('retryAfter')+' '+r.retryAfter));
      const artifacts=el('div',null,'short14-artifacts');for(const name of s.outputs||[])artifacts.append(button(name,()=>{void showArtifact(r,name);},'short14-artifact'));work.append(artifacts);
      const viewer=el('div',null,'short14-file');viewer.id='short14File';viewer.hidden=true;work.append(viewer);
      if(index===r.current) {
        if(r.gate==='G1'&&r.status==='awaiting_approval') {
          const script=el('textarea',null,'short14-script');script.id='short14Script';script.rows=12;script.spellcheck=false;script.oninput=()=>{dirty=true;};field(work,t('scriptEditor'),script);
          void readArtifact(r,'script.json').then(text=>{if(script.isConnected&&!dirty)script.value=text;}).catch(e=>{notice=e.message;});
          work.append(button(t('saveScript'),()=>operation(()=>api('/short/runs/'+selected+'/script',{text:script.value}))));
        }
        if(r.gate==='G2'&&r.status==='awaiting_approval') {
          const video=el('video');video.controls=true;video.preload='metadata';video.setAttribute('aria-label',t('preview'));work.append(video);
          void readArtifact(r,'preview_720.mp4',true).then(url=>{if(video.isConnected)video.src=url;}).catch(e=>{notice=e.message;});
          const report=el('pre',t('loading'),'short14-file');work.append(report);void readArtifact(r,'qa/qa_report.md').then(text=>{report.textContent=text;}).catch(e=>{report.textContent=e.message;});
        }
        const actions=el('div',null,'short14-actions');
        if(r.status==='running')actions.append(button(t('cancel'),()=>action('cancel'),'short14-danger'));
        else if(r.status==='awaiting_approval') {
          if(r.gate==='G3')actions.append(button(t('upload'),()=>{void confirmUpload();},'short14-primary'));
          else {const approve=button(t('approve')+' · '+r.gate,()=>action('approve'),'short14-primary');approve.disabled=dirty;actions.append(approve);}
          const feedback=el('textarea');feedback.rows=2;field(work,t('feedback'),feedback);actions.append(button(t('reject'),()=>action('reject',{feedback:feedback.value})));
        }else if(!['completed','cancelled','upload_unknown','uploading'].includes(r.status))actions.append(button(t('resume'),()=>action('resume'),'short14-primary'));
        if(s.id==='qa'&&['failed','awaiting_approval','revision_requested'].includes(r.status))actions.append(button(t('repair')+' ('+r.qaRounds+'/3)',()=>action('repair')));
        if(['failed','interrupted','waiting_limit'].includes(r.status)){actions.append(button(t('retry'),()=>action('retry')));if(!s.gate)actions.append(button(t('skip'),()=>action('skip')));actions.append(button(t('cancel'),()=>action('cancel'),'short14-danger'));}
        if(r.status==='upload_unknown')work.append(el('p',t('uploadUnknown'),'short14-notice'));
        work.append(actions);
      } else if(index<r.current&&!['running','completed','cancelled','uploading','upload_unknown'].includes(r.status)) {
        work.append(button(t('retry'),()=>action('retry',{stageId:s.id})));
      }
      const logs=el('details',null,'short14-logs');logs.open=true;logs.append(el('summary',t('liveLog')));const log=el('pre',s.logTail||t('noLog'));log.id='short14LiveLog';logs.append(log);work.append(logs);main.append(work);
    }
    async function showArtifact(r,name){try{const viewer=$('short14File');viewer.hidden=false;viewer.replaceChildren();
      if(/\.(mp4|wav|jpg|png)$/i.test(name)){const node=el(/\.mp4$/i.test(name)?'video':/\.wav$/i.test(name)?'audio':'img');node.src=await readArtifact(r,name,true);if(node.tagName==='IMG'){node.alt=name;node.style.maxWidth='100%';}else node.controls=true;viewer.append(node);}
      else viewer.textContent=await readArtifact(r,name);
    }catch(e){notice=e.message;noticeCode=e.code||'';render();}}
    async function confirmUpload(){try{
      const data=await api('/short/runs/'+selected+'/confirm-upload',{}),c=data.result.confirmation;
      const modal=el('dialog',null,'short14-confirm');modal.append(el('h3',t('confirmUpload')));
      const dl=el('dl');for(const [key,value] of [['channel',c.channel],['videoTitle',c.title],['schedule',c.schedule],['privacy',c.privacy]])dl.append(el('dt',t(key)),el('dd',value));modal.append(dl,el('p',t('confirmBody')));
      const actions=el('div',null,'short14-actions');actions.append(button(t('cancel'),()=>modal.close()),button(t('upload'),()=>{modal.close();void action('upload',{confirmed:true,nonce:c.nonce});},'short14-primary'));modal.append(actions);modal.addEventListener('close',()=>modal.remove(),{once:true});document.body.append(modal);modal.showModal();
    }catch(e){notice=e.message;noticeCode=e.code||'';render();}}
    return {open,close,refresh};
  }
  window.OfficeShortUI={create};
})();
