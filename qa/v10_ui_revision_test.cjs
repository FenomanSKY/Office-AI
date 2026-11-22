
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { open, sleep, root } = require('./v6c_lib.cjs');

async function main() {
  const browser = await open();
  const { call, ev, events, fixture, server } = browser;
  const shots = path.join(root, 'qa', 'v17-regression-shots', 'v10-revision');
  const checks = [];
  await call('Network.enable');
  const click = id => ev('document.getElementById('+JSON.stringify(id)+').click();0');
  const waitFor = async (predicate, name) => {
    for (let i = 0; i < 35; i++) {
      if (await predicate()) return;
      await sleep(100);
    }
    throw Error(name);
  };
  const capture = async name => {
    const image = await call('Page.captureScreenshot', { format: 'png' });
    // [Diubah oleh Codex - 2026-11-21] Atomic replacement also works for prior QA output permissions.
    const file=path.join(shots,name+'.png');
    await fs.writeFile(file+'.v17.tmp',Buffer.from(image.data,'base64'));
    await fs.rename(file+'.v17.tmp',file);
  };
  const request = async (url, data, status = 200) => {
    const res = await fetch(server.origin+url, data === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    assert.equal(res.status, status, url);
    return res.json();
  };

  try {
    await fs.mkdir(shots,{recursive:true});
    await browser.go('?qa=1');
    assert.equal(await ev('document.title.length>0&&document.querySelector("#officeMenu").hidden'), true);
    for (const [width,height] of [[1920,1080],[1280,720]]) {
      await browser.size(width,height);
      for (const theme of ['light','dark']) {
        await ev('{const s=OfficeSettings.get();s.language="id";s.appearance.theme='+JSON.stringify(theme)+';OfficeSettings.set(s);} officeQA.preset("iso");officeQA.tick(1);0');
        const overview=await ev('officeDebug().labelMetrics.filter(m=>m.visible).length');
        assert.equal(overview,0,'zoomed-out labels '+width+' '+theme);
        await click('officeMenuButton');
        const menu=await ev('(()=>{const m=document.getElementById("officeMenu"),r=m.getBoundingClientRect(),b=document.getElementById("officeMenuButton").getBoundingClientRect();return {above:r.bottom<b.top,inBounds:r.top>=0&&r.left>=0&&r.right<=innerWidth,scroll:m.scrollHeight>m.clientHeight,layout:m.contains(document.getElementById("layoutButton"))};})()');
        assert.deepEqual(menu,{above:true,inBounds:true,scroll:true,layout:true});
        const wheel = await ev('(()=>{const r=document.getElementById("officeMenu").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
        await call('Input.dispatchMouseEvent',{type:'mouseWheel',...wheel,deltaX:0,deltaY:360});
        await waitFor(()=>ev('document.getElementById("officeMenu").scrollTop>0'),'wheel scrolls menu');
        await ev('document.getElementById("officeMenu").scrollTop=0');
        await capture('menu-'+width+'-'+theme);
        await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        assert.equal(await ev('document.getElementById("officeMenu").hidden&&document.activeElement.id==="officeMenuButton"'),true);
        await ev('document.activeElement.blur();');
        checks.push('layout menu '+width+' '+theme);
      }
    }

    const hover=await ev('(()=>{for(const a of officeDebug().actors){const {x,y}=a.screen;if(a.hidden)continue;const h=officeQA.pickAt(x,y);if(h?.key==="actor:"+a.id)return {id:a.id,x,y};}return null;})()');
    assert.ok(hover,'visible model under pointer at full view');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hover.x,y:hover.y});
    await sleep(120);
    await ev('officeQA.tick(1);0');
    const displayed=await ev('officeDebug().labelMetrics.filter(m=>m.visible).map(m=>m.id)');
    assert.deepEqual(displayed,[hover.id]);
    await capture('label-hover');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1278,y:710});
    assert.equal(await ev('officeQA.tick(1);officeDebug().labelMetrics.some(m=>m.visible)'),false);
    // [Diubah oleh Gemini - 2026-11-20] Arahkan pose kamera dekat ke kursi sekretaris V12 (-16.5, -4).
    await ev('officeQA.pose(.5,1.05,13,[-16.5,0,-4]);officeQA.tick(1);0');
    const near=await ev('officeDebug().labelMetrics.filter(m=>m.visible).map(m=>m.id)');
    assert.ok(near.includes('secretary'),'near label for secretary '+near.join(','));
    await capture('labels-near');
    checks.push('hover langsung dan zoom');

    for (let i=0;i<8;i++) await request('/event',{
      type:'report',agent:'main-codex',provider:'codex',role:'Codex',kind:'main',
      status:'done',session:'office-ui-'+i,event_id:'office-ui-'+i,tokens:12,duration_s:2
    });
    for (const event of [
      {type:'persona_call'},{type:'submit'},{type:'inspect_start'},
      {type:'verdict',result:'pass',checks_passed:4,checks_total:4}
    ]) await request('/event',{persona:'frontend-developer',engine:'codex',task_id:'office-ui',round:1,...event});
    let rows=(await request('/reports')).reports;
    assert.equal(rows.length,9);
    assert.equal(rows.filter(r=>r.persona).length,1);
    const ids=rows.map(r=>r.id);
    await request('/reports/batch/read',{ids:['bad']},400);
    await request('/reports/batch/read',{ids:Array(301).fill(ids[0])},400);
    assert.deepEqual((await request('/reports/batch/archive',{ids})).updated,[]);
    // Reload the fixture after the completed events to observe persisted tray contents.
    await browser.go('?qa=1');
    await waitFor(()=>ev('officeDebug().reports.filter(r=>r.inTray).length===9'),'all reports reached tray');
    await click('openReports');
    assert.equal(await ev('!document.getElementById("markAllRead").disabled&&document.querySelector("#panelContent").firstElementChild.className==="report-actions"'),true);
    await capture('reports-action');
    await click('markAllRead');
    try{await waitFor(()=>ev('officeDebug().reports.every(r=>r.read)&&document.getElementById("markAllRead").disabled'),'report dialog marks every row');}
    catch(error){
      console.error(JSON.stringify({
        rows:(await request('/reports')).reports.map(r=>[r.id,r.read]),
        client:await ev('({rows:officeDebug().reports.map(r=>[r.id,r.read,r.inTray]), disabled:document.getElementById("markAllRead")?.disabled, text:document.getElementById("panelContent").textContent.slice(-250)})'),
        network:events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('batch')).map(e=>e.params.request.postData),
        errors:events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text)
      },null,2));
      throw error;
    }
    rows=(await request('/reports')).reports;
    assert.ok(rows.every(r=>r.read));
    assert.equal(new Set((await request('/reports/batch/read',{ids})).updated).size,9);
    assert.deepEqual((await request('/reports/batch/read',{ids:Array(300).fill(ids[0])})).updated,[ids[0]]);
    await click('closePanel');
    await request('/event',{type:'report',agent:'main-codex',provider:'codex',role:'Codex',kind:'main',
      status:'done',session:'office-ui-new',event_id:'office-ui-new',tokens:12,duration_s:2});
    await waitFor(()=>ev('!document.getElementById("quickReadAll").disabled'),'quick action enabled for new report');
    await click('quickReadAll');
    await waitFor(()=>ev('officeDebug().reports.every(r=>r.read)&&!document.getElementById("panel").open'),'dashboard bulk action stays in office');
    assert.ok((await request('/reports')).reports.every(r=>r.read));
    const archived = await request('/reports/batch/archive',{ids});
    assert.equal(new Set(archived.updated).size,9);
    assert.equal((await request('/reports')).reports.filter(r=>r.archived).length,9);
    checks.push('report panel, daftar cepat, provider, persona, validasi, idempotensi, arsip');

    const realErrors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
    assert.deepEqual(realErrors,[]);
    const debug=await ev('(()=>{const d=officeDebug();return {drawCalls:d.drawCalls,gpu:d.gpu};})()');
    assert.ok(debug.drawCalls<=340,JSON.stringify(debug));
    console.log(JSON.stringify({ checks, overviewLabels:0, hoverLabels:displayed.length, nearLabels:near.length,...debug },null,2));
  } finally {
    await browser.close();
    const target=await fs.realpath(fixture);
    if(path.dirname(target)===await fs.realpath(path.join(root,'qa'))&&path.basename(target).startsWith('v6c-test-')) {
      await fs.rm(target,{recursive:true,force:true,maxRetries:4,retryDelay:250});
    }
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

