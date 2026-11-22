/* [Diubah oleh Codex - 2026-11-22] Exercise the production recovery path without a GPU or user data. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function run({mutant=false}={}){
 const T=require('../vendor/three.min.js'),map=require('../office_flow_map.json'),model=require('../office_flow_model').create({now:()=>100});
 const base={provider:'gemini',session:'fixture',agent:'main-gemini',at:100};model.ingest({...base,type:'call'});
 model.ingest({...base,type:'spawn',kind:'subagent',agent:'fixture-child',parent:'main-gemini',agent_type:'unknown-helper'});
 const warnings=[],ctx={console:{warn:(...v)=>warnings.push(v)}};
 let source=fs.readFileSync(require.resolve('../office_flow3d.js'),'utf8');
 if(mutant)source=source.replace('if (validAnchor(point)) return point;','if (!validAnchor(point)) return point;');
 vm.runInNewContext(source,ctx);
 const heads=new Map([['boss',new T.Vector3(-4,3,0)],['secretary',new T.Vector3(0,3,0)],['agent',new T.Vector3(4,3,0)]]),scene=new T.Scene();
 let restored=0;
 const r=ctx.OfficeFlow3D.create({THREE:T,scene,map,anchorFor:n=>heads.get(n?.role)||null,recoverAnchor:()=>{restored++;return heads.get('agent');}});
 try{
  r.sync(model.snapshot());r.advance(300);r.advance(100);
  const s=r.stats();assert.equal(s.visibleEdges,3);assert.equal(s.missingAnchors,0);assert.ok(s.anchorRecoveries>0&&restored>0);assert.equal(warnings.length,1);
  for(const mesh of scene.children[0].children)for(const attr of Object.values(mesh.geometry.attributes))assert.ok(Array.from(attr.array).every(Number.isFinite));
  model.ingest({...base,type:'retire',kind:'subagent',agent:'fixture-child',parent:'main-gemini',role:'Agent',at:110});
  assert.equal(model.snapshot()[0].nodes.find(n=>n.agent==='fixture-child').agentType,'unknown-helper','untyped stop preserves the observed start label');
  model.ingest({...base,type:'retire',kind:'subagent',agent:'fixture-child',parent:'main-gemini',agent_type:'general-purpose',at:120});
  assert.equal(model.snapshot()[0].nodes.find(n=>n.agent==='fixture-child').agentType,'unknown-helper','generic hook stop cannot rename an observed start');
  return {ok:true,edges:s.visibleEdges,recoveries:s.anchorRecoveries,warnings:warnings.length};
 }finally{r.dispose();}
}
module.exports={run};
if(require.main===module){
 const result=run();
 if(process.argv.includes('--mutation-check')){assert.throws(()=>run({mutant:true}));result.mutationCaught=true;}
 console.log(JSON.stringify(result));
}
