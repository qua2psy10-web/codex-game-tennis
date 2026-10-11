import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const jointNames = ['Hips', 'Spine', 'Head', 'UpperArm_R', 'Forearm_R', 'Hand_R', 'UpperArm_L', 'Forearm_L', 'Thigh_R', 'Calf_R', 'Foot_R', 'Thigh_L', 'Calf_L', 'Foot_L'];
for (const key of ['male-player', 'male-rival', 'female-player', 'female-rival']) {
  test(`${key} GLB has a complete skeleton, valid skin weights and self-contained assets`, () => {
    const file = readFileSync(new URL(`../assets/models/${key}.glb`, import.meta.url));
    assert.equal(file.readUInt32LE(0), 0x46546c67); assert.equal(file.readUInt32LE(4), 2);
    assert.equal(file.readUInt32LE(8), file.length);
    const jsonLength = file.readUInt32LE(12); assert.equal(file.readUInt32LE(16), 0x4e4f534a);
    const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
    const binHeader = 20 + jsonLength; assert.equal(file.readUInt32LE(binHeader + 4), 0x004e4942);
    const binary = file.subarray(binHeader + 8, binHeader + 8 + file.readUInt32LE(binHeader));
    assert.ok(doc.buffers.every(b => !b.uri && b.byteLength <= binary.length));
    assert.ok(!doc.images?.some(image => image.uri));
    const skin = doc.skins[0]; assert.ok(skin);
    const names = skin.joints.map(index => doc.nodes[index].name);
    jointNames.forEach(name => assert.ok(names.includes(name), `Missing ${name}`));
    assert.equal(doc.accessors[skin.inverseBindMatrices].count, skin.joints.length);
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
      const colors = doc.accessors[primitive.attributes.COLOR_0];
      assert.ok(colors, 'skin and fabric surface detail is embedded in the mesh');
      assert.equal(colors.count, doc.accessors[primitive.attributes.POSITION].count);
      const weights = doc.accessors[primitive.attributes.WEIGHTS_0];
      const joints = doc.accessors[primitive.attributes.JOINTS_0];
      assert.ok(weights && joints); assert.equal(weights.count, joints.count);
      assert.equal(weights.componentType, 5126); assert.equal(weights.type, 'VEC4');
      const view = doc.bufferViews[weights.bufferView];
      const offset = (view.byteOffset ?? 0) + (weights.byteOffset ?? 0);
      for (let i = 0; i < weights.count; i++) {
        let sum = 0;
        for (let j = 0; j < 4; j++) {
          const value = binary.readFloatLE(offset + i * (view.byteStride ?? 16) + j * 4);
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1); sum += value;
        }
        assert.ok(Math.abs(sum - 1) < .001, `Unbound vertex ${i}`);
      }
    }
  });
}
