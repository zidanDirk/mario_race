import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original, locally authored character sculpts. Every face has its own silhouette;
// material batching keeps the six full drivers affordable during a race.
const palette = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number) {
  if (!palette.has(color)) palette.set(color, new THREE.MeshStandardMaterial({ color, roughness: .62 }));
  return palette.get(color)!;
}
const skin = material(0xffbf8d), white = material(0xfffdf4), black = material(0x16110f);
const blue = material(0x0649bd), red = material(0xe71124), green = material(0x039c35);
const hair = material(0x512313), gold = material(0xffbd16), shoe = material(0x612b13);
const iris = material(0x1286df), pink = material(0xf7489e), blonde = material(0xffc629);
const sphere = new THREE.SphereGeometry(1, 20, 12);
const rounded = new RoundedBoxGeometry(1, 1, 1, 3, .2);
type Vec = [number, number, number];
function mesh(root: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, p: Vec, scale: Vec = [1,1,1]) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(...p); m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
}
function ellipsoid(root: THREE.Object3D, mat: THREE.Material, p: Vec, scale: Vec) { return mesh(root, sphere, mat, p, scale); }
function softBox(root: THREE.Object3D, mat: THREE.Material, p: Vec, scale: Vec) { return mesh(root, rounded, mat, p, scale); }
function tube(root: THREE.Object3D, mat: THREE.Material, points: Vec[], radius: number) {
  return mesh(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), Math.max(8, points.length * 4), radius, 8, false), mat, [0,0,0]);
}
function limb(root: THREE.Object3D, mat: THREE.Material, from: Vec, to: Vec, radius: number) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
  const m = mesh(root, new THREE.CapsuleGeometry(radius, Math.max(.01, delta.length() - radius*2), 5, 12), mat, a.clone().add(b).multiplyScalar(.5).toArray() as Vec);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize()); return m;
}
// A bevelled silhouette is used for moustaches, bangs and crown points so they
// remain intentional shapes, rather than a cluster of disconnected cylinders.
function silhouette(root: THREE.Object3D, mat: THREE.Material, points: [number,number][], p: Vec, depth = .07, bevel = .035) {
  const s = new THREE.Shape(); points.forEach(([x,y],i) => i ? s.lineTo(x,y) : s.moveTo(x,y)); s.closePath();
  return mesh(root, new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 6 }), mat, p);
}
function batch(source: THREE.Group, destination: THREE.Group) {
  source.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const transformed = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const g = transformed.index ? transformed.toNonIndexed() : transformed;
    if (g !== transformed) transformed.dispose();
    for (const attr of Object.keys(g.attributes)) if (!['position','normal','uv'].includes(attr)) g.deleteAttribute(attr);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material)!.push(g);
  });
  for (const [mat, geometries] of groups) {
    const merged = mergeGeometries(geometries, false); if (merged) mesh(destination, merged, mat, [0,0,0]);
    geometries.forEach(g => g.dispose());
  }
}
function eye(root: THREE.Group, x: number, y: number, z: number, size = 1, lashes = false) {
  const side = Math.sign(x);
  const sclera = ellipsoid(root, white, [x,y,z], [.185*size,.27*size,.105]); sclera.rotation.y = side * .12;
  ellipsoid(root, iris, [x-side*.015,y-.005,z+.093], [.088*size,.153*size,.033]);
  ellipsoid(root, black, [x-side*.015,y-.005,z+.122], [.042*size,.107*size,.019]);
  ellipsoid(root, white, [x-.025,y+.059*size,z+.141], [.024*size,.041*size,.009]);
  if (lashes) {
    tube(root, black, [[x-.15*size,y+.14*size,z+.05],[x,y+.26*size,z+.06],[x+.15*size,y+.15*size,z+.05]], .027);
    for (let i = 0; i < 2; i++) tube(root, black, [[x+side*.12,y+.16-i*.07,z+.05],[x+side*(.23+i*.025),y+.22-i*.08,z+.03]], .021);
  }
}
function cap(root: THREE.Group, capMat: THREE.Material, letter: string, letterColor: number, wide = 1) {
  // Dome and a separate substantial curved visor with a raised sewn rim.
  ellipsoid(root, capMat, [0,.68,-.08], [.9*wide,.48,.76]);
  ellipsoid(root, capMat, [0,.48,.24], [.88*wide,.15,.73]);
  ellipsoid(root, capMat, [0,.47,.64], [.85*wide,.10,.56]);
  tube(root, capMat, [[-.76*wide,.48,.60],[-.60*wide,.47,.99],[0,.46,1.15],[.60*wide,.47,.99],[.76*wide,.48,.60]], .033);
  ellipsoid(root, white, [0,.80,.637], [.285,.27,.046]);
  // A small canvas decal avoids an expensive typeface dependency.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0,0,128,128); ctx.fillStyle = `#${letterColor.toString(16).padStart(6,'0')}`;
  ctx.font = '900 100px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter,64,69);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  mesh(root,new THREE.PlaneGeometry(.46,.43),decal,[0,.8,.688]);
  // Back seam, top button, and nape hair remain visible in the chase camera.
  ellipsoid(root, capMat, [0,1.137,-.09], [.10,.035,.10]);
  for (const x of [-.43,-.2,.04,.27,.47]) ellipsoid(root, hair, [x,-.04,-.57], [.22,.30,.17]);
}
function moustache(root: THREE.Group, luigi: boolean, wario: boolean) {
  if (wario) {
    silhouette(root,black,[[-.64,.1],[-.45,.04],[-.55,-.19],[-.28,-.1],[-.22,-.25],[0,-.13],[.22,-.25],[.28,-.1],[.55,-.19],[.45,.04],[.64,.1],[.32,.18],[0,.05],[-.32,.18]], [0,-.30,.69], .07, .02);
  } else {
    // Six scalloped lobes create Mario's recognisable broad moustache edge.
    const w = luigi ? .91 : 1;
    ellipsoid(root, black, [0,-.245,.736], [.55*w,.112,.096]);
    for (const [x,y,r] of [[-.42,-.265,.125],[-.27,-.32,.145],[-.105,-.355,.14],[.105,-.355,.14],[.27,-.32,.145],[.42,-.265,.125]]) {
      ellipsoid(root,black,[x*w,y,.75],[r*w,r*.73,.085]);
    }
  }
}
function plumberHead(root: THREE.Group, key: string) {
  const luigi = key === 'luigi', wario = key === 'wario';
  const faceSkin = wario ? material(0xffb682) : skin;
  ellipsoid(root,hair,[0,.18,-.24],[.79,.58,.58]);
  ellipsoid(root,faceSkin,[0,-.04,.08],[wario?.93:luigi?.70:.79,luigi?.91:.79,.63]);
  ellipsoid(root,faceSkin,[0,-.40,.29],[wario?.80:luigi?.56:.67,.38,.43]);
  for (const s of [-1,1]) {
    ellipsoid(root,faceSkin,[s*(wario?.90:luigi?.72:.80),-.03,.01],[.20,.27,.15]);
    ellipsoid(root,material(0xe78f60),[s*(wario?.96:luigi?.79:.87),-.02,.12],[.08,.145,.04]);
    const sideburn = ellipsoid(root,hair,[s*(luigi?.63:.71),.015,.19],[.09,.32,.11]); sideburn.rotation.z=s*-.12;
    eye(root,s*(wario?.32:.275),.22,.64,luigi?1.01:.99);
    tube(root,black,[[s*.115,.48,.615],[s*.275,.54,.63],[s*.43,.45,.56]],wario?.078:.058);
  }
  // Nose projects ahead of both eyes and moustache; a warm lip defines the jaw.
  ellipsoid(root,wario?material(0xf27894):faceSkin,[0,-.03,.85],[wario?.39:luigi?.30:.32,wario?.275:.265,luigi?.39:.30]);
  tube(root,material(0x8b381d),[[-.20,-.48,.633],[0,-.51,.675],[.20,-.48,.633]],.026);
  if (wario) {
    ellipsoid(root,white,[0,-.46,.699],[.36,.13,.025]);
    for (const x of [-.15,0,.15]) tube(root,black,[[x,-.37,.729],[x,-.54,.73]],.012);
  }
  moustache(root,luigi,wario);
  cap(root,luigi?green:wario?gold:red,luigi?'L':wario?'W':'M',luigi?0x058b2e:wario?0x5020aa:0xdf1223,wario?1.08:1);
}
function toadHead(root: THREE.Group) {
  ellipsoid(root,skin,[0,-.19,.07],[.62,.63,.54]);
  ellipsoid(root,skin,[0,-.44,.22],[.49,.32,.40]);
  for (const x of [-.22,.22]) {
    ellipsoid(root,black,[x,-.12,.568],[.078,.185,.035]);
    ellipsoid(root,white,[x-.022,-.045,.604],[.018,.047,.008]);
  }
  ellipsoid(root,material(0x671b1f),[0,-.40,.592],[.115,.108,.024]);
  ellipsoid(root,material(0xef746e),[0,-.449,.615],[.077,.038,.009]);
  // Broad white dome, cream underside and flattened surface-following red spots.
  ellipsoid(root,material(0xf3d5b1),[0,.21,-.01],[1.07,.16,.89]);
  ellipsoid(root,white,[0,.55,-.04],[1.15,.76,.96]);
  for (let i=0; i<5; i++) {
    const a=i/5*Math.PI*2;
    const spot=ellipsoid(root,red,[Math.sin(a)*1.115,.75,Math.cos(a)*.93-.04],[.34,.36,.037]); spot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(Math.sin(a),.30,Math.cos(a)).normalize());
  }
  ellipsoid(root,red,[0,1.294,-.08],[.33,.035,.31]);
}
function peachHead(root: THREE.Group) {
  // A long, layered golden silhouette covers the seat back without hiding face.
  ellipsoid(root,blonde,[0,-.12,-.36],[.85,1.12,.51]);
  for (const s of [-1,1]) {
    const lock=ellipsoid(root,blonde,[s*.59,-.58,-.12],[.29,.76,.35]);lock.rotation.z=s*.18;
    const tip=ellipsoid(root,blonde,[s*.66,-1.03,-.07],[.29,.31,.30]);tip.rotation.z=s*-.4;
  }
  ellipsoid(root,skin,[0,-.08,.16],[.61,.78,.53]);
  ellipsoid(root,skin,[0,-.40,.29],[.43,.38,.38]);
  for (const s of [-1,1]) {
    eye(root,s*.25,.13,.626,.97,true);
    tube(root,material(0xb76a1b),[[s*.10,.45,.58],[s*.25,.47,.61],[s*.39,.38,.56]],.027);
    ellipsoid(root,skin,[s*.61,-.10,.15],[.13,.20,.12]);
    ellipsoid(root,iris,[s*.64,-.35,.28],[.105,.15,.075]);
    ellipsoid(root,white,[s*.67,-.30,.34],[.027,.037,.011]);
    ellipsoid(root,material(0xf49286),[s*.37,-.30,.615],[.115,.062,.012]);
  }
  ellipsoid(root,skin,[0,-.12,.731],[.12,.155,.145]);
  ellipsoid(root,material(0xd8335b),[0,-.47,.654],[.12,.048,.027]);
  ellipsoid(root,material(0xff88a0),[0,-.51,.648],[.09,.027,.02]);
  // Swept heart-shaped fringe: locks stop above the pupils.
  const l=ellipsoid(root,blonde,[-.30,.55,.40],[.43,.30,.30]);l.rotation.z=-.43;
  const r=ellipsoid(root,blonde,[.32,.52,.40],[.35,.31,.29]);r.rotation.z=.54;
  silhouette(root,blonde,[[-.38,.18],[-.25,-.13],[-.04,-.25],[.03,-.05],[.13,.19]],[-.03,.50,.60],.08,.065);
  const crown = new THREE.Group();
  mesh(crown,new THREE.CylinderGeometry(.34,.28,.29,24,1,true),gold,[0,.89,-.08]);
  for(let i=0;i<5;i++) {
    const a=i/5*Math.PI*2;
    const point=silhouette(crown,gold,[[-.15,0],[0,.32],[.15,0]],[0,1.02,0],.045,.014);point.position.set(Math.sin(a)*.305,1.02,-.08+Math.cos(a)*.305);point.rotation.y=a;
    ellipsoid(crown,gold,[Math.sin(a)*.31,1.35,-.08+Math.cos(a)*.31],[.048,.05,.048]);
    const jewel=ellipsoid(crown,i%2?iris:red,[Math.sin(a)*.343,.90,-.08+Math.cos(a)*.343],[.073,.105,.025]);jewel.rotation.y=a;
  }
  root.add(crown);
}
function yoshiHead(root: THREE.Group) {
  ellipsoid(root,green,[0,-.11,-.05],[.67,.70,.63]);
  for(const s of [-1,1]) {
    ellipsoid(root,green,[s*.275,.49,.02],[.30,.55,.34]);
    ellipsoid(root,white,[s*.275,.51,.267],[.22,.37,.115]);
    ellipsoid(root,black,[s*.25,.50,.369],[.080,.20,.026]);
    ellipsoid(root,white,[s*.25-.026,.58,.395],[.022,.052,.009]);
  }
  ellipsoid(root,white,[0,-.37,.38],[.65,.36,.67]);
  ellipsoid(root,green,[0,-.08,.62],[.73,.52,.73]);
  for(const s of [-1,1]) {
    ellipsoid(root,material(0x075e2e),[s*.24,.20,1.167],[.060,.045,.02]);
    ellipsoid(root,white,[s*.51,-.29,.21],[.23,.29,.34]);
  }
  tube(root,material(0x096a37),[[-.52,-.38,.85],[0,-.45,1.18],[.52,-.38,.85]],.025);
  for(let i=0;i<3;i++) {
    const spike=mesh(root,new THREE.ConeGeometry(.18,.40,5),red,[0,.52-i*.40,-.63]);spike.rotation.x=-Math.PI/2;
  }
}

