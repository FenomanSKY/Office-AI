// V9: dievaluasi di halaman (?qa=1). Bekerja untuk kode lama (fallback dari obstacles/bounds) dan model footprint baru (world.rect).
// Mengembalikan audit statis (a) tata letak + (b) titik pakai. Simulasi (c) memakai v9Sample().
(function(){
const W=design.world,R=window.OfficeLayoutRules,TOL=.02,CAP=.25;
const wallish=new Set(['daily-board','window','stretch','entry']);
const raw=k=>I18n.raw(k);
function aabb(x,z,w,d){return{x,z,w,d};}
function rectOf(o){if(W.rect)return W.rect(o);if(wallish.has(o.id)||o.id==='dart')return null;if(o.obstacle&&!o.obstacle.disabled)return{...aabb(o.obstacle.x,o.obstacle.z,o.obstacle.w,o.obstacle.d),solid:true};const b=new THREE.Box3().setFromObject(o.node);if(b.isEmpty())return null;return{...aabb((b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2,b.max.x-b.min.x,b.max.z-b.min.z),solid:false,y0:b.min.y};}
const seatObj=o=>/^chair-|^sofa$|^smoke-bench$|^bench-|^added-.*chair/.test(o.id)||o.soft;
function footprints(){const out=[],owned=new Set();for(const o of W.items.values()){if(!o.enabled)continue;if(o.obstacle)owned.add(o.obstacle);const r=rectOf(o);if(!r||r.w<=0||r.d<=0)continue;out.push({...r,id:o.id,type:o.type,kind:'object',on:o.on||null,seat:seatObj(o),locked:!!o.locked});}
 let i=0;for(const b of design.obstacles){if(owned.has(b)||b.disabled||b.owner)continue;const wall=(b.w<=.15&&b.d>1)||(b.d<=.15&&b.w>1);out.push({...aabb(b.x,b.z,b.w,b.d),id:(wall?'wall-':'static-')+(i++),type:b.name||(wall?'wall':'static'),kind:wall?'wall':'static',solid:true});}return out;}
function pen(a,b){return Math.min((a.w+b.w)/2-Math.abs(a.x-b.x),(a.d+b.d)/2-Math.abs(a.z-b.z));}
const inside=(c,p)=>Math.abs(c.x-p.x)<=p.w/2+1e-6&&Math.abs(c.z-p.z)<=p.d/2+1e-6;
const within=(c,p)=>c.x-c.w/2>=p.x-p.w/2-.01&&c.x+c.w/2<=p.x+p.w/2+.01&&c.z-c.d/2>=p.z-p.d/2-.01&&c.z+c.d/2<=p.z+p.d/2+.01;
function circleHit(px,pz,r,f){const dx=Math.max(Math.abs(px-f.x)-f.w/2,0),dz=Math.max(Math.abs(pz-f.z)-f.d/2,0);return dx*dx+dz*dz<(r-TOL)*(r-TOL);}
function layoutAudit(fps){fps=fps||footprints();const overlaps=[],walls=[],zones=[];
 for(let i=0;i<fps.length;i++)for(let j=i+1;j<fps.length;j++){const a=fps[i],b=fps[j];if(a.kind!=='object'&&b.kind!=='object')continue;if(pen(a,b)<=TOL)continue;
  if((a.on===b.id&&within(a,b))||(b.on===a.id&&within(b,a)))continue;const row={a:a.id,b:b.id,ta:a.type,tb:b.type,pen:+pen(a,b).toFixed(3)};if(a.kind==='wall'||b.kind==='wall')walls.push(row);else overlaps.push(row);}
 const Z=(R?.catalog?.zones||[]);for(const f of fps){if(f.kind!=='object'||f.on||f.locked&&f.type===raw('strings.pintu_masuk'))continue;const type=R?.base?.get(f.id)?.type;for(const z of Z){if(z.allow&&z.allow===type)continue;if(pen(f,z)>TOL)zones.push({id:f.id,type:f.type,zone:z.name});}}
 return{footprints:fps.length,objects:fps.filter(f=>f.kind==='object').length,overlaps,walls,zones};}
function pointsAudit(fps){fps=fps||footprints();const bad=[],inactive=[],active=new Set();let total=0;const byId=new Map(fps.map(f=>[f.id,f]));
 for(const o of W.items.values()){if(!o.enabled)continue;o.node.updateWorldMatrix(true,false);
  o.usePoints.forEach((p,i)=>{total++;const v=o.node.localToWorld(new THREE.Vector3(p.x,0,p.z)),rawP={x:Math.round(v.x*2)/2,z:Math.round(v.z*2)/2},q=W.point(o,i),aff=Object.keys(o.affordances),kind=p.kind||(aff.some(a=>a==='sit'||a==='sit_work')?'sit':'stand');
   const row=(why,extra={})=>bad.push({id:o.id,type:o.type,index:i,kind,why,x:q?.x??rawP.x,z:q?.z??rawP.z,...extra});
   if(!q){if(W.rect&&!o.locked){inactive.push(o.id+'#'+i);return;}row('unreachable');return;}active.add(o.id);if(Math.hypot(q.x-rawP.x,q.z-rawP.z)>.01)row('snapped',{from:rawP});
   const own=byId.get(o.id);const seat=fps.find(f=>f.seat&&inside(q,f));
   if(kind==='sit'){if(!seat)row('sit_without_seat');}
   for(const f of fps){if(f.id===o.id||f===seat)continue;if(f.kind==='object'&&f.on)continue;if(circleHit(q.x,q.z,CAP,f)){row('capsule_hits',{hit:f.id,hitType:f.type});break;}}
   if(kind!=='sit'&&own&&!['entry','stretch','lounge'].includes(o.id)&&!o.affordances.chat_spot){const fx=-Math.sin(q.facing),fz=-Math.cos(q.facing),nx=Math.max(own.x-own.w/2,Math.min(own.x+own.w/2,q.x)),nz=Math.max(own.z-own.d/2,Math.min(own.z+own.d/2,q.z)),dx=nx-q.x,dz=nz-q.z,n=Math.hypot(dx,dz)||1;if((fx*dx+fz*dz)/n<.7)row('facing',{dot:+((fx*dx+fz*dz)/n).toFixed(2)});}
   if(o.affordances.play_dart){const b=own||{x:o.node.position.x,z:o.node.position.z},d=Math.hypot(b.x-q.x,b.z-q.z);if(d<1.8||d>3.1)row('dart_distance',{d:+d.toFixed(2)});const lane={x:(b.x+q.x)/2,z:(b.z+q.z)/2,w:Math.abs(b.x-q.x)+.5,d:Math.abs(b.z-q.z)+.5};for(const f of fps){if(f.id===o.id||f.kind==='object'&&f.on)continue;if(pen(lane,f)>TOL){row('dart_lane_blocked',{hit:f.id});break;}}}
    if(o.affordances.play_pong&&own){const alongX=own.w>=own.d,end=alongX?Math.abs(q.x-own.x)>own.w/2&&Math.abs(q.z-own.z)<own.d/2:Math.abs(q.z-own.z)>own.d/2&&Math.abs(q.x-own.x)<own.w/2;if(!end)row('pong_side');}
   if(o.affordances.coffee&&own){if(Math.hypot(q.x-own.x,q.z-own.z)>1.8)row('coffee_far');}
  });}
 for(const o of W.items.values())if(o.enabled&&o.usePoints.length&&Object.keys(o.affordances).length&&!active.has(o.id))bad.push({id:o.id,type:o.type,why:'no_active_point'});
 return{points:total,bad,inactive};}
window.v9Audit=function(){const fps=footprints();return{layout:layoutAudit(fps),points:pointsAudit(fps)};};
window.v9Footprints=footprints;
const spatial=new WeakMap();function nearby(fps,x,z){let grid=spatial.get(fps);if(!grid){grid=new Map();for(const f of fps)for(let ix=Math.floor((f.x-f.w/2-CAP)/2);ix<=Math.floor((f.x+f.w/2+CAP)/2);ix++)for(let iz=Math.floor((f.z-f.d/2-CAP)/2);iz<=Math.floor((f.z+f.d/2+CAP)/2);iz++){const key=ix+','+iz;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}spatial.set(fps,grid);}return grid.get(Math.floor(x/2)+','+Math.floor(z/2))||[];}
// Sampel simulasi: kapsul vs footprint non-pakai, antar-karakter, melayang, label vs posisi.
window.v9Sample=function(fps){fps=fps||footprints();const snapshot=window.officeQA.sampleActors?officeQA.sampleActors():window.officeDebug().actors,acts=snapshot.filter(a=>!a.hidden&&!a.lifted),out={actors:acts.length,capsule:[],pairs:[],floating:[],label:[]};
 const A={sit:raw('strings.duduk_santai'),dart:raw('strings.bermain_dart'),pong:raw('strings.tenis_meja')};
 for(const a of acts){const allow=new Set([a.object?.id,...(a.soft||[])].filter(Boolean));const goal=a.queue.find(q=>q.type==='walk'&&q.goal)?.goal;
  for(const f of nearby(fps,a.x,a.z)){if(allow.has(f.id))continue;if(f.kind==='object'&&f.on)continue;if(f.seat&&(inside(a,f)&&(a.seated||!W.rect)||goal&&inside(goal,f)))continue;if(circleHit(a.x,a.z,CAP,f)){out.capsule.push({id:a.id,hit:f.id,type:f.type,x:+a.x.toFixed(2),z:+a.z.toFixed(2),activity:a.activity,moving:a.moving});break;}}
  if(!a.seated&&Math.abs(a.y||0)>.03)out.floating.push({id:a.id,y:a.y,activity:a.activity});if(a.seated){const s=fps.find(f=>f.seat&&inside(a,f));if(!s)out.floating.push({id:a.id,x:a.x,z:a.z,activity:a.activity});}
  const waiting=a.queue[0]?.type==='wait'&&!a.moving;
  if(a.activity===A.sit&&waiting&&!a.seated)out.label.push({id:a.id,why:'sit_not_seated',x:a.x,z:a.z});
  if(waiting&&a.object){const o=W.get(a.object.id),q=o&&W.point(o,a.object.index),spec=o?.affordances?.[a.object.affordance];if(q&&spec&&a.activity===spec.activity&&Math.hypot(q.x-a.x,q.z-a.z)>.6)out.label.push({id:a.id,why:'far_from_object',object:o.id,activity:a.activity,d:+Math.hypot(q.x-a.x,q.z-a.z).toFixed(2)});}
  if(waiting&&(a.activity===A.dart||a.activity===A.pong)&&!a.object)out.label.push({id:a.id,why:'activity_without_object',activity:a.activity});}
 for(let i=0;i<acts.length;i++)for(let j=i+1;j<acts.length;j++){const d=Math.hypot(acts[i].x-acts[j].x,acts[i].z-acts[j].z);if(d<2*CAP-TOL)out.pairs.push({a:acts[i].id,b:acts[j].id,d:+d.toFixed(2)});}
 return out;};
})();
