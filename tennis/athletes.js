import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { fallbackAthlete, createRacket } from './athlete-fallback.js';

const files = new Map();
const loader = new GLTFLoader();
const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
const rotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion(), modelRotation = new THREE.Quaternion();
const localAxis = new THREE.Vector3();
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
  const url = new URL(`./assets/models/${key}.glb?v=rig-2`, import.meta.url);
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

export function animateAthlete(model, { time = 0, moving = 0, swing = 0, serving = false, serveStroke = false, celebrating = false, disappointed = false } = {}) {
  const strength = Math.sin(swing * Math.PI / 2);
  const stride = moving ? Math.sin(time * 12) : 0;
  if (model.userData.fallback) {
    model.userData.arms[0].rotation.x = serving ? 2.1 : .15 + strength * (serveStroke ? 2.15 : 1.3);
    model.userData.arms[1].rotation.x = celebrating ? 2.4 : serving ? 2.65 : .1;
    model.userData.head.rotation.x = disappointed ? -.2 : 0;
    for (const leg of model.userData.legs) leg.rotation.x = stride * leg.userData.side * .4;
    return;
  }
  const bones = model.userData.bones;
  for (const bone of bones.values()) bone.object.quaternion.copy(bone.rest);
  // Bone rest orientations differ from model axes (arms point down in the rig).
  // Express an anatomical model-space rotation in the current parent space,
  // then apply it before the bone's rest rotation. Root/opponent rotation cancels.
  model.getWorldQuaternion(modelRotation);
  const pose = (name, angle, axis = axisX) => {
    const bone = bones.get(name); if (!bone) return;
    bone.object.parent.getWorldQuaternion(parentRotation).invert();
    localAxis.copy(axis).applyQuaternion(modelRotation).applyQuaternion(parentRotation).normalize();
    bone.object.quaternion.premultiply(rotation.setFromAxisAngle(localAxis, angle));
  };
  pose('Spine', strength * .32, axisY);
  pose('Spine', moving ? -.06 : Math.sin(time * 2) * .01);
  pose('Head', disappointed ? -.18 : 0);
  pose('UpperArm_R', serving ? 2.1 : .10 + strength * (serveStroke ? 2.2 : 1.05));
  pose('UpperArm_R', serving ? -.22 : serveStroke ? -.16 : -.16 + strength * .65, axisZ);
  pose('Forearm_R', serving ? .65 : .3 + strength * (serveStroke ? .15 : .45));
  pose('Hand_R', strength * -.12);
  pose('UpperArm_L', celebrating ? 2.2 : serving ? 2.65 : .10 - stride * .2);
  pose('UpperArm_L', celebrating ? .2 : .1, axisZ);
  pose('Forearm_L', celebrating ? .65 : serving ? .08 : .25);
  for (const side of ['R', 'L']) {
    const step = side === 'R' ? stride : -stride;
    pose(`Thigh_${side}`, step * .45);
    // The knee flexes backward, opposite to the elbow's forward flexion.
    pose(`Calf_${side}`, -Math.max(0, -step) * .65);
    pose(`Foot_${side}`, Math.max(0, step) * .12);
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