export function createDriver(character: string) {
  const driver = new THREE.Group(); driver.name='driver';
  const body = new THREE.Group(); const headSource = new THREE.Group(); const head = new THREE.Group(); head.name='head';
  const isPeach=character==='peach',isYoshi=character==='yoshi',isToad=character==='toad',isWario=character==='wario',isLuigi=character==='luigi';
  const shirt=isLuigi?green:isWario?gold:isPeach?pink:isYoshi?green:red;
  const trousers=isWario?material(0x6c18ae):isToad?white:blue;
  const width=isWario?1.13:isLuigi?.87:1;
  if(isPeach) {
    ellipsoid(body,pink,[0,1.63,.07],[.86,.43,.83]);
    ellipsoid(body,pink,[0,2.08,-.12],[.53,.58,.42]);
    ellipsoid(body,material(0xffa8d6),[0,1.52,.48],[.65,.23,.68]);
    for(const s of [-1,1]) ellipsoid(body,material(0xff91cd),[s*.53,2.26,-.01],[.25,.29,.27]);
    ellipsoid(body,gold,[0,2.23,.28],[.15,.18,.039]);ellipsoid(body,iris,[0,2.23,.321],[.11,.14,.021]);
  } else if(isToad) {
    ellipsoid(body,skin,[0,2.0,-.08],[.58,.57,.43]);
    ellipsoid(body,white,[0,1.57,.10],[.65,.37,.52]);
    // Blue open vest and gold piping leave the bare beige chest visible.
    for(const s of [-1,1]) {
      const vest=ellipsoid(body,blue,[s*.42,2.02,-.04],[.22,.50,.44]);vest.rotation.z=s*-.13;
      tube(body,gold,[[s*.24,2.39,.19],[s*.27,2.13,.36],[s*.29,1.75,.33],[s*.51,1.71,.22]],.033);
    }
    ellipsoid(body,blue,[0,2.10,-.40],[.47,.44,.09]);
  } else if(isYoshi) {
    ellipsoid(body,green,[0,1.96,-.10],[.66,.65,.50]);
    ellipsoid(body,white,[0,1.91,.286],[.47,.53,.16]);
    ellipsoid(body,red,[0,2.03,-.58],[.43,.32,.18]);
    ellipsoid(body,white,[0,2.03,-.53],[.47,.36,.13]);
    ellipsoid(body,red,[0,2.06,-.64],[.40,.28,.12]);
    const tail=mesh(body,new THREE.ConeGeometry(.24,.7,12),green,[0,1.49,-.72]);tail.rotation.x=-2.1;
  } else {
    ellipsoid(body,shirt,[0,2.07,-.15],[.69*width,.62,.48]);
    ellipsoid(body,trousers,[0,1.65,.04],[.71*width,.47,.53]);
    softBox(body,trousers,[0,2.00,.306],[.84*width,.67,.13]);
    for(const s of [-1,1]) {
      limb(body,trousers,[s*.40*width,2.50,-.20],[s*.40*width,1.94,.36],.102);
      limb(body,trousers,[s*.40*width,2.46,-.24],[s*.39*width,1.80,-.56],.102);
      ellipsoid(body,gold,[s*.40*width,2.20,.423],[.084,.091,.029]);
    }
  }
  const limbMat=isToad?skin:shirt;
  for(const s of [-1,1]) {
    const shoulder:Vec=[s*.59*width,2.21,-.04],elbow:Vec=[s*.76*width,1.98,.36],hand:Vec=[s*.51,2.02,.87];
    limb(body,limbMat,shoulder,elbow,isPeach?.15:.185);
    limb(body,isPeach?white:limbMat,elbow,hand,isPeach?.115:.155);
    const gloveMat=isYoshi?green:isToad?skin:white;
    ellipsoid(body,gloveMat,hand,[.205,.18,.22]);
    ellipsoid(body,gloveMat,[s*.405,2.04,.91],[.09,.12,.14]);
    if(!isYoshi&&!isToad) for(let j=0;j<3;j++) tube(body,material(0xd5d6d8),[[s*(.48+j*.055),2.16,.86],[s*(.48+j*.055),2.14,.96]],.007);
    if(!isPeach) {
      limb(body,isYoshi?green:trousers,[s*.42,1.54,.25],[s*.47,1.23,.74],isYoshi?.20:.24);
      ellipsoid(body,isYoshi?material(0xfb761c):isWario?material(0x218b37):shoe,[s*.47,1.14,.99],[.32,.21,.47]);
      ellipsoid(body,isYoshi?gold:material(0x321a10),[s*.47,.99,1.00],[.32,.055,.43]);
    }
  }
  if(!isYoshi) ellipsoid(body,skin,[0,2.60,-.12],[.24,.30,.25]);
  if(isToad)toadHead(headSource);else if(isPeach)peachHead(headSource);else if(isYoshi)yoshiHead(headSource);else plumberHead(headSource,character);
  batch(body,driver);batch(headSource,head);
  head.position.set(0,isToad?3.00:isLuigi?3.36:isPeach?3.29:3.20,-.13);
  driver.add(head);driver.userData.head=head;
  return {driver,head};
}
