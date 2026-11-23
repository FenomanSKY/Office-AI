/* Shared assets for office figures, props and articulated expressions. */
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
// Sculpted silhouettes share immutable geometry. The same meshes drive the scene and the rig.
const officeFigureShapes=new Map(), officeFigureMaterials=new Map();
function figureProfile(rings, exponent=1, hairline=false,sectors=24){
  const pos=[], uv=[], indices=[];
  const signed=t=>Math.sign(t)*Math.pow(Math.abs(t),exponent);
  for(let j=0;j<rings.length;j++){
    const [y,rx,rz,offset=0]=rings[j];
    for(let i=0;i<sectors;i++){
      const a=i/sectors*Math.PI*2, front=-Math.sin(a);
      const hem=hairline?(Math.max(0,front)*.61+Math.sin(a*3+.3)*.055)*(1-j/(rings.length-1)):0;
      pos.push(rx*signed(Math.cos(a)),y+hem,rz*signed(Math.sin(a))+offset);
      uv.push(i/sectors,j/(rings.length-1));
    }
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sectors;i++){
    const a=j*sectors+i,b=j*sectors+(i+1)%sectors;
    indices.push(a,a+sectors,b,b,a+sectors,b+sectors);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
// The placket, folded lapels and fringe keep their outline at portrait scale.
function figurePanel(outline){
 const shape=new THREE.Shape();
 outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
 shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:.35,bevelEnabled:true,bevelThickness:.08,bevelSize:.025,bevelSegments:1,steps:1});
 g.translate(0,0,-.20);return g;
}
function sweptFringe(){
 const pos=[],idx=[],u=[],rows=13,cols=10;
 for(let i=0;i<=rows;i++){
  const t=i/rows,volume=.12+.88*Math.pow(Math.sin(Math.PI*t),.57);
  for(let j=0;j<cols;j++){
   const a=j/cols*2*Math.PI;
   pos.push(t-.5, .09+.26*Math.sin(Math.PI*t)-.37*t*t+Math.cos(a)*volume*.38,
     .19*Math.pow(2*t-1,2)+Math.sin(a)*volume*.47);
   u.push(t,j/cols);
  }
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const a=i*cols+j,b=i*cols+(j+1)%cols,c=a+cols,d=b+cols;
  idx.push(a,b,c,b,d,c);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

function figureShape(name,overview=false){
  const key=overview?name+'-overview':name;
  if(officeFigureShapes.has(key))return officeFigureShapes.get(key);
  const profile=(rings,exponent,hairline)=>figureProfile(rings,exponent,hairline,overview?12:24);
  let g;
  switch(name){
    case 'fringe':g=sweptFringe();break;
    case 'lapel':g=figurePanel([[-.48,.5],[.44,.37],[.20,.12],[.49,.08],[-.34,-.50]]);break;
    case 'collar':g=figurePanel([[-.48,.37],[.35,.50],[.49,.09],[-.13,-.50]]);break;
    case 'tie':g=figurePanel([[-.21,.5],[.21,.5],[.46,-.33],[0,-.50],[-.46,-.33]]);break;
    case 'head':g=profile([[-.50,.13,.18,-.05],[-.43,.30,.33,-.055],[-.29,.43,.43,-.035],
      [-.05,.49,.50],[.17,.49,.49],[.34,.44,.44],[.46,.28,.32],[.5,.02,.02]],.84);break;
    case 'haircap':g=profile([[-.46,.46,.48],[-.15,.5,.50],[.14,.49,.48],[.34,.4,.40],[.46,.24,.26],[.50,.005,.005]],.85,true);break;
    case 'tailored':g=profile([[-.5,.38,.37],[-.47,.46,.46],[-.3,.44,.46],[.05,.46,.49],[.29,.50,.48],[.39,.46,.40],[.46,.31,.31],[.5,.23,.24]],.72);break;
    case 'limb':g=profile([[-.5,.04,.04],[-.47,.41,.42],[-.37,.45,.45],[.08,.47,.49],[.30,.50,.48],[.44,.38,.36],[.5,.06,.06]],.85);break;
    case 'shoe':g=profile([[-.5,.01,.01],[-.49,.40,.42],[-.32,.50,.49],[-.05,.49,.5],[.12,.45,.47],[.39,.39,.29,.11],[.50,.25,.22,.12]],.67);break;
    case 'lock':g=profile([[-.5,.04,.07,-.12],[-.31,.28,.32,-.07],[.03,.47,.46],[.24,.49,.49],[.43,.34,.32,.06],[.5,.03,.03,.08]],.94);break;
    case 'band':g=new THREE.TorusGeometry(.46,.035,overview?4:7,overview?15:30,Math.PI);break;
    case 'frame':g=new THREE.TorusGeometry(.426,.068,overview?4:6,overview?14:28);break;
    case 'oval':g=new THREE.SphereGeometry(.5,overview?8:16,overview?6:12);break;
    case 'pin':g=new THREE.SphereGeometry(.5,overview?7:10,overview?4:6);break;
    default:throw new Error('Unknown figure form '+name);
  }
  g.userData.figureShape=name;officeFigureShapes.set(key,g);return g;
}
function figureMaterial(color,finish='matte'){
  const key=finish+':'+color;
  if(!officeFigureMaterials.has(key)){
    const properties={matte:[.77,0],skin:[.69,0],complexion:[.73,0],hair:[.60,0],fabric:[.94,0],metal:[.31,.36],eye:[.22,0]}[finish];
    const m=new THREE.MeshStandardMaterial({color,roughness:properties[0],metalness:properties[1]});
    m.userData.finish=finish;
    if(finish==='complexion'){
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vFace;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFace=position;');
        shader.fragmentShader='varying vec3 vFace;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float blush=exp(-dot((abs(vFace.xy-vec2(0.,-.10))-vec2(.31,0.))*vec2(5.,7.),
                               (abs(vFace.xy-vec2(0.,-.10))-vec2(.31,0.))*vec2(5.,7.)))*smoothstep(.13,.39,-vFace.z);
          diffuseColor.rgb*=mix(vec3(1.),vec3(1.02,.84,.81),blush*.8);
        `);
      };
    }
    if(finish==='fabric'||finish==='hair'){
      m.customProgramCacheKey=()=>'office-figure-'+finish;
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vSew;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSew=position;');
        shader.fragmentShader='varying vec3 vSew;\n'+shader.fragmentShader;
        const thread=finish==='hair'?`
          float path=atan(vSew.z,vSew.x)*17.+vSew.y*6.+vSew.x*4.;
          float grooves=sin(path*3.+.8*sin(path));
          diffuseColor.rgb*=1.+(.06*sin(path)+.085*grooves)*(1.-smoothstep(.1,1.5,fwidth(path)));
        `:`
          vec2 yarn=vec2(vSew.x+vSew.z,vSew.y)*410.;
          float woven=cos(yarn.x+.65*sin(yarn.y))*sin(yarn.y);
          diffuseColor.rgb*=1.+.105*woven*(1.-smoothstep(.35,3.,max(fwidth(yarn.x),fwidth(yarn.y))));
        `;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+thread);
      };
    }
    officeFigureMaterials.set(key,m);
  }
  return officeFigureMaterials.get(key);
}
function figurePart(parent,shape,size,position,color,finish='matte',tilt=0){
  let geo=figureShape(shape);
  if(size[0]<0){
    const key=shape+'-mirror';
    if(!officeFigureShapes.has(key)){
      const mirrored=geo.index?geo.toNonIndexed():geo.clone();mirrored.scale(-1,1,1);
      for(const attr of Object.values(mirrored.attributes)){
        for(let i=0;i<attr.count;i+=3){
          for(let k=0;k<attr.itemSize;k++){
            const a=(i+1)*attr.itemSize+k,b=(i+2)*attr.itemSize+k;
            [attr.array[a],attr.array[b]]=[attr.array[b],attr.array[a]];
          }
        }
      }
      officeFigureShapes.set(key,mirrored);
    }
    geo=officeFigureShapes.get(key);size=[-size[0],size[1],size[2]];
  }
  const m=new THREE.Mesh(geo,figureMaterial(color,finish));
  m.scale.set(...size);m.position.set(...position);m.rotation.z=tilt;
  parent.add(m);return m;
}
function figureTone(color,target,weight){
  return new THREE.Color(color).lerp(new THREE.Color(target),weight).getHex();
}
function dressHead(head,body,look){
  const {hairStyle:style,hair,shirt,skin,accessory}=look;
  const hairLight=figureTone(hair,0xbfa48e,.15);
  const earTone=figureTone(skin,0xae5954,.32);
  const part=(shape,size,p,c,finish,tilt)=>figurePart(head,shape,size,p,c,finish,tilt);
  part('head',[.57,.59,.49],[0,0,0],skin,'complexion');
  for(const side of [-1,1]){
    part('oval',[.103,.157,.087],[side*.273,-.024,0],skin,'skin',-side*.12);
    part('pin',[.048,.082,.038],[side*.291,-.023,-.033],earTone,'skin');
  }
  part('oval',[.075,.12,.088],[0,-.047,-.237],skin,'skin');
  part('pin',[.095,.063,.075],[0,-.080,-.263],skin,'skin');
  const eyes=[],brows=[];
  for(const s of [-1,1]){
    const x=s*.119, eye=new THREE.Group();head.add(eye);
    eye.position.set(x,.009,-.232);eye.scale.set(.109,.07,.046);eye.rotation.y=-s*.15;
    figurePart(eye,'oval',[1.08,.81,.65],[0,0,0],0xfff3e0,'eye');
    figurePart(eye,'oval',[.53,.77,.52],[0,0,-.20],0x553f34,'eye');
    figurePart(eye,'pin',[.28,.59,.24],[0,0,-.42],0x242a30,'eye');
    figurePart(eye,'pin',[.12,.17,.14],[.09,.20,-.52],0xfff5dc,'eye');
    figurePart(eye,'oval',[1.00,.125,.23],[0,.32,-.16],figureTone(hair,skin,.31),'matte');
    eyes.push(eye);brows.push(part('oval',[.123,.029,.033],[x,.078,-.238],hair,'hair',s*.09));
  }
  const mouth=part('oval',[.10,.029,.035],[0,-.153,-.222],figureTone(skin,0x633f43,.58),'skin');
  const cloak=style==='hood'||style==='hijab', cloth=style==='hood'?shirt:figureTone(shirt,0x765474,.65);
  if(cloak){
    part('haircap',[.67,.69,.60],[0,.031,.046],cloth,'fabric');
    for(const s of [-1,1])part('lock',[.16,.46,.35],[s*.247,-.12,.015],cloth,'fabric',s*.11);
    figurePart(body,'oval',[.63,.17,.40],[0,1.48,.008],cloth,'fabric');
    figurePart(body,'lock',[.16,.32,.09],[-.14,1.39,-.15],cloth,'fabric',-.42);
  } else if(style!=='bald'){
    part('haircap',[.593,.53,.54],[0,.10,.022],hair,'hair');
    if(style==='long'){
      for(const s of [-1,1])part('lock',[.19,.64,.36],[s*.239,-.054,.065],hair,'hair',s*.065);
      part('lock',[.52,.64,.22],[0,-.08,.212],hair,'hair');
    }
    if(style==='ponytail'){
      part('oval',[.154,.155,.155],[0,.12,.275],shirt,'fabric');
      part('lock',[.215,.48,.218],[0,-.055,.345],hair,'hair').rotation.x=-.22;
    }
    if(style==='curly'){
      for(let i=0;i<20;i++){
        const a=i*2.39996;const ring=i<13?.224:.14;
        part('oval',[.165,.171,.167],[ring*Math.cos(a),(i<13?.198:.29)+.035*Math.cos(a*3),ring*.94*Math.sin(a)],i%3===0?hairLight:hair,'hair');
      }
    } else {
      const high=style==='quiff';
      const fringe=part('fringe',[high?.445:.39,high?.235:.154,.128],[-.012,high?.246:.208,-.194],hair,'hair',-.11);
      fringe.rotation.y=-.12;
      part('fringe',[.24,.094,.115],[-.144,.16,-.145],hairLight,'hair',.78).rotation.y=.53;
      for(const side of [-1,1])part('lock',[.064,.167,.088],[side*.257,.07,-.082],hair,'hair',side*.14);
    }
    if(style==='beard'){
      part('oval',[.38,.157,.104],[0,-.182,-.179],hair,'hair');
      for(const s of [-1,1])part('lock',[.096,.18,.095],[s*.175,-.13,-.175],hair,'hair',-s*.49);
      mouth.position.z=-.238;
    }
  }
  if(accessory==='glasses'){
    for(const s of [-1,1]){
      part('frame',[.231,.163,.157],[s*.126,.012,-.266],0x34464b,'metal');
      part('oval',[.022,.028,.282],[s*.242,.035,-.130],0x34464b,'metal');
    }
    part('oval',[.075,.026,.034],[0,.025,-.27],0x866b49,'metal');
  }
  if(accessory==='headset'){
    part('band',[.67,.73,.37],[0,.018,.028],0x34434b,'metal').rotation.x=.16;
    for(const s of [-1,1]){
      part('oval',[.142,.196,.176],[s*.303,.015,.001],0x29353e,'matte');
      part('oval',[.06,.133,.134],[s*.357,.015,.001],figureTone(shirt,0xa9babc,.33),'metal');
    }
    part('oval',[.027,.028,.28],[.287,-.056,-.127],0x3c4647,'metal').rotation.x=-.31;
    part('pin',[.07,.043,.054],[.276,-.10,-.255],0x252f35);
  } else if(accessory==='cap'){
    part('oval',[.63,.34,.56],[0,.218,.012],shirt,'fabric');
    part('oval',[.50,.044,.36],[0,.223,-.216],figureTone(shirt,0x313e4b,.23),'fabric');
    part('pin',[.046,.029,.046],[0,.392,.012],shirt,'fabric');
  }
  return {eyeL:eyes[0],eyeR:eyes[1],mouth,brows};
}

function dressClassicFigure({body,head,arms,legs}, {skin,hair,hairStyle,shirt,pants,accessory,outfit,shoes}) {
  voxelBox(body,[.52,.63,.34],[0,1.2,0],shirt);
  voxelBox(body,[.54,.13,.35],[0,.85,0],pants);
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
  for(let i=0;i<arms.length;i++){
    const arm=arms[i],{leg,shin}=legs[i];
    voxelBox(arm,[.22,.32,.26],[0,-.12,0],shirt);
    voxelBox(arm,[.19,.36,.22],[0,-.43,0],skin);
    voxelBox(leg,[.22,.40,.25],[0,-.2,0],pants);
    voxelBox(shin,[.21,.33,.24],[0,-.16,0],pants);
    voxelBox(shin,[.25,.13,.37],[0,-.36,-.055],shoes);
  }
  return {eyeL,eyeR,mouth,brows};
}

function dressHdFigure({body,head,arms,legs}, {skin,hair,hairStyle,shirt,pants,accessory,outfit,shoes}) {
  const face=dressHead(head,body,{hairStyle,hair,shirt,skin,accessory});
  const ivory=0xeee8d9, metal=0xb7aa90, cuff=figureTone(shirt,0x23343c,.21);
  const jacket=outfit==='lab'?ivory:shirt;
  const bodyPart=(shape,size,at,color,surface,tilt)=>figurePart(body,shape,size,at,color,surface,tilt);
  bodyPart('oval',[.206,.245,.212],[0,1.53,.012],skin,'skin');
  bodyPart('tailored',[.605,.68,.406],[0,1.17,0],jacket,'fabric');
  if(outfit==='tie'){
    bodyPart('lock',[.181,.37,.044],[0,1.327,-.175],ivory,'fabric');
    for(const side of [-1,1])bodyPart('lapel',[side*.115,.30,.037],[side*.103,1.312,-.191],figureTone(jacket,0xabaaa4,.14),'fabric',-side*.25);
    bodyPart('oval',[.114,.018,.033],[-.175,1.30,-.163],ivory,'fabric',-.08);
  }
  bodyPart('oval',[.49,.19,.32],[0,.859,.012],pants,'fabric');
  if(outfit==='tie'||outfit==='shirt'||outfit==='lab'){
    bodyPart('oval',[.024,.46,.018],[0,1.22,-.193],figureTone(jacket,0x3a464b,.21),'fabric');
    for(const s of [-1,1])bodyPart('collar',[s*.121,.111,.024],[s*.068,1.42,-.159],outfit==='shirt'?figureTone(shirt,ivory,.32):ivory,'fabric',s*.51);
    if(outfit==='tie'){
      bodyPart('tie',[.077,.308,.035],[0,1.244,-.218],0x865046,'fabric');
      bodyPart('pin',[.065,.058,.041],[0,1.404,-.190],0x78443c,'fabric');
    } else for(const y of [1.05,1.20,1.34])bodyPart('pin',[.021,.021,.014],[0,y,-.196],metal,'metal');
    if(outfit==='lab'){
      for(const s of [-1,1])bodyPart('lapel',[s*.124,.29,.042],[s*.118,1.316,-.191],0xd7d5c9,'fabric',s*.34);
      voxelBox(body,[.104,.068,.022],[-.18,1.216,-.154],0x578389);
    }
  }else if(outfit==='hoodie'){
    bodyPart('oval',[.42,.16,.31],[0,1.458,.048],cuff,'fabric');
    bodyPart('oval',[.31,.137,.050],[0,1.02,-.168],cuff,'fabric');
    for(const s of [-1,1]){
      bodyPart('limb',[.018,.185,.021],[s*.077,1.351,-.177],ivory,'fabric',s*.071);
      bodyPart('pin',[.028,.035,.029],[s*.082,1.26,-.18],metal,'metal');
    }
  } else bodyPart('oval',[.31,.059,.246],[0,1.476,.015],cuff,'fabric');
  for(let i=0;i<arms.length;i++){
    const s=i===0?-1:1,arm=arms[i],{leg,shin}=legs[i];
    const sleeveLong=outfit!=='tee';
    figurePart(arm,'limb',[.207,.34,.230],[0,-.102,0],jacket,'fabric');
    figurePart(arm,'limb',[.157,.29,.175],[0,-.346,-.007],sleeveLong?jacket:skin,sleeveLong?'fabric':'skin');
    if(sleeveLong)figurePart(arm,'limb',[.157,.058,.177],[0,-.461,-.007],outfit==='lab'?0xd7d5c9:cuff,'fabric');
    figurePart(arm,'oval',[.149,.180,.146],[0,-.529,-.013],skin,'skin');
    figurePart(arm,'pin',[.067,.107,.081],[-s*.057,-.506,-.054],skin,'skin',s*.22);
    figurePart(leg,'limb',[.237,.440,.257],[0,-.189,0],pants,'fabric');
    figurePart(shin,'oval',[.192,.122,.213],[0,.008,0],pants,'fabric');
    figurePart(shin,'limb',[.201,.357,.221],[0,-.153,.004],pants,'fabric');
    figurePart(shin,'shoe',[.225,.154,.356],[0,-.353,-.057],shoes,'matte');
    figurePart(shin,'shoe',[.229,.043,.360],[0,-.408,-.059],figureTone(shoes,0x3f403b,.60),'matte');
    for(const z of [-.081,-.119])figurePart(shin,'pin',[.103,.017,.025],[0,-.299,z],figureTone(shoes,ivory,.58));
  }
  return face;
}

// Artwork lives on its own groups so switching models preserves the animated
// joints, carried reports, phone and specialist badges already in the scene.
function setFigureQuality(char,quality){
  const u=char.userData;
  if(u.modelQuality===quality)return;
  const classic=quality==='low';
  u.head.position.y=classic?1.74:1.805;
  u.arms.forEach((arm,i)=>arm.position.set((i===0?-1:1)*(classic?.38:.313),classic?1.43:1.418,0));
  for(const surface of u.surfaces)surface.clear();
  const face=(classic?dressClassicFigure:dressHdFigure)(u.wardrobe,u.look);
  Object.assign(u,face,{modelQuality:quality});
}

function makeVoxelChar({skin=0xe8b48b,hair=0x42352e,hairStyle='short',shirt=0x558ae4,pants=0x34445b,accessory='headset',outfit='tee',shoes=0xf0eee7}={},quality='high'){
  const joint=parent=>{const group=new THREE.Group();parent.add(group);return group;};
  const g=new THREE.Group(),body=joint(g),head=joint(body),arms=[joint(body),joint(body)];
  const legs=[-1,1].map(side=>{
    const leg=joint(body),shin=joint(leg);
    leg.position.set(side*.15,.83,0);shin.position.y=-.4;
    return {leg,shin};
  });
  const wardrobe={body:joint(body),head:joint(head),arms:arms.map(joint),
    legs:legs.map(({leg,shin})=>({leg:joint(leg),shin:joint(shin)}))};
  const surfaces=[wardrobe.body,wardrobe.head,...wardrobe.arms,...wardrobe.legs.flatMap(({leg,shin})=>[leg,shin])];
  const look={skin,hair,hairStyle,shirt,pants,accessory,outfit,shoes};
  const mug=voxelBox(arms[1],[.17,.21,.17],[0,-.58,-.08],0xf4f0df);mug.visible=false;
  const mark = new THREE.Group();mark.position.set(0,2.37,0);g.add(mark);
  voxelBox(mark,[.11,.3,.11],[0,.1,0],0xf16d5b);voxelBox(mark,[.11,.1,.11],[0,-.15,0],0xf16d5b);mark.visible=false;
  const effects=new THREE.Group();g.add(effects);const bits=[];for(let i=0;i<7;i++)bits.push(voxelBox(effects,[.07,.07,.07],[0,2.35,0],0xffd37c));effects.visible=false;const cloud=new THREE.Group();g.add(cloud);for(let i=0;i<5;i++)voxelBox(cloud,[.16,.13,.13],[-.27+i*.13,2.36+Math.sin(i)*.07,0],0xb9c7cf);cloud.visible=false;
  const scatter=new THREE.Group(),drips=new THREE.Group();g.add(scatter,drips);for(let i=0;i<5;i++){voxelBox(scatter,[.22,.018,.29],[0,1.5,0],0xf4eddb);voxelBox(drips,[.055,.07,.055],[0,1.2,0],0x754f37);}scatter.visible=drips.visible=false;
  const bag=new THREE.Group();arms[1].add(bag);voxelBox(bag,[.32,.4,.18],[.1,-.66,0],0xb88150);voxelBox(bag,[.18,.08,.06],[.1,-.43,0],0x594638);bag.visible=false;
  g.userData={scatter,drips,bag,body,head,arms,legs,mug,mark,effects,cloud,bits,hairStyle,outfit,shoes,skin,look,wardrobe,surfaces};
  setFigureQuality(g,quality);return g;
}
function animateVoxelChar(char, status, moving, seated, t, phase) {
  const {body,head,arms,legs,mug,mark}=char.userData, wave=Math.sin(t*9+phase);
  const classic=char.userData.modelQuality==='low';
  const blinkPhase=(t+phase*.73)%4.7;
  const openness=!classic&&t>0&&blinkPhase<.14?.17+.83*Math.abs(blinkPhase/.07-1):1;
  for(const e of [char.userData.eyeL,char.userData.eyeR])e.scale.y=.07*openness;
  if(classic)char.userData.mouth.scale.set(.1,.045,.035);else char.userData.mouth.scale.set(.115,.028,.033);
  char.userData.brows.forEach((b,i)=>b.rotation.z=classic?0:(i?.09:-.09));
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
