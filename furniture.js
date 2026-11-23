/* Furnitur statis dikompilasi menjadi instansi kotak per material. */
// [Diubah oleh Gemini - 2026-11-20] Arsitektur 3D Office AI V12: perluasan 48x32 m + Teras Barat (4x15 m), 10 zona bertema, instancing kaca buram/bening, dekorasi atrium/koridor/meja kaya, nol tumpang tindih karpet.
'use strict';
// v6-B: benda memiliki geometri, titik pakai, kapasitas dan perilaku sendiri.
class OfficeWorldObjects {
 constructor(){this.items=new Map();this.revision=0;this.onChange=null;this.audit=[];}
 // v9: model footprint tunggal. footprint lokal {w,d,h,ox,oz} (sebelum rotasi) = satu-satunya sumber tapak; obstacle grid,
 // pratinjau editor, audit dan overlay "Garis fisik" diturunkan darinya. soft = tempat duduk (hanya pemakainya boleh masuk),
 // on = benda permukaan di atas induk, clearance = zona kosong lokal, locked = alasan kunci editor. Titik: kind stand/sit/lie.
 add(id,type,node,{points,affordances={},obstacle=null,footprint,soft=false,on=null,clearance=[],locked=null}={}){
  if(this.items.has(id))id+='-'+this.items.size;
  const usePoints=(points||[[0,1.5,0]]).map((p,i)=>{const v=Array.isArray(p)?{x:p[0],z:p[1],facing:p[2],kind:p[3]}:p;return{index:i,x:v.x,z:v.z,facing:v.facing||0,kind:v.kind||'stand',capacity:v.capacity||1,affordances:v.affordances||null,users:new Set()};});
  const o={id,type,node,enabled:true,version:0,affordances,occluders:[],usePoints,bindings:[],obstacle,soft,on,clearance,locked};
  Object.defineProperty(node.userData,'worldObject',{value:o,writable:true,configurable:true,enumerable:false});node.updateWorldMatrix(true,true);o.origin=node.position.clone();o.rotation=node.rotation.y;
  o.footprint=footprint===false?null:this.localFootprint(node,footprint);
  if(o.footprint&&!o.obstacle&&typeof design==='object'){o.obstacle={x:0,z:0,w:0,d:0};design.obstacles.push(o.obstacle);}
  if(o.obstacle){o.obstacle.owner=id;o.obstacle.name=type;}
  this.items.set(id,o);this.sync(o);return o;
 }
 localFootprint(node,f){if(Array.isArray(f))f={w:f[0],d:f[1]};const r=node.rotation.y;node.rotation.y=0;node.updateWorldMatrix(true,true);const b=new THREE.Box3();node.traverse(m=>{if(m.isMesh&&!m.userData.noHit&&!m.userData.billboard){m.geometry.boundingBox||m.geometry.computeBoundingBox();b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));}});node.rotation.y=r;node.updateWorldMatrix(true,true);
  const p=node.getWorldPosition(new THREE.Vector3()),auto=b.isEmpty()?{w:.3,d:.3,ox:0,oz:0,h:.3}:{w:b.max.x-b.min.x,d:b.max.z-b.min.z,ox:(b.min.x+b.max.x)/2-p.x,oz:(b.min.z+b.max.z)/2-p.z,h:b.max.y};
  const out={w:f?.w??auto.w,d:f?.d??auto.d,ox:f?.ox??(f?.w?0:auto.ox),oz:f?.oz??(f?.d?0:auto.oz),h:f?.h??auto.h};for(const k of ['w','d','ox','oz','h'])out[k]=Math.round(out[k]*1000)/1000;return out;}
 // Persegi dunia; rotasi kelipatan 90 derajat (editor) sehingga kotak sejajar sumbu tepat.
 rectLocal(o,f,x=o.node.position.x,z=o.node.position.z,r=o.node.rotation.y){const c=Math.cos(r),s=Math.sin(r),q=Math.abs(s)>.7;return{x:x+f.ox*c+f.oz*s,z:z-f.ox*s+f.oz*c,w:q?f.d:f.w,d:q?f.w:f.d};}
 rect(o,at){if(!o.footprint)return null;const r=this.rectLocal(o,o.footprint,at?.x,at?.z,at?.r);return{...r,h:o.footprint.h,rot:at?.r??o.node.rotation.y,soft:!!o.soft,solid:!o.soft,surface:this.onSurface(o,r)};}
 clearRects(o,at){const out=[];for(const c of o.clearance||[])out.push({...this.rectLocal(o,c,at?.x,at?.z,at?.r),kind:c.kind||'clear'});return out;}
 onSurface(o,r){if(!o.on)return false;const p=this.get(o.on);if(!p?.enabled||!p.footprint)return false;r=r||this.rectLocal(o,o.footprint);const q=this.rectLocal(p,p.footprint);return r.x-r.w/2>=q.x-q.w/2-.01&&r.x+r.w/2<=q.x+q.w/2+.01&&r.z-r.d/2>=q.z-q.d/2-.01&&r.z+r.d/2<=q.z+q.d/2+.01;}
 sync(o){if(!o.obstacle)return;const r=this.rect(o);if(!r){o.obstacle.disabled=true;return;}Object.assign(o.obstacle,{x:r.x,z:r.z,w:r.w,d:r.d,h:r.h,disabled:!o.enabled,soft:!!o.soft,surface:r.surface,owner:o.id});}
 get(id){return this.items.get(id);}
 exists(o){return !!o?.enabled;}
 point(id,index=0){const o=typeof id==='string'?this.get(id):id;if(!o?.enabled)return null;const p=o.usePoints[index];if(!p)return null;o.node.updateWorldMatrix(true,false);const v=o.node.localToWorld(new THREE.Vector3(p.x,0,p.z));const raw={x:Math.round(v.x*2)/2,z:Math.round(v.z*2)/2,facing:p.facing+o.node.rotation.y,objectId:o.id,index};return this.resolvePoint?this.resolvePoint(raw):raw;}
 release(actor){for(const o of this.items.values())for(const p of o.usePoints)p.users.delete(actor.id);actor.usingObject=null;}
 available(affordance,actor){return [...this.items.values()].filter(o=>o.enabled&&o.affordances[affordance]).flatMap(o=>o.usePoints.map((p,i)=>({object:o,point:this.point(o,i),slot:p}))).filter(v=>v.point&&(!v.slot.affordances||v.slot.affordances.includes(affordance))&&(v.slot.users.size<v.slot.capacity||v.slot.users.has(actor.id))).sort((a,b)=>Math.hypot(a.point.x-actor.char.position.x,a.point.z-actor.char.position.z)-Math.hypot(b.point.x-actor.char.position.x,b.point.z-actor.char.position.z));}
 reserve(choice,actor,affordance){this.release(actor);choice.slot.users.add(actor.id);actor.usingObject={id:choice.object.id,index:choice.point.index,affordance,version:choice.object.version};const row={time:0,actor:actor.id,object:choice.object.id,type:choice.object.type,affordance,exists:choice.object.enabled};this.audit.push(row);if(this.audit.length>12000)this.audit.shift();return row;}
 bind(part,mesh,index){let n=part;while(n&&!n.userData.worldObject)n=n.parent;if(!n)return;const o=n.userData.worldObject;n.updateWorldMatrix(true,false);const local=new THREE.Matrix4().copy(n.matrixWorld).invert().multiply(part.matrixWorld);o.bindings.push({mesh,index,local});if(part.userData.accent)o.accent={mesh,index};}
 refresh(o){if(o.renderRoot)o.renderRoot.visible=o.enabled;o.node.visible=o.enabled;o.node.updateWorldMatrix(true,true);for(const b of o.bindings){const m=o.enabled?new THREE.Matrix4().multiplyMatrices(o.node.matrixWorld,b.local):new THREE.Matrix4().makeScale(0,0,0);if(b.index!==undefined){b.mesh.setMatrixAt(b.index,m);b.mesh.instanceMatrix.needsUpdate=true;b.mesh.computeBoundingSphere?.();}else{b.mesh.matrix.copy(m);b.mesh.matrixAutoUpdate=false;b.mesh.visible=o.enabled;}}
  for(const c of o.occluders)c.box.setFromObject(o.node);this.sync(o);for(const c of this.items.values())if(c.on===o.id)this.sync(c);
 }
 // v9: anak permukaan (on) dan benda tertaut (follow) ikut transformasi induknya.
 move(id,x,z,rotation){const o=this.get(id);if(!o)return false;const old={x:o.node.position.x,z:o.node.position.z,r:o.node.rotation.y};o.node.position.x=x;o.node.position.z=z;if(Number.isFinite(rotation))o.node.rotation.y=rotation;const dr=o.node.rotation.y-old.r,c=Math.cos(dr),s=Math.sin(dr);
  for(const k of this.items.values())if(k!==o&&(k.follow===o.id||k.on===o.id&&!k.free&&this.onSurfaceAt(k,old))){const rx=k.node.position.x-old.x,rz=k.node.position.z-old.z;k.node.position.x=x+rx*c+rz*s;k.node.position.z=z-rx*s+rz*c;k.node.rotation.y+=dr;k.version++;this.refresh(k);}
  o.version++;this.revision++;this.refresh(o);this.onChange?.(o);return true;}
 onSurfaceAt(k,old){const p=this.get(k.on);if(!p?.footprint||!k.footprint)return false;const q=this.rectLocal(p,p.footprint,old.x,old.z,old.r),r=this.rectLocal(k,k.footprint);return r.x-r.w/2>=q.x-q.w/2-.01&&r.x+r.w/2<=q.x+q.w/2+.01&&r.z-r.d/2>=q.z-q.d/2-.01&&r.z+r.d/2<=q.z+q.d/2+.01;}
 restore(id){const o=this.get(id);if(!o||o.enabled)return false;o.enabled=true;for(const k of this.items.values())if(k.removedWith===id){k.enabled=true;delete k.removedWith;this.refresh(k);}o.version++;this.revision++;this.refresh(o);this.onChange?.(o);return true;}
 remove(id){const o=this.get(id);if(!o)return false;for(const k of this.items.values())if(k.enabled&&(k.follow===id||k.on===id&&this.onSurface(k))){k.enabled=false;k.removedWith=id;k.version++;this.refresh(k);}o.enabled=false;o.version++;this.revision++;this.refresh(o);this.onChange?.(o);return true;}
 snapshot(){return [...this.items.values()].map(o=>({id:o.id,type:o.type,enabled:o.enabled,x:o.node.position.x,y:o.node.position.y,z:o.node.position.z,rotation:o.node.rotation.y,affordances:Object.keys(o.affordances),footprint:o.footprint,rect:this.rect(o),soft:!!o.soft,on:o.on,locked:o.locked,usePoints:o.usePoints.map((p,i)=>({...this.point(o,i),kind:p.kind,capacity:p.capacity,users:[...p.users]}))}));}
}
const officeAffordances={water:{activity:I18n.raw('strings.menyiram_tanaman'),duration:8,animation:'water'},coffee:{activity:I18n.raw('strings.minum_kopi'),duration:12,animation:'drink'},drink:{activity:I18n.raw('strings.minum_air'),duration:8},read:{activity:I18n.raw('strings.membaca_buku'),duration:14},play_pong:{activity:I18n.raw('strings.tenis_meja'),duration:13},play_dart:{activity:I18n.raw('strings.bermain_dart'),duration:12},smoke:{activity:I18n.raw('strings.merokok_animasi'),duration:14},stretch_zone:{activity:I18n.raw('strings.meregang'),duration:9},chat_spot:{activity:I18n.raw('strings.berbincang'),duration:12},sit_work:{activity:I18n.raw('strings.mengetik'),duration:6},file_archive:{activity:I18n.raw('strings.merapikan_rak'),duration:8},print:{activity:I18n.raw('strings.mencetak_laporan'),duration:2},phone:{activity:I18n.raw('strings.menelepon'),duration:4},sit:{activity:I18n.raw('strings.duduk_santai'),duration:12},browse_fridge:{activity:I18n.raw('strings.mencari_camilan'),duration:8},window:{activity:I18n.raw('strings.melamun_di_jendela'),duration:10},handoff:{activity:I18n.raw('strings.menyerahkan_laporan'),duration:1},entry:{activity:I18n.raw('strings.masuk_lewat_pintu'),duration:1}};
function worldAffords(...keys){return Object.fromEntries(keys.map(k=>[k,{...officeAffordances[k],animation:officeAffordances[k].animation||k,requires:'instance'}]));}

