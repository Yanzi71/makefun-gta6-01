// Cars: a box-built body with a cabin and turning wheels, arcade driving physics, lane
// traffic that wanders the grid, and police cars that chase the player. Any car is stealable.
import { CAR, POLICE, TRAFFIC, WORLD } from './config.js';
import { collideCircle, nearestStreet } from './city.js';

const CAR_COLORS = [
  0xc23b2e, 0x2e6ac2, 0xe8e8e8, 0x22262c, 0xe8a13a,
  0x3a9a5a, 0x7a4ac2, 0xd8d8d8, 0x38b8b8, 0xb8b83a,
];

const BODY_GEO = new THREE.BoxGeometry(1.9, 0.62, 4.3);
const CABIN_GEO = new THREE.BoxGeometry(1.7, 0.55, 2.2);
const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
const LIGHTBAR_GEO = new THREE.BoxGeometry(1.5, 0.22, 0.5);
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
const TIRE_MAT = new THREE.MeshLambertMaterial({ color: 0x14161a });
const CHROME_MAT = new THREE.MeshLambertMaterial({ color: 0xd8dde2 });

/** Build a car's meshes. Returns { group, wheels, bodyMat, lights } (lights only for police). */
export function makeCarMesh(color, options) {
  const opts = options || {};
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(CABIN_GEO, opts.police ? bodyMat : GLASS_MAT);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  // Bumpers and headlights for a finished look.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 0.25), CHROME_MAT);
  bumperF.position.set(0, 0.35, 2.18);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.18;
  group.add(bumperR);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x555522 });
  for (const side of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    head.position.set(side, 0.6, 2.16);
    group.add(head);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(WHEEL_GEO, TIRE_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  let lights = null;
  if (opts.police) {
    lights = new THREE.Group();
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x0022aa });
    const red = new THREE.Mesh(LIGHTBAR_GEO, redMat);
    red.scale.x = 0.5;
    red.position.x = -0.38;
    const blue = new THREE.Mesh(LIGHTBAR_GEO, blueMat);
    blue.scale.x = 0.5;
    blue.position.x = 0.38;
    lights.add(red);
    lights.add(blue);
    lights.position.y = 1.5;
    group.add(lights);
    lights.userData.redMat = redMat;
    lights.userData.blueMat = blueMat;
  }
  return { group, wheels, bodyMat, lights };
}

/** One car in the world: physics state plus its meshes. */
export class Car {
  constructor(scene, x, z, heading, color, options) {
    const opts = options || {};
    const built = makeCarMesh(color, opts);
    this.group = built.group;
    this.wheels = built.wheels;
    this.bodyMat = built.bodyMat;
    this.lights = built.lights;
    this.police = !!opts.police;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.health = CAR.maxHealth;
    this.dead = false;
    this.driver = opts.driver || null; // 'player' | 'traffic' | 'police' | null (parked)
    this.steerVisual = 0;
    this.smokeTimer = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.group.userData.carRef = this;
    scene.add(this.group);
  }

  get position() {
    return this.group.position;
  }

  /** Arcade step: throttle -1..1, steer -1..1, handbrake bool. Collides with buildings. */
  drive(dt, throttle, steer, handbrake, colliders) {
    if (this.dead) {
      this.speed = 0;
      return;
    }
    const maxSpeed = this.police ? POLICE.chaseSpeed : CAR.maxSpeed;
    if (throttle > 0) this.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += CAR.brake * throttle * dt;
      else this.speed = Math.max(-CAR.reverseMax, this.speed + CAR.accel * 0.6 * throttle * dt);
    }
    this.speed -= this.speed * CAR.drag * dt;
    if (handbrake) this.speed -= this.speed * CAR.handbrakeDrag * dt;
    this.speed = Math.max(-CAR.reverseMax, Math.min(maxSpeed, this.speed));
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;

    const speedFactor = 1 - Math.min(0.75, Math.abs(this.speed) / maxSpeed) * CAR.turnFalloff;
    const turn = steer * CAR.turnRate * speedFactor * (this.speed >= 0 ? 1 : -1);
    this.heading += turn * dt * Math.min(1, Math.abs(this.speed) / 3 + 0.15);
    this.steerVisual += ((steer * 0.45) - this.steerVisual) * Math.min(1, dt * 8);

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    let nx = this.x + forwardX * this.speed * dt;
    let nz = this.z + forwardZ * this.speed * dt;
    const before = { x: nx, z: nz };
    const fixed = collideCircle(colliders, nx, nz, CAR.radius);
    nx = fixed.x;
    nz = fixed.z;
    // A building hit kills speed and dents the car.
    const hit = Math.abs(before.x - nx) > 0.001 || Math.abs(before.z - nz) > 0.001;
    if (hit) {
      const impact = Math.abs(this.speed);
      if (impact > 6) {
        this.damage(impact * CAR.crashDamage * 0.4);
        this.onCrash = Math.min(1, impact / 30);
      }
      this.speed *= -0.18;
    } else {
      this.onCrash = 0;
    }
    this.x = Math.max(-WORLD.half, Math.min(WORLD.half, nx));
    this.z = Math.max(-WORLD.half, Math.min(WORLD.half, nz));
    this.syncMesh(dt);
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.speed = 0;
    }
  }

  syncMesh(dt) {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (let i = 0; i < this.wheels.length; i += 1) {
      this.wheels[i].rotation.x += spin;
    }
    // Front wheels yaw with the steering.
    if (this.wheels.length >= 2) {
      this.wheels[0].rotation.y = this.steerVisual;
      this.wheels[1].rotation.y = this.steerVisual;
    }
    if (this.lights) {
      const flash = Math.floor(performance.now() / 180) % 2 === 0;
      this.lights.userData.redMat.emissiveIntensity = flash ? 1.6 : 0.2;
      this.lights.userData.blueMat.emissiveIntensity = flash ? 0.2 : 1.6;
    }
  }

  remove(scene) {
    scene.remove(this.group);
  }
}

