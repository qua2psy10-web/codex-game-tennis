import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { fallbackAthlete, createRacket } from './athlete-fallback.js';

const files = new Map();
const loader = new GLTFLoader();
const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
const rotation = new THREE.Quaternion();
export const ATHLETES = Object.freeze({
  'male-player': { gender: 'male', rival: false, name: '男子プレーヤー', detail: '白とネイビー · 爽やかなスタイル' },
  'male-rival': { gender: 'male', rival: true, name: '男子ライバル', detail: '黒とブルー · ワイルドなスタイル' },
  'female-player': { gender: 'female', rival: false, name: '女子プレーヤー', detail: 'コーラルと白 · 明るく華やか' },
  'female-rival': { gender: 'female', rival: true, name: '女子ライバル', detail: '紫と黒 · カーリーポニーテール' },
});

function fetchModel(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  return fetch(url, { signal: controller.signal }).then(response => {
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    return response.arrayBuffer();
  }).finally(() => clearTimeout(timeout));
}

export async function loadAthlete(key) {
  const info = ATHLETES[key];
  if (!info) throw new RangeError('Unknown athlete');
  const url = new URL(`./assets/models/${key}.glb`, import.meta.url);
  try {
    if (!files.has(key)) files.set(key, fetchModel(url).catch(error => { files.delete(key); throw error; }));
    const gltf = await loader.parseAsync((await files.get(key)).slice(0), new URL('./', url).href);
    const model = new THREE.Group(); model.add(gltf.scene);
    const bones = new Map();
    gltf.scene.traverse(object => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false; }
      if (object.isBone) bones.set(object.name, { object, rest: object.quaternion.clone() });
    });
    for (const name of ['Hips', 'Spine', 'Head', 'UpperArm_R', 'Forearm_R', 'Hand_R', 'Thigh_R', 'Calf_R', 'UpperArm_L', 'Forearm_L', 'Thigh_L', 'Calf_L']) {
      if (!bones.has(name)) { disposeAthlete(model); throw new Error(`Missing joint ${name}`); }
    }
    const racket = createRacket();
    racket.rotation.z = Math.PI; racket.position.set(0, .025, 0);
    bones.get('Hand_R').object.add(racket);
    model.userData.bones = bones; model.userData.key = key;
    return model;
  } catch (error) {
    files.delete(key);
    console.warn(`3Dモデルを読み込めませんでした (${key})。試作モデルを表示します。`);
    const model = fallbackAthlete(info.gender, info.rival);
    model.userData.fallback = true; model.userData.key = key;
    return model;
  }
}

export function animateAthlete(model, { time = 0, moving = 0, swing = 0, serving = false, celebrating = false, disappointed = false } = {}) {
  const strength = Math.sin(swing * Math.PI);
  const stride = moving ? Math.sin(time * 12) : 0;
  if (model.userData.fallback) {
    model.userData.arms[0].rotation.x = -.25 - strength * 1.8;
    model.userData.arms[1].rotation.x = celebrating ? -2.3 : serving ? -2.4 : -.25;
    model.userData.head.rotation.x = disappointed ? .2 : 0;
    for (const leg of model.userData.legs) leg.rotation.x = stride * leg.userData.side * .4;
    return;
  }
  const bones = model.userData.bones;
  for (const bone of bones.values()) bone.object.quaternion.copy(bone.rest);
  const pose = (name, angle, axis = axisX) => {
    const bone = bones.get(name); if (bone) bone.object.quaternion.multiply(rotation.setFromAxisAngle(axis, angle));
  };
  pose('Spine', strength * -.38, axisY);
  pose('Spine', moving ? .08 : Math.sin(time * 2) * .01);
  pose('Head', disappointed ? .2 : 0);
  pose('UpperArm_R', serving ? -2.25 : -.15 - strength * 1.25);
  pose('UpperArm_R', strength * -.85, axisZ);
  pose('Forearm_R', -.2 - strength * .65);
  pose('Hand_R', strength * .3, axisY);
  pose('UpperArm_L', celebrating ? -2.5 : serving ? -2.7 : -.14 + stride * .2);
  pose('Forearm_L', celebrating ? -1.1 : -.2);
  for (const side of ['R', 'L']) {
    const step = side === 'R' ? stride : -stride;
    pose(`Thigh_${side}`, step * .5);
    pose(`Calf_${side}`, Math.max(0, -step) * .7);
    pose(`Foot_${side}`, Math.max(0, step) * .15);
  }
}

export function disposeAthlete(model) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); skeletons.forEach(s => s.dispose());
}
