// Pedestrians: low-poly people strolling the sidewalks around a block. They flee from
// gunfire, crimes and speeding cars, and they fall (then get back up elsewhere) when hit.
// Cops reuse the same body with a navy uniform and a cap.
import { PEDS, WORLD } from './config.js';
import { collideCircle } from './city.js';

const SHIRT_COLORS = [
  0xe86a6a, 0x6a9ae8, 0x6ae88a, 0xe8d84a, 0xe89ad0,
  0x9a6ae8, 0x6ad8e8, 0xe8a05a, 0xd8d8d8, 0x5a8a6a,
];
const SKIN_COLORS = [0xf2c89a, 0xc89a6a, 0x8a5a3a, 0xe8b88a, 0x6a4530];
const PANTS_COLORS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x2a5a3a];

const TORSO_GEO = new THREE.BoxGeometry(0.62, 0.78, 0.36);
const HEAD_GEO = new THREE.SphereGeometry(0.26, 10, 8);
const LEG_GEO = new THREE.BoxGeometry(0.24, 0.8, 0.28);
const ARM_GEO = new THREE.BoxGeometry(0.18, 0.66, 0.22);
const CAP_GEO = new THREE.CylinderGeometry(0.28, 0.3, 0.14, 10);

export function makePersonMesh(options) {
  const opts = options || {};
  const shirt = opts.cop ? 0x1a2a5a : opts.shirt;
  const pants = opts.cop ? 0x141c30 : opts.pants;
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: opts.skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(TORSO_GEO, torsoMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(HEAD_GEO, skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  if (opts.cop) {
    const cap = new THREE.Mesh(CAP_GEO, new THREE.MeshLambertMaterial({ color: 0x101830 }));
    cap.position.y = 1.98;
    group.add(cap);
  } else if (opts.hat) {
    const cap = new THREE.Mesh(CAP_GEO, new THREE.MeshLambertMaterial({ color: opts.hat }));
    cap.position.y = 1.98;
    group.add(cap);
  }
  const legs = [];
  for (const side of [-0.17, 0.17]) {
    const leg = new THREE.Mesh(LEG_GEO, pantsMat);
    leg.position.set(side, 0.4, 0);
    leg.geometry = LEG_GEO;
    // Pivot at the hip: shift the mesh up and rotate around the group origin of the leg.
    leg.position.y = 0.8;
    leg.translateY(-0.4);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const side of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(ARM_GEO, torsoMat);
    arm.position.set(side, 1.45, 0);
    arm.translateY(-0.28);
    group.add(arm);
    arms.push(arm);
  }
  return { group, legs, arms };
}

export class Pedestrian {
  constructor(scene, rng, cop) {
    this.rng = rng;
    this.cop = !!cop;
    const built = makePersonMesh({
      cop: this.cop,
      shirt: rng.pick(SHIRT_COLORS),
      skin: rng.pick(SKIN_COLORS),
      pants: rng.pick(PANTS_COLORS),
      hat: rng.chance(0.25) ? rng.pick(SHIRT_COLORS) : null,
    });
    this.group = built.group;
    this.group.userData.pedRef = this;
    this.legs = built.legs;
    this.arms = built.arms;
    this.health = 100;
    this.down = false;
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.fleeX = 0;
    this.fleeZ = 0;
    this.walkPhase = rng.range(0, Math.PI * 2);
    this.speed = rng.range(PEDS.walkMin, PEDS.walkMax);
    this.assignRoute(rng);
    scene.add(this.group);
  }

  /** Pick a block and walk its sidewalk perimeter. */
  assignRoute(rng) {
    const bx = rng.pick(WORLD.blocks);
    const bz = rng.pick(WORLD.blocks);
    const half = WORLD.blockSize / 2 + 2.5;
    const corners = [
      [bx - half, bz - half], [bx + half, bz - half],
      [bx + half, bz + half], [bx - half, bz + half],
    ];
    this.route = rng.chance(0.5) ? corners : corners.reverse();
    this.corner = rng.int(0, 3);
    const start = this.route[this.corner];
    this.x = start[0];
    this.z = start[1];
    this.heading = 0;
    this.group.position.set(this.x, 0.3, this.z);
  }

  /** Run away from (x, z) for a few seconds. */
  fleeFrom(x, z) {
    if (this.down) return;
    this.fleeTimer = 3 + this.rng.range(0, 2);
    this.fleeX = x;
    this.fleeZ = z;
  }

  hit(damage, fromX, fromZ) {
    if (this.down) return;
    this.health -= damage;
    if (this.health <= 0) {
      this.down = true;
      this.downTimer = 5;
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.6;
    } else {
      this.fleeFrom(fromX, fromZ);
    }
  }

  update(dt, colliders) {
    if (this.down) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // Get back up somewhere fresh, good as new.
        this.down = false;
        this.health = 100;
        this.group.rotation.x = 0;
        this.group.position.y = 0;
        this.assignRoute(this.rng);
      }
      return;
    }
    let targetX;
    let targetZ;
    let speed = this.speed;
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      const dx = this.x - this.fleeX;
      const dz = this.z - this.fleeZ;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      targetX = this.x + (dx / dist) * 10;
      targetZ = this.z + (dz / dist) * 10;
      speed = PEDS.fleeSpeed;
    } else {
      const corner = this.route[this.corner];
      targetX = corner[0];
      targetZ = corner[1];
      const dx = targetX - this.x;
      const dz = targetZ - this.z;
      if (dx * dx + dz * dz < 1.5) {
        this.corner = (this.corner + 1) % this.route.length;
      }
    }
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    this.heading = Math.atan2(dx, dz);
    let nx = this.x + (dx / dist) * speed * dt;
    let nz = this.z + (dz / dist) * speed * dt;
    const fixed = collideCircle(colliders, nx, nz, 0.5);
    nx = fixed.x;
    nz = fixed.z;
    this.x = Math.max(-WORLD.half, Math.min(WORLD.half, nx));
    this.z = Math.max(-WORLD.half, Math.min(WORLD.half, nz));
    this.walkPhase += dt * speed * 2.4;
    const swing = Math.sin(this.walkPhase) * 0.55;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.7;
    this.arms[1].rotation.x = swing * 0.7;
    this.group.position.set(this.x, 0.3, this.z);
    this.group.rotation.y = this.heading;
  }

  remove(scene) {
    scene.remove(this.group);
  }
}

export class Crowd {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) {
      this.peds.push(new Pedestrian(scene, rng, false));
    }
  }

  update(dt, colliders) {
    for (const ped of this.peds) ped.update(dt, colliders);
  }

  /** Everyone within radius of a scare flees from it. */
  scare(x, z, radius) {
    for (const ped of this.peds) {
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz < radius * radius) ped.fleeFrom(x, z);
    }
  }

  /** The nearest upright pedestrian to a point, within range, or null. */
  nearest(x, z, range) {
    let best = null;
    let bestDist = range;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = ped;
      }
    }
    return best;
  }

  /** Any pedestrian close enough to witness a crime? */
  witnessNear(x, z, range) {
    for (const ped of this.peds) {
      if (ped.down) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz < range * range) return true;
    }
    return false;
  }
}
