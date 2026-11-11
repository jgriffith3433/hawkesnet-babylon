// Scene audit for the Flagstone arena demo (Studio quality rules 2, 3, 4 + camera near / orbit):
// floating / sunk props (bounds bottom vs a downward ray), coplanar z-fighting pairs, inside-out normals,
// and frames where the camera sits inside a solid mesh's bounds. Reads the scene; never edits it.
//
//   auditScene(scene, BABYLON, opts?) -> { problems, counts }
//   cameraInsideSolid(scene, BABYLON, point, opts?) -> mesh | null
//
// Counts always include: floating, sunk, zfight, insideOut, cameraInside (0 until an orbit caller fills it).

const FLOAT_TOL = 0.02; // 2 cm above the surface under the mesh
const SUNK_TOL = 0.05;  // 5 cm below (quality.ground-contact)
const COPLANAR_EPS = 0.002;
const OVERLAP_MIN = 0.01;
const INSIDE_OUT_SHARE = 0.6;

// Skip helpers / characters / bobbing orbs — but keep orb-pad-* (static discs on the stone).
const SKIP_NAME = /^(ground|sky|skyMat|me$|me-|hn-|orb-(?!pad-)|flame|char-|audit-)/i;
const SOLID_NAME = /^(crate|pillar\d+|ring|orb-pad-)/i;

function drawn(mesh) {
  if (!mesh || (mesh.isEnabled && !mesh.isEnabled()) || mesh.isVisible === false || mesh.visibility === 0) return false;
  if (!mesh.getTotalVertices || mesh.getTotalVertices() < 3) return false;
  if (mesh.infiniteDistance) return false;
  if (mesh.billboardMode && mesh.billboardMode !== 0) return false;
  return true;
}

function skipMesh(mesh) {
  const n = String(mesh.name || '');
  if (SKIP_NAME.test(n)) return true;
  // Character body meshes from the robot glb (hn-body-… / nested glTF names under a char- / hn-avatar- root).
  for (let p = mesh; p; p = p.parent) {
    const pn = String(p.name || '');
    if (/^(me|char-|hn-avatar-|hn-body-|orb-)/i.test(pn)) return true;
  }
  return false;
}

