import * as THREE from './vendor/three.module.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .84, ...extra });
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(x, y, z); result.castShadow = true; result.receiveShadow = true;
  parent.add(result); return result;
}
function box(parent, mat, w, h, d, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z); }
function sphere(parent, mat, r, x, y, z, segments = 16) { return mesh(new THREE.SphereGeometry(r, segments, 12), mat, parent, x, y, z); }
function limb(parent, mat, radius, length, x, y, z) { return mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat, parent, x, y, z); }

/** Articulated procedural athletes following the approved portrait silhouettes and outfits. */
export function fallbackAthlete(gender, rival) {
  const root = new THREE.Group();
  const female = gender === 'female';
  const shirtColor = female ? rival ? '#653467' : '#f3838c' : rival ? '#1d2636' : '#f6f8fb';
  const lowerColor = female ? rival ? '#202839' : '#f3f5fa' : '#172940';
  const shirt = material(shirtColor), shorts = material(lowerColor), skin = material(rival ? '#bb8567' : '#dba37d'), hair = material('#342c29');
  const white = material('#f2f5f7'), accent = material(female ? rival ? '#9668ab' : '#f3838c' : rival ? '#3e69b2' : '#253e5d');
  const hips = new THREE.Group(); hips.position.y = .97; root.add(hips);
  const torso = mesh(new THREE.CylinderGeometry(female ? .26 : rival ? .34 : .3, female ? .2 : .23, .66, 24), shirt, hips, 0, .34, 0); torso.scale.z = .65;
  const collar = mesh(new THREE.TorusGeometry(.115, .018, 8, 24), accent, hips, 0, .675, 0); collar.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const shoulder = sphere(hips, shirt, female ? .105 : .14, side * (female ? .235 : .275), .585, 0, 20); shoulder.scale.set(1, .8, .8);
    box(hips, accent, .018, .45, .018, side * .16, .32, -.195);
  }
  box(hips, white, .068, .035, .014, -.14, .48, -.198);
  box(hips, accent, .04, .55, .15, .27, .36, 0);
  if (female) {
    const skirt = mesh(new THREE.CylinderGeometry(.26, .38, .37, 14), shorts, hips, 0, -.09, 0); skirt.scale.z = .78;
  } else { box(hips, shorts, .52, .36, .3, 0, -.1, 0); }
  const head = new THREE.Group(); head.position.set(0, .94, 0); hips.add(head);
  limb(hips, skin, .105, .16, 0, .73, 0);
  const face = sphere(head, skin, .215, 0, 0, 0, 24); face.scale.set(.82, 1.17, .86);
  for (const side of [-1, 1]) {
    const ear = sphere(head, skin, .044, side * .18, -.012, .005, 16); ear.scale.set(.55, 1, .65);
    const brow = box(head, hair, .059, .012, .016, side * .077, .058, -.179);
    brow.rotation.z = side * (rival ? -.15 : -.05);
  }
  const scalp = sphere(head, hair, .214, 0, .095, .012, 24); scalp.scale.set(.85, .79, .87);
  for (const x of [-.08, .08]) {
    sphere(head, white, .023, x, .017, -.176, 10);
    sphere(head, material('#35302c'), .012, x, .017, -.195, 10);
  }
  sphere(head, skin, .037, 0, -.023, -.19);
  box(head, material('#a6715d'), .078, .012, .02, 0, -.09, -.177);
  if (female) {
    if (rival) for (let i = 0; i < 28; i++) {
      const angle = i * 2.4, radius = .12 + (i % 3) * .028;
      sphere(head, hair, .047, Math.cos(angle) * radius, .15 + Math.sin(i * 1.7) * .065, Math.sin(angle) * radius, 12);
    }
    for (let i = 0; i < (rival ? 20 : 7); i++) {
      const t = i / (rival ? 19 : 6);
      const curl = sphere(head, hair, rival ? .063 : .075, Math.sin(i * 2.3) * (rival ? .085 : .02), .13 - t * .47, .18 + Math.sin(t * 3) * .1);
      curl.scale.y = rival ? 1 : 1.6;
    }
    mesh(new THREE.TorusGeometry(.061, .018, 6, 16), accent, head, 0, .13, .2);
  } else {
    for (let i = 0; i < 7; i++) sphere(head, hair, .07, (i - 3) * .042, .23 + Math.sin(i) * .025, -.04 + (rival ? Math.sin(i * 3) * .05 : 0));
    if (rival) { const beard = sphere(head, hair, .17, 0, -.085, -.027); beard.scale.set(.89, .56, .94); }
  }
  const arms = [];
  for (const sign of [-1, 1]) {
    const joint = new THREE.Group(); joint.position.set(sign * .32, .61, 0); hips.add(joint);
    if (!female) { const sleeve = limb(joint, shirt, .105, .11, 0, -.065, 0); sleeve.scale.z = .85; }
    limb(joint, skin, .079, .31, 0, -.19, 0);
    const forearm = limb(joint, skin, .067, .28, 0, -.51, -.04); forearm.rotation.x = -.3;
    limb(joint, white, .073, .055, 0, -.58, -.065);
    sphere(joint, skin, .079, 0, -.7, -.085); arms.push(joint);
    const leg = new THREE.Group(); leg.position.set(sign * .16, -.16, 0); hips.add(leg);
    limb(leg, skin, .097, .32, 0, -.23, 0);
    limb(leg, skin, .078, .27, 0, -.59, .015);
    limb(leg, white, .079, .13, 0, -.73, .015);
    const shoe = box(leg, white, .19, .12, .34, 0, -.82, -.07); shoe.rotation.x = -.03;
    box(leg, accent, .192, .032, .34, 0, -.872, -.07);
    leg.userData.side = sign;
    (root.userData.legs ??= []).push(leg);
  }
  const racket = createRacket(); arms[0].add(racket); racket.position.set(0, -.67, -.1); racket.rotation.z = -.6;
  root.userData.head = head; root.userData.hips = hips; root.userData.arms = arms;
  root.scale.setScalar(1.13);
  return root;
}

export function createRacket() {
  const accent = material('#253e5d');
  const racket = new THREE.Group();
  limb(racket, material('#e6eaf0'), .025, .22, 0, -.1, 0);
  limb(racket, accent, .018, .18, 0, -.32, 0);
  const frame = mesh(new THREE.TorusGeometry(.205, .018, 6, 28), accent, racket, 0, -.63, 0); frame.scale.y = 1.3;
  const strings = [];
  for (let i = -4; i <= 4; i++) {
    const value = i * .04;
    const maxY = Math.sqrt(Math.max(0, .2 ** 2 - value ** 2)) * 1.3;
    strings.push(value, -.63 - maxY, 0, value, -.63 + maxY, 0);
    const maxX = Math.sqrt(Math.max(0, .2 ** 2 - (value / 1.3) ** 2));
    strings.push(-maxX, -.63 + value, 0, maxX, -.63 + value, 0);
  }
  const stringGeo = new THREE.BufferGeometry(); stringGeo.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
  racket.add(new THREE.LineSegments(stringGeo, new THREE.LineBasicMaterial({ color: '#c2cedc', transparent: true, opacity: .8 })));
  return racket;
}