// [Diubah oleh Gemini - 2026-11-20] Material kaca bersama & instancing terpisah untuk kaca buram dan bening agar draw call tetap hemat (<= 360).
// Surface detail is baked once and shared by all timber, upholstery and brushed parts.
function officeSurfaceTile(){
 const n=512, pixels=new Uint8Array(n*n*4);
 let seed=87413;
 function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
 const field=new Float32Array(32*32);
 for(let i=0;i<field.length;i++)field[i]=random();
 const noise=(x,y)=>{
  const i=Math.floor(x),j=Math.floor(y);
  let u=x-i,v=y-j;u=u*u*(3-2*u);v=v*v*(3-2*v);
  const at=(a,b)=>field[(b&31)*32+(a&31)];
  return (at(i,j)*(1-u)+at(i+1,j)*u)*(1-v)+(at(i,j+1)*(1-u)+at(i+1,j+1)*u)*v;
 };
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=x/n,v=y/n,r=random(),coarse=noise(u*3,v*17);
  const bend=.8*Math.sin(u*6.283)+.47*Math.sin(u*12.566+v*6.283);
  const ring=.5+.5*Math.sin(6.283*(v*29+bend+.16*coarse));
  const fiber=.5+.5*Math.sin(6.283*(v*107+bend*2+.31*coarse));
  const k=(y*n+x)*4;
  pixels[k]=255*(.22+.32*coarse+.18*ring+.16*fiber+.11*r);
  pixels[k+1]=255*(.36+.30*(.5+.5*Math.cos(x*Math.PI/3)*Math.sin(y*Math.PI/4))+.22*r);
  pixels[k+2]=255*(.44+.23*fiber+.18*r);pixels[k+3]=255;
 }
 const tex=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.generateMipmaps=true;
 tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.anisotropy=4;tex.needsUpdate=true;
 return tex;
}
const officeSurfaceMap=officeSurfaceTile();
const plainPart=new THREE.MeshLambertMaterial({color:0xffffff});
const officeFinishes=new Map();
function surfaceMaterial(kind){
 if(!kind)return plainPart;
 if(officeFinishes.has(kind))return officeFinishes.get(kind);
 const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:({oak:.57,fabric:.92,metal:.41,leaf:.59})[kind],metalness:kind==='metal'?.35:0});
 const channel=({oak:'r',fabric:'g',metal:'b',leaf:'r'})[kind];
 mat.customProgramCacheKey=()=>'office-finish-'+kind;
 mat.onBeforeCompile=shader=>{
  shader.uniforms.officeTile={value:officeSurfaceMap};
  shader.vertexShader='varying vec2 vGrain;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec3 extent=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
   vec3 p=(position+vec3(.5))*extent;
   vec2 grain=abs(normal.y)>.56?p.xz:abs(normal.x)>.65?p.zy:p.xy;
   vGrain=grain*vec2(.46,.74)+fract(instanceMatrix[3].xz*vec2(.381,.293));
  `);
  shader.fragmentShader='uniform sampler2D officeTile;varying vec2 vGrain;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float pores=texture2D(officeTile,vGrain).${channel}-.535;
   diffuseColor.rgb*=1.+pores*${kind==='oak'?'1.1':'.48'};
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+pores*.22,.22,1.);');
 };
 officeFinishes.set(kind,mat);return mat;
}
let roundedOfficeGeo,officeLeafGeo;
function roundedOfficeShape(){
 if(roundedOfficeGeo)return roundedOfficeGeo;
 const geo=new THREE.BoxGeometry(1,1,1,6,6,6),point=new THREE.Vector3(),core=new THREE.Vector3(),normal=new THREE.Vector3();
 const pos=geo.attributes.position,normals=geo.attributes.normal;
 for(let i=0;i<pos.count;i++){
  point.fromBufferAttribute(pos,i);core.copy(point).clampScalar(-.33,.33);
  normal.copy(point).sub(core).normalize();point.copy(core).addScaledVector(normal,.17);
  pos.setXYZ(i,point.x,point.y,point.z);normals.setXYZ(i,normal.x,normal.y,normal.z);
 }
 roundedOfficeGeo=geo;return geo;
}
function officeLeafShape(){
 if(officeLeafGeo)return officeLeafGeo;
 const g=new THREE.BufferGeometry(),v=[],idx=[];
 for(let i=0;i<=8;i++){
  const f=i/8,w=.5*Math.pow(Math.sin(Math.PI*f),.75),lift=.18*Math.sin(f*Math.PI)-.17*f*f;
  v.push(-w,lift,f,0,lift+w*.33,f,w,lift,f);
  if(i<8){const s=i*3;idx.push(s,s+3,s+1,s+1,s+3,s+4,s+1,s+4,s+2,s+2,s+4,s+5);}
 }
 g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();
 officeLeafGeo=g;surfaceMaterial('leaf').side=THREE.DoubleSide;return g;
}
function finishBox(parent,size,position,color,finish,rounded=false){
 const m=voxelBox(parent,size,position,color);
 if(rounded)m.geometry=roundedOfficeShape();
 m.userData.solidFinish=finish;return m;
}

const sharedFrostedGlassMat=new THREE.MeshPhongMaterial({color:0xd9e8ea,transparent:true,opacity:.44,shininess:90,side:THREE.DoubleSide,depthWrite:false});
const sharedClearGlassMat=new THREE.MeshPhongMaterial({color:0xc5dadd,transparent:true,opacity:.20,shininess:80,side:THREE.DoubleSide,depthWrite:false});
const sharedPlaneGeo1=new THREE.PlaneGeometry(1,1);

function addGlassPlane(parent,w,h,x,y,z,kind='clear',rotY=0){
 const m=new THREE.Mesh(sharedPlaneGeo1,kind==='frosted'?sharedFrostedGlassMat:sharedClearGlassMat);
 m.scale.set(w,h,1);m.position.set(x,y,z);m.rotation.y=rotY;m.userData.instanceGlass=kind;m.userData.noHit=true;
 parent.add(m);return m;
}

function makeMonitor(){const g=new THREE.Group();voxelBox(g,[.30,.06,.26],[0,.03,0],0x293745);voxelBox(g,[.08,.30,.08],[0,.19,.02],0x3b4b59);voxelBox(g,[1.03,.65,.10],[0,.59,0],0x263444);voxelBox(g,[.92,.53,.018],[0,.59,.06],0x95c5d4);for(let i=0;i<5;i++)voxelBox(g,[.24+(i%3)*.18,.027,.02],[-.18+(i%2)*.09,.76-i*.085,.075],i%2?0xe2f2e8:0x407d9c);return g;}
// [Diubah oleh Gemini - 2026-11-20] Monitor sekunder voxel penuh (0 draw call tambahan) untuk stasiun dual-monitor Engineering Bay.
function makeStaticMonitor(scale=.82){const g=new THREE.Group();voxelBox(g,[.28,.05,.24],[0,.025,0],0x293745);voxelBox(g,[.07,.28,.07],[0,.17,.01],0x3b4b59);voxelBox(g,[.96,.58,.09],[0,.54,0],0x243240);voxelBox(g,[.86,.48,.02],[0,.54,.05],0x1c2b36);const cols=[0x75c4a8,0xe5bd74,0x86b8e0,0xdf8f74,0xd6e6dc];for(let i=0;i<5;i++)voxelBox(g,[.28+(i%3)*.15,.03,.015],[-.14+(i%2)*.08,.70-i*.08,.065],cols[i%cols.length]);g.scale.setScalar(scale);return g;}
function makeDesk(){const g=new THREE.Group();finishBox(g,[2.75,.16,1.25],[0,1.08,0],0xbc8c5c,'oak');finishBox(g,[2.67,.05,1.19],[0,1.18,0],0xd6ae7a,'oak');for(const x of [-1.13,1.13])for(const z of [-.45,.45])voxelBox(g,[.13,1.04,.13],[x,.52,z],0x53616b);const m=makeMonitor();m.position.set(-.20,1.21,-.27);g.add(m);voxelBox(g,[.72,.04,.27],[-.20,1.22,.34],0x354453);voxelBox(g,[.13,.06,.20],[.38,1.23,.36],0x344553);return g;}
function makeChair(seatColor=0x304458){
 const g=new THREE.Group(),rim=figureTone(seatColor,0xb8c1bf,.17);
 finishBox(g,[.67,.14,.63],[0,.62,0],seatColor,'fabric',true);
 finishBox(g,[.62,.60,.13],[0,1.01,.29],seatColor,'fabric',true).rotation.x=.055;
 finishBox(g,[.51,.13,.09],[0,.89,.19],rim,'fabric',true);
 finishBox(g,[.10,.47,.10],[0,.32,0],0x78878a,'metal',true);
 for(let i=0;i<5;i++){
  const a=i*Math.PI*2/5;
  finishBox(g,[.083,.064,.34],[.15*Math.sin(a),.145,.15*Math.cos(a)],0x596a70,'metal',true).rotation.y=a;
  finishBox(g,[.094,.12,.125],[.30*Math.sin(a),.077,.30*Math.cos(a)],0x343d44,'metal',true);
 }
 for(const side of [-1,1]){
  finishBox(g,[.055,.28,.080],[side*.34,.795,.03],0x53636a,'metal');
  finishBox(g,[.115,.064,.41],[side*.36,.94,0],rim,'fabric',true);
 }
 return g;
}
function makeShelf(){makeShelf.count=(makeShelf.count??-1)+1;const g=new THREE.Group();voxelBox(g,[2.8,2.65,.12],[0,1.35,-.26],0x9a704e);for(const x of [-1.36,1.36])voxelBox(g,[.14,2.8,.64],[x,1.4,0],0x9d744f);for(let r=0;r<4;r++){voxelBox(g,[2.8,.12,.64],[0,.1+r*.86,0],0xc59a6a);if(r<3)for(let i=0;i<10;i++)voxelBox(g,[.16,.40+(i%3)*.10,.37],[-1.14+i*.24,.37+r*.86+(i%3)*.05,.01],[0x506e89,0xc7b38a,0xac6c59,0x789887,0xe6d6ac][(i+r)%5]);}return g;}
function makeWhiteboard(){const g=new THREE.Group();voxelBox(g,[3.6,1.85,.13],[0,0,0],0x8b9a9e);voxelBox(g,[3.42,1.67,.05],[0,0,.10],0xf4f4e7);voxelBox(g,[3.7,.08,.30],[0,-.95,.1],0x9ba8ac);return g;}
function makePlant(s=1){
 const g=new THREE.Group();
 finishBox(g,[.48,.44,.48],[0,.22,0],0xd6c9b5,'fabric',true);
 finishBox(g,[.41,.038,.41],[0,.44,0],0x604b3c,'oak',true);
 finishBox(g,[.044,.82,.044],[0,.84,0],0x706749,'oak');
 for(let i=0;i<17;i++){
  const a=i*2.39996,y=.56+i*.044,r=.34+.041*Math.cos(i*1.33);
  const leaf=finishBox(g,[.14+(i%3)*.025,.44,r],[0,y,0],[0x437055,0x64855c,0x52724e,0x84966a][i%4],'leaf');
  leaf.geometry=officeLeafShape();leaf.rotation.order='YXZ';leaf.rotation.set(-.26-.28*Math.sin(i),a,Math.sin(i*.7)*.15);
 }
 g.scale.setScalar(s);return g;
}
function makeRug(){const g=new THREE.Group();voxelBox(g,[4.15,.035,4.9],[0,.025,0],0x344f70);voxelBox(g,[3.9,.018,4.65],[0,.05,0],0x294363);for(let i=0;i<28;i++){const a=i/28*Math.PI*2;const b=voxelBox(g,[.24,.02,.15],[Math.sin(a)*.85,.065,Math.cos(a)*.85],0x7396bd);b.rotation.y=a;}for(const x of [-.30,.30])voxelBox(g,[.21,.025,.79],[x,.075,0],0x91b4db);voxelBox(g,[.55,.025,.2],[0,.075,0],0x91b4db);return g;}
// [Diubah oleh Gemini - 2026-11-20] Pembuat sekat kaca buram rendah, sofa standar, dispenser air, mesin fotokopi, dan pulau tanaman atrium.
function makeLowDivider(len,h=1.55){
 const g=new THREE.Group();
 voxelBox(g,[len,.08,.14],[0,.04,0],0x8f775c);
 voxelBox(g,[len,.65,.12],[0,.405,0],0xd5dcd4);
 const posts=Math.max(2,Math.ceil(len/2.2)+1);
 for(let i=0;i<posts;i++){const px=-len/2+(len/(posts-1))*i;voxelBox(g,[.09,h,.13],[px,h/2,0],0x3b585c);}
 voxelBox(g,[len+.04,.08,.15],[0,h-.04,0],0x3b585c);
 addGlassPlane(g,Math.max(.1,len-.12),h-.78,0,.73+(h-.78)/2,0,'frosted',0);
 return g;
}
function makeSofa(w=3.6){
 const n=new THREE.Group(),sb=(s,p,c)=>finishBox(n,s,p,c,'fabric',true);
 sb([w,.46,.95],[0,.28,.06],0x6f9486);sb([w,.96,.20],[0,.82,.46],0x52796f);
 for(const dx of [-w/2+.09,w/2-.09])sb([.18,.36,.94],[dx,.70,.06],0x5f8577);
 const cw=(w-.42)/3;for(let i=0;i<3;i++)sb([cw,.15,.70],[-(w-.42)/2+cw/2+i*cw,.60,-.02],0xa3b7a0);
 return n;
}
function makeWaterCooler(){
 const g=new THREE.Group();
 voxelBox(g,[.54,1.08,.54],[0,.54,0],0xebe8dc);
 voxelBox(g,[.44,.38,.05],[0,.74,.26],0x345158);
 voxelBox(g,[.07,.07,.08],[-.10,.82,.30],0xd65d4f);
 voxelBox(g,[.07,.07,.08],[.10,.82,.30],0x4ea3cf);
 voxelBox(g,[.44,.04,.16],[0,.57,.30],0x4a6066);
 voxelBox(g,[.36,.52,.36],[0,1.34,0],0x7bc0dc);
 voxelBox(g,[.16,.10,.16],[0,1.62,0],0x4a8da8);
 voxelBox(g,[.11,.28,.11],[.32,.86,.08],0xf4f1e6);
 return g;
}
function makePhotocopier(){
 const g=new THREE.Group();
 voxelBox(g,[1.26,.78,.74],[0,.39,0],0x688078);
 voxelBox(g,[1.18,.44,.70],[0,1.00,0],0xe8e4d3);
 voxelBox(g,[1.02,.08,.58],[0,1.25,0],0x304950);
 voxelBox(g,[.36,.07,.24],[.34,1.26,.22],0x75b5a8);
 voxelBox(g,[.32,.14,.42],[-.38,1.29,0],0xf5f2e8);
 voxelBox(g,[.36,.24,.44],[.38,.28,.39],0xf0eee7);
 return g;
}
function makeAtriumIsland(){
 const g=new THREE.Group();
 // Low warm-oak wooden planter + corner magazine ledges
 voxelBox(g,[1.52,.52,1.52],[0,.26,0],0xb98a5b);
 voxelBox(g,[1.58,.08,1.58],[0,.54,0],0xd6ae7a);
 voxelBox(g,[1.22,.08,1.22],[0,.55,0],0x5c4f3d);
 // Tall lush indoor ficus centerpiece
 voxelBox(g,[.18,1.28,.18],[0,1.16,0],0x7a5b3e);
 for(let i=0;i<11;i++){
  const a=i*2.25,r=i<4?.36:i<8?.28:.14,y=1.22+i*.10;
  voxelBox(g,[.42,.34,.42],[Math.cos(a)*r,y,Math.sin(a)*r],i%3===0?0x467655:i%2?0x688f64:0x52805e);
 }
 // Small corner succulent pots & magazine stacks on wooden rim
 for(const [dx,dz] of [[-.56,-.56],[.56,.56]]){
  voxelBox(g,[.22,.16,.22],[dx,.66,dz],0xe8dec5);
  voxelBox(g,[.16,.14,.16],[dx,.79,dz],0x6e946c);
 }
 for(const [dx,dz,c] of [[.54,-.54,0xd98a5e],[-.54,.54,0x5e8fa8]]){
  voxelBox(g,[.32,.05,.24],[dx,.61,dz],c);
  voxelBox(g,[.28,.04,.22],[dx-.02,.65,dz+.02],0xf4eedc);
 }
 return g;
}

// Satu draw call untuk semua kotak statis; warna per instansi.
const design={inventory:[],screens:[],signs:[],ambient:new THREE.Group(),obstacles:[],leaves:[],steam:[],leds:[],fans:[],windows:[],tokenBits:[],emotes:new Map(),timeMode:'auto',cycle:0};
function batchFurniture(group){
 group.updateMatrixWorld(true);
 const solids=new Map(),extras=[];
 group.traverse(p=>{
  if(!p.isMesh)return;
  if(p.geometry!==voxelGeometry&&!p.userData.solidFinish){extras.push(p);return;}
  const finish=p.userData.solidFinish||'',key=p.geometry.uuid+'|'+finish;
  if(!solids.has(key))solids.set(key,{finish,parts:[]});
  solids.get(key).parts.push(p);
 });
 const result=new THREE.Group();
 for(const {finish,parts} of solids.values()){
  const mesh=new THREE.InstancedMesh(parts[0].geometry,surfaceMaterial(finish),parts.length);
  parts.forEach((p,i)=>{mesh.setMatrixAt(i,p.matrixWorld);mesh.setColorAt(i,p.material.color);design.world?.bind(p,mesh,i);});
  mesh.castShadow=true;mesh.receiveShadow=true;result.add(mesh);
 }
 // [Diubah oleh Gemini - 2026-11-20] Pisahkan instancing kaca per jenis ('frosted' vs 'clear') agar masing-masing 1 draw call.
 const glassByKind=new Map();
 for(const p of extras){
  if(!p.userData.instanceGlass)continue;
  const k=typeof p.userData.instanceGlass==='string'?p.userData.instanceGlass:'clear';
  if(!glassByKind.has(k))glassByKind.set(k,[]);
  glassByKind.get(k).push(p);
 }
 for(const list of glassByKind.values()){
  const gm=new THREE.InstancedMesh(list[0].geometry,list[0].material,list.length);
  list.forEach((p,i)=>{gm.setMatrixAt(i,p.matrixWorld);design.world?.bind(p,gm,i);});
  gm.instanceMatrix.needsUpdate=true;result.add(gm);
 }
 for(const p of extras.filter(p=>!p.userData.instanceGlass)){
  const m=p.clone();m.matrix.copy(p.matrixWorld);m.matrixAutoUpdate=false;
  if(p.userData.billboard&&Math.abs(p.rotation.x)<.1){m.matrix.decompose(m.position,m.quaternion,m.scale);m.matrixAutoUpdate=true;(design.billboards ||= []).push(m);}
  design.world?.bind(p,m);result.add(m);
 }
 return result;
}
function recordProp(type,x,z,w=.3,d=.3,meta={}){design.inventory.push({type,x,z,w,d,...meta});}
// Footprint mengikuti geometri dunia, termasuk kanopi dan rotasi rak.
function furnitureBounds(group){group.updateWorldMatrix(true,true);const b=new THREE.Box3().setFromObject(group);return{x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,w:b.max.x-b.min.x,d:b.max.z-b.min.z,y:b.min.y,h:b.max.y-b.min.y};}
function designCanvas(w=512,h=256){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=I18n.canvas(canvas.getContext('2d')),texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;return{canvas,ctx,texture};}
function designPlane(parent,w,h,x,y,z,draw){const c=designCanvas();const redraw=()=>{c.ctx.setTransform(1,0,0,1,0,0);I18n.begin(c.ctx);c.ctx.clearRect(0,0,512,256);c.ctx.save();draw(c.ctx,512,256);c.ctx.restore();c.texture.needsUpdate=true;};redraw();const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:c.texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));mesh.position.set(x,y,z);parent.add(mesh);const result={...c,mesh,redraw};(design.textSurfaces||=[]).push(result);return result;}
function sign(parent,text,x,y,z,w=2,color='#edc580',rotY=0,bg='#263e44'){
 const result=designPlane(parent,w,w*.26,x,y,z,(c,W,H)=>{c.scale(1,2);H/=2;c.fillStyle=bg;c.fillRect(0,0,W,H);c.strokeStyle=color;c.lineWidth=6;c.strokeRect(7,7,W-14,H-14);c.fillStyle=color;I18n.draw(c,text,20,14,W-40,H-28,{size:68,min:24,align:'center',valign:'middle',weight:'bold'});});
 result.mesh.rotation.y=rotY;result.mesh.userData.billboard=false;result.mesh.userData.noHit=true;
 design.signs.push({text,x,y,z,w,mesh:result.mesh,canvas:result.canvas});return result;
}
let monitorIndex=0;
makeMonitor=function(){const g=new THREE.Group();voxelBox(g,[.30,.06,.26],[0,.03,0],0x293745);voxelBox(g,[.08,.30,.08],[0,.19,.02],0x3b4b59);voxelBox(g,[1.03,.65,.10],[0,.59,0],0x263444);const screen=designPlane(g,.92,.53,0,.59,.061,()=>{});screen.index=monitorIndex++;screen.deskIndex=screen.index;design.screens.push(screen);return g;};
function detailProp(parent,type,x,y,z,color=0xd8b06c){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);const b=(s,p,c=color)=>voxelBox(g,s,p,c);switch(type){
case 'Mug': b([.19,.24,.19],[0,.12,0],0xf4e5c4);b([.12,.04,.12],[0,.244,0],0x4c3429);b([.09,.13,.06],[.12,.13,0],0xf4e5c4);break;
case 'Paper stack': for(let i=0;i<5;i++)b([.32,.018,.4],[i%2*.018,.015+i*.02,0],0xf0eee7);break;
case 'Notebook': b([.32,.06,.4],[0,.03,0]);b([.03,.07,.4],[-.13,.035,0],0x293745);break;
case 'Desk lamp': b([.22,.04,.22],[0,.02,0],0x263e44);b([.04,.43,.04],[0,.24,0],0x263e44);b([.23,.12,.23],[0,.48,0]);b([.2,.025,.2],[0,.41,0],0xffe4a0);break;
case 'Figurine': b([.18,.08,.18],[0,.04,0],0x263e44);b([.12,.22,.1],[0,.18,0]);b([.19,.17,.16],[0,.38,0],0xe3c49d);break;
case 'Mini cactus': b([.22,.18,.22],[0,.09,0]);b([.10,.34,.1],[0,.34,0],0x4d7e5d);b([.23,.08,.08],[0,.32,0],0x4d7e5d);break;
case 'Water bottle': b([.12,.31,.12],[0,.155,0],0x8ac7c0);b([.09,.05,.09],[0,.335,0],0xf0eee7);break;
case 'Headphones': b([.3,.04,.12],[0,.18,0],0x263444);for(const n of [-1,1])b([.08,.16,.13],[n*.13,.1,0],0x263444);break;
case 'Pen cup': b([.15,.20,.15],[0,.1,0]);for(let i=0;i<3;i++)b([.025,.28,.025],[-.05+i*.04,.23,0],[0x5a9aa8,0xde876c,0xe9c977][i]);break;
case 'Succulent': b([.24,.16,.24],[0,.08,0],0xf0eee7);for(let i=0;i<5;i++){const a=i*1.3;b([.11,.12,.1],[Math.cos(a)*.08,.21,Math.sin(a)*.08],0x7c9d78);}break;
case 'Snack packet': b([.23,.3,.12],[0,.15,0]);b([.16,.10,.013],[0,.17,.07],0xffe4a0);break;
case 'Phone stand': b([.18,.03,.2],[0,.015,0],0x293745);b([.16,.29,.03],[0,.17,-.03],0x293745);b([.13,.23,.01],[0,.18,-.01],0x70b6c6);break;
case 'Desk calendar': b([.3,.23,.09],[0,.115,0],0xf0eee7);for(let i=0;i<4;i++)b([.03,.025,.01],[-.1+i*.065,.1,.05],0xde876c);break;
case 'Tissue box': b([.3,.14,.2],[0,.07,0]);b([.09,.12,.02],[0,.18,0],0xf0eee7);break;
case 'Keyboard':b([.7,.045,.25],[0,.025,0],0x293745);for(let i=0;i<8;i++)b([.05,.01,.18],[-.3+i*.08,.05,0],0x71838c);break;
case 'Mouse':b([.12,.07,.18],[0,.035,0],0x293745);break;
case 'Tablet':b([.38,.035,.28],[0,.02,0],0x293745);b([.32,.01,.22],[0,.043,0],0x70b6c6);break;
case 'Rubik cube':for(let i=0;i<3;i++)for(let j=0;j<3;j++)b([.065,.065,.19],[-.07+i*.07,.04+j*.07,0],[0xde876c,0xe9c977,0x7c9d78][(i+j)%3]);break;
case 'Desk clock': b([.3,.16,.08],[0,.08,0],0x293745);for(let i=0;i<3;i++)b([.04,.07,.01],[-.09+i*.09,.09,.05],0x8ac7c0);break;
case 'Tape dispenser':b([.25,.08,.15],[0,.04,0]);b([.12,.14,.13],[.04,.13,0],0xf0eee7);break;
case 'Stapler':b([.1,.05,.27],[0,.025,0],0x293745);b([.1,.04,.25],[0,.085,-.01]);break;
case 'Envelope':b([.3,.018,.2],[0,.015,0],0xf0eee7);b([.22,.01,.014],[0,.03,0],0xde876c);break;
case 'Sticky pad':b([.18,.04,.18],[0,.02,0],0xe9c977);break;
case 'Desk nameplate':b([.38,.15,.05],[0,.075,0],0x263e44);b([.26,.025,.01],[0,.08,.03],0xe9c977);break;
case 'USB hub':b([.22,.06,.12],[0,.03,0],0x71838c);for(let i=0;i<3;i++)b([.03,.02,.01],[-.07+i*.07,.03,.065],0x293745);break;
case 'Camera':b([.23,.17,.12],[0,.085,0],0x293745);b([.12,.12,.09],[0,.09,.1],0x71838c);break;
case 'Game controller':b([.3,.08,.15],[0,.04,0],0x293745);for(const n of [-1,1])b([.05,.02,.05],[n*.09,.09,0],0xde876c);break;
case 'Hourglass':for(const h of [.03,.31])b([.18,.04,.18],[0,h,0]);b([.07,.23,.07],[0,.17,0],0xe9c977);break;
case 'Trophy':b([.20,.08,.20],[0,.04,0],0x2b3e46);b([.07,.16,.07],[0,.15,0],0xe6be68);b([.22,.20,.18],[0,.31,0],0xf0cb72);for(const n of [-1,1])b([.05,.12,.05],[n*.14,.31,0],0xdcb45c);break;
case 'Wastebasket':b([.32,.36,.32],[0,.18,0],0x3e5159);b([.26,.04,.26],[0,.36,0],0x26343b);b([.14,.08,.14],[.02,.39,-.02],0xf0eee7);break;
case 'Magazines':b([.32,.04,.24],[0,.02,0],0x5c859e);b([.30,.04,.22],[.03,.06,.02],0xd6855c);b([.28,.04,.22],[-.02,.10,-.01],0xf2ecd8);break;
default:b([.24,.2,.2],[0,.1,0]);}
g.userData.detail=true;g.userData.noHit=true;const bounds=furnitureBounds(g);recordProp(type,bounds.x,bounds.z,bounds.w,bounds.d,{y:bounds.y,h:bounds.h,layer:'detail'});return g;}

// [Diubah oleh Gemini - 2026-11-20] Karpet bertema 10 zona + pendaftaran ke layout.rugs untuk audit nol tumpang tindih.
function patternedRug(parent,x,z,w,d,kind=0,borderColor=null,rugsList=null,tag=''){
 const styles=[
  ['#344e5b','#63828c','v'], // 0: dev
  ['#355c68','#d6b97f','d'], // 1: meeting / boss
  ['#9e6547','#e4b67a','s'], // 2: lounge / welcome
  ['#36414b','#758683','h'], // 3: server / filming
  ['#344a5e','#7aa2c4','v'], // 4: engineering
  ['#7c4e43','#e2a67a','v'], // 5: studio pod
  ['#38574c','#88bfa2','v'], // 6: mutu & dokumen
  ['#253b3a','#5ac48d','h'], // 7: mt5
  ['#3b4b3c','#dfb865','v'], // 8: finance
  ['#36565c','#d9b97e','r']  // 9: entrance boulevard runner
 ];
 const [bg,line,pat]=styles[kind]||styles[0];
 const p=designPlane(parent,w,d,x,.056,z,(c,W,H)=>{
  c.fillStyle=bg;c.fillRect(0,0,W,H);
  c.strokeStyle=line;c.lineWidth=3;
  if(pat==='r'){
   c.strokeStyle='#edc580';c.lineWidth=14;c.strokeRect(20,12,W-40,H-24);
   c.strokeStyle='#88b2a8';c.lineWidth=4;c.strokeRect(46,24,W-92,H-48);
  }else{
   for(let i=0;i<24;i++){
    c.beginPath();
    if(pat==='d'){c.moveTo(i*38,0);c.lineTo(i*38-180,H);}
    else if(pat==='h'){c.moveTo(0,i*16);c.lineTo(W,i*16);}
    else if(pat==='s'){c.strokeRect(i*24,0,12,H);continue;}
    else{c.moveTo(i*26,0);c.lineTo(i*26,H);}
    c.stroke();
   }
   c.strokeStyle=borderColor||line;c.lineWidth=11;c.strokeRect(12,12,W-24,H-24);
  }
 });
 p.mesh.rotation.x=-Math.PI/2;p.mesh.userData.noHit=true;
 recordProp(['Dev woven rug','Meeting diagonal rug','Lounge striped rug','Server grid mat'][kind%4],x,z,w,d);
 if(rugsList)rugsList.push({name:tag||'rug-'+rugsList.length,x,z,w,d});
 return p;
}

// [Diubah oleh Gemini - 2026-11-20] Slot meja residen V12 (1..8 agen) di Area Inti AI (x: -9..+9, z: -7..+4) dengan lorong >2.2 m mengelilingi Pulau Tanaman Atrium (0, -1.4).
function officeResidentSlots(n){n=Math.max(1,Math.min(8,Math.round(n)||1));
 if(n<=4)return [[-4.4,-4.2],[4.4,-4.2],[-4.4,1.2],[4.4,1.2]].slice(0,n);
 if(n<=6)return [[-4.4,-5.4],[4.4,-5.4],[-4.4,-1.8],[4.4,-1.8],[-4.4,1.8],[4.4,1.8]].slice(0,n);
 return [[-4.4,-6.2],[4.4,-6.2],[-4.4,-2.8],[4.4,-2.8],[-4.4,.6],[4.4,.6],[-4.4,4.0],[4.4,4.0]].slice(0,n);}

function buildOfficeV4(scene) {
 const room=new THREE.Group(), dynamic=new THREE.Group(); scene.add(dynamic);
 const world=design.world=new OfficeWorldObjects();
 // [Diubah oleh Gemini - 2026-11-20] Tambahkan layout.worldBounds & layout.rugs pada kontrak tata letak V12.
 const layout={room,dynamic,world,walls:[],desks:[],projects:[],clicks:[],leds:[],smoke:[],plants:[],rugs:[],inventory:design.inventory,obstacles:design.obstacles,worldBounds:{minX:-28,maxX:24,minZ:-16,maxZ:16}};
 const box=(s,p,c)=>voxelBox(room,s,p,c);
 const prop=(name,x,z,w,d,solid=true)=>{recordProp(name,x,z,w,d);if(solid)design.obstacles.push({x,z,w,d,name});return solid?design.obstacles.at(-1):null;};
 let bookshelfSeq=0,tableSeq=0,chairSeq=0;
 function plant(x,z,s=1,customId=null){
  const g=makePlant(s);g.position.set(x,0,z);room.add(g);const b=furnitureBounds(g);
  const obstacle=prop(I18n.raw('strings.tanaman_pot'),b.x,b.z,b.w,b.d);
  const r=Math.round((Math.max(b.w,b.d)/2+.6)*2)/2;
  world.add(customId||'plant-'+layout.plants.length,I18n.raw('strings.tanaman_pot'),g,{points:[[0,r,0],[r,0,Math.PI/2],[-r,0,-Math.PI/2],[0,-r,Math.PI]],affordances:worldAffords('water'),obstacle,footprint:{w:b.w,d:b.d,ox:b.x-x,oz:b.z-z,h:b.h}});
  layout.plants.push(g);Object.assign(design.inventory.at(-1),b,{layer:'floor'});
 }
 function shelf(x,z,rot=0,customId=null){
  const g=makeShelf();g.position.set(x,0,z);g.rotation.y=rot;room.add(g);const b=furnitureBounds(g);
  const obstacle=prop(I18n.raw('strings.rak_buku_dan_arsip'),b.x,b.z,b.w,b.d);
  world.add(customId||'bookshelf-'+(bookshelfSeq++),I18n.raw('strings.rak_buku_dan_arsip'),g,{points:[[0,1.2,0],[-1,1.2,0],[1,1.2,0]],affordances:worldAffords('read','file_archive'),obstacle,footprint:{w:2.86,d:.64,h:2.8}});
  Object.assign(design.inventory.at(-1),b,{layer:'floor'});
 }
 function table(x,z,w,d,name,color=0xc59a6a,rot=0,customId=null,extraOpts={}){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;room.add(g);
  finishBox(g,[w,.15,d],[0,1.08,0],color,'oak');finishBox(g,[w-.08,.04,d-.08],[0,1.17,0],Math.min(0xffffff,color+0x101010),'oak');
  for(const dx of [-w/2+.17,w/2-.17])for(const dz of [-d/2+.15,d/2-.15])voxelBox(g,[.12,1.02,.12],[dx,.51,dz],0x3f5557);
  const q=Math.abs(Math.sin(rot))>.7,obstacle=prop(name,x,z,q?d:w,q?w:d);
  const id=customId||({'Meja besar bos':'boss-desk','Meja sekretaris':'secretary-desk','Meja arsiparis':'archive-desk','Tenis meja':'pong','Meja lounge':'lounge','Pantry':'pantry'})[name]||'table-'+(tableSeq++);
  const story=['boss-desk','secretary-desk','archive-desk'].includes(id);
  const points=extraOpts.points||(id==='pong'?[[-2.3,0,-Math.PI/2],[2.3,0,Math.PI/2]]:id==='archive-desk'?[[0,1.5,0,'sit'],[-3,1,-Math.PI/2],[-2,1,-Math.PI/2]]:id==='boss-desk'?[[0,1.5,0,'sit'],[2.5,1.5,0]]:id==='secretary-desk'?[[0,1.5,0,'sit'],[2.5,1.5,Math.PI/4]]:id==='lounge'?[[0,1.2,0],[1.5,0,Math.PI/2]]:[]);
  const affordances=extraOpts.affordances||(id==='pong'?worldAffords('play_pong'):id==='lounge'?worldAffords('chat_spot'):story?worldAffords('sit_work','handoff'):{});
  world.add(id,name,g,{points,affordances,obstacle,footprint:{w,d,h:1.19},locked:extraOpts.locked??(story?'story':null)});
  return g;
 }
 function chair(x,z,rot=0,work=false,customId=null,seatColor=0x304458){
  const g=makeChair(seatColor);g.position.set(x,0,z);g.rotation.y=rot;room.add(g);
  prop(I18n.raw('strings.kursi'),x,z,.86,.72,false);
  const aff=worldAffords('sit');if(work)aff.sit.idle=false;
  world.add(customId||'chair-'+(chairSeq++),I18n.raw('strings.kursi'),g,{points:[[0,0,0,'sit']],affordances:aff,footprint:{w:.86,d:.72,h:1.34},soft:true});
  return g;
 }

 // Dinding opak & dinding kaca arsitektural dengan jendela nyata, gorden, sukulen, dan karya seni dinding.
 layout.occluders=[];layout.wallDecor=[];layout.windowCount=0;layout.artworkCount=0;
 function partition(x,z,w,d,axis,normal,opts={}){
  const length=axis==='z'?w:d, exterior=Math.abs(x)===24||Math.abs(z)===16;
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=axis==='x'?Math.PI/2:0;
  const wall={group:null,axis,normal,x,z,length,height:3.8,boxes:[],exterior,material:{opacity:1},frame:{opacity:1}};
  const b=(s,p,c)=>voxelBox(g,s,p,c);
  const solid=(a,bottom,span,height)=>{
   b([span,height,.26],[a,bottom+height/2,0],exterior?0xe4decb:0xcbd6c8);
   const cx=x+(axis==='z'?a:0),cz=z+(axis==='x'?-a:0),sx=axis==='z'?span:.26,sz=axis==='x'?span:.26;
   const bounds=new THREE.Box3(new THREE.Vector3(cx-sx/2,bottom,cz-sz/2),new THREE.Vector3(cx+sx/2,bottom+height,cz+sz/2));
   wall.boxes.push(bounds);layout.occluders.push({box:bounds,wall});
  };
  if(opts.glassWall){
   solid(0,0,length,.95);solid(0,3.25,length,.55);
   for(const face of [-1,1])b([length,.16,.07],[0,.10,face*.15],0x9d805f);
   b([length+.06,.12,.36],[0,3.80,0],0xc5b99f);
   b([length,.10,.26],[0,.98,0],0x456266);b([length,.10,.26],[0,3.22,0],0x456266);
   const mullions=Math.max(2,Math.ceil(length/2.4)+1);
   for(let i=0;i<mullions;i++){const mx=-length/2+(length/(mullions-1))*i;b([.10,2.28,.20],[mx,2.10,0],0x456266);}
   addGlassPlane(g,Math.max(.2,length-.16),2.16,0,2.10,0,'clear',0);
   wall.group=batchFurniture(g);scene.add(wall.group);layout.walls.push(wall);
   prop(I18n.raw('objects.innerWall'),x,z,w,d);return;
  }
  const count=Math.max(1,Math.round(length/4.4)),step=length/count,side=exterior?-normal:1;
  const clean=opts.cleanRange||null;
  const inClean=(a)=>{if(!clean)return false;const wc=axis==='z'?(x+a):(z-a);return Array.isArray(clean[0])?clean.some(([lo,hi])=>wc>=lo&&wc<=hi):wc>=clean[0]&&wc<=clean[1];};
  function artwork(a,face,index){
   if(opts.noArt||inClean(a))return;
   const types=[I18n.raw("objects.sunsetArt"),I18n.raw("objects.morningHills"),I18n.raw("objects.teamPoster"),I18n.raw("objects.circleArt"),I18n.raw("objects.lake"),I18n.raw("objects.ideaPoster"),I18n.raw("objects.garden"),I18n.raw("objects.mountains"),I18n.raw("objects.calendar"),I18n.raw("objects.mirror"),I18n.raw("objects.noticeBoard"),I18n.raw("objects.wallClock"),I18n.raw("objects.wallShelf"),I18n.raw("objects.hangingPlant"),I18n.raw("objects.wallLamp"),I18n.raw("objects.zoneSign")];
   const type=types[index%16],yy=2.25,zz=face*.18;
   const art=designPlane(g,1.25,1.05,a,yy,zz,(c,W,H)=>{
    c.fillStyle=['#f1dfb9','#d5e3d7','#264c51','#d7b397'][index%4];c.fillRect(0,0,W,H);c.strokeStyle='#966e49';c.lineWidth=22;c.strokeRect(10,10,W-20,H-20);const kind=index%16;
    if(kind===8){c.fillStyle='#334f50';c.font='bold 36px sans-serif';c.fillText(I18n.raw('strings.november'),55,64);for(let j=0;j<28;j++){c.font='21px sans-serif';c.fillText(String(j+1),65+j%7*57,105+Math.floor(j/7)*33);}}
    else if(kind===9){const gr=c.createLinearGradient(0,0,W,H);gr.addColorStop(0,'#aec9c6');gr.addColorStop(.5,'#f3f5e6');gr.addColorStop(1,'#739a9d');c.fillStyle=gr;c.fillRect(28,28,W-56,H-56);c.strokeStyle='#fff9df';c.lineWidth=7;c.beginPath();c.moveTo(70,205);c.lineTo(280,40);c.stroke();}
    else if(kind===10){c.fillStyle='#aa855e';c.fillRect(25,25,W-50,H-50);for(let j=0;j<6;j++){c.fillStyle=['#f5e7ad','#d4e7d6','#d9b99d'][j%3];c.fillRect(45+j%3*150,50+Math.floor(j/3)*90,110,66);}}
    else if(kind===11){c.fillStyle='#fff4d8';c.beginPath();c.arc(256,128,100,0,7);c.fill();c.strokeStyle='#355c58';c.lineWidth=9;for(let j=0;j<12;j++){const an=j*Math.PI/6;c.beginPath();c.moveTo(256+Math.sin(an)*80,128+Math.cos(an)*80);c.lineTo(256+Math.sin(an)*90,128+Math.cos(an)*90);c.stroke();}c.beginPath();c.moveTo(210,80);c.lineTo(256,128);c.lineTo(320,128);c.stroke();}
    else if(kind===2||kind===5||kind===15){c.fillStyle='#e6bd7b';c.font='bold 47px sans-serif';c.textAlign='center';c.fillText(kind===2?I18n.raw("strings.satu_tim"):kind===5?I18n.raw("strings.catatan_tim"):'Office AI',256,110);c.font='29px sans-serif';c.fillText(kind===2?I18n.raw("strings.tumbuh_bersama"):kind===5?I18n.raw("strings.ruang_ide"):I18n.raw('strings.ruang_berkarya'),256,168);}
    else if([1,4,6,7].includes(kind)){c.fillStyle='#d5ae6d';c.beginPath();c.arc(370,75,33,0,7);c.fill();for(let j=0;j<3;j++){c.fillStyle=['#8aa490','#547c75','#355b62'][j];c.beginPath();c.moveTo(20,236);c.lineTo(20,150+j*22);c.lineTo(125+j*75,65+j*30);c.lineTo(310,175-j*10);c.lineTo(492,110+j*40);c.lineTo(492,236);c.fill();}if(kind===4){c.fillStyle='#a5c5c3';c.fillRect(25,184,462,43);}}
    else {for(let j=0;j<5;j++){c.fillStyle=['#d3a16c','#688f83','#314f59','#b57160','#e9d6a9'][(j+index)%5];c.beginPath();c.arc(85+j*84,80+(j%2)*80,40+(index+j)%4*8,0,7);c.fill();}}
   });art.mesh.rotation.y=face===1?0:Math.PI;
   for(const yy2 of [yy-.56,yy+.56])b([1.36,.07,.09],[a,yy2,zz],0x9e7953);for(const xx of [-.68,.68])b([.07,1.18,.09],[a+xx,yy,zz],0x9e7953);
   if(index%16===12){b([1.5,.1,.48],[a,1.68,face*.35],0x9c7954);for(let j=0;j<5;j++)b([.14,.36,.26],[a-.45+j*.22,1.91,face*.35],[0x79977b,0xd5b486,0x925f55][j%3]);}
   if(index%16===13){b([.03,.6,.03],[a,2.97,face*.33],0x8a7351);b([.38,.27,.34],[a,2.62,face*.33],0xc49b6d);for(let j=0;j<7;j++)b([.19,.22,.18],[a+Math.sin(j)*.22,2.46-j*.09,face*.35],j%2?0x658761:0x8da675);}
   if(index%16===14){b([.18,.38,.2],[a,2.4,face*.34],0x6f6c54);b([.52,.28,.36],[a,2.65,face*.36],0xffdaa1);}
   layout.wallDecor.push({type,x,z,position:a,side:face});
  }
  for(let i=0;i<count;i++){
   const a=-length/2+step*(i+.5),allowWin=opts.windows!==false,windowSlot=allowWin&&!inClean(a)&&step>=2.4&&(exterior?i%2===0:i%3===1),ww=Math.min(1.95,step-.72);
   if(windowSlot){
    solid(a,0,step,1.55);solid(a,2.9,step,.9);
    solid(a-step/2+(step-ww)/4,1.55,(step-ww)/2,1.35);solid(a+step/2-(step-ww)/4,1.55,(step-ww)/2,1.35);
    for(const yy of [1.55,2.9])b([ww+.18,.11,.4],[a,yy,0],0xf4eddb);for(const xx of [-ww/2,0,ww/2])b([.085,1.35,.32],[a+xx,2.225,0],0xf4eddb);
    addGlassPlane(g,ww,1.28,a,2.22,0,'clear',0);
    for(const face of exterior?[side]:[1,-1]){
     b([ww+.32,.12,.60],[a,1.52,face*.16],0xba956d);b([ww+.32,.12,.14],[a,3.02,face*.22],0x96714e);
     for(const xx of [-ww/2+.1,ww/2-.1]){b([.2,1.2,.12],[a+xx,2.36,face*.23],0xc8b793);for(let j=0;j<3;j++)b([.025,1.2,.025],[a+xx-.07+j*.065,2.36,face*.3],0xefe0bb);}
     detailProp(g,'Succulent',a+.48,1.59,face*.25);for(let j=0;j<3;j++)b([ww-.4,.025,.06],[a,2.72-j*.12,face*.19],0xd3c7ac);
    }
    layout.windowCount++;
   }else{
    solid(a,0,step,3.8);
    if(i%2===1||!exterior)artwork(a,side,layout.artworkCount++);
    if(!exterior&&i%2===0)artwork(a,-side,layout.artworkCount++);
    if(exterior&&!inClean(a)){
     const face=-side;b([.2,.5,.16],[a,2.3,face*.2],0x64756a);b([.42,.38,.28],[a,2.45,face*.32],0xffd294);b([.5,.08,.34],[a,2.68,face*.32],0x697b70);
     layout.wallDecor.push({type:I18n.raw("objects.facadeLamp"),x,z,position:a,side:face});
    }
   }
  }
  for(const face of [-1,1]){b([length,.17,.08],[0,.12,face*.16],0x9d805f);b([length,.13,.09],[0,3.6,face*.17],0xf5ecda);}
  b([length+.08,.13,.38],[0,3.8,0],0xc5b99f);
  wall.group=batchFurniture(g);scene.add(wall.group);layout.walls.push(wall);
  prop(exterior?I18n.raw("objects.outerWall"):I18n.raw("objects.innerWall"),x,z,w,d);
 }

 function doorPortal(x,z,width,axis='z',exterior=false){
  const g=new THREE.Group();g.position.set(x,0,z);if(axis==='x')g.rotation.y=Math.PI/2;
  const wall={group:null,axis,normal:1,x,z,length:width,height:3.8,boxes:[],exterior,material:{opacity:1},frame:{opacity:1}};
  const part=(cx,cy,ww,hh,color)=>{
   voxelBox(g,[ww,hh,.28],[cx,cy,0],color);
   const wx=x+(axis==='z'?cx:0),wz=z+(axis==='x'?-cx:0),sx=axis==='z'?ww:.28,sz=axis==='x'?ww:.28;
   const bounds=new THREE.Box3(new THREE.Vector3(wx-sx/2,cy-hh/2,wz-sz/2),new THREE.Vector3(wx+sx/2,cy+hh/2,wz+sz/2));
   wall.boxes.push(bounds);layout.occluders.push({box:bounds,wall});
  };
  part(0,3.46,width,.68,exterior?0xe4decb:0xcbd6c8);
  for(const dx of [-width/2,width/2])part(dx,1.57,.12,3.14,exterior?0x486d65:0x9d805f);
  part(0,3.12,width+.16,.14,exterior?0x486d65:0x9d805f);
  voxelBox(g,[width+.08,.13,.38],[0,3.80,0],0xc5b99f);
  if(!exterior){voxelBox(g,[.72,2.82,.10],[-width/2-.42,1.41,-.22],0xa77b52);voxelBox(g,[.06,.12,.12],[-width/2-.68,1.4,-.3],0xe8c78a);}
  wall.group=batchFurniture(g);scene.add(wall.group);layout.walls.push(wall);
 }

 // ==========================================================================
 // 1. FONDASI & LANTAI PARKET KAYU HANGAT (48x32 m + TERAS BARAT 4x15 m)
 // ==========================================================================
 box([48.6,.44,32.6],[0,-.26,0],0x8c9b91);
 box([4.3,.44,15.4],[-26.05,-.26,7.5],0x8c9b91);
 const plankCols=[0xcda574,0xd5b084,0xc7a071,0xd9b68a];
 for(let row=0;row<64;row++){
  const shift=(row%3)*.67;
  for(let col=-1;col<24;col++){
   const left=Math.max(-24,-24+col*2+shift),right=Math.min(24,-22+col*2+shift);
   if(right-left<.035)continue;
   finishBox(room,[right-left-.015,.07,.488],[(left+right)/2,.005,-15.75+row*.5],plankCols[(row*7+(col+1)*3)%4],'oak');
  }
 }
 for(let row=0;row<30;row++)finishBox(room,[4,.07,.488],[-26,.005,.25+row*.5],row%2?0xa68c70:0xb19b7d,'oak');

 // ==========================================================================
 // 2. DINDING LUAR & PORTAL PINTU (48 x 32 m)
 // ==========================================================================
 partition(0,-16,48,.12,'z',-1,{cleanRange:[[-12.2,-4.0],[13.5,22.0]]});
 partition(24,0,.12,32,'x',1,{cleanRange:[-6.0,15.2]});
 partition(-13.1,16,21.8,.12,'z',1,{cleanRange:[-23.5,-11.2]});
 partition(13.1,16,21.8,.12,'z',1);
 doorPortal(0,16,4.4,'z',true);
 partition(-24,-5.6,.12,20.8,'x',-1,{cleanRange:[-1.5,4.5]});
 partition(-24,12.1,.12,7.8,'x',-1,{windows:false,noArt:true});
 doorPortal(-24,6.5,3.4,'x',true);

 // ==========================================================================
 // 3. BARIS UTARA (z: -16..-8) — BOS, LOBBY KANBAN + LOUNGE #2, RAPAT, VAULT
 // ==========================================================================
 // 3a. Ruang Bos (x: -24..-13, z: -16..-8)
 partition(-13,-12,.12,8,'x',1,{windows:false,cleanRange:[-12.5,-8.5]});
 partition(-23,-8,2,.12,'z',1,{windows:false,noArt:true});
 partition(-16.25,-8,6.5,.12,'z',1,{windows:true});
 doorPortal(-20.75,-8,2.5,'z',false);
 patternedRug(room,-18.5,-12.0,8.8,5.2,1,null,layout.rugs,'boss');
 table(-18.5,-12.5,4.6,1.6,I18n.raw('strings.meja_besar_bos'),0xbc8c5c,0,'boss-desk');
 {const c=chair(-18.5,-11.0,0,true,'boss-chair',0x2f4856).userData.worldObject;c.locked='story';layout.bossChairId=c.id;}
 layout.bossSeat={x:-18.5,z:-11.0};
 const tray=voxelBox(room,[1.35,.12,.9],[-17.1,1.24,-12.5],0x334c56);
 for(const dx of [-.66,.66])box([.04,.23,.9],[-17.1+dx,1.37,-12.5],0xc2a166);
 prop(I18n.raw('strings.baki_laporan_masuk'),-17.1,-12.5,1.35,.9,false);
 layout.tray=new THREE.Vector3(-17.1,1.6,-12.5);layout.trayApproach={x:-17.0,z:-11.0};
 layout.clicks.push({kind:'reports',point:layout.tray});
 detailProp(room,'Phone stand',-20.1,1.19,-12.5);detailProp(room,'Desk lamp',-20.4,1.19,-12.85,0xd8b06c);
 detailProp(room,'Pen cup',-19.3,1.19,-12.9,0x5a9aa8);detailProp(room,'Notebook',-18.8,1.19,-12.45,0x355c68);
 detailProp(room,'Desk nameplate',-18.5,1.19,-11.82);detailProp(room,'Hourglass',-17.9,1.19,-12.85,0xe6be68);
 detailProp(room,'Wastebasket',-16.4,.04,-12.7);
 shelf(-18.5,-15.35,0,'bookshelf-0');shelf(-23.35,-12.4,Math.PI/2,'bookshelf-1');
 plant(-22.9,-9.2,1.1,'plant-0');plant(-14.1,-14.9,1.0,'plant-1');
 sign(room,I18n.raw('strings.ruang_bos_2'),-18.5,3.3,-15.72,3.6);

 // 3b. Lobby Utara: Papan Kanban + Sofa Baca + Lounge & Kopi #2 (x: -13..-1, z: -16..-8)
 for(const [i,lx] of [[-10.5,-15.25],[-6.5,-15.25]].entries()){
  box([1.3,.82,.70],[lx[0],.41,lx[1]],0x7c9586);
  detailProp(room,'Paper stack',lx[0]-.28,.83,lx[1]);
  detailProp(room,i===0?'Trophy':'Succulent',lx[0]+.28,.83,lx[1]);
  prop(I18n.raw('objects.lowCabinet'),lx[0],lx[1],1.3,.70);
 }
 shelf(-12.3,-11.5,Math.PI/2,'bookshelf-2');
 // Sofa baca utama menghadap papan Kanban Utara
 patternedRug(room,-9.0,-10.5,4.4,2.6,2,null,layout.rugs,'lobby-sofa');
 {const n=makeSofa(3.6);n.position.set(-9.0,0,-10.5);n.rotation.y=0;room.add(n);recordProp(I18n.raw('objects.readingSofa'),-9.0,-10.5,3.6,1.0);layout.sofaNode=n;}
 // Lounge & Kopi #2 (supaya agen idle tidak berdesakan di Teras Barat)
 patternedRug(room,-3.6,-11.4,4.4,4.8,2,null,layout.rugs,'lounge-2');
 {const n=makeSofa(3.6);n.position.set(-4.8,0,-11.4);n.rotation.y=-Math.PI/2;room.add(n);recordProp(I18n.raw('objects.readingSofa'),-4.8,-11.4,1.0,3.6);layout.sofa2Node=n;}
 const lounge=table(-3.0,-11.4,2.2,1.0,I18n.raw('strings.meja_lounge'),0xc59a6a,Math.PI/2,'lounge');
 detailProp(lounge,'Magazines',-.45,1.19,0);detailProp(lounge,'Mug',.35,1.19,.12);detailProp(lounge,'Mug',.65,1.19,-.15);
 // Meja Bar Kopi #2 + Mesin Kopi #2 (coffee-2)
 const bar2=table(-3.4,-15.1,3.0,.95,I18n.raw('strings.pantry_2'),0xbc8c5c,0,'coffee-bar-2');
 const coffee2=new THREE.Group();coffee2.position.set(-4.1,0,-15.1);room.add(coffee2);
 voxelBox(coffee2,[.78,.80,.60],[0,1.58,0],0x283b43);voxelBox(coffee2,[.48,.18,.06],[0,1.72,.33],0x8cbeb1);
 voxelBox(coffee2,[.78,1.17,.60],[0,.585,0],0xbc8c5c);
 prop(I18n.raw('strings.mesin_kopi'),-4.1,-15.1,.78,.60,false);
 world.add('coffee-2',I18n.raw('strings.mesin_kopi'),coffee2,{points:[[.1,1.1,0]],affordances:worldAffords('coffee'),footprint:{w:.78,d:.60,h:1.98},on:'coffee-bar-2'});
 for(let m=0;m<3;m++)detailProp(bar2,'Mug',.05+m*.42,1.19,.12);
 detailProp(bar2,'Snack packet',1.25,1.19,-.12,0xd99061);
 sign(room,I18n.raw('v12.world.lounge2Sign'),-3.4,3.3,-15.72,3.4);
 plant(-12.1,-14.8,1.0,'plant-2');

 // Sekretaris di bawah Ruang Bos (-16.5, -5.5)
 table(-16.5,-5.5,3.6,1.2,I18n.raw('strings.meja_sekretaris'),0x6b9186,0,'secretary-desk');
 chair(-16.5,-4.0,0,true,'secretary-chair',0x3b585c).userData.worldObject.locked='story';
 layout.secretarySeat={x:-16.5,z:-4.0};
 detailProp(room,'Phone stand',-17.7,1.19,-5.5);detailProp(room,'Paper stack',-15.1,1.19,-5.6);
 detailProp(room,'Mug',-17.2,1.19,-5.2);detailProp(room,'Pen cup',-14.9,1.19,-5.2,0xd6855c);
 detailProp(room,'Desk calendar',-16.1,1.19,-5.8);detailProp(room,'Sticky pad',-16.6,1.19,-5.1);
 detailProp(room,'Wastebasket',-14.9,.04,-5.7);
 box([.75,.18,.65],[-15.5,1.25,-5.5],0xd2ac70);
 sign(room,I18n.raw('strings.tugas_masuk'),-16.5,1.55,-4.88,1.7);
 // Gantungan jas, tempat payung & tanaman di koridor barat
 box([.5,.08,.5],[-23.2,.08,-6.5],0x435e55);box([.06,1.9,.06],[-23.2,1,-6.5],0x9b7959);box([.8,.06,.06],[-23.2,1.85,-6.5],0x9b7959);
 prop(I18n.raw("objects.coatRack"),-23.2,-6.5,.8,.5);
 for(const dx of [-.22,.22]){box([.22,.65,.18],[-23.2+dx,1.42,-6.5],dx<0?0x6f9388:0xb68a6b);prop(I18n.raw("objects.coat"),-23.2+dx,-6.5,.22,.18,false);}
 box([.45,.55,.45],[-23.2,.275,-5.0],0x597a6b);
 for(let i=0;i<3;i++){box([.04,1.15,.04],[-23.34+i*.14,.8,-5.0],0xd2b687);box([.09,.5,.09],[-23.34+i*.14,.85,-5.0],0x8ba7b0);}
 prop(I18n.raw("objects.umbrella"),-23.2,-5.0,.45,.45);
 plant(-22.8,-4.1,1.0,'plant-3');

 // 3c. Ruang Rapat Kaca (x: -1..+12, z: -16..-8)
 partition(-1,-12,.12,8,'x',-1,{windows:false,cleanRange:[-15.5,-8.5]});
 partition(12,-12,.12,8,'x',1,{windows:false,noArt:true});
 partition(1.5,-8,5.0,.12,'z',1,{glassWall:true});
 partition(9.5,-8,5.0,.12,'z',1,{glassWall:true});
 doorPortal(5.5,-8,3.0,'z',false);
 patternedRug(room,5.5,-12.0,9.6,5.4,1,null,layout.rugs,'meeting');
 const meetTbl=table(5.5,-12.0,5.8,1.8,I18n.raw('strings.meja_rapat'),0xc59a6a,0,'meeting-table');
 let meetChairIdx=0;
 for(const cx of [3.5,5.5,7.5]){
  chair(cx,-13.5,Math.PI,false,'chair-meet-'+(meetChairIdx++),0x344f63);
  chair(cx,-10.5,0,false,'chair-meet-'+(meetChairIdx++),0x344f63);
  detailProp(meetTbl,'Notebook',cx-5.5,1.19,-.45,[0x52796f,0xd8a85c,0x5a84a8][meetChairIdx%3]);
  detailProp(meetTbl,'Notebook',cx-5.5,1.19,.45,[0xa86b5a,0x5a84a8,0x52796f][meetChairIdx%3]);
 }
 detailProp(meetTbl,'Water bottle',-1.4,1.19,0);detailProp(meetTbl,'Water bottle',1.4,1.19,0);
 detailProp(meetTbl,'Tissue box',0,1.19,0,0xe8dec5);
 // Papan presentasi di dinding barat Ruang Rapat
 const meetBoard=designPlane(room,3.8,1.75,-.72,2.25,-12.0,(c,W,H)=>{
  c.fillStyle='#f5f4e8';c.fillRect(0,0,W,H);c.strokeStyle='#6c8588';c.lineWidth=10;c.strokeRect(6,6,W-12,H-12);
  c.fillStyle='#24454c';I18n.draw(c,I18n.raw('strings.ruang_rapat'),24,18,W-48,40,{size:30,min:16,weight:'bold'});
  const cols=['#d99061','#548a6e','#669ac8','#a28ac4','#398a63'];
  cols.forEach((col,i)=>{c.fillStyle=col;c.fillRect(24+i*95,92,82,58);c.fillStyle='#ffffff';c.fillRect(36+i*95,112,58,8);c.fillRect(36+i*95,128,40,6);});
  c.strokeStyle='#8ca2a6';c.lineWidth=4;c.beginPath();c.moveTo(24,186);c.lineTo(W-24,186);c.stroke();
  for(let i=0;i<4;i++){c.fillStyle='#4e6b70';c.fillRect(24+i*116,204,88,12);}
 });
 meetBoard.mesh.rotation.y=Math.PI/2;meetBoard.mesh.userData.noHit=true;
 sign(room,I18n.raw('strings.ruang_rapat'),5.5,3.3,-15.72,3.6);
 plant(.3,-14.8,1.0,'plant-4');plant(10.7,-14.8,1.0,'plant-5');

 // 3d. Obsidian Vault & Server (x: +12..+24, z: -16..-8)
 partition(12.75,-8,1.5,.12,'z',1,{windows:false,noArt:true});
 partition(20.0,-8,8.0,.12,'z',1,{glassWall:true});
 doorPortal(14.75,-8,2.5,'z',false);
 patternedRug(room,18.2,-12.0,9.8,6.2,3,null,layout.rugs,'vault');
 for(const sx of [14.5,16.5,18.5,20.5]){
  box([1.3,2.8,1],[sx,1.4,-14.6],0x273f48);
  for(let j=0;j<7;j++){
   box([1.15,.26,.05],[sx,.3+j*.35,-14.07],0x506872);
   const led=voxelBox(dynamic,[.07,.05,.04],[sx-.43,.3+j*.35,-14.02],0x7be3ae);
   layout.leds.push(led);
   box([.6,.03,.03],[sx+.1,.3+j*.35,-14.03],0x243941);
  }
  prop(I18n.raw("objects.obsidianRack"),sx,-14.55,1.3,1.1);
 }
 sign(room,I18n.raw('messages.obsidianVault'),18.0,3.3,-15.72,4.6);
 layout.server=new THREE.Vector3(17.5,1.5,-14.0);
 layout.clicks.push({kind:'server',point:layout.server});
 table(19.5,-10.5,3.0,1.0,I18n.raw('strings.meja_arsiparis'),0xc59a6a,0,'archive-desk');
 chair(19.5,-9.0,0,true,'archive-chair',0x3b585c).userData.worldObject.locked='story';
 layout.archivistSeat={x:19.5,z:-9.0};
 detailProp(room,'Paper stack',18.7,1.19,-10.5);detailProp(room,'Stapler',19.5,1.19,-10.5,0x9f6a50);
 detailProp(room,'Pen cup',20.5,1.19,-10.5,0x789782);detailProp(room,'Desk lamp',20.7,1.19,-10.8,0xd6ae7a);
 detailProp(room,'Wastebasket',20.7,.04,-10.7);
 box([.22,.25,.22],[20.2,1.32,-10.5],0x9f6a50);prop(I18n.raw("objects.stamp"),20.2,-10.5,.22,.22,false);
 box([.8,2.2,2.0],[23.2,1.1,-11.5],0x7d9189);
 for(let i=0;i<5;i++)box([.05,.06,1.7],[22.78,.3+i*.42,-11.5],0xd2b98c);
 prop(I18n.raw("objects.archiveCabinet"),23.2,-11.5,.8,2.0);
 // Printer bersama #1 di dalam Vault (dekat pintu masuk Vault)
 {
  const pn=new THREE.Group();pn.position.set(13.5,0,-11.5);room.add(pn);
  voxelBox(pn,[1.2,.96,.90],[0,.48,0],0xb8966e);
  voxelBox(pn,[.90,.45,.70],[0,1.18,0],0xe8e4d3);
  voxelBox(pn,[.70,.06,.55],[0,1.42,0],0x304950);
  const pObs=prop(I18n.raw('objects.sharedPrinter'),13.5,-11.5,1.2,.9);
  world.add('printer',I18n.raw('strings.printer'),pn,{points:[[1.5,0,Math.PI/2]],affordances:worldAffords('print'),obstacle:pObs,footprint:{w:1.2,d:.9,h:1.48}});
 }
 // Papan Laporan Harian di koridor selatan Vault menghadap +Z (titik berdiri 20.0, -6.0 bebas halangan)
 layout.board=designPlane(room,2.8,1.28,20.0,2.25,-7.75,(c)=>{
  c.fillStyle='#243f47';c.fillRect(0,0,512,256);c.strokeStyle='#edc580';c.lineWidth=6;c.strokeRect(5,5,502,246);
  c.fillStyle='#ebc983';c.font='bold 34px sans-serif';c.fillText(I18n.raw('strings.laporan_harian'),20,48);
  c.font='24px sans-serif';c.fillStyle='#f5eddb';c.fillText(I18n.raw('strings.token_provider_7_hari'),20,105);
  c.fillText(I18n.raw('strings.ringkasan_lokal'),20,155);
  for(let i=0;i<7;i++){c.fillStyle=i===6?'#76d39c':'#e5c073';c.fillRect(24+i*64,226-i%3*16,38,12+i%3*16);}
 });
 layout.board.mesh.rotation.y=0;
 layout.clicks.push({kind:'daily',point:new THREE.Vector3(20.0,2.25,-7.75)});
 // Jam dinding koridor utara (12.75, -7.75)
 const clock=designPlane(room,1.0,1.0,12.75,2.5,-7.75,(c)=>{
  c.fillStyle='#f5e9cb';c.fillRect(0,0,512,256);c.strokeStyle='#36574f';c.lineWidth=14;c.strokeRect(8,8,496,240);
  c.beginPath();c.moveTo(256,42);c.lineTo(256,130);c.lineTo(355,130);c.stroke();
 });
 clock.mesh.userData.noHit=true;prop(I18n.raw("objects.wallClock"),12.75,-7.75,1.0,.1,false);

 // ==========================================================================
 // 4. ATRIUM TENGAH (x: -10.5..+10.5) — AREA INTI AI + PULAU TANAMAN + 8 MEJA PROYEK
 // ==========================================================================
 // 4a. 8 slot meja residen (aktif 1..8 sesuai roster, default 4 di [-4.4,-4.2],[4.4,-4.2],[-4.4,1.2],[4.4,1.2])
 const residentPalette=[0xd99061,0x548a6e,0x669ac8,0xa28ac4,0xc9a24a,0x5f9ea0,0xc0707a,0x7d8bb5];
 const residentProps=[
  [['Mug',-1.05,.28],['Paper stack',.68,-.30],['Desk lamp',1.12,-.38],['Figurine',-1.02,-.36],['Notebook',.18,.38],['Sticky pad',.88,.34]],
  [['Water bottle',-1.08,.26],['Rubik cube',.72,-.32],['Desk lamp',-1.04,-.38],['Headphones',1.02,.28],['Notebook',.20,.38],['Pen cup',1.12,-.34]],
  [['Mug',-1.06,.28],['Mini cactus',-1.00,-.38],['Tablet',.78,-.26],['Desk clock',1.08,-.38],['Desk calendar',.95,.34],['Pen cup',.42,-.38]],
  [['Water bottle',-1.08,.28],['Hourglass',-1.00,-.36],['Desk lamp',1.12,-.38],['Notebook',.22,.38],['Snack packet',.96,.30],['Succulent',.62,-.36]],
  [['Mug',-1.05,.28],['Game controller',.82,.34],['Desk lamp',-1.04,-.38],['Paper stack',.72,-.30],['Figurine',1.10,-.36],['Sticky pad',.26,.38]],
  [['Water bottle',-1.06,.28],['Phone stand',.98,.30],['Mini cactus',1.10,-.38],['Notebook',.20,.38],['Pen cup',-1.02,-.36],['Stapler',.64,-.34]],
  [['Mug',-1.06,.28],['Camera',.88,-.32],['Desk lamp',1.12,-.38],['Headphones',-1.02,-.36],['Desk calendar',.96,.34],['Notebook',.22,.38]],
  [['Water bottle',-1.08,.26],['Rubik cube',-1.00,-.36],['Desk clock',1.08,-.38],['Tape dispenser',.72,-.32],['Envelope',.95,.34],['Pen cup',.40,-.38]]
 ];
 const residentCount=Math.max(1,Math.min(8,Math.round(Number(globalThis.officeResidentCount))||4));
 const residentSlots=officeResidentSlots(residentCount),parkedSlots=officeResidentSlots(8);
 for(let i=0;i<8;i++){
  const [x,z]=residentSlots[i]||parkedSlots[i],mark=design.inventory.length,state={index:i,name:'',plate:'',color:'#'+new THREE.Color(residentPalette[i]).getHexString()};
  const d=makeDesk();d.position.set(x,0,z);room.add(d);
  const seatChair=chair(x,z+1.25,0,true,'resident-chair-'+i);
  const obstacle=prop(I18n.raw("objects.residentDesk")+(i+1),x,z,2.75,1.25);
  world.add('desk-'+i,I18n.raw('strings.meja_residen'),d,{points:[[0,1.25,0,'sit'],[1.8,1.5,0]],affordances:worldAffords('sit_work'),obstacle,footprint:{w:2.75,d:1.25,h:1.9},locked:'roster'});
  seatChair.userData.worldObject.locked='roster';
  // Karpet meja residen (3.9 x 3.05) — aman tanpa tumpang tindih bahkan saat 8 agen aktif (jarak baris 3.4 m -> celah 0.35 m)
  const rug=designPlane(d,3.9,3.05,0,.056,.55,(c,W,H)=>{c.fillStyle='#344e5b';c.fillRect(0,0,W,H);c.strokeStyle='#63828c';c.lineWidth=3;for(let k=0;k<24;k++){c.beginPath();c.moveTo(k*28,0);c.lineTo(k*28,H);c.stroke();}c.strokeStyle=state.color;c.lineWidth=12;c.strokeRect(12,12,W-24,H-24);});
  rug.mesh.rotation.x=-Math.PI/2;rug.mesh.userData.noHit=true;
  recordProp('Dev woven rug',x,z+.55,3.9,3.05);
  if(i<residentCount)layout.rugs.push({name:'resident-'+i,x,z:z+.55,w:3.9,d:3.05});
  const accent=voxelBox(d,[2.76,.10,.10],[0,1.25,.62],residentPalette[i]);accent.userData.accent=true;
  const plate=designPlane(d,1.2,.312,0,1.4,.66,(c,W,H)=>{c.scale(1,2);H/=2;c.fillStyle='#263e44';c.fillRect(0,0,W,H);c.strokeStyle=state.color;c.lineWidth=8;c.strokeRect(7,7,W-14,H-14);c.fillStyle='#f4e8d0';I18n.draw(c,state.plate||state.name||'·',20,14,W-40,H-28,{size:68,min:26,align:'center',valign:'middle',weight:'bold'});});
  plate.mesh.userData.billboard=false;plate.mesh.userData.noHit=true;
  design.signs.push({get text(){return state.plate||state.name;},x,y:1.4,z:z+.66,w:1.2,mesh:plate.mesh,canvas:plate.canvas,residentSlot:i});
  residentProps[i].forEach(([type,dx,dz])=>detailProp(d,type,dx,1.23,dz,residentPalette[i]));
  detailProp(d,'Wastebasket',1.02,.04,-.34);
  for(const p of design.inventory.slice(mark))p.residentSlot=i;
  layout.desks.push({slot:i,color:residentPalette[i],screen:design.screens.at(-1),chairId:seatChair.userData.worldObject.id,plate,rug,state});
 }

 // 4b. Pulau Tanaman Fokus Atrium Tengah di (0, -1.4) — menyisakan lorong >2.2 m di keempat sisi!
 {
  const island=makeAtriumIsland();island.position.set(0,0,-1.4);room.add(island);
  const obs=prop(I18n.raw('v12.world.atriumIsland'),0,-1.4,1.55,1.55);
  world.add('atrium-island',I18n.raw('v12.world.atriumIsland'),island,{points:[[0,1.4,0],[0,-1.6,Math.PI]],affordances:worldAffords('water'),obstacle:obs,footprint:{w:1.55,d:1.55,h:2.35},locked:'structure'});
 }

 // 4c. 8 Meja Proyek Simetris (P1..P4 kiri, P5..P8 kanan) mengapit koridor masuk tengah
 const projCoords=[[-7.4,8.0],[-3.9,8.0],[-7.4,12.0],[-3.9,12.0],[3.9,8.0],[7.4,8.0],[3.9,12.0],[7.4,12.0]];
 const projProps=[
  [['Desk lamp',1.12,-.36],['Figurine',-1.05,-.34],['Mug',.96,.36],['Sticky pad',.38,.36],['Pen cup',-1.02,.32]],
  [['Mini cactus',-1.04,-.36],['Headphones',.98,.34],['Water bottle',-1.08,.28],['Notebook',.82,-.28],['Desk calendar',1.08,-.36]],
  [['Rubik cube',-1.02,-.34],['Desk clock',1.08,-.36],['Mug',.96,.36],['Paper stack',.76,-.26],['Tape dispenser',-1.04,.30]],
  [['Succulent',-1.02,-.36],['Phone stand',.98,.32],['Desk lamp',1.12,-.36],['Notebook',.78,-.28],['Snack packet',-1.05,.28]],
  [['Figurine',1.08,-.36],['Water bottle',-1.08,.28],['Pen cup',-1.02,-.36],['Hourglass',.82,-.32],['Sticky pad',.96,.36]],
  [['Desk lamp',-1.08,-.36],['Game controller',.96,.34],['Mug',-1.04,.30],['Desk calendar',1.06,-.36],['Stapler',.76,-.28]],
  [['Mini cactus',1.06,-.36],['Tablet',.78,-.28],['Headphones',-1.02,-.34],['Notebook',.95,.34],['Paper stack',-1.04,.28]],
  [['Desk clock',-1.02,-.36],['Succulent',1.06,-.36],['Water bottle',.98,.32],['Rubik cube',-1.04,.30],['Envelope',.78,-.28]]
 ];
 const projAccents=[0x5c8ab5,0x6a9c7e,0xc98a5b,0x8d79b5,0x5b9aa3,0xc7a354,0xb86e77,0x6e85a6];
 for(let i=0;i<8;i++){
  const [x,z]=projCoords[i];
  const d=makeDesk();d.position.set(x,0,z);room.add(d);
  const pc=chair(x,z+1.25,0,true,'project-chair-'+i,0x364c60).userData.worldObject;
  const obstacle=prop(I18n.raw("objects.projectDesk")+(i+1),x,z,2.75,1.25);
  world.add('project-'+i,I18n.raw('strings.meja_proyek'),d,{points:[[0,1.25,0,'sit']],affordances:worldAffords('sit_work'),obstacle,footprint:{w:2.75,d:1.25,h:1.9}});
  pc.follow='project-'+i;pc.locked='follow';
  patternedRug(room,x,z+.45,3.10,2.80,0,null,layout.rugs,'project-'+i);
  projProps[i].forEach(([type,dx,dz])=>detailProp(d,type,dx,1.23,dz,projAccents[i]));
  detailProp(d,'Wastebasket',1.02,.04,-.34);
  sign(d,'P'+(i+1),0,1.4,.66,.72);
  layout.projects.push({x,z,seat:{x,z:z+1.5},screen:design.screens.at(-1)});
 }

 // 4d. Koridor Masuk Utama + Karpet Runner + Keset Selamat Datang (nol tumpang tindih!)
 patternedRug(room,0,9.8,2.6,8.6,9,null,layout.rugs,'entrance-runner');
 patternedRug(room,0,15.1,3.4,1.1,2,'#edc580',layout.rugs,'welcome-mat');
 sign(room,I18n.raw('strings.selamat_datang'),0,3.05,16.16,3.8);
 layout.entry={x:0,z:15.5};

 // 4e. Pengayaan Koridor & Atrium (Dispenser Air, Printer #2, Lemari Pajangan, Tanaman & Pedestal)
 // Dispenser Air (water-cooler) di tepi selatan kaca Ruang Rapat
 {
  const wc=makeWaterCooler();wc.position.set(1.2,0,-7.3);room.add(wc);
  const obs=prop(I18n.raw('v12.world.waterCooler'),1.2,-7.3,.60,.60);
  world.add('water-cooler',I18n.raw('v12.world.waterCooler'),wc,{points:[[-.2,1.3,0]],affordances:worldAffords('drink'),obstacle:obs,footprint:{w:.60,d:.60,h:1.68}});
 }
 // Mesin Fotokopi / Printer Bersama #2 di tepi koridor barat atrium
 {
  const p2=makePhotocopier();p2.position.set(-9.7,0,4.2);p2.rotation.y=Math.PI/2;room.add(p2);
  const obs=prop(I18n.raw('objects.sharedPrinter'),-9.7,4.2,.80,1.26);
  world.add('printer-2',I18n.raw('objects.sharedPrinter'),p2,{points:[[0,1.2,0]],affordances:worldAffords('print'),obstacle:obs,footprint:{w:1.26,d:.80,h:1.45}});
 }
 // Lemari pajangan & arsip tepi koridor (dengan piala, figurin, majalah, tanaman — tanpa menghalangi jalur)
 box([.70,.84,2.0],[9.7,.42,1.8],0x7c9586);prop(I18n.raw('objects.sideCabinet'),9.7,1.8,.70,2.0);
 detailProp(room,'Trophy',9.7,.85,1.2);detailProp(room,'Succulent',9.7,.85,1.8);detailProp(room,'Magazines',9.7,.85,2.4);
 for(const [idx,cx] of [[-6.0,15.35],[6.0,15.35]].entries()){
  box([2.2,.82,.64],[cx[0],.41,cx[1]],0x7c9586);prop(I18n.raw('objects.lowCabinet'),cx[0],cx[1],2.2,.64);
  detailProp(room,idx===0?'Trophy':'Desk clock',cx[0]-.65,.83,cx[1]);
  detailProp(room,'Magazines',cx[0],.83,cx[1]);
  detailProp(room,idx===0?'Succulent':'Figurine',cx[0]+.65,.83,cx[1],0xd6855c);
 }
 // Tanaman pembingkai koridor atrium & pintu masuk
 for(const [px,pz,s] of [[-9.4,-5.6,1.05],[9.4,-5.6,1.05],[-2.8,15.1,1.05],[2.8,15.1,1.05],[-9.4,14.8,1.0],[9.4,14.8,1.0]])plant(px,pz,s);
 // Pedestal dekoratif di sudut-sudut koridor yang lega
 const pedestals=[[8.8,-7.2],[-9.6,-2.0],[9.6,6.0],[9.6,13.5],[-9.6,8.0]];
 for(const [i,[px,pz]] of pedestals.entries()){
  box([.65,.62,.65],[px,.31,pz],0x758e80);prop(I18n.raw("objects.pedestal"),px,pz,.65,.65);
  detailProp(room,i%2===0?'Succulent':'Figurine',px-.14,.63,pz,0xd8a85c);
  detailProp(room,i%2===0?'Notebook':'Magazines',px+.16,.63,pz,0xc59068);
 }

 // ==========================================================================
 // 5. TERAS BARAT (x: -28..-24, z: 0..+15) — PANTRY, KOPI #1, KULKAS, PING-PONG
 // ==========================================================================
 const pantry=table(-26.6,2.5,4.0,1.25,I18n.raw('strings.pantry_2'),0xc59a6a,Math.PI/2,'pantry');
 const coffee=new THREE.Group();coffee.position.set(-26.6,0,3.8);room.add(coffee);
 voxelBox(coffee,[.80,.85,.65],[0,1.60,0],0x283b43);voxelBox(coffee,[.50,.20,.06],[0,1.75,.37],0x8cbeb1);
 voxelBox(coffee,[.80,1.17,.65],[0,.585,0],0xc59a6a);
 prop(I18n.raw('strings.mesin_kopi'),-26.6,3.8,.80,.65,false);
 world.add('coffee',I18n.raw('strings.mesin_kopi'),coffee,{points:[[1.6,.2,Math.PI/2]],affordances:worldAffords('coffee'),footprint:{w:.80,d:.65,h:2.03},on:'pantry'});
 for(let i=0;i<4;i++)detailProp(pantry,'Mug',-1.5+i*.7,1.19,.24);
 detailProp(pantry,'Tissue box',.9,1.19,-.15,0xe8dec5);
 detailProp(pantry,'Snack packet',-.6,1.19,-.22,0xd99061);
 {
  const fridgeG=new THREE.Group();fridgeG.position.set(-24.8,0,1.2);room.add(fridgeG);
  voxelBox(fridgeG,[.90,1.92,.80],[0,.96,0],0xece6d4);voxelBox(fridgeG,[.06,.42,.06],[-.47,1.28,.20],0x6f828a);
  const fridgeObs=prop(I18n.raw('strings.kulkas'),-24.8,1.2,.90,.80);
  world.add('fridge',I18n.raw('strings.kulkas'),fridgeG,{points:[[-.2,1.3,0]],affordances:worldAffords('browse_fridge'),obstacle:fridgeObs,footprint:{w:.90,d:.80,h:1.92}});
 }
 // Tenis meja (z: 9.8 -> titik main di (-26, 7.5) & (-26, 12.0))
 const pong=table(-26.2,9.8,3.5,1.95,I18n.raw('strings.tenis_meja_2'),0x508f83,Math.PI/2,'pong');
 voxelBox(pong,[.05,.40,1.95],[0,1.36,0],0xf0e6cf);voxelBox(pong,[3.4,.02,.04],[0,1.19,0],0xf5ead1);
 detailProp(pong,'Game controller',1.15,1.19,.45);
 prop(I18n.raw("objects.pongNet"),-26.2,9.8,1,1,false);
 // Bangku teras & meja asbak
 {const bx=-24.8,bz=13.5;box([.8,.12,2.2],[bx,.65,bz],0xc59a6a);for(const dz of [-.85,.85])box([.12,.6,.12],[bx,.3,bz+dz],0x3f5557);prop(I18n.raw("objects.balconyBench"),bx,bz,.8,2.2);}
 table(-27.0,13.8,.95,.95,I18n.raw("objects.ashtrayTable"),0xc59a6a,0,'ashtray-table');
 box([.34,.10,.34],[-27.0,1.22,13.8],0x52656c);prop(I18n.raw("objects.ashtray"),-27.0,13.8,.34,.34,false);
 // Pagar keliling teras & tiang kanopi
 for(const rz of [.1,14.9]){box([4.0,.09,.09],[-26.0,1.2,rz],0x526d6a);for(let rx=-28;rx<=-24;rx++)box([.06,1.2,.06],[rx,.6,rz],0x526d6a);}
 box([.09,.09,14.8],[-28.0,1.2,7.5],0x526d6a);
 for(let rz=.5;rz<=14.5;rz+=1)box([.06,1.2,.06],[-28.0,.6,rz],0x526d6a);
 for(const px of [-27.6,-24.4]){box([.06,3.8,.06],[px,1.9,.3],0x687d73);prop(I18n.raw("objects.terracePost"),px,.3,.06,.06);}
 box([3.3,.08,.08],[-26.0,3.8,.3],0x687d73);
 sign(room,I18n.raw('strings.pantry'),-26.0,3.3,.45,3.2);
 sign(room,I18n.raw('strings.teras'),-26.0,3.3,14.7,2.6,undefined,Math.PI);

 // Uap kopi & kertas transfer dinamis
 layout.steam=[];for(let i=0;i<6;i++)layout.steam.push(voxelBox(dynamic,[.07,.07,.07],[-26.6,2.1,3.8],0xe8e7dc));
 layout.transferPaper=voxelBox(dynamic,[.64,.035,.86],[0,-10,0],0xf7e9c9);layout.transferPaper.visible=false;
 layout.stacks=new THREE.Group();scene.add(layout.stacks);

 layout.wallDecor.push(
  {type:I18n.raw("objects.oldClock"),x:12.75,z:-7.75},
  {type:I18n.raw("objects.bossSign"),x:-18.5,z:-16},
  {type:I18n.raw("objects.serverSign"),x:18.0,z:-16},
  {type:I18n.raw("objects.meetingSign"),x:5.5,z:-16},
  {type:I18n.raw("objects.reportSign"),x:20.0,z:-7.75},
  {type:I18n.raw("objects.welcomeSign"),x:0,z:16}
 );

 // ==========================================================================
 // 6. REGISTRASI BENDA DUNIA & RELASI INDUK-ANAK
 // ==========================================================================
 const anchorNode=(x,z)=>{const n=new THREE.Group();n.position.set(x,0,z);room.add(n);return n;};
 const attachBoxes=(n,w,d)=>{room.updateMatrixWorld(true);for(const c of [...room.children])if(c!==n&&!c.userData.worldObject&&(c.isMesh||c.isGroup&&c.userData.detail)&&c.position.y>.1&&Math.abs(c.position.x-n.position.x)<w/2+.01&&Math.abs(c.position.z-n.position.z)<d/2+.01)n.attach(c);};
 const adopt=(id,type,x,z,w,d,h,extra={})=>{const n=anchorNode(x,z);attachBoxes(n,w+.2,d+.2);const obstacle=design.obstacles.find(o=>!o.owner&&o.x===x&&o.z===z&&o.w===w&&o.d===d);return world.add(id,type,n,{points:[],affordances:{},obstacle,footprint:{w,d,h},...extra});};

 pedestals.forEach(([x,z],i)=>adopt('pedestal-'+i,I18n.raw('objects.pedestal'),x,z,.65,.65,.88));
 [[-10.5,-15.25],[-6.5,-15.25]].forEach(([x,z],i)=>adopt('cabinet-'+i,I18n.raw('objects.lowCabinet'),x,z,1.3,.70,.95));
 [[-6.0,15.35],[6.0,15.35]].forEach(([x,z],i)=>adopt('cabinet-'+(i+2),I18n.raw('objects.lowCabinet'),x,z,2.2,.64,.95));
 adopt('side-cabinet',I18n.raw('objects.sideCabinet'),9.7,1.8,.70,2.0,1.02);
 adopt('coat-rack',I18n.raw('objects.coatRack'),-23.2,-6.5,.8,.5,1.95);
 adopt('umbrella',I18n.raw('objects.umbrella'),-23.2,-5.0,.45,.45,1.38);
 adopt('archive-cabinet',I18n.raw('objects.archiveCabinet'),23.2,-11.5,.8,2.0,2.2);

 const trayNode=anchorNode(-17.1,-12.5);attachBoxes(trayNode,1.4,1);
 world.add('tray',I18n.raw('strings.baki_laporan'),trayNode,{points:[[.1,1.5,0]],affordances:worldAffords('handoff'),on:'boss-desk',locked:'story'});
 const phoneNode=new THREE.Group();phoneNode.position.set(-17.7,0,-5.5);dynamic.add(phoneNode);
 layout.phone=voxelBox(phoneNode,[.33,.12,.16],[0,1.55,0],0xe6be64);
 world.add('phone',I18n.raw('strings.telepon'),phoneNode,{points:[[1.2,1.5,0,'sit']],affordances:worldAffords('phone'),on:'secretary-desk',locked:'story'});
 const inbox=anchorNode(-15.5,-5.5);attachBoxes(inbox,.8,.7);
 world.add('inbox',I18n.raw('strings.kotak_tugas_masuk'),inbox,{points:[[-1.0,1.5,0,'sit']],affordances:worldAffords('handoff'),on:'secretary-desk',locked:'story'});
 const serverNode=anchorNode(17.5,-14.55);attachBoxes(serverNode,7.5,1.2);
 const rackObstacles=design.obstacles.filter(o=>o.z===-14.55&&[14.5,16.5,18.5,20.5].includes(o.x));
 rackObstacles.slice(1).forEach(o=>o.disabled=true);
 const serverObject=world.add('server',I18n.raw('strings.rak_server'),serverNode,{points:[[0,1.55,0],[-1,1.55,0]],affordances:worldAffords('file_archive'),obstacle:rackObstacles[0],footprint:{w:7.3,d:1.08,h:2.8},locked:'story'});
 world.refresh(serverObject);
 layout.leds.forEach(l=>l.userData.serverLocal=serverNode.worldToLocal(l.position.clone()));

 const entryNode=anchorNode(0,15.5);
 world.add('entry',I18n.raw('strings.pintu_masuk'),entryNode,{points:[[0,0,0],[-1,-2,0],[0,-2,0]],affordances:worldAffords('entry'),footprint:false,locked:'structure'});
 world.add('sofa',I18n.raw('strings.sofa_baca'),layout.sofaNode,{points:[[-1,0,0,'sit'],[0,0,0,'sit'],[1,0,0,'sit'],{x:-2.5,z:0,facing:-Math.PI/2,kind:'stand',affordances:['chat_spot']},{x:2.5,z:0,facing:Math.PI/2,kind:'stand',affordances:['chat_spot']}],affordances:worldAffords('sit','read','chat_spot'),footprint:{w:3.6,d:1.0,ox:0,oz:.06,h:1.35},soft:true});
 world.add('sofa-2',I18n.raw('strings.sofa_baca'),layout.sofa2Node,{points:[[-1,0,0,'sit'],[0,0,0,'sit'],[1,0,0,'sit'],{x:-2.5,z:0,facing:-Math.PI/2,kind:'stand',affordances:['chat_spot']},{x:2.5,z:0,facing:Math.PI/2,kind:'stand',affordances:['chat_spot']}],affordances:worldAffords('sit','read','chat_spot'),footprint:{w:3.6,d:1.0,ox:0,oz:.06,h:1.35},soft:true});
 const smokeNode=anchorNode(-24.8,13.5);attachBoxes(smokeNode,.9,2.3);
 world.add('smoke-bench',I18n.raw('strings.bangku_teras'),smokeNode,{points:[[-.2,-.5,Math.PI/2,'sit'],[-.2,.5,Math.PI/2,'sit']],affordances:worldAffords('smoke','sit'),obstacle:design.obstacles.find(o=>o.x===-24.8&&o.z===13.5),footprint:{w:.8,d:2.2,h:.71},soft:true});
 const stretchNode=anchorNode(0,4.5);
 world.add('stretch',I18n.raw('strings.ruang_peregangan'),stretchNode,{points:[[0,0,0],[0,-1,0]],affordances:worldAffords('stretch_zone'),footprint:false,locked:'zone'});
 // Papan dart berdiri di Ruang Bos (jalur lempar bebas ke barat -16.0, -9.8)
 const dart=new THREE.Group();dart.position.set(-13.5,0,-9.8);dart.rotation.y=-Math.PI/2;room.add(dart);
 voxelBox(dart,[1.25,1.25,.08],[0,1.9,-.06],0x6d5440);
 for(const dx of [-.45,.45]){voxelBox(dart,[.08,1.85,.08],[dx,.93,-.14],0x4c3b2e);voxelBox(dart,[.12,.05,.5],[dx,.025,-.05],0x4c3b2e);}
 designPlane(dart,1.1,1.1,0,1.9,-.01,c=>{c.fillStyle='#263e44';c.fillRect(0,0,512,256);for(let i=6;i>0;i--){c.fillStyle=i%2?'#e6c494':'#4f8a7e';c.beginPath();c.ellipse(256,128,i*18,i*9,0,0,7);c.fill();}});
 world.add('dart',I18n.raw('strings.papan_dart'),dart,{points:[[0,2.5,0]],affordances:worldAffords('play_dart'),footprint:{w:1.25,d:.5,ox:0,oz:-.05,h:2.53},clearance:[{w:.8,d:2.0,ox:0,oz:1.25,kind:'lane'}]});
 world.add('daily-board',I18n.raw('strings.papan_harian_2'),layout.board.mesh,{points:[[0,1.75,0]],affordances:{review_board:{activity:I18n.raw('strings.menempel_laporan_harian'),duration:2}},footprint:false,locked:'story'});
 const windowNode=anchorNode(-21.5,-15.7);
 world.add('window',I18n.raw('strings.jendela_ruang_bos'),windowNode,{points:[[0,1.7,0]],affordances:worldAffords('window'),footprint:false,locked:'structure'});

 for(const [id,x,z] of [['boss-desk',-18.5,-12.5],['secretary-desk',-16.5,-5.5],['archive-desk',19.5,-10.5]]){
  const m=makeMonitor();m.position.set(x-.25,1.19,z-.2);room.add(m);const o=world.get(id);room.updateMatrixWorld(true);o.node.attach(m);o.screen=design.screens.at(-1);
 }
 for(const [list,prefix] of [[layout.desks,'desk-'],[layout.projects,'project-']])list.forEach((d,i)=>{
  d.objectId=prefix+(d.provider||i);world.get(d.objectId).screen=d.screen;
  Object.defineProperty(d,'x',{get:()=>world.get(d.objectId).node.position.x});
  Object.defineProperty(d,'z',{get:()=>world.get(d.objectId).node.position.z});
  Object.defineProperty(d,'seat',{get:()=>world.point(d.objectId)});
 });
 for(const [key,id,index] of [['bossSeat','boss-desk',0],['secretarySeat','secretary-desk',0],['archivistSeat','archive-desk',0],['trayApproach','tray',0],['entry','entry',0]]){
  Object.defineProperty(layout,key,{get:()=>world.point(id,index)});
 }
 Object.defineProperty(layout,'tray',{get:()=>{const n=world.get('tray').node.position;return new THREE.Vector3(n.x,1.6,n.z);}});

 // Ekspos utilitas terpadu bagi specialist_wing.js (tanpa duplikasi kode)
 layout._helpers={plant,shelf,table,chair,prop};

 // Properti meja berbagi transformasi induknya sebelum zona spesialis dibangun.
 for(const o of world.items.values())if(o.id==='lounge'||o.id==='pantry'||o.id==='coffee-bar-2'||o.id==='meeting-table'||o.id==='ashtray-table'||/^table-|^project-/.test(o.id)){
  const b=o.obstacle;if(!b)continue;room.updateMatrixWorld(true);
  for(const n of [...room.children])if(n!==o.node&&!n.userData.worldObject&&n.position.y>=1.1&&n.position.y<1.9&&Math.abs(n.position.x-b.x)<b.w/2&&Math.abs(n.position.z-b.z)<b.d/2)o.node.attach(n);
 }

 // Bangun seluruh zona divisi spesialis, Studio Video Short, Mutu & Dokumen, Trading MT5 & Keuangan Kantor!
 buildSpecialistOffice(scene,room,dynamic,layout);

 // Kotak oklusi perabot tinggi (termasuk rak buku & lemari pembelajaran dari specialist_wing).
 for(const p of design.inventory.filter(p=>/Rak buku|Rak server|Lemari arsip|Kulkas|Lemari Pembelajaran/.test(p.type))){
  const h=/Kulkas/.test(p.type)?1.9:/Lemari arsip/.test(p.type)?2.2:2.8;
  const owner=[...world.items.values()].find(o=>o.type===p.type&&Math.hypot(o.node.position.x-p.x,o.node.position.z-p.z)<.5)||(/Rak server/.test(p.type)?world.get('server'):null);
  const c={box:new THREE.Box3(new THREE.Vector3(p.x-p.w/2,0,p.z-p.d/2),new THREE.Vector3(p.x+p.w/2,h,p.z+p.d/2)),type:p.type,owner};
  layout.occluders.push(c);if(owner)owner.occluders.push(c);
 }

 scene.add(batchFurniture(room));

 // v6-C: slot di luar jumlah agen aktif dimatikan setelah batching (instansi disembunyikan, obstacle nonaktif).
 layout.discardObject=id=>{const o=world.get(id);if(!o||!id.startsWith('added-'))return;world.remove(id);scene.remove(o.renderRoot);o.renderRoot?.traverse(m=>{if(m.isInstancedMesh)m.dispose();});const index=design.obstacles.indexOf(o.obstacle);if(index>=0)design.obstacles.splice(index,1);world.items.delete(id);};
 layout.addObject=(id,type,template)=>{const src=world.get(template);if(!src)return null;const group=new THREE.Group(),copy=(key,s,x,z,r)=>{const g=s.node.clone(true);g.position.set(x,s.node.position.y,z);g.rotation.set(0,r,0);g.visible=true;group.add(g);return world.add(key,s.type,g,{points:s.usePoints.map(p=>({x:p.x,z:p.z,facing:p.facing,kind:p.kind,capacity:p.capacity,affordances:p.affordances})),affordances:Object.fromEntries(Object.entries(s.affordances).map(([k,v])=>[k,{...v}])),footprint:s.footprint?{...s.footprint}:false,soft:s.soft,clearance:(s.clearance||[]).map(c=>({...c}))});};const o=copy(id,src,0,0,0),children=[...world.items.values()].filter(k=>k!==o&&(k.follow===src.id||k.on===src.id&&world.onSurface(k))),r=src.node.rotation.y,c=Math.cos(r),s=Math.sin(r);children.forEach((k,i)=>{const dx=k.node.position.x-src.node.position.x,dz=k.node.position.z-src.node.position.z,n=copy(id+'-part-'+i,k,dx*c-dz*s,dx*s+dz*c,k.node.rotation.y-r);n.follow=id;n.locked='follow';if(k.on===src.id)n.on=id;world.sync(n);});o.renderRoot=batchFurniture(group);scene.add(o.renderRoot);return o;};
 layout.residentCount=residentCount;layout.residentSlots=officeResidentSlots;
 for(const d of layout.desks)if(d.slot>=residentCount){world.remove(d.objectId);world.remove(d.chairId);}
 layout.styleDesk=(i,{name,plate,color})=>{const d=layout.desks[i];if(!d)return;const s=d.state,next={name:String(name||''),plate:String(plate||''),color:/^#[0-9a-f]{6}$/i.test(color)?color:s.color};if(next.name===s.name&&next.plate===s.plate&&next.color===s.color)return;Object.assign(s,next);d.plate.redraw();d.rug.redraw();const a=world.get(d.objectId)?.accent;if(a){a.mesh.setColorAt(a.index,new THREE.Color(s.color));a.mesh.instanceColor.needsUpdate=true;}};

 const floorProps=design.inventory.filter(p=>p.w>.5&&p.d>.5&&!/rug|mat|Dinding/i.test(p.type));
 const contact=document.createElement('canvas');contact.width=contact.height=64;
 const cx=contact.getContext('2d'),falloff=cx.createRadialGradient(32,32,5,32,32,32);
 falloff.addColorStop(0,'rgba(255,255,255,1)');falloff.addColorStop(.66,'rgba(255,255,255,.64)');falloff.addColorStop(1,'rgba(255,255,255,0)');
 cx.fillStyle=falloff;cx.fillRect(0,0,64,64);
 const contactMap=new THREE.CanvasTexture(contact);layout.contactMap=contactMap;
 const shade=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:contactMap,color:0x302f29,transparent:true,opacity:.27,depthWrite:false}),floorProps.length);
 const t=new THREE.Object3D();
 floorProps.forEach((p,i)=>{t.position.set(p.x,.045,p.z);t.rotation.set(-Math.PI/2,0,0);t.scale.set(p.w*1.32+.1,p.d*1.32+.1,1);t.updateMatrix();shade.setMatrixAt(i,t.matrix);});
 scene.add(shade);
 return layout;
}
