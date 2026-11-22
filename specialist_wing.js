/* V12: 3 klaster kubikel '+' kaca buram ala referensi, Studio Video Short, Mutu & Dokumen, serta Ruang Trading MT5 & Keuangan Kantor. */
// [Diubah oleh Gemini - 2026-11-20] Implementasi arsitektur zona divisi V12: kubikel '+' 4 kursi, set syuting Video Short + storyboard dinamis, pemisahan karpet Mutu (>=0.3 m), stasiun MT5 4 monitor + beacon + papan dinamis, stasiun Keuangan Kantor + brankas besi + papan dinamis (Rp 0 jujur).
'use strict';
function buildSpecialistOffice(scene,room,dynamic,layout){
 const W=layout.world,H=layout._helpers||{};
 const box=(p,s,v,c)=>voxelBox(p,s,v,c);
 const node=(x,z,rot=0)=>{const n=new THREE.Group();n.position.set(x,0,z);n.rotation.y=rot;room.add(n);return n;};
 const reg=(id,key,n,points=[],aff=[],extra={})=>{
  const label=I18n.raw(key);
  recordProp(label,n.position.x,n.position.z,extra.footprint?.w||1,extra.footprint?.d||1);
  return W.add(id,label,n,{points,affordances:worldAffords(...aff),...extra});
 };

 // ==========================================================================
 // 1. SEKAT RENDAH KACA BURAM ANTAR-DIVISI (h = 1.55 m, locked structure)
 // ==========================================================================
 const dividers=[
  // Engineering Bay (x: -24..-10.5, z: -3.5..+6.0)
  ['div-eng-n',-20.0,-3.5,7.0,0],['div-eng-e1',-10.5,-2.0,3.0,Math.PI/2],
  ['div-eng-e2',-10.5,4.25,3.5,Math.PI/2],['div-eng-s',-18.5,6.0,8.0,0],
  // Studio Konten & Desain (x: -24..-10.5, z: +6.0..+16.0)
  ['div-studio-e1',-10.5,7.8,3.6,Math.PI/2],['div-studio-e2',-10.5,14.3,3.2,Math.PI/2],
  // Ruang Mutu & Dokumen (x: +10.5..+24.0, z: -7.5..+4.2)
  ['div-mutu-w1',10.5,-5.8,3.4,Math.PI/2],['div-mutu-w2',10.5,1.7,5.0,Math.PI/2],
  ['div-mutu-s',18.6,4.2,10.6,0],
  // Ruang Trading MT5 & Keuangan Kantor (x: +10.5..+24.0, z: +4.2..+16.0)
  ['div-mt5-w1',10.5,5.8,3.2,Math.PI/2],['div-mt5-w2',10.5,13.6,4.6,Math.PI/2],
  ['div-mt5-mid',20.1,10.2,6.6,0]
 ];
 for(const [id,x,z,len,rot] of dividers){
  const n=makeLowDivider(len,1.55);n.position.set(x,0,z);n.rotation.y=rot;room.add(n);
  reg(id,'v10.partition',n,[],[],{footprint:{w:len,d:.14,h:1.55},locked:'structure'});
 }

 // ==========================================================================
 // 2. HELPER KOTAK TUGAS MASUK (INBOX) & KLASTER KUBIKEL '+' KACA BURAM
 // ==========================================================================
 const inboxes=[];
 function inbox(d,id,localPos=null,standOffset=null){
  const pos=localPos||[d.x+.36,d.z+.05];
  const n=node(pos[0],pos[1]);
  box(n,[.52,.07,.44],[0,1.25,0],0x354d56);
  for(const ix of [-.25,.25])box(n,[.035,.18,.44],[ix,1.33,0],0xdda960);
  const sp=standOffset||[[0,2,0]];
  reg('inbox-'+id,'v10.inbox',n,sp,['handoff'],{on:d.objectId,footprint:{w:.52,d:.44,h:1.45},locked:'follow'});
  const stack=new THREE.Group();stack.position.set(n.position.x,0,n.position.z);dynamic.add(stack);
  const sheets=[];for(let i=0;i<5;i++){const s=box(stack,[.40,.04,.34],[0,1.34+i*.05,0],i%2?0xe5be6b:0xf9eed4);s.visible=false;sheets.push(s);}
  const o=W.add('inbox-paper-'+id,I18n.raw('v10.inbox'),stack,{points:[],footprint:false,locked:'follow'});
  o.follow=d.objectId;W.get('inbox-'+id).follow=d.objectId;
  inboxes.push({d,sheets});
 }

 // Properti unik per meja spesialis (0..11) agar setiap kubikel terasa hidup & berbeda!
 const cubicleProps=[
  [['Desk lamp',.72,-.18],['Figurine',-.68,.18],['Mug',.35,.22]],
  [['Mini cactus',.70,-.18],['Rubik cube',-.66,.18],['Water bottle',.32,.22]],
  [['Headphones',.72,.18],['Phone stand',-.68,-.18],['Mug',.34,.22]],
  [['Desk clock',.70,-.18],['Game controller',-.66,.18],['Pen cup',.36,-.18]],
  [['Tablet',.66,.18],['Succulent',-.68,-.18],['Mug',.32,.22]],
  [['Desk calendar',.70,-.18],['Hourglass',-.66,.18],['Pen cup',.34,-.18]],
  [['Camera',.68,.18],['Desk lamp',-.68,-.18],['Water bottle',.34,.22]],
  [['Headphones',.68,.18],['Snack packet',-.66,.18],['Mug',.32,.22]],
  [['Paper stack',.68,-.18],['Sticky pad',-.66,.18],['Desk lamp',.36,-.18]],
  [['Notebook',.66,.18],['Desk clock',-.66,-.18],['Mug',.32,.22]],
  [['Mini cactus',.68,-.18],['Tape dispenser',-.66,.18],['Water bottle',.34,.22]],
  [['Figurine',.68,-.18],['Stapler',-.66,.18],['Pen cup',.34,-.18]]
 ];
 const cubiclePalette=[0x528dc8,0x7065b9,0x49a999,0x728b9e,0xbb629d,0xb96b56,0xce914b,0xd5b859,0x9675b3,0xa17d60,0xd9845b,0x589476];
 const specialistBySlot=new Array(12);

 // Membangun 1 klaster kubikel '+' modular 4 kursi (kain akustik abu 0x7c8789 bawah, kaca buram atas, rangka aluminium, meja L oak + laci 3 susun)
 function buildCubicleCluster(prefix,cx,cz,{armLen=2.50,dualMonitor=false,accent=0x5b7f95,slotIndices=[0,1,2,3]}={}){
  const H_FAB=1.34,H_GBOT=1.39,H_GTOP=1.85,H_TOT=1.92;
  const ALU=0xc3cccf,FAB=0x7c8789,TRIM=0x697476,OAK_TOP=0xdcb683,OAK_SIDE=0xc0925f;

  function makePartitionBar(len){
   const g=new THREE.Group();
   box(g,[len,.07,.09],[0,.035,0],ALU);
   box(g,[len,.06,.09],[0,H_FAB+.025,0],ALU);
   box(g,[len,.07,.095],[0,H_TOT-.035,0],ALU);
   box(g,[len-.04,H_FAB-.07,.07],[0,(H_FAB+.07)/2,0],FAB);
   box(g,[len-.06,.03,.08],[0,.72,0],TRIM);
   box(g,[.065,H_TOT,.095],[-len/2+.03,H_TOT/2,0],ALU);
   box(g,[.065,H_TOT,.095],[len/2-.03,H_TOT/2,0],ALU);
   if(len>1.7)box(g,[.045,H_TOT,.085],[0,H_TOT/2,0],ALU);
   addGlassPlane(g,Math.max(.1,len-.10),H_GTOP-H_GBOT,0,(H_GTOP+H_GBOT)/2,0,'frosted',0);
   return g;
  }

  // 5 segmen partisi tanpa tumpang tindih AABB: Z-bar menerus, lengan Barat, lengan Timur, sayap privasi Barat & Timur
  const zBar=makePartitionBar(armLen*2);zBar.position.set(cx,0,cz);zBar.rotation.y=Math.PI/2;
  box(zBar,[.13,H_TOT,.13],[0,H_TOT/2,0],ALU);room.add(zBar);
  reg('cubicle-'+prefix+'-z','v10.partition',zBar,[],[],{footprint:{w:armLen*2,d:.12,h:H_TOT},locked:'structure'});

  const armSpan=armLen-.16;
  for(const [tag,sx] of [['w',-1],['e',1]]){
   const arm=makePartitionBar(armSpan);arm.position.set(cx+sx*(.08+armSpan/2),0,cz);room.add(arm);
   reg('cubicle-'+prefix+'-'+tag,'v10.partition',arm,[],[],{footprint:{w:armSpan,d:.12,h:H_TOT},locked:'structure'});
   const wingSpan=1.72;
   const wing=makePartitionBar(wingSpan);wing.position.set(cx+sx*armLen,0,cz);wing.rotation.y=Math.PI/2;room.add(wing);
   reg('cubicle-'+prefix+'-wing-'+tag,'v10.partition',wing,[],[],{footprint:{w:wingSpan,d:.12,h:H_TOT},locked:'structure'});
  }

  // 4 kuadran L-desk: NW [-1,-1], NE [+1,-1], SW [-1,+1], SE [+1,+1]
  const dirs=[[-1,-1],[1,-1],[-1,1],[1,1]];
  const mainLen=Math.round((armLen-.20)*100)/100,mainD=.80;
  const retLen=Math.round((armLen-1.12)*100)/100,retW=.76;
  const deskY=1.15;

  dirs.forEach(([sx,sz],qIdx)=>{
   const slot=slotIndices[qIdx];
   const mainCx=cx+sx*(.10+mainLen/2),mainCz=cz+sz*.48;
   const retCx=cx+sx*.49,retCz=cz+sz*(.92+retLen/2);
   const chairX=cx+sx*1.5,chairZ=cz+sz*1.5;
   const handoffX=cx+sx*2.0,handoffZ=cz+sz*2.5;
   const angle=Math.atan2(sx,sz);

   // Meja utama sayap-X (persona-desk-<slot>)
   const deskN=node(mainCx,mainCz);
   box(deskN,[mainLen,.07,mainD],[0,deskY,0],OAK_TOP);
   box(deskN,[mainLen-.02,.04,mainD-.02],[0,deskY-.045,0],OAK_SIDE);
   // Jembatan sudut L ergonomis (noHit agar footprint AABB tidak menabrak kursi!)
   const br=box(deskN,[.56,.068,.56],[sx*(.88-(.10+mainLen/2)),deskY-.002,sz*.40],OAK_TOP);
   br.rotation.y=Math.PI/4;br.userData.noHit=true;
   // Laci oak 3 susun di bawah ujung luar meja
   const pedLx=sx*(mainLen/2-.32);
   box(deskN,[.56,1.07,.70],[pedLx,.54,0],OAK_SIDE);
   for(let d=0;d<3;d++){
    const dy=.24+d*.31;
    box(deskN,[.50,.25,.03],[pedLx,dy,sz*.355],OAK_TOP);
    box(deskN,[.18,.035,.04],[pedLx,dy+.05,sz*.37],0x3b4852);
   }
   // Garis aksen warna divisi di tepi luar
   box(deskN,[.06,.08,.62],[sx*(mainLen/2-.04),deskY+.06,0],accent);
   // Monitor dinamis utama menghadap kursi sudut
   const m=makeMonitor();
   m.position.set(sx*(.54-(.10+mainLen/2)),deskY+.035,sz*.06);
   m.rotation.y=angle;m.scale.setScalar(.86);
   deskN.add(m);
   const primaryScreen=design.screens.at(-1);
   // Monitor sekunder statis untuk divisi Engineering (0 draw call tambahan)
   if(dualMonitor){
    const m2=makeStaticMonitor(.76);
    m2.position.set(sx*(1.46-(.10+mainLen/2)),deskY+.035,-sz*.10);
    m2.rotation.y=sz>0?0:Math.PI;
    deskN.add(m2);
   }
   // Keyboard & mouse ergonomis
   const kb=box(deskN,[.54,.035,.20],[sx*(.92-(.10+mainLen/2)),deskY+.055,sz*.24],0x2c3945);
   kb.rotation.y=angle;kb.userData.noHit=true;
   const ms=box(deskN,[.10,.04,.15],[sx*(1.26-(.10+mainLen/2)),deskY+.055,sz*.16],0x2c3945);
   ms.userData.noHit=true;
   // Properti personalisasi unik per kubikel + tempat sampah rapi di bawah meja
   (cubicleProps[slot]||cubicleProps[0]).forEach(([type,dx,dz])=>detailProp(deskN,type,sx*dx,deskY+.04,sz*dz,cubiclePalette[slot]));
   detailProp(deskN,'Wastebasket',-sx*(mainLen/2-.24),.04,-sz*.16);

   // Papan nama persona dinamis
   const state={name:'',color:'#'+new THREE.Color(cubiclePalette[slot]).getHexString()};
   const plate=designPlane(deskN,1.65,.34,sx*.15,1.52,sz*.43,(c,Wv,Hv)=>{
    c.fillStyle='#263e44';c.fillRect(0,0,Wv,Hv);c.strokeStyle=state.color;c.lineWidth=12;c.strokeRect(6,6,Wv-12,Hv-12);
    c.fillStyle='#f5e8cf';I18n.draw(c,state.name||'—',12,18,Wv-24,Hv-36,{size:56,min:18,align:'center',valign:'middle',weight:'bold'});
   });
   plate.mesh.rotation.y=sz>0?0:Math.PI;plate.mesh.userData.noHit=true;

   const deskObj=reg('persona-desk-'+slot,'v10.personaDesk',deskN,[
    [chairX-mainCx,chairZ-mainCz,angle,'sit'],
    [handoffX-mainCx,handoffZ-mainCz,sz>0?0:Math.PI,'stand']
   ],['sit_work'],{footprint:{w:mainLen,d:mainD,h:1.92},locked:'roster'});
   deskObj.screen=primaryScreen;

   // Sayap meja return-Z (mengikuti persona-desk-<slot>, tanpa tumpang tindih AABB!)
   const retN=node(retCx,retCz);
   box(retN,[retW,.07,retLen],[0,deskY,0],OAK_TOP);
   box(retN,[retW-.02,.04,retLen-.02],[0,deskY-.045,0],OAK_SIDE);
   // Kaki penopang oak & sepatu aluminium luar
   const legLz=sz*(retLen/2-.06);
   box(retN,[.70,1.07,.07],[0,.54,legLz],OAK_SIDE);
   box(retN,[.76,.06,.16],[0,.03,legLz],ALU);
   detailProp(retN,slot%2===0?'Paper stack':'Notebook',0,deskY+.04,sz*(retLen/2-.32),cubiclePalette[slot]);
   const retObj=reg('persona-desk-ret-'+slot,'v10.personaDesk',retN,[],[],{footprint:{w:retW,d:retLen,h:1.25},locked:'follow'});
   retObj.follow=deskObj.id;

   // Kursi ergonomis bersudut menghadap sudut L meja
   const chN=makeChair(0x2b435c);chN.position.set(chairX,0,chairZ);chN.rotation.y=angle;room.add(chN);
   const chObj=reg('persona-chair-'+slot,'strings.kursi',chN,[[0,0,0,'sit']],['sit'],{soft:true,footprint:{w:.80,d:.80,h:1.34},locked:'follow'});
   chObj.follow=deskObj.id;

   const dRec={
    objectId:deskObj.id,chairId:chObj.id,screen:primaryScreen,state,plate,slot,
    get x(){return deskObj.node.position.x;},
    get z(){return deskObj.node.position.z;},
    get seat(){return W.point(deskObj.id,0);}
   };
   specialistBySlot[slot]=dRec;

   // Baki tugas masuk di ujung sayap-X meja (di dalam tapak meja utama)
   const inbX=cx+sx*(armLen-.44),inbZ=mainCz;
   inbox(dRec,'persona-'+slot,[inbX,inbZ],[[handoffX-inbX,handoffZ-inbZ,sz>0?0:Math.PI]]);
  });
 }

 // ==========================================================================
 // 3. ZONA 5 — ENGINEERING BAY (Barat Tengah: x -24..-10.5, z -3.5..+6.0)
 // ==========================================================================
 patternedRug(room,-17.0,1.5,10.6,7.6,4,null,layout.rugs,'eng');
 buildCubicleCluster('eng',-17.0,1.5,{armLen:2.60,dualMonitor:true,accent:0x5c8ab5,slotIndices:[0,1,2,3]});

 // Papan Arsitektur Engineering di dinding barat (-23.70, 2.0, 1.5)
 const archBoard=designPlane(room,3.6,1.55,-23.70,2.0,1.5,(c,Wv,Hv)=>{
  c.fillStyle='#f4f6f7';c.fillRect(0,0,Wv,Hv);c.strokeStyle='#5c7c94';c.lineWidth=10;c.strokeRect(6,6,Wv-12,Hv-12);
  c.fillStyle='#243c4f';I18n.draw(c,I18n.raw('v10.architecture'),22,16,Wv-44,36,{size:28,min:15,weight:'bold'});
  const nodes=[[34,76,'#4a80a8'],[194,76,'#4e8a6e'],[354,76,'#8a68a8'],[114,164,'#c4814e'],[278,164,'#4c8e99']];
  c.strokeStyle='#8ba2b0';c.lineWidth=4;
  c.beginPath();c.moveTo(96,128);c.lineTo(176,164);c.moveTo(256,128);c.lineTo(340,164);c.moveTo(158,102);c.lineTo(194,102);c.moveTo(318,102);c.lineTo(354,102);c.stroke();
  nodes.forEach(([bx,by,col])=>{c.fillStyle=col;c.fillRect(bx,by,124,52);c.fillStyle='#ffffff';c.fillRect(bx+18,by+18,88,8);c.fillRect(bx+18,by+32,58,6);});
 });
 archBoard.mesh.rotation.y=Math.PI/2;archBoard.mesh.userData.noHit=true;
 sign(room,I18n.raw('v10.department.engineering'),-23.68,3.30,1.5,3.2,'#9fd0f5',Math.PI/2);

 // Meja uji perangkat keras (Device Test Bench) di pojok timur-laut Engineering
 if(H.table){
  const bench=H.table(-12.3,-2.3,2.2,.95,I18n.raw('v10.devices'),0x7e929e,0,'device-bench');
  detailProp(bench,'Tablet',-.60,1.19,0);
  detailProp(bench,'Phone stand',-.05,1.19,-.08);
  detailProp(bench,'USB hub',.48,1.19,.12);
  detailProp(bench,'Camera',.76,1.19,-.14);
 }
 if(H.plant){H.plant(-22.8,-2.5,1.05);H.plant(-22.8,4.6,1.0);}

 // ==========================================================================
 // 4. ZONA 6 — STUDIO KONTEN & DESAIN (Barat Selatan: x -24..-10.5, z +6..+16)
 // ==========================================================================
 // 4a. Set Syuting Video Short SW (Green Screen, Kamera Tripod, 2 Softbox, Mic VO, Busa Akustik)
 patternedRug(room,-21.1,12.6,4.8,5.4,3,'#54b878',layout.rugs,'studio-film');
 {
  const gs=node(-23.25,12.8);
  box(gs,[.16,2.85,4.2],[0,1.43,0],0x3ba864);
  const sweep=box(gs,[1.4,.04,4.2],[.75,.065,0],0x3ba864);sweep.userData.noHit=true;
  for(const dz of [-2.15,2.15])box(gs,[.12,3.05,.12],[0,1.52,dz],0x283238);
  box(gs,[.14,.12,4.4],[0,2.98,0],0x283238);
  reg('studio-greenscreen','v12.world.studioSet',gs,[],[],{footprint:{w:.35,d:4.35,h:3.05},locked:'structure'});
 }
 // Kamera Sinema di atas tripod (titik berdiri agen di depan Green Screen menghadap kamera!)
 {
  const cam=node(-19.5,12.8);
  for(let k=0;k<3;k++){
   const a=k*(Math.PI*2/3),leg=box(cam,[.06,1.48,.06],[Math.cos(a)*.25,.70,Math.sin(a)*.25],0x273138);
   leg.rotation.z=Math.cos(a)*.24;leg.rotation.x=-Math.sin(a)*.24;
  }
  box(cam,[.46,.28,.26],[0,1.52,0],0x1e2830);
  box(cam,[.24,.18,.18],[-.30,1.52,0],0x3b4a56);
  box(cam,[.06,.06,.06],[.16,1.69,.08],0xeb5244);
  reg('studio-set','v12.world.studioSet',cam,[[-2.0,.2,-Math.PI/2,'stand']],['read'],{footprint:{w:.75,d:.75,h:1.75},locked:'story'});
  Object.defineProperty(layout,'studioStandPoint',{get:()=>W.point('studio-set',0)});
  layout.clicks.push({kind:'shorts',point:new THREE.Vector3(-21.2,1.5,12.8)});
 }
 // 2 Lampu Softbox Studio + Stand Mic VO + Panel Busa Akustik dinding selatan
 for(const [idx,lx,lz,lrot] of [[0,-20.4,10.6,.45],[1,-20.4,14.8,-.45]]){
  const lg=node(lx,lz,lrot);
  box(lg,[.42,.06,.42],[0,.03,0],0x273138);box(lg,[.07,2.15,.07],[0,1.08,0],0x273138);
  box(lg,[.16,.68,.68],[0,2.20,0],0x222c32);box(lg,[.06,.58,.58],[-.09,2.20,0],0xfff4d4);
  reg('studio-light-'+idx,'v10.ringLight',lg,[],[],{footprint:{w:.48,d:.48,h:2.55},locked:'structure'});
 }
 {
  const mic=node(-19.2,14.6);
  box(mic,[.35,.05,.35],[0,.025,0],0x29333b);box(mic,[.05,1.48,.05],[0,.74,0],0x29333b);box(mic,[.14,.22,.14],[0,1.56,0],0x526470);
  reg('studio-mic','v12.world.studioSet',mic,[],[],{footprint:{w:.38,d:.38,h:1.68},locked:'structure'});
 }
 for(let ax=0;ax<4;ax++){
  box(room,[.55,.55,.09],[-22.4+ax*.68,2.05,15.72],0x3b434b);
  box(room,[.55,.55,.09],[-22.4+ax*.68,1.38,15.72],0x4a535c);
 }

 // 4b. Pod Kubikel '+' Kreatif NE (desks 4, 6, 7, 10) — jarak 1.0 m bersih dari karpet set syuting!
 patternedRug(room,-14.5,11.0,6.4,6.4,5,null,layout.rugs,'studio-pod');
 buildCubicleCluster('studio',-14.5,11.0,{armLen:2.40,dualMonitor:false,accent:0xd9845b,slotIndices:[4,6,7,10]});

 // 4c. Papan Storyboard & Palet Warna Dinamis (layout.studioBoard) di dinding selatan
 let studioState=null;
 const studioBoardNode=node(-14.5,15.70,Math.PI);
 const studioBoard=designPlane(studioBoardNode,3.6,1.50,0,2.0,0,(c,Wv,Hv)=>{
  c.fillStyle='#f6eedc';c.fillRect(0,0,Wv,Hv);c.strokeStyle='#9c6e4e';c.lineWidth=10;c.strokeRect(6,6,Wv-12,Hv-12);
  c.fillStyle='#3d2f28';I18n.draw(c,I18n.raw('v12.world.studioBoard'),22,14,Wv-44,34,{size:24,min:14,weight:'bold'});
  const sw=['#d9845b','#f2c76b','#5ba68c','#5b8cc4','#a47ec4','#3e7a65'];
  const stageKeys=['brief','research','script','storyboard','render','qa_publish'];
  const wf=studioState;
  if(wf&&wf.title){
   c.fillStyle='#243e44';c.fillRect(20,52,Wv-40,42);
   c.fillStyle='#f7ead0';I18n.draw(c,String(wf.title),30,58,Wv-60,30,{size:20,min:13,weight:'bold',literal:true});
   const activeIdx=Math.max(0,stageKeys.indexOf(wf.currentStageId||wf.currentStage||wf.stage||'brief'));
   stageKeys.forEach((sk,i)=>{
    const bx=20+i*79,done=i<activeIdx||wf.status==='completed',cur=i===activeIdx&&wf.status!=='completed';
    c.fillStyle=done?'#4e9471':cur?(wf.status==='awaiting_approval'?'#d99043':'#5b8cc4'):'#d8cfc0';
    c.fillRect(bx,108,71,56);
    c.fillStyle=done||cur?'#ffffff':'#4a4139';
    I18n.draw(c,String(i+1),bx,122,71,28,{size:22,min:14,align:'center',weight:'bold',literal:true});
   });
   c.fillStyle=wf.status==='awaiting_approval'?'#b5542c':'#2d6a52';
   c.fillRect(20,180,Wv-40,48);
   c.fillStyle='#fff6e2';
   I18n.draw(c,wf.status==='awaiting_approval'?t('v10.status.pending'):String(wf.channel||'SHORT'),30,190,Wv-60,28,{size:22,min:14,align:'center',weight:'bold',literal:true});
  }else{
   sw.forEach((col,i)=>{
    const bx=22+i*79;
    c.fillStyle=col;c.fillRect(bx,62,68,66);
    c.fillStyle='#ffffff';c.fillRect(bx,142,68,54);
    c.strokeStyle='#8b7765';c.lineWidth=2;c.strokeRect(bx,142,68,54);
   });
   c.fillStyle='#5c4a3d';I18n.draw(c,I18n.raw('v12.world.studioIdle'),22,208,Wv-44,30,{size:19,min:13,align:'center',weight:'bold'});
  }
 });
 studioBoard.update=wf=>{studioState=wf||null;studioBoard.redraw();};
 layout.studioBoard=studioBoard;
 reg('studio-board','v12.world.studioBoard',studioBoardNode,[[0,1.7,0]],['read'],{footprint:false,locked:'story'});
 layout.clicks.push({kind:'shorts',point:new THREE.Vector3(-14.5,2.0,15.65)});
 sign(room,I18n.raw('v12.world.studioSign'),-14.5,3.28,15.68,4.0,'#f5c290',Math.PI);

 // ==========================================================================
 // 5. ZONA 9 — RUANG MUTU & DOKUMEN (Timur Tengah: x +10.5..+24.0, z -7.5..+4.2)
 // ==========================================================================
 // PERBAIKAN KRITIS KARPET: celah Z = +0.30 m antara karpet Manajer/Inspeksi (z max = -2.2) dan karpet Kubikel QA (z min = -1.9)!
 patternedRug(room,13.8,-4.6,5.0,4.8,6,null,layout.rugs,'mutu-manager');
 patternedRug(room,18.6,0.9,6.4,5.6,6,null,layout.rugs,'mutu-qa');

 // Meja & Kursi Manajer Mutu (14.0, -6.2)
 const managerDesk=makeDesk();managerDesk.position.set(14.0,0,-6.2);room.add(managerDesk);
 detailProp(managerDesk,'Desk lamp',1.10,1.23,-.36,0x3a5362);
 detailProp(managerDesk,'Mug',-1.05,1.23,.28);detailProp(managerDesk,'Paper stack',.72,1.23,-.28);
 detailProp(managerDesk,'Desk nameplate',0,1.23,.48);detailProp(managerDesk,'Wastebasket',1.02,.04,-.34);
 const managerObject=reg('quality-manager-desk','v10.managerDesk',managerDesk,[[0,1.2,0,'sit'],[-2,1.2,-Math.PI/2]],['sit_work'],{footprint:{w:2.75,d:1.25,h:1.95},locked:'story'});
 managerObject.screen=design.screens.at(-1);
 const managerChair=makeChair(0x2f4856);managerChair.position.set(14.0,0,-5.0);room.add(managerChair);
 reg('quality-manager-chair','strings.kursi',managerChair,[[0,0,0,'sit']],['sit'],{soft:true,footprint:{w:.86,d:.72,h:1.34},locked:'story'});
 layout.managerDesk={objectId:managerObject.id,screen:managerObject.screen,get seat(){return W.point(managerObject.id);}};

 // Meja Inspeksi Mutu (14.0, -2.8) + baki IN/OUT + 3 lampu indikator + stempel
 const inspect=node(14.0,-2.8);
 box(inspect,[3.0,.16,1.10],[0,1.10,0],0x86a395);
 for(const ix of [-1.3,1.3])box(inspect,[.12,1.10,.82],[ix,.55,0],0x53666b);
 reg('inspection','v10.inspection',inspect,[[0,-1.2,Math.PI],[0,1.3,0]],['handoff','read'],{footprint:{w:3.0,d:1.10,h:1.2},locked:'story'});
 for(const [id,key,ix,pt] of [['inspection-in','v10.inspectionIn',13.0,[0,1.3,0]],['inspection-out','v10.inspectionOut',15.0,[0,-1.2,Math.PI]]]){
  const n=node(ix,-2.8);box(n,[.65,.12,.65],[0,1.25,0],0x3b575e);
  reg(id,key,n,[pt],['handoff'],{footprint:{w:.65,d:.65,h:1.35},on:'inspection',locked:'story'});
 }
 const trayPapers=[];
 for(const [id,ix] of [['inspection-in',13.0],['inspection-out',15.0]]){
  const g=new THREE.Group();g.position.set(ix,0,-2.8);dynamic.add(g);
  const sheets=[];for(let i=0;i<10;i++){const s=box(g,[.51,.035,.50],[0,1.34+i*.04,0],0xf5e7c7);s.visible=false;sheets.push(s);}
  const o=W.add(id+'-papers',I18n.raw('v10.inspection'),g,{points:[],footprint:false,locked:'follow'});o.follow=id;
  trayPapers.push({id,sheets});
 }
 const indicators=new THREE.Group();indicators.position.set(14.0,0,-2.8);dynamic.add(indicators);
 const lights=W.add('inspection-lights',I18n.raw('v10.inspection'),indicators,{points:[],footprint:false,locked:'follow'});lights.follow='inspection';
 layout.qualityLamps=[];
 for(let i=0;i<3;i++)layout.qualityLamps.push(box(indicators,[.20,.24,.20],[-.45+i*.45,1.40,-.30],[0x69a57b,0xc16c59,0xd7b55e][i]));
 const ink=node(14.0,-2.8);
 for(let i=0;i<3;i++){box(ink,[.25,.07,.23],[-.45+i*.45,1.25,.30],[0x69a57b,0xc16c59,0xd7b55e][i]);box(ink,[.10,.20,.10],[-.45+i*.45,1.37,.30],0x5f5344);}
 reg('quality-stamps','v10.stamps',ink,[],[],{on:'inspection',footprint:{w:1.2,d:.30,oz:.30,h:1.5},locked:'story'});
 const stampLabels=designPlane(ink,1.35,.22,0,1.58,.42,(c,Wv,Hv)=>{
  c.fillStyle='#263e44';c.fillRect(0,0,Wv,Hv);
  for(let i=0;i<3;i++){c.fillStyle=['#9ac7a5','#edab96','#ead180'][i];I18n.draw(c,t('v10.result.'+['pass','fail','unsure'][i]),i*170+4,8,162,240,{size:47,min:17,align:'center',valign:'middle'});}
 });
 stampLabels.mesh.userData.noHit=true;
 layout.stampSurface=designPlane(inspect,1.1,.7,0,1.23,0,()=>{});
 layout.stampSurface.mesh.rotation.x=-Math.PI/2;layout.stampSurface.mesh.userData.noHit=true;
 sign(room,I18n.raw('v10.inspection'),14.0,1.56,-2.22,2.1,'#e8d8a8');

 // Klaster Kubikel '+' QA & Dokumen (desks 5, 8, 9, 11)
 buildCubicleCluster('qa',18.5,1.0,{armLen:2.40,dualMonitor:false,accent:0x589476,slotIndices:[5,8,9,11]});

 // Papan Kanban Besar di dinding Lobby Utara (-8.5, -15.72) menghadap +Z
 const kanbanNode=node(-8.5,-15.72);
 box(kanbanNode,[5.6,.12,.16],[0,1.15,0],0x6e847d);
 layout.qualityKanban=designPlane(kanbanNode,5.6,1.95,0,2.22,.10,()=>{});
 reg('quality-kanban','v10.kanban',kanbanNode,[[0,1.72,0]],['read'],{footprint:false,locked:'story'});

 // Lemari Pembelajaran & Rak Buku dinding timur Mutu & Dokumen
 const cabinet=makeShelf();cabinet.position.set(23.3,0,-4.5);cabinet.rotation.y=-Math.PI/2;room.add(cabinet);
 const learning=reg('learning-cabinet','v10.learningCabinet',cabinet,[[0,1.3,0]],['read','file_archive'],{footprint:{w:2.86,d:.64,h:2.8},locked:'story'});
 layout.learningCabinet=cabinet;
 const learningPapers=new THREE.Group();learningPapers.position.set(23.3,0,-4.5);learningPapers.rotation.y=-Math.PI/2;dynamic.add(learningPapers);
 const learnSlots=[];
 for(let i=0;i<24;i++){
  const p=box(learningPapers,[.13,.39,.25],[-1.12+(i%12)*.2,.42+Math.floor(i/12)*.85,.24],0xe3c46e);
  const g=box(learningPapers,[.13,.39,.25],[-1.12+(i%12)*.2,.42+Math.floor(i/12)*.85,.24],0x80b796);
  p.visible=g.visible=false;learnSlots.push({p,g});
 }
 const lp=W.add('learning-paper-slots',I18n.raw('v10.learningCabinet'),learningPapers,{points:[],footprint:false,locked:'follow'});lp.follow=learning.id;
 let learningCount=0;
 const learningCounter=designPlane(cabinet,1.5,.32,0,2.7,.4,(c,Wv,Hv)=>{
  c.fillStyle='#263e44';c.fillRect(0,0,Wv,Hv);c.fillStyle='#ead28a';
  I18n.draw(c,t('v10.learnings')+' '+I18n.number(learningCount),8,8,Wv-16,Hv-16,{size:60,min:18,align:'center'});
 });
 learningCounter.mesh.userData.noHit=true;
 sign(room,I18n.raw('v10.learningCabinet'),23.68,3.30,-4.5,3.8,'#edc981',-Math.PI/2);
 if(H.shelf)H.shelf(23.3,1.0,-Math.PI/2,'bookshelf-3');
 if(H.plant){H.plant(11.3,-6.7,1.0);H.plant(11.3,3.1,1.0);}

 // Finalisasi array specialistDesks berurutan 0..11 + inbox untuk meja residen
 layout.specialistDesks=specialistBySlot;
 for(const d of layout.desks)inbox(d,d.objectId,null,[[1.44,1.45,Math.PI/4]]);
 layout.updateInboxes=actors=>{for(const {d,sheets} of inboxes){const a=actors.find(a=>a.desk===d&&!a.removed),count=a?.inbox||0;for(let i=0;i<sheets.length;i++)sheets[i].visible=i<Math.min(5,count);}};
 layout.stylePersona=(d,p)=>{d.state.name=p?.name||'';d.state.color=p?.color||'#8a9da2';d.plate.redraw();};
 layout.updateQualityPapers=(inside,out,ls)=>{
  trayPapers.forEach(({id,sheets})=>sheets.forEach((s,i)=>{s.visible=i<Math.min(10,id==='inspection-in'?inside:out);}));
  const live=ls.filter(l=>l.status!=='rejected').slice(-24);
  learnSlots.forEach(({p,g},i)=>{p.visible=i<live.length&&live[i].status==='pending';g.visible=i<live.length&&live[i].status==='approved';});
  if(learningCount!==live.length){learningCount=live.length;learningCounter.redraw();}
 };
 let lastReport=null,lastReportName='';
 const reportPlate=designPlane(W.get('tray').node,1.5,.48,0,1.68,.52,()=>{});reportPlate.mesh.userData.noHit=true;
 layout.updateReportStamp=(r,name)=>{
  lastReport=r;lastReportName=name;const c=reportPlate.ctx;I18n.begin(c);c.clearRect(0,0,512,256);
  if(r){
   c.fillStyle=r.result==='pass'?'#296d54':'#a34736';c.fillRect(0,0,512,256);c.fillStyle='#fff3d7';
   I18n.draw(c,t('v10.result.'+r.result),10,5,492,100,{size:66,min:23,align:'center',weight:'bold'});
   I18n.draw(c,(name||t('v10.unknown'))+' · '+t('v10.round',{n:r.round}),10,106,492,144,{size:36,min:15,align:'center'});
  }
  reportPlate.texture.needsUpdate=true;
 };
 reportPlate.redraw=()=>layout.updateReportStamp(lastReport,lastReportName);

 // ==========================================================================
 // 6. ZONA 10 — RUANG TRADING MT5 & KEUANGAN KANTOR (Timur Selatan: x +10.5..+24, z +4.2..+16)
 // ==========================================================================
 // Karpet MT5 (z: 4.8..9.6) & Keuangan (z: 10.8..15.4) — celah 1.20 m tanpa tumpang tindih!
 patternedRug(room,17.4,7.2,10.4,4.8,7,'#58c98f',layout.rugs,'mt5');
 patternedRug(room,17.4,13.1,10.4,4.6,8,'#e4bf6b',layout.rugs,'finance');

 // Helper monitor khusus MT5 (candlestick dinamis) & Keuangan (grafik batang dinamis)
 function makeCustomMonitor(parent,lx,ly,lz,rotY,scale,drawFn){
  const g=new THREE.Group();g.position.set(lx,ly,lz);g.rotation.y=rotY;g.scale.setScalar(scale);
  box(g,[.30,.05,.24],[0,.025,0],0x293745);box(g,[.08,.28,.08],[0,.17,-.02],0x3b4b59);box(g,[.98,.60,.09],[0,.54,0],0x243240);
  const scr=designPlane(g,.88,.50,0,.54,.054,drawFn);scr.mesh.userData.noHit=true;
  parent.add(g);return scr;
 }

 // 6a. Sub-Zona Utara: Stasiun Trading MT5 (Read-Only)
 let mt5State={connected:false,status:'idle',activePositions:[],activeSide:null,floatingProfit:0,currency:'USD'};
 const drawCandlestick=(idx)=>(c,Wv,Hv)=>{
  const st=mt5State,pos=st.activePositions?.[idx%Math.max(1,(st.activePositions||[]).length)];
  const side=pos?.side||st.activeSide;
  const accent=side==='BUY'?'#3fd28a':side==='SELL'?'#eb6b5e':'#7ab8c4';
  c.fillStyle='#0f1c20';c.fillRect(0,0,Wv,Hv);
  c.strokeStyle='#20383e';c.lineWidth=2;
  for(let i=1;i<6;i++){c.beginPath();c.moveTo(0,i*42);c.lineTo(Wv,i*42);c.stroke();}
  const seeds=[[160,145,152,130,118,125,102,95,110,84,72,80,62,54,65,48],[90,104,96,118,126,115,134,142,130,152,146,160,150,168,158,172],[132,126,138,120,128,112,122,106,116,102,110,98,108,92,102,88],[144,138,148,134,140,126,136,120,128,118,124,114,120,108,116,104]];
  const arr=seeds[idx%4];
  arr.forEach((v,i)=>{
   const up=side==='SELL'?(i%3===0):(i===0?true:v<arr[i-1]);
   c.fillStyle=up?'#3fd28a':'#eb6b5e';
   const bx=24+i*29;c.fillRect(bx+7,v-18,3,50);c.fillRect(bx,v,17,24+(i%3)*7);
  });
  const sym=pos?.symbol||['XAUUSD','EURUSD','USDJPY','GBPUSD'][idx%4];
  const header=pos?(sym+' · '+pos.side+' '+(pos.profit>=0?'+':'')+Number(pos.profit||0).toFixed(2)):(sym+' · '+(st.connected?'LIVE':'MT5'));
  c.fillStyle=accent;I18n.draw(c,header,18,12,Wv-36,30,{size:22,min:14,weight:'bold',literal:true});
 };

 const mt5DeskN=node(17.5,6.2);
 box(mt5DeskN,[4.2,.15,1.40],[0,1.08,0],0x3b4d56);
 box(mt5DeskN,[4.12,.04,1.32],[0,1.175,0],0x4a5e68);
 for(const lx of [-1.92,1.92])for(const lz of [-.54,.54])box(mt5DeskN,[.12,1.02,.12],[lx,.51,lz],0x27353d);
 layout.mt5Screens=[
  makeCustomMonitor(mt5DeskN,-1.48,1.20,-.24,.24,.94,drawCandlestick(0)),
  makeCustomMonitor(mt5DeskN,-.48,1.20,-.34,.06,.98,drawCandlestick(1)),
  makeCustomMonitor(mt5DeskN,.52,1.20,-.34,-.06,.98,drawCandlestick(2)),
  makeCustomMonitor(mt5DeskN,1.52,1.20,-.24,-.24,.94,drawCandlestick(3))
 ];
 box(mt5DeskN,[.76,.04,.26],[0,1.22,.36],0x222d36);
 box(mt5DeskN,[.13,.05,.18],[.62,1.22,.36],0x222d36);
 detailProp(mt5DeskN,'Mug',-1.72,1.20,.34);detailProp(mt5DeskN,'Desk clock',1.74,1.20,.34);
 detailProp(mt5DeskN,'Phone stand',-1.22,1.20,.36);detailProp(mt5DeskN,'Wastebasket',1.78,.04,-.36);
 sign(mt5DeskN,I18n.raw('v12.world.mt5Desk'),0,.72,-.72,2.1,'#6ce6a4',Math.PI,'#1a3330');

 const mt5DeskObj=reg('mt5-desk','v12.world.mt5Desk',mt5DeskN,[[0,1.8,0,'sit'],[2.0,2.3,0,'stand']],['sit_work'],{footprint:{w:4.2,d:1.40,h:1.85},locked:'story'});
 mt5DeskObj.screen=layout.mt5Screens[1];
 // Sayap L barat meja MT5 (terpisah agar footprint tidak menabrak kursi mt5-chair!)
 const mt5RetN=node(15.9,7.55);
 box(mt5RetN,[1.0,.15,1.24],[0,1.08,0],0x3b4d56);box(mt5RetN,[.92,.04,1.16],[0,1.175,0],0x4a5e68);
 for(const lx of [-.38,.38])for(const lz of [-.48,.48])box(mt5RetN,[.11,1.02,.11],[lx,.51,lz],0x27353d);
 detailProp(mt5RetN,'Notebook',0,1.20,.10,0x3fd28a);detailProp(mt5RetN,'Water bottle',-.24,1.20,-.32);
 const mt5RetObj=reg('mt5-desk-ret','v12.world.mt5Desk',mt5RetN,[],[],{footprint:{w:1.0,d:1.24,h:1.22},locked:'follow'});
 mt5RetObj.follow=mt5DeskObj.id;

 const mt5ChairN=makeChair(0x243b39);mt5ChairN.position.set(17.5,0,8.0);room.add(mt5ChairN);
 const mt5ChairObj=reg('mt5-chair','v12.world.mt5Chair',mt5ChairN,[[0,0,0,'sit']],['sit'],{soft:true,footprint:{w:.86,d:.72,h:1.34},locked:'story'});

 // Suar Status BUY/SELL MT5 (skala dasar .34 agar animasi pulse tidak membesar berlebih!)
 const beaconPed=node(20.5,6.2);
 box(beaconPed,[.48,1.45,.48],[0,.725,0],0x263840);
 box(beaconPed,[.54,.08,.54],[0,1.46,0],0x3a525c);
 reg('mt5-beacon','v12.world.mt5Beacon',beaconPed,[],[],{footprint:{w:.52,d:.52,h:1.85},locked:'story'});
 const mt5Beacon=voxelBox(dynamic,[.34,.34,.34],[20.5,1.66,6.2],0x527578);
 mt5Beacon.userData.baseScale=[.34,.34,.34];
 layout.mt5Beacon=mt5Beacon;
 layout.mt5BeaconBase={x:.34,y:.34,z:.34};
 layout.setMt5Beacon=mode=>{
  const col=mode==='BUY'||mode==='buy'?0x42de8c:mode==='SELL'||mode==='sell'?0xeb6b5e:mode==='connected'?0x64b5c4:0x527578;
  if(!voxelMaterials.has(col))voxelMaterials.set(col,new THREE.MeshLambertMaterial({color:col}));
  mt5Beacon.material=voxelMaterials.get(col);
 };

 // Papan Dinding Timur: MT5 LIVE · READ-ONLY (layout.mt5Board dengan .update(state))
 const mt5BoardNode=node(23.68,7.0,-Math.PI/2);
 const mt5Board=designPlane(mt5BoardNode,4.0,1.55,0,1.92,0,(c,Wv,Hv)=>{
  const st=mt5State,pos=Array.isArray(st.activePositions)?st.activePositions:[];
  const active=pos.length>0,side=st.activeSide||pos[0]?.side||null;
  const border=side==='BUY'?'#4ad18c':side==='SELL'?'#eb6b5e':'#6ab5c2';
  c.fillStyle='#122226';c.fillRect(0,0,Wv,Hv);c.strokeStyle=border;c.lineWidth=8;c.strokeRect(6,6,Wv-12,Hv-12);
  c.fillStyle=border;I18n.draw(c,I18n.raw('v12.world.mt5Board'),20,16,Wv-40,34,{size:25,min:14,weight:'bold'});
  if(active){
   pos.slice(0,3).forEach((p,i)=>{
    // [Diubah oleh Codex - 2026-11-21] Match the panel's per-position net and native currency.
    const net=Number(p.net_floating??p.profit??0);
    const pCol=net>=0?'#75e3a8':'#f28779';
    c.fillStyle=pCol;
    const row=String(p.symbol||'MT5')+'  '+String(p.side||'BUY')+'  '+Number(p.volume||0).toFixed(2)+'  '+(net>=0?'+':'')+net.toFixed(2)+' '+String(st.currency||'USD');
    I18n.draw(c,row,22,64+i*36,Wv-44,30,{size:21,min:13,weight:'bold',literal:true});
   });
   c.fillStyle=side==='SELL'?'#5c2824':'#255c43';c.fillRect(20,186,Wv-40,48);
   const fp=Number(st.netFloating??st.floatingProfit??0);
   c.fillStyle=side==='SELL'?'#ffd0c8':'#a8ffd0';
   I18n.draw(c,t('mt5v17.net')+' · '+String(pos.length)+' '+String(side||'OPEN')+' · '+(fp>=0?'+':'')+fp.toFixed(2)+' '+String(st.currency||'USD'),28,196,Wv-56,30,{size:22,min:14,align:'center',weight:'bold',literal:true});
  }else{
   c.fillStyle='#b8d0d4';
   I18n.draw(c,I18n.raw('v12.world.mt5Idle'),22,94,Wv-44,44,{size:23,min:14,align:'center',weight:'bold'});
   c.fillStyle='#1f3b40';c.fillRect(20,186,Wv-40,48);
   c.fillStyle='#8ec9d4';
   I18n.draw(c,st.connected?t('strings.terhubung'):t('v12.world.mt5Board'),28,196,Wv-56,30,{size:21,min:14,align:'center',weight:'bold',literal:true});
  }
 });
 mt5Board.update=state=>{
  mt5State={...mt5State,...(state||{})};
  mt5Board.redraw();
  layout.mt5Screens.forEach(s=>s.redraw());
  layout.setMt5Beacon(mt5State.activePositions?.length?(mt5State.activeSide||mt5State.activePositions[0]?.side||'BUY'):mt5State.connected?'connected':'idle');
 };
 layout.mt5Board=mt5Board;
 reg('mt5-board','v12.world.mt5Board',mt5BoardNode,[[0,1.68,0]],['read'],{footprint:false,locked:'story'});
 layout.mt5Desk={objectId:mt5DeskObj.id,chairId:mt5ChairObj.id,screen:layout.mt5Screens[1],screens:layout.mt5Screens,get seat(){return W.point('mt5-desk',0);},get handoff(){return W.point('mt5-desk',1);}};
 Object.defineProperty(layout,'mt5Seat',{get:()=>W.point('mt5-desk',0)});
 layout.clicks.push({kind:'mt5',point:new THREE.Vector3(23.60,1.92,7.0)},{kind:'mt5',point:new THREE.Vector3(17.5,1.5,6.2)});

 // 6b. Sub-Zona Selatan: Stasiun Keuangan Kantor (Jujur Rp 0 bawaan!)
 let finSummary={totalIncomeIdr:0,totalLossIdr:0,netBalanceIdr:0,bySource:{mt5:0,youtube:0,affiliate:0,freelance:0,other:0},entryCount:0};
 const fmtIdrShort=n=>{const v=Math.round(Number(n)||0);return I18n.moneyIDR(v,{maximumFractionDigits:0});};
 const drawFinScreen=(idx)=>(c,Wv,Hv)=>{
  const s=finSummary,bs=s.bySource||{};
  c.fillStyle='#142428';c.fillRect(0,0,Wv,Hv);
  c.fillStyle='#edc580';I18n.draw(c,I18n.raw(idx===0?'v12.world.financeNet':'v12.world.financeBoard'),18,14,Wv-36,30,{size:22,min:13,weight:'bold'});
  if(idx===0){
   const vals=[bs.mt5||0,bs.youtube||0,bs.affiliate||0,bs.freelance||0,bs.other||0];
   const mx=Math.max(1,...vals.map(Math.abs));
   vals.forEach((v,i)=>{
    const bh=Math.max(8,Math.abs(v)/mx*128);
    c.fillStyle=v<0?'#d96b5e':(i%2?'#59b88a':'#e6be6c');
    c.fillRect(42+i*90,Hv-42-bh,54,bh);
   });
   c.fillStyle='#f4ead0';I18n.draw(c,fmtIdrShort(s.netBalanceIdr),18,Hv-34,Wv-36,26,{size:20,min:13,align:'center',weight:'bold',literal:true});
  }else{
   c.fillStyle='#e8f0eb';
   const rows=[['MT5',bs.mt5||0],['YouTube',bs.youtube||0],['Affiliate',bs.affiliate||0],['Freelance',bs.freelance||0]];
   rows.forEach(([k,v],i)=>I18n.draw(c,k+': '+fmtIdrShort(v),22,64+i*38,Wv-44,30,{size:20,min:13,literal:true}));
  }
 };

 const finDeskN=node(16.0,12.5);
 box(finDeskN,[3.6,.15,1.35],[0,1.08,0],0x9b744d);
 box(finDeskN,[3.52,.04,1.27],[0,1.175,0],0xb38a5e);
 for(const lx of [-1.62,1.62])for(const lz of [-.50,.50])box(finDeskN,[.12,1.02,.12],[lx,.51,lz],0x3f5557);
 layout.financeScreens=[
  makeCustomMonitor(finDeskN,-.58,1.20,-.24,.10,.92,drawFinScreen(0)),
  makeCustomMonitor(finDeskN,.54,1.20,-.24,-.10,.88,drawFinScreen(1))
 ];
 // Baki Profit (hijau) & Baki Rugi/Biaya (merah)
 box(finDeskN,[.55,.14,.45],[-1.42,1.24,.18],0x3b8a62);
 box(finDeskN,[.55,.14,.45],[1.42,1.24,.18],0xa84a3d);
 box(finDeskN,[.64,.04,.24],[0,1.22,.34],0x2c3945);
 detailProp(finDeskN,'Desk lamp',-1.48,1.20,-.36,0xe6be68);
 detailProp(finDeskN,'Pen cup',1.46,1.20,-.36,0x3b8a62);
 detailProp(finDeskN,'Mug',-.92,1.20,.36);detailProp(finDeskN,'Wastebasket',1.46,.04,-.38);
 sign(finDeskN,I18n.raw('v12.world.financeDesk'),0,.72,-.70,2.3,'#f2d07e',Math.PI,'#263830');

 const finDeskObj=reg('finance-desk','v12.world.financeDesk',finDeskN,[[0,1.5,0,'sit'],[-1.5,1.5,0,'stand']],['sit_work','handoff'],{footprint:{w:3.6,d:1.35,h:1.85},locked:'story'});
 finDeskObj.screen=layout.financeScreens[0];
 const finChairN=makeChair(0x3b4c3d);finChairN.position.set(16.0,0,14.0);room.add(finChairN);
 const finChairObj=reg('finance-chair','v12.world.financeChair',finChairN,[[0,0,0,'sit']],['sit'],{soft:true,footprint:{w:.86,d:.72,h:1.34},locked:'story'});

 // Brankas Besi Kantor + Dial Emas (finance-safe) di (22.0, 14.5) menghadap Utara (Math.PI)
 const safeN=node(22.0,14.5,Math.PI);
 box(safeN,[1.48,1.85,1.24],[0,.925,0],0x2c3b44);
 box(safeN,[1.26,1.62,.08],[0,.94,.62],0x394b56);
 box(safeN,[.46,.46,.10],[0,1.05,.68],0xe6bf68);
 box(safeN,[.12,.36,.12],[-.38,1.02,.68],0xc9d2d6);
 for(const hy of [.45,.95,1.45])box(safeN,[.09,.18,.10],[.66,hy,.62],0x8d9aa0);
 const safeObj=reg('finance-safe','v12.world.financeSafe',safeN,[[0,1.5,0,'stand']],['file_archive'],{footprint:{w:1.48,d:1.24,h:1.86},locked:'story'});
 layout.financeSafe=safeObj;

 // Papan Dinding Timur: LAPORAN KEUANGAN KANTOR (layout.financeBoard dengan .update(summary), bawaan Rp 0!)
 const finBoardNode=node(23.68,12.8,-Math.PI/2);
 const finBoard=designPlane(finBoardNode,4.0,1.55,0,1.92,0,(c,Wv,Hv)=>{
  const s=finSummary,bs=s.bySource||{};
  c.fillStyle='#1d2d29';c.fillRect(0,0,Wv,Hv);c.strokeStyle='#e6be68';c.lineWidth=8;c.strokeRect(6,6,Wv-12,Hv-12);
  c.fillStyle='#f2d07e';I18n.draw(c,I18n.raw('v12.world.financeBoard'),20,16,Wv-40,34,{size:24,min:14,weight:'bold'});
  c.fillStyle='#e8f0eb';
  const rows=[
   ['MT5',bs.mt5||0],
   ['YouTube',bs.youtube||0],
   ['Affiliate',bs.affiliate||0],
   ['Freelance',bs.freelance||0]
  ];
  rows.forEach(([lbl,val],i)=>{
   I18n.draw(c,'• '+lbl+' : '+fmtIdrShort(val),24,62+i*28,Wv-48,26,{size:19,min:13,literal:true});
  });
  const net=Number(s.netBalanceIdr||0);
  c.fillStyle=net<0?'#6e2e29':'#2d5746';c.fillRect(20,186,Wv-40,48);
  c.fillStyle='#ffe59e';
  I18n.draw(c,t('v12.world.financeNet')+': '+fmtIdrShort(net),28,196,Wv-56,30,{size:22,min:14,align:'center',weight:'bold',literal:true});
 });
 finBoard.update=summary=>{
  finSummary={...finSummary,...(summary||{}),bySource:{...finSummary.bySource,...(summary?.bySource||{})}};
  finBoard.redraw();
  layout.financeScreens.forEach(s=>s.redraw());
 };
 layout.financeBoard=finBoard;
 reg('finance-board','v12.world.financeBoard',finBoardNode,[[0,1.68,0]],['read'],{footprint:false,locked:'story'});
 layout.financeDesk={objectId:finDeskObj.id,chairId:finChairObj.id,screen:layout.financeScreens[0],screens:layout.financeScreens,get seat(){return W.point('finance-desk',0);},get handoff(){return W.point('finance-desk',1);}};
 Object.defineProperty(layout,'financeSeat',{get:()=>W.point('finance-desk',0)});
 layout.clicks.push({kind:'finance',point:new THREE.Vector3(23.60,1.92,12.8)},{kind:'finance',point:new THREE.Vector3(16.0,1.5,12.5)},{kind:'finance',point:new THREE.Vector3(22.0,1.2,14.5)});

 sign(room,I18n.raw('v12.world.mt5FinanceSign'),23.68,3.32,9.8,4.0,'#f2d07e',-Math.PI/2);
 if(H.plant)H.plant(11.3,14.8,1.0);
}
