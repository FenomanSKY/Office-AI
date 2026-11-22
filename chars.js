/* Semua bagian karakter menggunakan kotak yang berbagi geometri. */
'use strict';
const voxelMaterials = new Map();
let voxelGeometry;
function voxelBox(parent, size, position, color) {
  voxelGeometry ||= new THREE.BoxGeometry(1, 1, 1);
  if (!voxelMaterials.has(color)) voxelMaterials.set(color, new THREE.MeshLambertMaterial({color}));
  const mesh = new THREE.Mesh(voxelGeometry, voxelMaterials.get(color));
  mesh.scale.set(...size); mesh.position.set(...position);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function makeVoxelChar({skin=0xe8b48b, hair=0x42352e, hairStyle='short', shirt=0x558ae4, pants=0x34445b, accessory='headset', outfit='tee', shoes=0xf0eee7}={}) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  voxelBox(body,[.52,.63,.34],[0,1.2,0],shirt);
  voxelBox(body,[.54,.13,.35],[0,.85,0],pants);
  const head = new THREE.Group(); head.position.y=1.74; body.add(head);
  voxelBox(head,[.55,.55,.49],[0,0,0],skin);
  if(hairStyle!=='bald')voxelBox(head,[.58,.16,.52],[0,.25,.01],hair);
  if(hairStyle!=='bald')voxelBox(head,[.56,.37,.11],[0,.02,.24],hair);
  const eyeL=voxelBox(head,[.08,.07,.025],[-.13,.01,-.253],0x27303b);
  const eyeR=voxelBox(head,[.08,.07,.025],[.13,.01,-.253],0x27303b);
  const mouth=voxelBox(head,[.10,.045,.035],[0,-.14,-.25],0xb67561),brows=[voxelBox(head,[.12,.025,.03],[-.13,.09,-.27],hair),voxelBox(head,[.12,.025,.03],[.13,.09,-.27],hair)];
  if(hairStyle==='long') {voxelBox(head,[.13,.61,.4],[-.28,-.07,.07],hair);voxelBox(head,[.13,.61,.4],[.28,-.07,.07],hair);}
  if(hairStyle==='ponytail'){voxelBox(head,[.18,.45,.18],[0,-.1,.37],hair);voxelBox(head,[.2,.08,.2],[0,.12,.36],shirt);}
  if(hairStyle==='quiff')voxelBox(head,[.25,.31,.38],[-.08,.41,-.12],hair);
  if(hairStyle==='hijab'||hairStyle==='hood'){const cloth=hairStyle==='hijab'?0x9d739c:shirt;voxelBox(head,[.65,.19,.62],[0,.32,.02],cloth);for(const x of [-.31,.31])voxelBox(head,[.13,.67,.52],[x,-.03,.06],cloth);voxelBox(head,[.63,.5,.16],[0,-.01,.31],cloth);voxelBox(body,[.64,.13,.45],[0,1.49,.06],cloth);}
  if(outfit==='tie'||outfit==='shirt'||outfit==='lab'){voxelBox(body,[.04,.53,.025],[0,1.2,-.18],0xe6dfcb);for(const x of [-.12,.12])voxelBox(body,[.16,.12,.03],[x,1.48,-.18],0xf0eee7);}
  if(outfit==='tie')voxelBox(body,[.09,.39,.035],[0,1.25,-.2],0x995051);
  if(outfit==='hoodie'){for(const x of [-.12,.12])voxelBox(body,[.025,.22,.03],[x,1.4,-.19],0xe6dfcb);voxelBox(body,[.33,.13,.035],[0,1.04,-.19],shirt);}
  if(outfit==='lab'){for(const x of [-.19,.19])voxelBox(body,[.18,.75,.39],[x,1.12,0],0xf0eee7);voxelBox(body,[.11,.12,.03],[.18,1.35,-.21],0x76cbe3);}
  if(hairStyle==='beard') voxelBox(head,[.43,.17,.08],[0,-.22,-.25],hair);
  if(hairStyle==='curly') for(let i=0;i<4;i++) voxelBox(head,[.18,.16,.54],[-.23+i*.15,.35+(i%2)*.04,0],hair);
  if(accessory==='cap'){voxelBox(head,[.64,.19,.57],[0,.30,0],shirt);voxelBox(head,[.6,.06,.28],[0,.23,-.32],shirt);}
  if(accessory==='glasses'){for(const x of [-.14,.14]){voxelBox(head,[.24,.16,.03],[x,0,-.27],0x283646);voxelBox(head,[.16,.09,.035],[x,0,-.29],0xa6d2e0);}voxelBox(head,[.07,.035,.04],[0,0,-.29],0x283646);}
  if(accessory==='headset'){voxelBox(head,[.67,.08,.14],[0,.34,0],0x334153);for(const x of [-.33,.33])voxelBox(head,[.13,.23,.23],[x,.05,0],0x334153);voxelBox(head,[.05,.04,.34],[.32,-.1,-.18],0x334153);}
  const arms=[],legs=[];
  for(const sign of [-1,1]){
    const arm=new THREE.Group();arm.position.set(sign*.38,1.43,0);body.add(arm);
    voxelBox(arm,[.22,.32,.26],[0,-.12,0],shirt);
    voxelBox(arm,[.19,.36,.22],[0,-.43,0],skin);arms.push(arm);
    const leg=new THREE.Group();leg.position.set(sign*.15,.83,0);body.add(leg);
    voxelBox(leg,[.22,.40,.25],[0,-.2,0],pants);
    const shin=new THREE.Group();shin.position.y=-.4;leg.add(shin);
    voxelBox(shin,[.21,.33,.24],[0,-.16,0],pants);
    voxelBox(shin,[.25,.13,.37],[0,-.36,-.055],shoes);legs.push({leg,shin});
  }
  const mug=voxelBox(arms[1],[.17,.21,.17],[0,-.58,-.08],0xf4f0df);mug.visible=false;
  const mark = new THREE.Group();mark.position.set(0,2.37,0);g.add(mark);
  voxelBox(mark,[.11,.3,.11],[0,.1,0],0xf16d5b);voxelBox(mark,[.11,.1,.11],[0,-.15,0],0xf16d5b);mark.visible=false;
  const effects=new THREE.Group();g.add(effects);const bits=[];for(let i=0;i<7;i++)bits.push(voxelBox(effects,[.07,.07,.07],[0,2.35,0],0xffd37c));effects.visible=false;const cloud=new THREE.Group();g.add(cloud);for(let i=0;i<5;i++)voxelBox(cloud,[.16,.13,.13],[-.27+i*.13,2.36+Math.sin(i)*.07,0],0xb9c7cf);cloud.visible=false;
  const scatter=new THREE.Group(),drips=new THREE.Group();g.add(scatter,drips);for(let i=0;i<5;i++){voxelBox(scatter,[.22,.018,.29],[0,1.5,0],0xf4eddb);voxelBox(drips,[.055,.07,.055],[0,1.2,0],0x754f37);}scatter.visible=drips.visible=false;
  const bag=new THREE.Group();arms[1].add(bag);voxelBox(bag,[.32,.4,.18],[.1,-.66,0],0xb88150);voxelBox(bag,[.18,.08,.06],[.1,-.43,0],0x594638);bag.visible=false;
  g.userData={scatter,drips,eyeL,eyeR,mouth,brows,bag,body,head,arms,legs,mug,mark,effects,cloud,bits,hairStyle,outfit,shoes,skin};return g;
}
function animateVoxelChar(char, status, moving, seated, t, phase) {
  const {body,head,arms,legs,mug,mark}=char.userData, wave=Math.sin(t*9+phase);
  for(const e of [char.userData.eyeL,char.userData.eyeR])e.scale.y=.07;char.userData.mouth.scale.set(.1,.045,.035);char.userData.brows.forEach(b=>b.rotation.z=0);
  body.position.y=seated?-.13:0;body.rotation.z=0;
  head.rotation.set(status==='working'?.04*Math.sin(t*3+phase):0, status==='idle'?.20*Math.sin(t*.65+phase):0,0);
  mug.visible=false;mark.visible=false;mark.position.y=2.35+Math.sin(t*3)*.07;
  char.userData.scatter.visible=false;char.userData.drips.visible=false;const {effects,bits}=char.userData;effects.visible=status==='done';char.userData.cloud.visible=status==='error';char.userData.cloud.position.y=Math.sin(t*2)*.04;bits.forEach((b,i)=>{const f=(t*.6+i/7)%1;b.position.set(Math.sin(i*2.4)*(.2+f*.35),2.3+f*.45,Math.cos(i*2.4)*.22);b.scale.setScalar(status==='error'?.14:.06*(1-f));});
  arms.forEach((a,i)=>{a.rotation.set(0,0,0);legs[i].leg.rotation.x=0;legs[i].shin.rotation.x=0;});
  if(moving){arms[0].rotation.x=-wave*.65;arms[1].rotation.x=wave*.65;legs[0].leg.rotation.x=wave*.55;legs[1].leg.rotation.x=-wave*.55;legs.forEach((l,i)=>l.shin.rotation.x=-Math.max(0,Math.sin(t*9+phase+i*Math.PI))*.35);body.position.y=Math.abs(wave)*.025;}
  else {
    if(seated)legs.forEach(l=>{l.leg.rotation.x=1.05;l.shin.rotation.x=-1.05;});
    if(status==='working'){arms[0].rotation.x=1.05+wave*.07;arms[1].rotation.x=1.05-wave*.07;}
    else if(status==='thinking'){arms[1].rotation.x=2.35;arms[1].rotation.z=-.30;head.rotation.z=-.1;}
    else if(status==='idle' && Math.sin(t*.5+phase)>.85){head.rotation.x=-.08;}
    else if(status==='meeting'){arms[0].rotation.z=.2+Math.sin(t*2+phase)*.2;}
  }
}

