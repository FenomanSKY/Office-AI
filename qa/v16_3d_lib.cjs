/* V16-C [Diubah oleh Codex - 2026-11-21] Isolated headless shell and server; owns every process it closes. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
// V16-C [Diubah oleh Codex - 2026-11-21] All browser runners share the current and legacy locks.
async function lockBrowser(task){
 const peers=['v16c_g_browser.lock','v16b_g_browser.lock','v16b_c_browser.lock'],lock=path.join(__dirname,'v16c_browser.lock');
 for(const name of peers)if(await fs.stat(path.join(__dirname,name)).catch(()=>null))throw Error('Browser lock active: '+name);
 await fs.writeFile(lock,JSON.stringify({pid:process.pid,task}),{flag:'wx'});
 try{for(const name of peers)if(await fs.stat(path.join(__dirname,name)).catch(()=>null))throw Error('Browser lock active: '+name);}
 catch(error){await fs.unlink(lock);throw error;}
 return ()=>fs.unlink(lock);
}
async function open({sourceOverrides={}}={}){
 for(const route of Object.keys(sourceOverrides))if(!['/office.js','/office_flow3d.js'].includes(route))throw Error('Only owned browser sources may be overridden.');
 const fixture=await fs.mkdtemp(path.join(__dirname,'v6c-test-v16-')),profile=path.join(fixture,'chrome');await fs.mkdir(profile);
 const {startServer}=require('../embedded_server');
 const server=await startServer({root,cwd:fixture,dataDir:path.join(fixture,'data'),port:0,maxPort:0,collector:false,allowDriveScan:false});
 const exe=process.env.OFFICE_TEST_CHROME||path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe');
 const chrome=spawn(exe,['--no-sandbox','--disable-dev-shm-usage','--disable-breakpad','--in-process-gpu','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1600,900','about:blank'],{windowsHide:true,stdio:'ignore'});
 let port,ws,seq=0;const events=[],pending=new Map();
 try{
  for(let i=0;i<100;i++){try{port=+(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];if(port)break;}catch{}await sleep(100);}
  if(!port)throw Error('headless startup');
  const pages=await fetch('http://127.0.0.1:'+port+'/json').then(r=>r.json());ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id){const p=pending.get(value.id);pending.delete(value.id);if(p)value.error?p.reject(value.error):p.resolve(value.result);}else{
   events.push(value);
   if(value.method==='Fetch.requestPaused'){
    const requestId=value.params.requestId,source=sourceOverrides[new URL(value.params.request.url).pathname];
    const response=source===undefined?call('Fetch.continueRequest',{requestId}):call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript; charset=utf-8'}],body:Buffer.from(source).toString('base64')});
    response.catch(error=>events.push({method:'Fixture.overrideError',error:String(error)}));
   }
  }});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const value=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw Error(JSON.stringify(value.exceptionDetails).slice(0,2000));return value.result.value;};
  for(const domain of ['Runtime','Log','Page'])await call(domain+'.enable');
  if(Object.keys(sourceOverrides).length)await call('Fetch.enable',{patterns:Object.keys(sourceOverrides).map(route=>({urlPattern:server.origin+route,requestStage:'Request'}))});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.addEventListener("load",()=>window.officeQA?.freeze());'});
  const b={fixture,server,chrome,events,call,ev,
   async go(query='?qa=1&demo=1'){
    await call('Page.navigate',{url:server.origin+'/'+query});let ready=false;
    for(let i=0;i<150;i++){await sleep(100);if(await ev('!!window.officeQA&&!!window.OfficeFlow?.stats().renderer')){ready=true;break;}}
    if(!ready)throw Error('OfficeFlow renderer startup: '+JSON.stringify(events.filter(e=>e.method==='Runtime.exceptionThrown')).slice(0,1500));
    await ev('officeQA.freeze();officeQA.auto(false);document.querySelectorAll("dialog[open]").forEach(d=>d.close());officeQA.preset("iso");0');
    await b.settle();
   },
   async settle(){await ev('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await ev('officeQA.tick(0);0');},
   async size(width,height){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await b.settle();},
   async shot(name){await b.settle();const data=await call('Page.captureScreenshot',{format:'png'}),file=path.join(root,'qa/v16-shots',name+'.png');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,Buffer.from(data.data,'base64'));return file;},
   async close(){await Promise.race([call('Browser.close').catch(()=>{}),sleep(1500)]);ws.close();chrome.kill();await server.close();const target=path.resolve(fixture);if(path.dirname(target)!==__dirname)throw Error('fixture cleanup boundary');await fs.rm(target,{recursive:true,force:true,maxRetries:15,retryDelay:100});}
  };return b;
 }catch(e){ws?.close();chrome.kill();await server.close();throw e;}
}
module.exports={open,root,sleep,lockBrowser};
