import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '@babylonjs/core';
import { billboards } from '../hawkes-net-babylon.mjs';

// A nameplate copies the camera's rotation: from every side its right edge stays on the screen's right, it is never
// mirrored (no negative scale) and never rolled, whatever its parent's yaw or scale.
test('billboards: a plate copies the camera rotation from every side, never mirrored', () => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const cam = new B.ArcRotateCamera('cam', 0, 1.1, 9, new B.Vector3(0, 1, 0), scene);
  const root = new B.TransformNode('root', scene);
  root.rotation.y = 2.1; root.position.set(3, 0, -2); root.scaling.setAll(0.4);   // yawed, popping in at a smaller scale
  const tag = B.MeshBuilder.CreatePlane('hn-tag-x', { width: 1.6, height: 0.4 }, scene);
  tag.position.y = 2.2; tag.parent = root; tag.metadata = { hnBillboard: true };
  const off = billboards(scene, B);
  for (let i = 0; i < 24; i++) {
    cam.alpha = (i / 24) * Math.PI * 2; cam.beta = 0.6 + (i % 5) * 0.15;
    scene.render();
    const w = tag.computeWorldMatrix(true);
    assert.ok(w.determinant() > 0, `frame ${i}: negative scale`);
    const view = cam.getViewMatrix();
    const right = B.Vector3.TransformNormal(new B.Vector3(1, 0, 0), w), up = B.Vector3.TransformNormal(new B.Vector3(0, 1, 0), w);
    const r = B.Vector3.TransformNormal(right, view).normalize(), u = B.Vector3.TransformNormal(up, view).normalize();
    assert.ok(r.x > 0.999 && Math.abs(r.y) < 0.01 && Math.abs(r.z) < 0.01, `frame ${i}: the plate's right is ${r.toString()} in the camera's view`);
    assert.ok(u.y > 0.999, `frame ${i}: the plate is rolled (${u.toString()})`);
    const at = B.Vector3.TransformCoordinates(B.Vector3.Zero(), w);
    assert.ok(Math.abs(at.y - 2.2 * 0.4) < 1e-3 && Math.hypot(at.x - 3, at.z + 2) < 1e-3, `frame ${i}: the plate drifted off its hook (${at.toString()})`);
  }
  off(); scene.dispose(); engine.dispose();
});
