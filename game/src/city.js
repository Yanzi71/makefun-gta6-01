// Solmar, procedurally built from a seeded RNG: a street grid, blocks of buildings with
// canvas-painted window textures, sidewalks, lamps, trees, a central park and a beach with
// water on the east edge. Static geometry is instanced (one draw call per kind) and every
// building also registers an axis-aligned collider for movement and driving.
import { PALETTE, WORLD } from './config.js';

/** Building facade colours: sun-bleached stucco, brick, glass and pastel. */
const FACADE_COLORS = [
  0xe8dcc8, 0xd8c9a8, 0xc9b8a3, 0xb8a894, 0xd9c4b8,
  0xa8b8c8, 0x9fb8a8, 0xc8b8d0, 0xe0b8a0, 0x88a8b8,
  0x707888, 0x98a8b8, 0xd8d0c0, 0xb8c8a8,
];

/** A canvas texture of lit and dark windows, tiled across every facade. */
function makeWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 12;
  const w = 128 / cols;
  const h = 256 / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const lit = Math.random() < 0.28;
      ctx.fillStyle = lit ? '#ffe9a8' : '#2e4258';
      ctx.fillRect(x * w + 4, y * h + 4, w - 8, h - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x * w + 4, y * h + h - 7, w - 8, 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

/**
 * Asphalt with a dashed centre line. `alongU` draws the dashes along the u axis
 * (for roads running east-west); otherwise they run along v (north-south roads).
 * The texture tiles every 8 world units, so the dashes stay road-sized.
 */
function makeRoadTexture(alongU) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f44';
  ctx.fillRect(0, 0, 64, 64);
  // Speckle for asphalt grain.
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 2, 2);
  }
  ctx.fillStyle = '#e8d84a';
  if (alongU) {
    ctx.fillRect(8, 30, 20, 4);
    ctx.fillRect(40, 30, 20, 4);
  } else {
    ctx.fillRect(30, 8, 4, 20);
    ctx.fillRect(30, 40, 4, 20);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A circle (x, z, radius) pushed out of every building AABB it touches. Returns the new x/z. */
export function collideCircle(colliders, x, z, radius) {
  for (let i = 0; i < colliders.length; i += 1) {
    const b = colliders[i];
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 0.000001) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      x += dx * push;
      z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const pushLeft = x - b.minX + radius;
      const pushRight = b.maxX - x + radius;
      const pushUp = z - b.minZ + radius;
      const pushDown = b.maxZ - z + radius;
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) x = b.minX - radius;
      else if (min === pushRight) x = b.maxX + radius;
      else if (min === pushUp) z = b.minZ - radius;
      else z = b.maxZ + radius;
    }
  }
  return { x, z };
}

/** True when the point is on a road (within half a road width of a street line). */
export function onRoad(x, z) {
  const half = WORLD.roadWidth / 2 + 0.5;
  for (const s of WORLD.streets) {
    if (Math.abs(x - s) < half || Math.abs(z - s) < half) return true;
  }
  return false;
}

