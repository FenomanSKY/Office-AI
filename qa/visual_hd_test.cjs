'use strict';
const assert=require('node:assert/strict');
const {open}=require('./v21_lib.cjs');
process.env.OFFICE_MT5_AUTODETECT='0';
(async()=>{
 const b=await open();
 try{
  await b.go();
  const models=await b.ev(`(()=>{
    const styles=OfficeSettings.agentOptions;
    const geometries={low:new Set(),high:new Set()};let count=0;
    for(const [i,hairStyle] of styles.hair.entries()){
     for(const [j,outfit] of styles.outfit.entries()){
      const actor=makeVoxelChar({hairStyle,outfit,accessory:styles.accessory[(i+j)%styles.accessory.length]});
      const u=actor.userData,arm=u.arms[1],report=new THREE.Group();arm.add(report);
      const totals={};
      for(const quality of ['high','low','high']){
       setFigureQuality(actor,quality);
       if(report.parent!==arm||u.arms[1]!==arm)throw Error('detached hand prop');
       let parts=0;u.wardrobe.head.traverse(part=>{if(part.isMesh)parts++;});
       if(totals[quality]&&parts!==totals[quality])throw Error('duplicate character parts');
       totals[quality]=parts;
       for(const [status,moving,seated] of [['working',false,true],['idle',true,false],['thinking',false,false]]){
        animateVoxelChar(actor,status,moving,seated,2.1,i);reactVoxelChar(actor,'surprised',.4,'paper');actor.updateMatrixWorld(true);
        actor.traverse(p=>{if(!p.matrixWorld.elements.every(Number.isFinite))throw Error('invalid transform');if(p.isMesh)geometries[quality].add(p.geometry.uuid);});
       }
      }
      if(totals.high<=totals.low)throw Error('expected detailed head');
      count++;
     }
    }
    return {count,low:geometries.low.size,high:geometries.high.size};
   })()`);
  assert.equal(models.count,45);assert.equal(models.low,1);assert.ok(models.high>=8&&models.high<20);
  const legacy=await b.ev(`(()=>{const v=OfficeSettings.defaults();delete v.appearance.modelQuality;
   v.appearance.economy=true;const saved=OfficeSettings.validate(v);return [saved.appearance.modelQuality,saved.appearance.economy];})()`);
  assert.deepEqual(legacy,['high',true]);
  const live=()=>b.ev('officeQA.sampleActors().map(a=>[a.id,a.modelQuality,a.x,a.y,a.z])');
  async function selectQuality(value){
   const before=await live();assert.ok(before.length>5);
   await b.ev(`document.getElementById('settingsButton').click();document.getElementById('tab-theme').click();
    var control=document.getElementById('setting-modelQuality');control.value=${JSON.stringify(value)};
    control.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('settingsDialog').close();
    OfficeSettings.flush()`);
   const after=await live();
   assert.deepEqual(after.map(([id,,...xyz])=>[id,...xyz]),before.map(([id,,...xyz])=>[id,...xyz]));
   assert.ok(after.every(([,q])=>q===value),'updated live cast');
   const saved=await b.ev("fetch('/settings').then(r=>r.json()).then(s=>s.appearance.modelQuality)");
   assert.equal(saved,value);
  }
  await selectQuality('low');
  await b.ev("officeQA.tick(.1);localStorage.clear()");
  await b.go();
  assert.ok((await live()).every(([,q])=>q==='low'),'restored low from the server on reload');
  await selectQuality('high');
  await b.size(1440,900);
  const draws={};
  for(const name of ['iso','boss','engineering','quality','top']){
   draws[name]=await b.ev(`officeQA.preset(${JSON.stringify(name)});officeQA.tick(.1);officeDebug().drawCalls`);
   assert.ok(draws[name]>0&&draws[name]<=340,name+' '+draws[name]);
  }
  await b.ev("officeQA.preset('boss');officeQA.tick(.1)");
  const point=await b.ev(`(()=>{
    const a=officeQA.sampleActors().find(a=>a.id==='boss');
    const head=officeQA.project(a.x,a.y+1.66,a.z),box=document.querySelector('#stage canvas').getBoundingClientRect();
    return {x:head.x+box.left,y:head.y+box.top};
  })()`);
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await b.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  try{
   await b.ev('new Promise(resolve=>setTimeout(resolve,350))');
   assert.equal(await b.ev('officeQA.sampleActors().find(a=>a.lifted)?.id'),'boss','portrait mesh picking');
  }finally{
   await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
  const routes=await b.ev('(()=>{const r=officeQA.routes();return {routes:r.tested,failures:r.failures.length};})()');
  assert.equal(routes.failures,0);assert.ok(routes.routes>0);
  await b.call('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:2,mobile:false});
  const resolutions=await b.ev(`(()=>{
    const sizes=[];for(const economy of [true,false]){
     const s=OfficeSettings.get();s.appearance.economy=economy;OfficeSettings.set(s);window.dispatchEvent(new Event('resize'));officeQA.tick(.1);
     const c=document.querySelector('#stage canvas');sizes.push([c.width,c.clientWidth]);
    }
    return sizes;
   })()`);
  assert.equal(resolutions[0][0],resolutions[0][1]);
  assert.ok(resolutions[1][0]>=resolutions[1][1]*1.9);
  const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.params.type==='error'||e.params.entry?.level==='error');
  assert.deepEqual(errors.map(e=>e.params.exceptionDetails?.text||e.params.args?.[0]?.value||e.params.entry?.text),[]);
  console.log(JSON.stringify({models,draws,routes,resolutions,errors:errors.length}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});