function worldVerts(mesh, B) {
  const pos = mesh.getVerticesData && mesh.getVerticesData(B.VertexBuffer.PositionKind);
  if (!pos) return null;
  const m = mesh.computeWorldMatrix(true);
  const out = [];
  const v = new B.Vector3();
  for (let i = 0; i < pos.length; i += 3) {
    B.Vector3.TransformCoordinatesFromFloatsToRef(pos[i], pos[i + 1], pos[i + 2], m, v);
    out.push([v.x, v.y, v.z]);
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const r2 = (x) => Math.round(x * 100) / 100;

function staticMeshes(scene) {
  return scene.meshes.filter((m) => drawn(m) && !skipMesh(m));
}

function groundMeshes(scene) {
  return scene.meshes.filter((m) => m && m.name === 'ground' && drawn(m));
}

/** Bounds-bottom vs downward ray onto the flagstone (or another surface under the prop). */
function groundAudit(scene, B, problems, counts) {
  const props = staticMeshes(scene).filter((m) => {
    // Flat overlays on the floor (ring, orb pads) still get a ground gap check.
    const n = String(m.name || '');
    return SOLID_NAME.test(n) || (!SKIP_NAME.test(n) && m.getBoundingInfo);
  });
  // Prefer named solids; also include any other static mesh that isn't a skip.
  const list = [];
  const seen = new Set();
  for (const m of props) {
    if (seen.has(m.uniqueId)) continue;
    seen.add(m.uniqueId);
    list.push(m);
  }
  counts.groundChecked = list.length;
  const floors = groundMeshes(scene);
  for (const mesh of list) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo?.(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    const min = bb.minimumWorld, max = bb.maximumWorld;
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
    const bottom = min.y;
    const self = mesh.uniqueId;
    const pickable = (m) => m && m.uniqueId !== self && (m.name === 'ground' || (drawn(m) && !skipMesh(m) && SOLID_NAME.test(String(m.name || ''))));
    // Prefer the arena floor when present so a pad over the ring still measures against stone.
    const floorOnly = (m) => m && m.name === 'ground';
    const ray = new B.Ray(new B.Vector3(cx, bottom + 0.05, cz), new B.Vector3(0, -1, 0), 80);
    let hit = scene.pickWithRay(ray, floors.length ? floorOnly : pickable);
    if (!hit?.hit) {
      // From above the mesh in case it is sunk through the floor.
      hit = scene.pickWithRay(new B.Ray(new B.Vector3(cx, max.y + 0.5, cz), new B.Vector3(0, -1, 0), 80), floors.length ? floorOnly : pickable);
    }
    if (!hit?.hit || !hit.pickedPoint) {
      problems.push({ kind: 'floating', id: mesh.name, detail: 'nothing under its bounds bottom (ray down)' });
      continue;
    }
    const gap = bottom - hit.pickedPoint.y;
    if (gap > FLOAT_TOL) {
      problems.push({ kind: 'floating', id: mesh.name, detail: `base ${(gap * 100).toFixed(0)} cm above the ground`, amount: +gap.toFixed(3) });
    } else if (gap < -SUNK_TOL) {
      problems.push({ kind: 'sunk', id: mesh.name, detail: `base ${((-gap) * 100).toFixed(0)} cm under the ground`, amount: +gap.toFixed(3) });
    }
  }
}

function axisAligned(mesh, B) {
  const q = new B.Quaternion(), sc = new B.Vector3(), tr = new B.Vector3();
  mesh.computeWorldMatrix(true).decompose(sc, q, tr);
  const e = q.toEulerAngles();
  const quarter = (a) => Math.abs(a / (Math.PI / 2) - Math.round(a / (Math.PI / 2))) < 0.01;
  return quarter(e.x) && quarter(e.y) && quarter(e.z);
}

/** Coplanar overlapping faces between different meshes (z-fighting pairs). */
function coplanarAudit(scene, B, problems, counts) {
  const boxes = [];
  for (const mesh of staticMeshes(scene)) {
    if (!mesh.material || mesh.material.zOffset) continue;
    const nv = mesh.getTotalVertices();
    if (nv < 4) continue;
    if (!axisAligned(mesh, B)) continue;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo?.(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    boxes.push({
      mesh, id: mesh.name,
      min: bb.minimumWorld.asArray(), max: bb.maximumWorld.asArray(),
      flat: (bb.maximumWorld.y - bb.minimumWorld.y) < 0.05,
    });
  }
  // Floor plane (y of the ground top) for "flat overlay laid on the stone" checks — a prop resting on
  // the ground is opposite-facing (hidden), not a fight; a second flat in the same plane flickers.
  let groundY = null;
  for (const g of groundMeshes(scene)) {
    g.computeWorldMatrix(true);
    g.refreshBoundingInfo?.(true);
    const bb = g.getBoundingInfo().boundingBox;
    groundY = groundY == null ? bb.maximumWorld.y : Math.max(groundY, bb.maximumWorld.y);
  }
  counts.coplanarChecked = boxes.length + (groundY == null ? 0 : 1);
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      for (let k = 0; k < 3; k++) {
        const u = (k + 1) % 3, v = (k + 2) % 3;
        const ou = Math.min(a.max[u], b.max[u]) - Math.max(a.min[u], b.min[u]);
        const ov = Math.min(a.max[v], b.max[v]) - Math.max(a.min[v], b.min[v]);
        if (ou <= OVERLAP_MIN || ov <= OVERLAP_MIN) continue;
        // Same-facing faces only (both tops / both bottoms). A bottom on a top is resting, not a fight.
        const same = (Math.abs(a.max[k] - b.max[k]) < COPLANAR_EPS ? 'max' : null)
          || (Math.abs(a.min[k] - b.min[k]) < COPLANAR_EPS ? 'min' : null);
        if (!same) continue;
        const key = [a.id, b.id].sort().join('|') + ':' + k + same;
        if (seen.has(key)) continue;
        seen.add(key);
        problems.push({
          kind: 'zfight',
          id: a.id,
          detail: `coplanar with ${b.id} on ${'xyz'[k]}=${r2(same === 'max' ? a.max[k] : a.min[k])} (${r2(ou * ov)} m²)`,
          other: b.id,
        });
      }
    }
  }
  if (groundY != null) {
    for (const t of boxes) {
      if (!t.flat) continue;
      if (Math.abs(t.max[1] - groundY) >= COPLANAR_EPS && Math.abs(t.min[1] - groundY) >= COPLANAR_EPS) continue;
      const key = `ground|${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        kind: 'zfight',
        id: t.id,
        detail: `flat overlay coplanar with ground at y=${r2(groundY)}`,
        other: 'ground',
      });
    }
  }
}

let WINDING = 1;
function calibrate(scene, B) {
  const box = B.MeshBuilder.CreateBox('audit-calibrate', { size: 1 }, scene);
  box.setEnabled(false);
  WINDING = Math.sign(inwardShare(box, B, true)) || 1;
  box.dispose();
}

function inwardShare(mesh, B, raw) {
  const verts = worldVerts(mesh, B);
  const idx = mesh.getIndices();
  if (!verts || !idx || !idx.length) return 0;
  const flip = raw ? 1 : (Math.sign(mesh.getWorldMatrix().determinant()) || 1);
  const c = verts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x) => x / verts.length);
  let out = 0, inn = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = verts[idx[i]], b = verts[idx[i + 1]], cc = verts[idx[i + 2]];
    const n = cross(sub(b, a), sub(cc, a));
    const area = len(n);
    if (area < 1e-9) continue;
    const mid = [(a[0] + b[0] + cc[0]) / 3 - c[0], (a[1] + b[1] + cc[1]) / 3 - c[1], (a[2] + b[2] + cc[2]) / 3 - c[2]];
    const d = dot(n, mid) / (area * (len(mid) || 1));
    if (Math.abs(d) < 0.2) continue;
    if (d * (raw ? 1 : WINDING * flip) > 0) out += area; else inn += area;
  }
  if (raw) return out - inn;
  return out + inn > 0 ? inn / (out + inn) : 0;
}

function closed(mesh, B) {
  const P = mesh.getVerticesData && mesh.getVerticesData(B.VertexBuffer.PositionKind);
  const idx = mesh.getIndices();
  if (!P || !idx || idx.length > 60000) return false;
  const key = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
  const edges = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    for (const [p, q] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
      const a = key(p), b = key(q);
      if (a === b) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let two = 0;
  for (const n of edges.values()) if (n === 2) two++;
  return edges.size > 0 && two / edges.size > 0.95;
}

function normalsAgainstWinding(mesh, B) {
  const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
  const nor = mesh.getVerticesData(B.VertexBuffer.NormalKind);
  const idx = mesh.getIndices();
  if (!pos || !nor || !idx || !idx.length) return 0;
  let against = 0, all = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const P = (j) => [pos[idx[i + j] * 3], pos[idx[i + j] * 3 + 1], pos[idx[i + j] * 3 + 2]];
    const n = cross(sub(P(1), P(0)), sub(P(2), P(0)));
    if (len(n) < 1e-12) continue;
    let sn = [0, 0, 0];
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) sn[k] += nor[idx[i + j] * 3 + k];
    all++;
    if (dot(n, sn) * WINDING < 0) against++;
  }
  return all ? against / all : 0;
}

function normalsAudit(scene, B, problems, counts) {
  let checked = 0;
  const seen = new Set();
  for (const mesh of staticMeshes(scene)) {
    if (!mesh.material || mesh.material.backFaceCulling === false) continue;
    if (mesh.sideOrientation === B.Mesh.DOUBLESIDE) continue;
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    const ext = bb.extendSizeWorld;
    if (Math.min(ext.x, ext.y, ext.z) < 0.01) continue; // flat: no inside
    const geo = mesh.geometry || mesh.sourceMesh?.geometry;
    const key = geo ? `${geo.uniqueId}:${Math.sign(mesh.getWorldMatrix().determinant())}` : mesh.uniqueId;
    if (seen.has(key)) continue;
    seen.add(key);
    checked++;
    const flipped = normalsAgainstWinding(mesh, B);
    const share = closed(mesh, B) ? inwardShare(mesh, B) : 0;
    if (flipped > INSIDE_OUT_SHARE || share > INSIDE_OUT_SHARE) {
      const pct = Math.round((flipped > share ? flipped : share) * 100);
      problems.push({ kind: 'insideOut', id: mesh.name, detail: `${pct}% of normals/faces point inward` });
    }
  }
  counts.normalsChecked = checked;
}

/** A solid the camera should not sit inside (pillars, crate; not sky / ground / overlays / avatars). */
export function cameraInsideSolid(scene, B, point, opts = {}) {
  const p = point;
  for (const mesh of scene.meshes) {
    if (!drawn(mesh) || skipMesh(mesh)) continue;
    const n = String(mesh.name || '');
    if (n === 'ground' || n === 'ring' || n.startsWith('orb-pad-')) continue;
    if (opts.onlySolid !== false && !SOLID_NAME.test(n) && !/^crate$|^pillar/i.test(n)) continue;
    mesh.computeWorldMatrix(true);
    if (mesh.getBoundingInfo().boundingBox.intersectsPoint(p)) return mesh;
  }
  return null;
}

/**
 * @param {*} scene
 * @param {*} BABYLON
 * @param {{ skipGround?: boolean }} [opts]
 */
export function auditScene(scene, BABYLON, opts = {}) {
  const B = BABYLON;
  const problems = [];
  const counts = { floating: 0, sunk: 0, zfight: 0, insideOut: 0, cameraInside: 0, groundChecked: 0, coplanarChecked: 0, normalsChecked: 0 };
  calibrate(scene, B);
  if (!opts.skipGround) groundAudit(scene, B, problems, counts);
  coplanarAudit(scene, B, problems, counts);
  normalsAudit(scene, B, problems, counts);
  for (const p of problems) {
    if (p.kind === 'floating') counts.floating++;
    else if (p.kind === 'sunk') counts.sunk++;
    else if (p.kind === 'zfight') counts.zfight++;
    else if (p.kind === 'insideOut') counts.insideOut++;
  }
  return { problems, counts };
}

/** Fail message for playtest problems (includes the mesh name). */
export function auditFailMessage(problems) {
  if (!problems.length) return '';
  return problems.map((p) => {
    const code = p.kind === 'floating' || p.kind === 'sunk' ? 'quality.ground-contact'
      : p.kind === 'zfight' ? 'quality.z-fighting'
        : p.kind === 'insideOut' ? 'quality.inside-out'
          : `quality.${p.kind}`;
    return `${code}: ${p.id} ${p.detail}`;
  }).join('; ');
}

export const TOL = { FLOAT_TOL, SUNK_TOL, COPLANAR_EPS, INSIDE_OUT_SHARE };
