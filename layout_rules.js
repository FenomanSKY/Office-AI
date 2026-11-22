/* Geometry contract shared by the server, import validator and layout preview. */
// [Diubah oleh Gemini - 2026-11-20] Perbarui batas ruang V12 (48x32 m + Teras Barat 4x15 m), slot residen V12, template deterministik, dan migrasi mundur otomatis dari tata letak V10/V11 (32x24 m).
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./layout_catalog.js'));else root.OfficeLayoutRules=factory(root.OfficeLayoutCatalog);})(typeof window==='object'?window:globalThis,function(catalog){
'use strict';
const types=['plant','chair','table','coffee','bookshelf','fridge','lounge','pong','sofa','dart','printer','desk','decor','cabinet','rack','umbrella','bench'],addTypes=['plant','chair','table','coffee'];
const base=new Map(catalog.items.map(o=>[o.id,o]));
const templates={plant:'plant-0',chair:'chair-meet-0',table:'ashtray-table',coffee:'coffee',bookshelf:'bookshelf-0',fridge:'fridge',pong:'pong',sofa:'sofa',dart:'dart',printer:'printer',decor:'pedestal-0',cabinet:'cabinet-0',rack:'coat-rack',umbrella:'umbrella',bench:'smoke-bench',desk:'project-0'};
const norm=r=>((r%360)+360)%360,copy=x=>JSON.parse(JSON.stringify(x));
const legacyOnly=new Set([
 'table-48','table-49','table-51','table-63','table-64','table-65','table-66','table-67','table-68','table-69',
 'chair-50','chair-51','chair-52','chair-53','chair-54',
 'bookshelf-45','bookshelf-61','bookshelf-62',
 'pedestal-5','pedestal-6','pedestal-7','pedestal-8','pedestal-9','pedestal-10','pedestal-11','pedestal-12','pedestal-13'
]);
const legacyIds=new Map([
 ['table-48','ashtray-table'],['table-49','meeting-table'],['table-51','meeting-table'],
 ['chair-50','chair-meet-0'],['chair-51','chair-meet-1'],['chair-52','chair-meet-2'],['chair-53','chair-meet-1'],['chair-54','chair-meet-2'],
 ['bookshelf-45','bookshelf-2'],['bookshelf-61','bookshelf-3'],['bookshelf-62','bookshelf-1']
]);
const templateAliases={
 'table-69':'ashtray-table','table-66':'ashtray-table','table-63':'ashtray-table','table-51':'meeting-table','table-49':'meeting-table','table-48':'ashtray-table',
 'chair-50':'chair-meet-0','chair-51':'chair-meet-1','chair-52':'chair-meet-2','chair-53':'chair-meet-1','chair-54':'chair-meet-2',
 'bookshelf-45':'bookshelf-2','bookshelf-61':'bookshelf-3','bookshelf-62':'bookshelf-1','bench-1':'smoke-bench'
};
const addedPattern=/^added-[a-f0-9]{8,32}(?:-[a-z0-9-]+)?$/;
// Koordinat bawaan lama V10 & V11 (denah 32x24 m) untuk mendeteksi dan memigrasikan simpanan lama ke V12 secara bersih.
const oldDefaults=new Map(Object.entries({
 'project-0':[[3,5,0],[3,6,0]],'project-1':[[6.5,5,0],[6.5,6,0]],'project-2':[[10,5,0],[10,6,0]],'project-3':[[13.5,5,0],[13.5,6,0]],
 'project-4':[[3,9,0]],'project-5':[[6.5,9,0]],'project-6':[[10,9,0]],'project-7':[[13.5,9,0]],
 pantry:[[-11.75,2.5,0],[-18.3,3.5,90]],coffee:[[-13.5,2.5,0],[-18.3,5,0]],fridge:[[-15.25,1.5,0],[-17.1,5,0]],
 lounge:[[-12,6,0],[10.2,-1.7,90]],pong:[[-6,8,0],[-18.4,8.5,90]],sofa:[[-11,9,0],[9,-.85,90]],
 'bookshelf-2':[[-10.5,-11.4,0]],'bookshelf-3':[[-15.5,-10.25,90]],
 'plant-0':[[-15,-6,0]],'plant-1':[[-5.8,-11.15,0]],'plant-2':[[-15.1,-3.4,0]],'plant-3':[[-15,10.35,0],[2,-3,0]],
 'plant-4':[[-19.3,1.65,0],[12,4.3,0]],'plant-5':[[-17,11.35,0],[7.4,-11.3,0]],'plant-6':[[15.2,-1.8,0],[-8.5,-10.7,0]],
 'plant-7':[[7.4,-11.3,0],[-12.4,-3,0]],'plant-8':[[-8.5,-10.7,0],[7.4,1.6,0]],'plant-9':[[-12.4,-3,0],[10.5,3,0]],
 'pedestal-0':[[-14.9,-7.5,0],[-14.5,-8.5,0]],'pedestal-1':[[-5.65,-5.7,0]],'pedestal-2':[[-8.2,-4.35,0]],'pedestal-3':[[1.5,-11.4,0]],'pedestal-4':[[7.45,-8.5,0]],
 'cabinet-0':[[-2.5,-11.3,0]],'cabinet-1':[[-1.3,-11.3,0]],'side-cabinet':[[-5.5,-.15,0]],
 'coat-rack':[[-15.3,-4.4,0]],umbrella:[[-2.6,11.3,0],[-15,-1.25,0]],'archive-cabinet':[[15.4,-7.2,0]],
 'smoke-bench':[[-19,4,0],[-17.1,2.5,0]],printer:[[-8.8,1.2,0],[9,-7.5,0]],dart:[[-15.3,8,90],[-12.7,-7.5,270]]
}).map(([id,list])=>[id,list.map(p=>({x:p[0],z:p[1],rotation:p[2]}))]));