// Potret canvas voxel lokal, sesuai warna dan aksesori karakter.
function voxelPortrait(char,shirt){const c=document.createElement('canvas');c.width=48;c.height=48;const x=c.getContext('2d');x.fillStyle='#dbe7df';x.fillRect(0,0,48,48);x.fillStyle='#'+new THREE.Color(shirt).getHexString();x.fillRect(10,31,28,17);x.fillStyle='#'+new THREE.Color(char.userData.skin).getHexString();x.fillRect(14,10,22,23);x.fillStyle='#493b37';x.fillRect(12,7,24,7);if(['long','hijab','hood'].includes(char.userData.hairStyle)){x.fillRect(10,10,5,25);x.fillRect(35,10,5,25);}x.fillStyle='#263744';x.fillRect(18,20,4,4);x.fillRect(29,20,4,4);x.fillRect(23,28,6,2);return c.toDataURL();}

// Ekspresi ringan berbagi kotak yang sama; tidak membuat tekstur per reaksi.
function reactVoxelChar(char,expression,t,kind){const u=char.userData;u.scatter.visible=kind==='paper';u.drips.visible=kind==='coffee';for(const [group,paper] of [[u.scatter,true],[u.drips,false]])group.children.forEach((b,i)=>{const f=(t*.7+i/5)%1;b.position.set(Math.sin(i*2)*(.15+f*.45),1.7-f*1.4,Math.cos(i*2)*(.15+f*.45));b.rotation.z=paper?f*3:0;});u.eyeL.scale.y=u.eyeR.scale.y=expression==='surprised'?.12:expression==='laugh'?.035:.06;u.mouth.scale.y=expression==='surprised'?.13:expression==='laugh'?.085:.025;u.brows.forEach((b,i)=>b.rotation.z=(i?1:-1)*(expression==='annoyed'||expression==='angry'?.35:expression==='resigned'?-.18:0));u.head.rotation.z=expression==='dizzy'?Math.sin(t*5)*.2:expression==='resigned'?.15:0;u.effects.visible=expression==='dizzy'||kind==='play';u.bits.forEach((b,i)=>{const a=t*3+i*6.28/7;b.position.set(Math.cos(a)*.45,2.3+Math.sin(a*2)*.12,Math.sin(a)*.4);b.scale.setScalar(.07);});}
