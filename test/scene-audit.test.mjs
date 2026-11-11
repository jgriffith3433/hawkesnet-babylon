// Scene audit (example/scene-audit.mjs) on a NullEngine stand-in of the Flagstone arena:
// a clean court passes; a prop lifted off the ground fails with that prop's name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as BABYLON from '@babylonjs/core';
import { auditScene, auditFailMessage, cameraInsideSolid, TOL } from '../example/scene-audit.mjs';

function arena() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const cam = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 1.0, 20, new BABYLON.Vector3(0, 1, 0), scene);
  cam.minZ = 0.15;
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 36, height: 36 }, scene);
  ground.material = new BABYLON.StandardMaterial('g', scene);
  const ring = BABYLON.MeshBuilder.CreateGround('ring', { width: 12, height: 12 }, scene);
  ring.position.y = 0.01;
  ring.material = new BABYLON.StandardMaterial('ringMat', scene);
  const crate = BABYLON.MeshBuilder.CreateBox('crate', { size: 1 }, scene);
  crate.position.set(3, 0.5, 3);
  crate.material = new BABYLON.StandardMaterial('crateMat', scene);
  const pillars = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pil = BABYLON.MeshBuilder.CreateCylinder('pillar' + i, { height: 4, diameterTop: 1, diameterBottom: 1.4, tessellation: 12 }, scene);
    pil.position.set(Math.cos(a) * 15, 2, Math.sin(a) * 15);
    pil.material = new BABYLON.StandardMaterial('stone' + i, scene);
    pillars.push(pil);
  }
  // Intentional floaters the audit must skip (torches, sky).
  const sky = BABYLON.MeshBuilder.CreateSphere('sky', { diameter: 400, segments: 8, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
  sky.infiniteDistance = true;
  const flame = BABYLON.MeshBuilder.CreateSphere('flame0', { diameter: 0.6, segments: 8 }, scene);
  flame.position.set(15, 4.5, 0);
  scene.render();
  return { engine, scene, cam, ground, ring, crate, pillars, stop: () => engine.dispose() };
}

test('scene audit: Flagstone stand-in is clean (0 floating/sunk/zfight/insideOut)', () => {
  const w = arena();
  try {
    const { problems, counts } = auditScene(w.scene, BABYLON);
    assert.equal(auditFailMessage(problems), '', auditFailMessage(problems));
    assert.equal(counts.floating, 0);
    assert.equal(counts.sunk, 0);
    assert.equal(counts.zfight, 0);
    assert.equal(counts.insideOut, 0);
    assert.ok(counts.groundChecked >= 9, `checked ${counts.groundChecked} props`);
    assert.ok(w.cam.minZ >= 0.1);
  } finally { w.stop(); }
});

test('scene audit: a crate lifted off the ground fails with its name', () => {
  const w = arena();
  try {
    w.crate.position.y = 1.7;
    w.crate.computeWorldMatrix(true);
    w.scene.render();
    const { problems, counts } = auditScene(w.scene, BABYLON);
    assert.ok(counts.floating >= 1, `floating=${counts.floating}`);
    const hit = problems.find((p) => p.kind === 'floating' && p.id === 'crate');
    assert.ok(hit, auditFailMessage(problems));
    const msg = auditFailMessage([hit]);
    assert.match(msg, /quality\.ground-contact: crate/);
    assert.ok(msg.includes('crate'), msg);
  } finally { w.stop(); }
});

test('scene audit: coplanar overlapping tops report a zfight pair', () => {
  const w = arena();
  try {
    // Two crates with the same top face height and overlapping footprints → z-fighting.
    const a = BABYLON.MeshBuilder.CreateBox('crateZfA', { size: 2 }, w.scene);
    a.position.set(-6, 1, -6);
    a.material = new BABYLON.StandardMaterial('zfAm', w.scene);
    const b = BABYLON.MeshBuilder.CreateBox('crateZfB', { size: 2 }, w.scene);
    b.position.set(-5.2, 1, -6);
    b.material = new BABYLON.StandardMaterial('zfBm', w.scene);
    w.scene.render();
    const { problems, counts } = auditScene(w.scene, BABYLON);
    assert.ok(counts.zfight >= 1, auditFailMessage(problems));
    assert.ok(problems.some((p) => p.kind === 'zfight' && (String(p.id) + String(p.other || '')).includes('crateZf')), auditFailMessage(problems));
  } finally { w.stop(); }
});

test('scene audit: cameraInsideSolid sees a point inside the crate', () => {
  const w = arena();
  try {
    const hit = cameraInsideSolid(w.scene, BABYLON, new BABYLON.Vector3(3, 0.5, 3));
    assert.equal(hit?.name, 'crate');
    const miss = cameraInsideSolid(w.scene, BABYLON, new BABYLON.Vector3(0, 8, 0));
    assert.equal(miss, null);
  } finally { w.stop(); }
});

test('scene audit: a sunk crate and a flat on the ground are reported', () => {
  const w = arena();
  try {
    w.crate.position.y = 0.2; // bottom at -0.3 → sunk > 5 cm
    w.crate.computeWorldMatrix(true);
    w.ring.position.y = 0; // coplanar with the flagstone
    w.ring.computeWorldMatrix(true);
    w.scene.render();
    const { problems, counts } = auditScene(w.scene, BABYLON);
    assert.ok(counts.sunk >= 1, auditFailMessage(problems));
    assert.ok(problems.some((p) => p.kind === 'sunk' && p.id === 'crate'), auditFailMessage(problems));
    assert.ok(counts.zfight >= 1, auditFailMessage(problems));
    assert.ok(problems.some((p) => p.kind === 'zfight' && (p.id === 'ring' || p.other === 'ground')), auditFailMessage(problems));
  } finally { w.stop(); }
});

test('scene audit: an inside-out box is flagged', () => {
  const w = arena();
  try {
    const hollow = BABYLON.MeshBuilder.CreateBox('crateHollow', { size: 1, sideOrientation: BABYLON.Mesh.BACKSIDE }, w.scene);
    hollow.position.set(-8, 0.5, -8);
    hollow.material = new BABYLON.StandardMaterial('hollowMat', w.scene);
    w.scene.render();
    const { problems, counts } = auditScene(w.scene, BABYLON);
    assert.ok(counts.insideOut >= 1, auditFailMessage(problems));
    assert.ok(problems.some((p) => p.kind === 'insideOut' && String(p.id).includes('Hollow')), auditFailMessage(problems));
  } finally { w.stop(); }
});

test('scene audit: tolerances match quality.ground-contact (2 cm float / 5 cm sunk)', () => {
  assert.equal(TOL.FLOAT_TOL, 0.02);
  assert.equal(TOL.SUNK_TOL, 0.05);
});