/** Wrap an angle to [-PI, PI]. */
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Traffic: cars that follow the street grid, turning at intersections at random. */
export class Traffic {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) this.spawnCar(true);
  }

  spawnCar(anywhere) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const street = rng.pick(WORLD.streets);
    const dir = rng.sign();
    const lane = dir > 0 ? -3 : 3;
    const along = rng.range(-150, 150);
    const x = vertical ? street + lane : along;
    const z = vertical ? along : street + lane;
    const heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(this.scene, x, z, heading, rng.pick(CAR_COLORS), { driver: 'traffic' });
    car.traffic = {
      vertical, street, dir,
      speed: rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax),
      nextDecision: 0,
    };
    car.speed = car.traffic.speed;
    this.cars.push(car);
    return car;
  }

  /** A traffic car that is far from the player is recycled to a fresh spot. */
  recycle(playerX, playerZ) {
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i];
      const dx = car.x - playerX;
      const dz = car.z - playerZ;
      if (dx * dx + dz * dz > 220 * 220) {
        car.remove(this.scene);
        this.cars.splice(i, 1);
        this.spawnCar(true);
      }
    }
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      if (car.dead) continue;
      const t = car.traffic;
      const along = t.vertical ? car.z : car.x;
      // At an intersection, maybe turn onto the cross street.
      const cross = nearestStreet(along);
      const nearCross = Math.abs(along - cross) < 1.2;
      if (nearCross && t.nextDecision <= 0) {
        t.nextDecision = 2;
        if (this.rng.chance(TRAFFIC.turnChance)) {
          const turnDir = this.rng.sign();
          if (t.vertical) {
            car.z = cross + (turnDir > 0 ? 3 : -3);
            t.vertical = false;
            t.street = cross;
            t.dir = turnDir;
            car.heading = turnDir > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            car.x = cross + (turnDir > 0 ? -3 : 3);
            t.vertical = true;
            t.street = cross;
            t.dir = turnDir;
            car.heading = turnDir > 0 ? 0 : Math.PI;
          }
        }
      }
      t.nextDecision -= dt;
      // Slow down for a car ahead (including the player's).
      let targetSpeed = t.speed;
      const ahead = this.carAhead(car, playerCar);
      if (ahead !== null && ahead < 9) targetSpeed = 0;
      else if (ahead !== null && ahead < 16) targetSpeed = t.speed * 0.4;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
      const forwardX = Math.sin(car.heading);
      const forwardZ = Math.cos(car.heading);
      car.x += forwardX * car.speed * dt;
      car.z += forwardZ * car.speed * dt;
      // Keep on the road: gently pull back to the lane line.
      const lane = t.dir > 0 ? -3 : 3;
      if (t.vertical) car.x += (t.street + lane - car.x) * Math.min(1, dt * 2);
      else car.z += (t.street + lane - car.z) * Math.min(1, dt * 2);
      car.x = Math.max(-WORLD.half, Math.min(WORLD.half, car.x));
      car.z = Math.max(-WORLD.half, Math.min(WORLD.half, car.z));
      // Wrap around the far edge so the streets never empty out.
      if (t.vertical && Math.abs(car.z) > 160) car.z = -Math.sign(car.z) * 160;
      if (!t.vertical && Math.abs(car.x) > 160) car.x = -Math.sign(car.x) * 160;
      car.syncMesh(dt);
    }
  }

  /** Distance to the nearest car ahead of `car`, or null. */
  carAhead(car, playerCar) {
    let best = null;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const check = (other) => {
      if (other === car || other.dead) return;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const forward = dx * fx + dz * fz;
      if (forward < 0 || forward > 20) return;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > 2.6) return;
      if (best === null || forward < best) best = forward;
    };
    for (const other of this.cars) check(other);
    if (playerCar) check(playerCar);
    return best;
  }

  /** All cars (traffic + parked) that the player could steal. */
  allCars() {
    return this.cars;
  }
}

/** Parked cars the player can steal: placed along the roads, engines off. */
export function spawnParkedCars(scene, rng, count) {
  const parked = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const street = rng.pick(WORLD.streets);
    const side = rng.sign();
    const along = rng.range(-140, 140);
    const x = vertical ? street + side * 4.6 : along;
    const z = vertical ? along : street + side * 4.6;
    const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(scene, x, z, heading, rng.pick(CAR_COLORS), { driver: null });
    parked.push(car);
  }
  return parked;
}

/** Police pursuit driving: steer toward the target, ram on contact. */
export function policeDrive(car, dt, targetX, targetZ, colliders) {
  if (car.dead) return;
  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const wantedHeading = Math.atan2(dx, dz);
  const diff = wrapAngle(wantedHeading - car.heading);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  // Full throttle until close, then match speed to stay on the player's bumper.
  const throttle = dist > 8 ? 1 : 0.45;
  car.drive(dt, throttle, steer, false, colliders);
  // Unstick: if barely moving while pushing a wall, reverse briefly.
  if (Math.abs(car.speed) < 0.6 && dist > 6) {
    car.stuckTimer = (car.stuckTimer || 0) + dt;
    if (car.stuckTimer > 1.2) {
      car.drive(dt, -1, -steer, false, colliders);
      if (car.stuckTimer > 1.9) car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
}
