import * as THREE from './vendor/three.module.js';
import { ATHLETES, loadAthlete, animateAthlete, disposeAthlete } from './athletes.js';

export class CharacterViewer {
  constructor(container, status) {
    this.container = container; this.status = status; this.request = 0; this.angle = 0; this.zoom = 1; this.pose = 'idle';
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#e7eaed');
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 20);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '選手の3Dモデル。ドラッグで回転できます。');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#84909c', 2.5));
    const key = new THREE.DirectionalLight('#fff4e8', 3); key.position.set(-3, 5, -3); key.castShadow = true;
    key.shadow.mapSize.set(512, 512); key.shadow.camera.left = -2; key.shadow.camera.right = 2;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -1; key.shadow.bias = -.001;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#c8dcff', 1.8); fill.position.set(3, 2, 2); this.scene.add(fill);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(.82, .82, .055, 64), new THREE.MeshStandardMaterial({ color: '#d6dbe0', roughness: .9 }));
    platform.position.y = -.03; platform.receiveShadow = true; this.scene.add(platform);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    const canvas = this.renderer.domElement;
    let pointer = null, lastX = 0;
    canvas.addEventListener('pointerdown', event => { if (pointer !== null) return; pointer = event.pointerId; lastX = event.clientX; canvas.setPointerCapture(pointer); });
    canvas.addEventListener('pointermove', event => { if (event.pointerId !== pointer) return; this.angle += (event.clientX - lastX) * .012; lastX = event.clientX; });
    const release = event => { if (event.pointerId === pointer) pointer = null; };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, release);
    this.frame = time => {
      if (!this.active) return;
      if (this.model) {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const elapsed = reduced ? .25 : (time - this.started) / 1000;
        this.model.rotation.y = this.angle;
        animateAthlete(this.model, { time: elapsed, moving: this.pose === 'run' ? 1 : 0,
          swing: this.pose === 'swing' ? 1 - (elapsed % 1) : 0,
          serving: this.pose === 'serve', celebrating: this.pose === 'celebrate' });
      }
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(this.frame);
    };
  }
  resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const focus = this.zoom > 1.3 ? 1.5 : 1;
    this.camera.position.set(0, focus + .08, -3.45 / this.zoom);
    this.camera.lookAt(0, focus, 0); this.camera.updateProjectionMatrix();
  }
  async show(key) {
    const request = ++this.request;
    this.status.textContent = 'モデルを読み込んでいます…';
    if (this.model) { this.scene.remove(this.model); disposeAthlete(this.model); this.model = null; }
    this.angle = -.22; this.pose = 'idle'; this.started = performance.now();
    const model = await loadAthlete(key);
    if (!this.active || request !== this.request) { disposeAthlete(model); return; }
    this.model = model; this.scene.add(model);
    this.status.textContent = model.userData.fallback ? '読み込みに失敗したため、従来の試作モデルを表示しています。' : `${ATHLETES[key].detail} · ドラッグで回転`;
  }
  open(key) { this.active = true; this.started = performance.now(); this.resize(); cancelAnimationFrame(this.frameId); this.frameId = requestAnimationFrame(this.frame); return this.show(key); }
  close() {
    this.active = false; ++this.request; cancelAnimationFrame(this.frameId);
    if (this.model) { this.scene.remove(this.model); disposeAthlete(this.model); this.model = null; }
  }
  setPose(pose) { this.pose = pose; this.started = performance.now(); }
  setZoom(zoom) { this.zoom = zoom; this.resize(); }
  rotate(direction) { this.angle += direction * Math.PI / 4; }
}