function defaults(){return catalog.items.map(({id,type,x,z,rotation})=>({id,type,x,z,rotation:norm(rotation)}));}
function templateFor(o){if(base.has(o.id))return o.id;const m=/^added-[a-f0-9]{8,32}-(.+)$/.exec(o.id),id=m?m[1]:templates[o.type];return templateAliases[id]||id;}
function meta(o){return base.get(templateFor(o));}
function bounds(o){const m=meta(o),r=norm(o.rotation)*Math.PI/180,q=norm(o.rotation)%180===90,c=Math.round(Math.cos(r)),s=Math.round(Math.sin(r)),ox=m.ox||0,oz=m.oz||0;return{x:o.x+ox*c+oz*s,z:o.z-ox*s+oz*c,w:q?m.d:m.w,d:q?m.w:m.d};}
const within=(a,b)=>a.x-a.w/2>=b.x-b.w/2-.01&&a.x+a.w/2<=b.x+b.w/2+.01&&a.z-a.d/2>=b.z-b.d/2-.01&&a.z+a.d/2<=b.z+b.d/2+.01;
const onParent=(a,b)=>meta(a)?.on===b.id&&within(bounds(a),bounds(b));
const hit=(a,b,p=.06)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+p&&Math.abs(a.z-b.z)<(a.d+b.d)/2+p;
const same=(a,b)=>a&&b&&a.type===b.type&&a.x===b.x&&a.z===b.z&&norm(a.rotation)===norm(b.rotation);
// [Diubah oleh Gemini - 2026-11-20] Sinkronkan slots(n) dengan officeResidentSlots(n) di furniture.js (Area Inti AI V12).
function slots(n){
 return n<=4?[[-4.4,-4.2],[4.4,-4.2],[-4.4,1.2],[4.4,1.2]].slice(0,n)
  :n<=6?[[-4.4,-5.4],[4.4,-5.4],[-4.4,-1.8],[4.4,-1.8],[-4.4,1.8],[4.4,1.8]].slice(0,n)
  :[[-4.4,-6.2],[4.4,-6.2],[-4.4,-2.8],[4.4,-2.8],[-4.4,.6],[4.4,.6],[-4.4,4.0],[4.4,4.0]].slice(0,n);
}
function geometry(o,list,agents=[]){
 const b=bounds(o);
 const inMain=b.x-b.w/2>=-23.85&&b.x+b.w/2<=23.85&&b.z-b.d/2>=-15.85&&b.z+b.d/2<=15.85;
 const inTerrace=b.x-b.w/2>=-27.75&&b.x+b.w/2<=-24.15&&b.z-b.d/2>=.25&&b.z+b.d/2<=14.75;
 if(!inMain&&!inTerrace)return 'outside';
 const desks=[...new Map(Array.from({length:8},(_,i)=>slots(i+1)).flat().map(p=>[p.join(','),p])).values()];
 const fixed=[...catalog.fixed,...catalog.locked,...desks.map(([x,z])=>({x,z,w:2.75,d:1.25}))];
 if(fixed.some(v=>hit(b,v)))return 'collision';
 const deskAt=list.filter(p=>p.type==='desk').map(p=>{const a=p.rotation*Math.PI/180;return{x:p.x+Math.round(Math.sin(a))*2.1,z:p.z+Math.round(Math.cos(a))*2.1,w:1.1,d:1.1,id:p.id};});
 const chairZones=[...[...desks,[-18.5,-12.5],[-16.5,-5.5],[19.5,-10.5],[14.0,-6.2],[17.5,6.2],[16.0,12.5]].map(([x,z])=>({x,z:z+2.1,w:1.1,d:1.1})),...deskAt.filter(z=>z.id!==o.id)];
 const chairExit=p=>{const a=p.rotation*Math.PI/180,q=p.rotation%180===90;return{x:p.x+Math.sin(a)*.84,z:p.z+Math.cos(a)*.84,w:q?.9:1.0,d:q?1.0:.9,id:p.id};};
 const movableChairZones=list.filter(p=>p.type==='chair').map(chairExit);
 if(o.type==='chair'){const e=chairExit(o);if(fixed.some(p=>hit(e,p,0))||list.some(p=>p.id!==o.id&&hit(e,bounds(p),0)))return 'zone';}
 if([...catalog.zones,...chairZones,...movableChairZones.filter(z=>z.id!==o.id)].some(z=>z.allow!==o.type&&hit(b,z,0)))return 'zone';
 if(list.some(p=>p.id!==o.id&&!onParent(o,p)&&!onParent(p,o)&&hit(b,bounds(p))))return 'collision';
 return null;
}
function validate(value,agents){
 if(value===null)return null;
 if(!Array.isArray(value)||value.length>catalog.items.length+20||JSON.stringify(value).length>30000)throw Error('layout.invalid');
 const ids=new Set();let added=0;
 for(const o of value){
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==5||!['id','type','x','z','rotation'].every(k=>Object.hasOwn(o,k))||typeof o.id!=='string'||ids.has(o.id)||!types.includes(o.type)||![o.x,o.z].every(v=>typeof v==='number'&&Number.isFinite(v))||o.x<-28||o.x>24||o.z<-16||o.z>16||![0,90,180,270].includes(o.rotation))throw Error('layout.invalid');
  ids.add(o.id);
  const m=base.get(o.id);
  if(m){if(m.type!==o.type)throw Error('layout.invalid');}
  else if(!addedPattern.test(o.id)||!meta(o)||meta(o).type!==o.type||!Object.hasOwn(templates,o.type)||++added>20)throw Error('layout.invalid');
  if(!same(o,m)&&((!Number.isInteger(o.x*2)||!Number.isInteger(o.z*2))&&!(meta(o)?.on&&value.some(p=>p.id===meta(o).on&&onParent(o,p))&&Number.isInteger(o.x*4)&&Number.isInteger(o.z*4))||geometry(o,value,agents)))throw Error('layout.invalid');
 }
 return copy(value);
}
function nearest(item,list,agents){
 const points=[];
 for(let x=-27.5;x<=23.5;x+=.5)for(let z=-15.5;z<=15.5;z+=.5){const at={...item,x,z};if(!geometry(at,[...list,at],agents))points.push(at);}
 points.sort((a,b)=>Math.hypot(a.x-item.x,a.z-item.z)-Math.hypot(b.x-item.x,b.z-item.z));
 return points[0]||null;
}
function matchesOldDefault(o){
 const list=oldDefaults.get(o.id);if(!list)return false;
 const r=norm(o.rotation);
 return list.some(p=>p.x===o.x&&p.z===o.z&&p.rotation===r);
}
// [Diubah oleh Gemini - 2026-11-20] Migrasikan tata letak simpanan V10/V11 (32x24 m) ke V12 (48x32 m) sambil tetap menolak ID asing/terlarang seperti 'entry'.
function migrateLegacy(value,agents=[]){
 if(!Array.isArray(value))return value;
 const legacy=value.some(o=>{
  if(!o||typeof o!=='object'||typeof o.id!=='string')return false;
  if(legacyOnly.has(o.id))return true;
  if(!matchesOldDefault(o))return false;
  const cur=base.get(o.id);
  return !cur||o.x!==cur.x||o.z!==cur.z||norm(o.rotation)!==norm(cur.rotation);
 });
 if(!legacy)return copy(value);
 const canonical=new Map(defaults().map(o=>[o.id,o])),wanted=new Map(),custom=[],unknown=[];
 for(const raw of value){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'){unknown.push(raw);continue;}
  const original=raw.id,id=legacyIds.get(original)||original;
  if(addedPattern.test(original)){custom.push(copy(raw));continue;}
  if(!base.has(id)){if(legacyOnly.has(original)||oldDefaults.has(original))continue;unknown.push(copy(raw));continue;}
  const row={...copy(raw),id};
  if(matchesOldDefault(raw)||legacyOnly.has(original)||!same(row,canonical.get(id))&&geometry(row,defaults(),agents)){
   Object.assign(row,canonical.get(id)||{});
  }
  wanted.set(id,row);
 }
 const accepted=[];
 for(const d of defaults()){
  const item=wanted.get(d.id)||d;
  let placed=null;
  for(const candidate of [item,d])if(!geometry(candidate,[...accepted,candidate],agents)){placed=candidate;break;}
  if(!placed)placed=nearest(item,accepted,agents);
  if(placed)accepted.push(placed);
 }
 for(const item of custom){
  let placed=geometry(item,[...accepted,item],agents)?nearest(item,accepted,agents):item;
  if(!placed)throw Error('layout.migration_no_space');
  accepted.push(placed);
 }
 return unknown.length?[...accepted,...unknown]:accepted;
}
return{catalog,types,addTypes,templates,norm,templateFor,defaults,validate,migrateLegacy,geometry,bounds,same,base};
});