/** The nearest street centre line to a coordinate, for traffic lane math. */
export function nearestStreet(value) {
  let best = WORLD.streets[0];
  for (const s of WORLD.streets) if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  return best;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const span = WORLD.half * 2 + 40;

  // Ground: grassy base under everything.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span + 220, span),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: one dark strip per street, both directions, with dashed centre lines.
  // Each texture tiles every 8 units along the road's length.
  const roadTextureX = makeRoadTexture(true);
  roadTextureX.repeat.set(span / 8, 1);
  const roadTextureZ = makeRoadTexture(false);
  roadTextureZ.repeat.set(1, span / 8);
  const roadMaterialX = new THREE.MeshLambertMaterial({ map: roadTextureX });
  const roadMaterialZ = new THREE.MeshLambertMaterial({ map: roadTextureZ });
  const roadGeoX = new THREE.PlaneGeometry(span, WORLD.roadWidth);
  const roadGeoZ = new THREE.PlaneGeometry(WORLD.roadWidth, span);
  for (const s of WORLD.streets) {
    const rx = new THREE.Mesh(roadGeoX, roadMaterialX);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.02, s);
    rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMaterialZ);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(s, 0.02, 0);
    rz.receiveShadow = true;
    group.add(rz);
  }

  // Sidewalk slabs: one per block, slightly raised, with a grass park in the middle.
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const parkMat = new THREE.MeshLambertMaterial({ color: PALETTE.park });
  const slabGeo = new THREE.BoxGeometry(WORLD.blockSize + 2, 0.3, WORLD.blockSize + 2);
  const parkIndex = WORLD.parkBlock;
  for (let bx = 0; bx < WORLD.blocks.length; bx += 1) {
    for (let bz = 0; bz < WORLD.blocks.length; bz += 1) {
      const isPark = bx === parkIndex && bz === parkIndex;
      const slab = new THREE.Mesh(slabGeo, isPark ? parkMat : sidewalkMat);
      slab.position.set(WORLD.blocks[bx], 0.15, WORLD.blocks[bz]);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // Buildings: instanced boxes, one per plot, with per-instance facade colours.
  const plots = [];
  for (let bx = 0; bx < WORLD.blocks.length; bx += 1) {
    for (let bz = 0; bz < WORLD.blocks.length; bz += 1) {
      if (bx === parkIndex && bz === parkIndex) continue;
      const cx = WORLD.blocks[bx];
      const cz = WORLD.blocks[bz];
      // Downtown (near the centre) gets taller towers; the outskirts stay low.
      const centreDist = Math.sqrt(cx * cx + cz * cz) / 200;
      const tall = rng.chance(0.3) && centreDist < 0.6;
      if (tall) {
        plots.push({ x: cx, z: cz, w: 26, d: 26, h: rng.range(34, 58) });
      } else {
        // Two or four smaller buildings per block.
        const twoByTwo = rng.chance(0.55);
        const off = twoByTwo ? 8.5 : 0;
        const size = twoByTwo ? 15 : 26;
        const spots = twoByTwo
          ? [[-off, -off], [off, -off], [-off, off], [off, off]]
          : [[0, 0]];
        for (const [ox, oz] of spots) {
          if (twoByTwo && rng.chance(0.18)) continue; // an empty lot now and then
          const h = rng.range(7, 18) + (centreDist < 0.4 ? rng.range(0, 14) : 0);
          plots.push({ x: cx + ox, z: cz + oz, w: size, d: size, h });
        }
      }
    }
  }
  const windowTexture = makeWindowTexture();
  const buildingMat = new THREE.MeshLambertMaterial({ map: windowTexture });
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  // Shift the box so scaling by height grows it upward from the ground.
  buildingGeo.translate(0, 0.5, 0);
  const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, plots.length);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  plots.forEach((plot, i) => {
    matrix.makeScale(plot.w, plot.h, plot.d);
    matrix.setPosition(plot.x, 0.3, plot.z);
    buildings.setMatrixAt(i, matrix);
    colour.setHex(rng.pick(FACADE_COLORS));
    buildings.setColorAt(i, colour);
    colliders.push({
      minX: plot.x - plot.w / 2, maxX: plot.x + plot.w / 2,
      minZ: plot.z - plot.d / 2, maxZ: plot.z + plot.d / 2,
    });
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  group.add(buildings);

  // Rooftop water towers on a few towers, for silhouette.
  const towerGeo = new THREE.CylinderGeometry(1.6, 1.6, 3, 8);
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  let towerCount = 0;
  for (const plot of plots) {
    if (plot.h > 30 && rng.chance(0.5)) towerCount += 1;
  }
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, Math.max(1, towerCount));
  {
    let t = 0;
    for (const plot of plots) {
      if (plot.h > 30 && rng.chance(0.5)) {
        matrix.makeTranslation(plot.x, 0.3 + plot.h + 1.5, plot.z);
        towers.setMatrixAt(t, matrix);
        t += 1;
        if (t >= towerCount) break;
      }
    }
    towers.count = t;
  }
  towers.castShadow = true;
  group.add(towers);

  // Trees: instanced trunks + foliage balls, scattered on sidewalks and thick in the park.
  const treeSpots = [];
  for (let bx = 0; bx < WORLD.blocks.length; bx += 1) {
    for (let bz = 0; bz < WORLD.blocks.length; bz += 1) {
      const isPark = bx === parkIndex && bz === parkIndex;
      const count = isPark ? 14 : rng.int(0, 2);
      for (let i = 0; i < count; i += 1) {
        const range = isPark ? 14 : 16;
        treeSpots.push({
          x: WORLD.blocks[bx] + rng.range(-range, range),
          z: WORLD.blocks[bz] + rng.range(-range, range),
          s: rng.range(0.8, 1.4),
        });
      }
    }
  }
  // A row of palms along the beach boardwalk.
  for (let z = -150; z <= 150; z += 18) {
    treeSpots.push({ x: 152 + rng.range(-1, 1), z: z + rng.range(-2, 2), s: rng.range(1.1, 1.5) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const leafGeo = new THREE.IcosahedronGeometry(1.7, 0);
  leafGeo.translate(0, 3.2, 0);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeSpots.length);
  treeSpots.forEach((spot, i) => {
    matrix.makeScale(spot.s, spot.s, spot.s);
    matrix.setPosition(spot.x, 0.3, spot.z);
    trunks.setMatrixAt(i, matrix);
    leaves.setMatrixAt(i, matrix);
  });
  trunks.castShadow = true;
  leaves.castShadow = true;
  group.add(trunks);
  group.add(leaves);

  // Street lamps along every street, on both sides.
  const lampSpots = [];
  for (const s of WORLD.streets) {
    for (let v = -150; v <= 150; v += 30) {
      lampSpots.push({ x: s + 6.5, z: v });
      lampSpots.push({ x: v, z: s + 6.5 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
  poleGeo.translate(0, 3, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  bulbGeo.translate(0, 6.1, 0);
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff2b8, emissive: 0x554411 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  lampSpots.forEach((spot, i) => {
    matrix.makeTranslation(spot.x, 0.3, spot.z);
    poles.setMatrixAt(i, matrix);
    bulbs.setMatrixAt(i, matrix);
  });
  group.add(poles);
  group.add(bulbs);

  // Park fountain: a round basin with a jet of pale blue.
  const parkX = WORLD.blocks[parkIndex];
  const parkZ = WORLD.blocks[parkIndex];
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.5, 0.8, 24),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }),
  );
  basin.position.set(parkX, 0.7, parkZ);
  basin.castShadow = true;
  group.add(basin);
  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(5.4, 5.4, 0.3, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  pond.position.set(parkX, 0.95, parkZ);
  group.add(pond);
  colliders.push({ minX: parkX - 6, maxX: parkX + 6, minZ: parkZ - 6, maxZ: parkZ + 6 });

  // Beach and water on the east edge.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(20, span),
    new THREE.MeshLambertMaterial({ color: PALETTE.beach }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(WORLD.beachStart + 8, 0.03, 0);
  beach.receiveShadow = true;
  group.add(beach);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, span + 200),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.waterStart + 55, 0.01, 0);
  group.add(water);

  // A pier jutting into the water, with a little ferris wheel silhouette at its end.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x9a7a54 }),
  );
  pier.position.set(WORLD.waterStart + 10, 0.4, -46);
  pier.castShadow = true;
  group.add(pier);
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(7, 0.35, 8, 24),
    new THREE.MeshLambertMaterial({ color: 0xe86a92 }),
  );
  wheel.add(rim);
  for (let i = 0; i < 6; i += 1) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 13.4, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xe86a92 }),
    );
    spoke.rotation.z = (i * Math.PI) / 6;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xf2c94c }),
  );
  wheel.add(hub);
  wheel.position.set(WORLD.waterStart + 20, 9.5, -46);
  group.add(wheel);

  // A few benches and planters near the park paths, for street-level detail.
  const benchGeo = new THREE.BoxGeometry(2.2, 0.5, 0.6);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  for (let i = 0; i < 8; i += 1) {
    const bench = new THREE.Mesh(benchGeo, benchMat);
    const angle = (i / 8) * Math.PI * 2;
    bench.position.set(parkX + Math.cos(angle) * 10, 0.6, parkZ + Math.sin(angle) * 10);
    bench.rotation.y = -angle;
    bench.castShadow = true;
    group.add(bench);
  }

  return { group, colliders, wheel, water };
}
