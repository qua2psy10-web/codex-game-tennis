import * as THREE from './vendor/three.module.js';
import { COURT } from './game.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .84, ...extra });
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(x, y, z); result.castShadow = true; result.receiveShadow = true;
  parent.add(result); return result;
}
function box(parent, mat, w, h, d, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z); }
function sphere(parent, mat, r, x, y, z, segments = 16) { return mesh(new THREE.SphereGeometry(r, segments, 12), mat, parent, x, y, z); }
function limb(parent, mat, radius, length, x, y, z) { return mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat, parent, x, y, z); }

/** Articulated prototype models. Approved portraits are art direction, not rigged models. */
function athlete(gender, rival) {
  const root = new THREE.Group();
  const female = gender === 'female';
  const shirtColor = female ? rival ? '#653467' : '#f3838c' : rival ? '#1d2636' : '#f6f8fb';
  const lowerColor = female ? rival ? '#202839' : '#f3f5fa' : '#172940';
  const shirt = material(shirtColor), shorts = material(lowerColor), skin = material(rival ? '#bb8567' : '#dba37d'), hair = material('#342c29');
  const white = material('#f2f5f7'), accent = material(female ? rival ? '#9668ab' : '#f3838c' : rival ? '#3e69b2' : '#253e5d');
  const hips = new THREE.Group(); hips.position.y = .97; root.add(hips);
  const torso = mesh(new THREE.CylinderGeometry(.29, .23, .66, 14), shirt, hips, 0, .34, 0); torso.scale.z = .65;
  box(hips, accent, .04, .55, .15, .27, .36, 0);
  if (female) {
    const skirt = mesh(new THREE.CylinderGeometry(.26, .38, .37, 14), shorts, hips, 0, -.09, 0); skirt.scale.z = .78;
  } else { box(hips, shorts, .52, .36, .3, 0, -.1, 0); }
  const head = new THREE.Group(); head.position.set(0, .94, 0); hips.add(head);
  limb(hips, skin, .105, .16, 0, .73, 0);
  const face = sphere(head, skin, .215, 0, 0, 0, 24); face.scale.set(.82, 1.17, .86);
  const scalp = sphere(head, hair, .214, 0, .095, .012, 24); scalp.scale.set(.85, .79, .87);
  for (const x of [-.08, .08]) {
    sphere(head, white, .023, x, .017, -.176, 10);
    sphere(head, material('#35302c'), .012, x, .017, -.195, 10);
  }
  sphere(head, skin, .037, 0, -.023, -.19);
  box(head, material('#a6715d'), .078, .012, .02, 0, -.09, -.177);
  if (female) {
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
  const racket = new THREE.Group(); arms[0].add(racket); racket.position.set(0, -.67, -.1); racket.rotation.z = -.6;
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
  root.userData.hips = hips; root.userData.arms = arms;
  root.scale.setScalar(1.13);
  return root;
}

export class CourtScene {
  constructor(container, onLost = () => {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3Dテニスコート。Spaceで打球、方向キーでコースを指定。');
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); onLost(); });
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#b8d5e2'); this.scene.fog = new THREE.Fog('#b8d5e2', 45, 95);
    this.camera = new THREE.PerspectiveCamera(52, 1, .1, 140);
    this.scene.add(new THREE.HemisphereLight('#e7f3ff', '#6e838b', 1.8));
    const sun = new THREE.DirectionalLight('#fff6e7', 2.1); sun.position.set(-14, 24, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 26, bottom: -26, near: 1, far: 70 });
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; this.scene.add(sun);
    this.buildCourt();
    this.batchScenery();
    this.ball = sphere(this.scene, material('#e5ff42', { emissive: '#9caf08', emissiveIntensity: .28 }), .13, 0, 1, 0, 20);
    const seam = mesh(new THREE.TorusGeometry(.127, .007, 5, 24), material('#fff'), this.ball); seam.rotation.x = .8;
    this.ballShadow = mesh(new THREE.CircleGeometry(.2, 24), new THREE.MeshBasicMaterial({ color: '#14263e', transparent: true, opacity: .3, depthWrite: false }), this.scene); this.ballShadow.rotation.x = -Math.PI / 2;
    this.targetRing = mesh(new THREE.RingGeometry(.37, .41, 40), new THREE.MeshBasicMaterial({ color: '#d8f477', side: THREE.DoubleSide, transparent: true, opacity: .7 }), this.scene); this.targetRing.rotation.x = -Math.PI / 2;
    this.hitRing = mesh(new THREE.RingGeometry(.61, .69, 40), new THREE.MeshBasicMaterial({ color: '#d8f477', side: THREE.DoubleSide, transparent: true, opacity: .8 }), this.scene); this.hitRing.rotation.x = -Math.PI / 2;
    this.people = [];
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize();
  }
  buildCourt() {
    const floor = material('#354d6a'), blue = material('#2467ae'), white = material('#f4f8ff');
    box(this.scene, floor, 27, .14, 43, 0, -.1, 0);
    box(this.scene, blue, 10.97, .018, 23.77, 0, -.012, 0);
    const line = (w, d, x, z) => { const m = box(this.scene, white, w, .014, d, x, .007, z); m.castShadow = false; };
    for (const x of [-5.485, -COURT.halfWidth, COURT.halfWidth, 5.485]) line(.047, 23.77, x, 0);
    for (const z of [-COURT.halfLength, COURT.halfLength]) { line(10.97, .047, 0, z); line(.047, .21, 0, z + Math.sign(z) * .1); }
    for (const z of [-6.4, 6.4]) line(8.23, .047, 0, z);
    line(.047, 12.8, 0, 0);
    const net = material('#1c2e3d');
    for (const x of [-5.7, 5.7]) { const post = mesh(new THREE.CylinderGeometry(.055, .055, 1.15, 10), net, this.scene, x, .575, 0); post.castShadow = true; }
    const netVertices = [];
    const top = x => .914 + .156 * (Math.abs(x) / 5.7) ** 2;
    for (let x = -5.7; x <= 5.701; x += .15) netVertices.push(x, .055, 0, x, top(x), 0);
    for (let y = .05; y < 1.01; y += .1) netVertices.push(-5.7, y, 0, 5.7, y, 0);
    const grid = new THREE.BufferGeometry(); grid.setAttribute('position', new THREE.Float32BufferAttribute(netVertices, 3));
    this.scene.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: '#193247', transparent: true, opacity: .8 })));
    const tapePoints = [];
    for (let x = -5.7; x <= 5.701; x += .15) tapePoints.push(new THREE.Vector3(x, top(x), 0));
    const tapePath = new THREE.CatmullRomCurve3(tapePoints);
    mesh(new THREE.TubeGeometry(tapePath, 80, .024, 6, false), white, this.scene);
    box(this.scene, material('#ffffff', { transparent: true, opacity: .05, side: THREE.DoubleSide }), 11.4, .88, .002, 0, .47, 0);
    const wall = material('#1c3452');
    box(this.scene, wall, 28, 1.65, .25, 0, .82, -19);
    box(this.scene, wall, .25, 1.1, 40, -13.5, .55, 0); box(this.scene, wall, .25, 1.1, 40, 13.5, .55, 0);
    const seat = material('#dae3eb'), step = material('#8fa2b3'), metal = material('#647e91');
    for (let row = 0; row < 3; row++) {
      box(this.scene, step, 26, .45, 1.25, 0, .3 + row * .45, -20 - row * 1.25);
      for (let n = -15; n <= 15; n++) {
        box(this.scene, seat, .55, .12, .55, n * .8, .66 + row * .45, -20 - row * 1.25);
        box(this.scene, seat, .55, .55, .1, n * .8, .9 + row * .45, -20.25 - row * 1.25);
      }
    }
    for (const sign of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        box(this.scene, step, 1.2, .5, 34, sign * (15 + row * 1.2), row * .45 + .25, -2);
        for (let z = -17; z <= 12; z += 1.1) {
          box(this.scene, seat, .55, .1, .62, sign * (15 + row * 1.2), row * .45 + .6, z);
          box(this.scene, seat, .1, .55, .62, sign * (15.25 + row * 1.2), row * .45 + .85, z);
        }
      }
      for (let z = -20; z <= 16; z += 4) box(this.scene, metal, .04, 3, .04, sign * 14, 1.5, z);
      for (const height of [1.5, 3]) box(this.scene, metal, .04, .035, 39, sign * 14, height, -2);
    }
    const trunk = material('#79705c');
    const treeMaterials = ['#6d927b', '#829e73', '#588576'].map(color => material(color));
    for (let i = 0; i < 27; i++) {
      const x = (i - 13) * 2.7; const z = -28 - (i % 3) * 1.9;
      mesh(new THREE.CylinderGeometry(.1, .18, 3, 6), trunk, this.scene, x, 1.5, z);
      const foliage = treeMaterials[i % 3];
      for (let j = 0; j < 3; j++) { const tree = sphere(this.scene, foliage, 1.8, x + Math.sin(i + j) * .7, 3.6 + j * .7, z + Math.cos(j) * .5, 12); tree.scale.y = 1.25; }
    }
    for (const sign of [-1, 1]) {
      box(this.scene, white, 2.2, .16, .55, sign * 9.3, .62, 1.8);
      for (const dx of [-.9, .9]) box(this.scene, metal, .07, .55, .4, sign * 9.3 + dx, .28, 1.8);
      box(this.scene, wall, .5, .65, .5, sign * 9.3, .33, 3);
    }
  }
  // Seats, court markings and trees share GPU draw calls. This matters on
  // integrated GPUs and keeps timing responsive instead of slowing the game.
  batchScenery() {
    const groups = new Map();
    for (const object of [...this.scene.children]) {
      if (!object.isMesh || !['BoxGeometry', 'SphereGeometry'].includes(object.geometry.type)) continue;
      const key = object.geometry.type + object.material.uuid;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(object);
    }
    for (const objects of groups.values()) {
      if (objects.length < 2) continue;
      const isBox = objects[0].geometry.type === 'BoxGeometry';
      const geometry = isBox ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(1, 12, 12);
      const instances = new THREE.InstancedMesh(geometry, objects[0].material, objects.length);
      const transform = new THREE.Object3D();
      objects.forEach((object, i) => {
        const params = object.geometry.parameters;
        transform.position.copy(object.position); transform.quaternion.copy(object.quaternion);
        transform.scale.copy(object.scale).multiply(isBox ? new THREE.Vector3(params.width, params.height, params.depth) : new THREE.Vector3(params.radius, params.radius, params.radius));
        transform.updateMatrix(); instances.setMatrixAt(i, transform.matrix);
        this.scene.remove(object); object.geometry.dispose();
      });
      instances.castShadow = objects[0].castShadow; instances.receiveShadow = true;
      this.scene.add(instances);
    }
  }
  setGender(gender) {
    for (const person of this.people) {
      this.scene.remove(person);
      person.traverse(object => { object.geometry?.dispose(); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose()); });
    }
    this.people = [athlete(gender, false), athlete(gender, true)];
    this.people[1].rotation.y = Math.PI;
    this.people.forEach(p => this.scene.add(p));
  }
  resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.position.set(0, width < 750 ? 15 : 7.8, width < 750 ? 29 : 21.5);
    this.camera.fov = width / height < .9 ? 62 : 43;
    this.camera.lookAt(0, .65, width < 750 ? .3 : 5.7); this.camera.updateProjectionMatrix();
  }
  render(game) {
    for (let i = 0; i < this.people.length; i++) {
      const model = this.people[i], state = game.players[i];
      model.position.set(state.x, 0, state.z);
      const swing = Math.sin(state.swing * Math.PI);
      model.userData.arms[0].rotation.x = -.25 - swing * 1.8;
      model.userData.arms[0].rotation.z = -.2 - swing * .85;
      model.userData.arms[1].rotation.x = -.25 + swing * .4;
      model.userData.hips.rotation.z = state.moving * .04;
      for (const leg of model.userData.legs) leg.rotation.x = state.moving ? Math.sin(game.elapsed * 13 + leg.userData.side * 1.6) * .38 : .07;
    }
    const b = game.ball;
    this.ball.scale.setScalar(this.container.clientWidth < 750 ? 1.35 : 1);
    this.ball.visible = b.visible; this.ball.position.set(b.x, Math.max(b.y, .13), b.z);
    this.ball.rotation.x = game.elapsed * 5; this.ball.rotation.z = game.elapsed * 2;
    this.ballShadow.visible = b.visible; this.ballShadow.position.set(b.x, .025, b.z); this.ballShadow.scale.setScalar(1 + Math.max(0, b.y) * .08);
    this.ballShadow.material.opacity = .35 / (1 + b.y * .35);
    this.hitRing.visible = game.canHit;
    this.hitRing.position.set(game.players[0].x, .027, game.players[0].z);
    this.hitRing.scale.setScalar(1 + Math.sin(game.elapsed * 10) * .1);
    const serve = game.phase.startsWith('serve') || game.phase === 'fault';
    const sign = game.score.deuceSide ? -1 : 1;
    this.targetRing.visible = game.phase !== 'finished' && game.phase !== 'point-over';
    this.targetRing.position.set(serve && game.score.server === 0 ? sign * 2.05 + game.aim.x * 1.1 : game.aim.x * 3.45, .03, serve && game.score.server === 0 ? -4.8 : game.aim.depth ? -5.3 : -7.5);
    this.renderer.render(this.scene, this.camera);
  }
}
