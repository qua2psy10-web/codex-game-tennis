import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { animateAthlete } from '../athletes.js';

function skeleton(key) {
  const bytes = readFileSync(new URL(`../assets/models/${key}.glb`, import.meta.url));
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const jointIds = new Set(doc.skins.flatMap(s => s.joints));
  const nodes = doc.nodes.map((node, i) => {
    const object = jointIds.has(i) ? new THREE.Bone() : new THREE.Object3D();
    object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  doc.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const model = new THREE.Group(); doc.scenes[doc.scene].nodes.forEach(i => model.add(nodes[i]));
  model.userData.bones = new Map([...jointIds].map(i => [nodes[i].name, { object: nodes[i], rest: nodes[i].quaternion.clone() }]));
  return model;
}
const position = (model, name) => model.worldToLocal(model.userData.bones.get(name).object.getWorldPosition(new THREE.Vector3()));
for (const key of ['male-player', 'male-rival', 'female-player', 'female-rival']) {
  test(`${key}: elbows flex forward, serve and celebration raise hands, knees flex backward`, () => {
    const model = skeleton(key);
    for (const yaw of [0, Math.PI]) {
      model.rotation.y = yaw;
      animateAthlete(model);
      for (const side of ['R', 'L']) assert.ok(position(model, `Hand_${side}`).z < position(model, `Forearm_${side}`).z, `${side} elbow bends toward front (-Z)`);
      animateAthlete(model, { serving: true });
      assert.ok(position(model, 'Hand_L').y > position(model, 'Head').y, 'toss hand is overhead');
      assert.ok(position(model, 'Hand_R').y > position(model, 'UpperArm_R').y, 'racket hand raised');
      animateAthlete(model, { serveStroke: true, swing: 1 });
      assert.ok(position(model, 'Hand_R').y > position(model, 'Head').y, 'serve strikes overhead');
      animateAthlete(model, { celebrating: true });
      assert.ok(position(model, 'Hand_L').y > position(model, 'Head').y, 'celebration fist overhead');
      animateAthlete(model, { moving: 1, time: Math.PI / 24 });
      assert.ok(position(model, 'Foot_L').z > position(model, 'Calf_L').z, 'trailing knee bends backward (+Z)');
    }
  });
}
test('forehand begins at contact and poses do not accumulate across frames', () => {
  const model = skeleton('male-player');
  animateAthlete(model, { swing: 1 });
  assert.ok(position(model, 'Hand_R').z < -.25, 'racket is already in front at contact');
  const first = position(model, 'Hand_R');
  animateAthlete(model, { swing: 1 }); assert.ok(position(model, 'Hand_R').distanceTo(first) < 1e-6);
  animateAthlete(model); const idle = position(model, 'Hand_R');
  animateAthlete(model, { serving: true }); animateAthlete(model);
  assert.ok(position(model, 'Hand_R').distanceTo(idle) < 1e-6);
});

// Exercise the actual exported mesh and bind matrices, not just joint positions.
// A raised arm must never pull the hips or thighs along with it.
import { GLTFLoader } from '../vendor/GLTFLoader.js';
for (const key of ['male-player', 'male-rival', 'female-player', 'female-rival']) {
  test(`${key}: raising arms leaves the lower-body skin in place`, async () => {
    const bytes = readFileSync(new URL(`../assets/models/${key}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = new THREE.Group(); model.add(gltf.scene);
    const bones = new Map(), meshes = [];
    model.traverse(object => {
      if (object.isBone) bones.set(object.name, { object, rest: object.quaternion.clone() });
      if (object.isSkinnedMesh) meshes.push(object);
    });
    model.userData.bones = bones; model.updateMatrixWorld(true);
    const samples = [];
    for (const mesh of meshes) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i);
        mesh.applyBoneTransform(i, point); mesh.localToWorld(point); model.worldToLocal(point);
        const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
        for (let channel = 0; channel < 4; channel++) {
          const joint = mesh.skeleton.bones[indices.getComponent(i, channel)];
          if (joint.name === 'Head' && weights.getComponent(i, channel) > .001) assert.ok(point.y > 1.3, 'arm skin must not be attached to the head');
        }
        // Stay inside the hip/thigh region; hands hang beside it in the rest pose.
        if (point.y < .92 && Math.abs(point.x) < .21 * (key.startsWith('female') ? .94 : 1)) samples.push({ mesh, index: i, rest: point.clone() });
      }
    }
    assert.ok(samples.length > 100, 'actual lower-body vertices were tested');
    for (const pose of [{ serving: true }, { celebrating: true }, { swing: 1 }, { serveStroke: true, swing: 1 }]) {
      animateAthlete(model, pose); model.updateMatrixWorld(true);
      for (const { mesh, index, rest } of samples) {
        const point = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index);
        mesh.applyBoneTransform(index, point); mesh.localToWorld(point); model.worldToLocal(point);
        assert.ok(point.distanceTo(rest) < .001, `lower-body vertex ${index} pulled by an arm`);
      }
    }
  });
}

for (const key of ['male-player', 'male-rival', 'female-player', 'female-rival']) {
  test(`${key}: running swings opposite arms, bends both knees and leans forward`, () => {
    const model = skeleton(key);
    const kneeAngle = side => {
      const thigh = position(model, `Thigh_${side}`), knee = position(model, `Calf_${side}`), ankle = position(model, `Foot_${side}`);
      return knee.clone().sub(thigh).angleTo(ankle.clone().sub(knee));
    };
    animateAthlete(model); const idleHead = position(model, 'Head'), idleKnees = ['R', 'L'].map(kneeAngle);
    const hands = [];
    for (const time of [Math.PI / 24, Math.PI / 8]) {
      animateAthlete(model, { moving: 1, time });
      hands.push(['R', 'L'].map(side => position(model, `Hand_${side}`).z));
      for (const [i, side] of ['R', 'L'].entries()) assert.ok(kneeAngle(side) > idleKnees[i] + .1, `${side} knee flexes during both halves of the stride`);
      assert.ok(position(model, 'Head').z < idleHead.z - .035, 'upper body leans forward');
    }
    assert.ok(hands[0][0] > hands[1][0], 'right arm swings with the opposite leg');
    assert.ok(hands[0][1] < hands[1][1], 'left arm swings opposite to the right arm');
    animateAthlete(model); assert.ok(position(model, 'Head').distanceTo(idleHead) < 1e-6, 'stopping resets the running posture');
  });
}
