// The wanted system: 1-5 stars, police cars that chase and ram, on-foot cops at high
// heat, heat decay when the player hides, and the busted/wasted outcomes. Crimes report
// in through commitCrime(); the rest runs itself.
import { POLICE, WORLD } from './config.js';
import { Car, policeDrive } from './vehicles.js';
import { Pedestrian } from './pedestrians.js';
import { collideCircle } from './city.js';

export const OUTCOME_NONE = 0;
export const OUTCOME_BUSTED = 1;
export const OUTCOME_WASTED = 2;

export class Wanted {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.stars = 0;
    this.heatTimer = 0;
    this.calmTimer = 0;
    this.bustTimer = 0;
    this.cars = [];
    this.cops = [];
    this.onStarsChanged = null;
  }

  /** A crime was committed: raise the wanted level and refresh the heat. */
  commitCrime(stars, x, z) {
    const before = this.stars;
    this.stars = Math.min(5, Math.max(this.stars, stars));
    this.heatTimer = POLICE.heatSeconds;
    this.calmTimer = 0;
    if (this.stars !== before && this.onStarsChanged) this.onStarsChanged(this.stars);
    void x;
    void z;
  }

  addStar() {
    this.commitCrime(this.stars + 1);
  }

  clear() {
    this.stars = 0;
    this.heatTimer = 0;
    this.calmTimer = 0;
    this.bustTimer = 0;
    this.removeAll();
    if (this.onStarsChanged) this.onStarsChanged(0);
  }

  removeAll() {
    for (const car of this.cars) car.remove(this.scene);
    for (const cop of this.cops) cop.remove(this.scene);
    this.cars = [];
    this.cops = [];
  }

  /** How many police cars the current wanted level calls for. */
  wantedCarCount() {
    return this.stars === 0 ? 0 : Math.min(4, this.stars);
  }

  /** How many on-foot cops the current wanted level calls for. */
  wantedCopCount() {
    if (this.stars < POLICE.footCopsAtStars) return 0;
    return Math.min(3, this.stars - 2);
  }

  spawnCarNear(playerX, playerZ) {
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = POLICE.spawnDistance + this.rng.range(0, 20);
    const x = Math.max(-WORLD.half, Math.min(WORLD.half, playerX + Math.cos(angle) * dist));
    const z = Math.max(-WORLD.half, Math.min(WORLD.half, playerZ + Math.sin(angle) * dist));
    const car = new Car(this.scene, x, z, Math.atan2(playerX - x, playerZ - z), 0xf2f2f2, {
      driver: 'police', police: true,
    });
    // A black hood and doors read as a patrol car at a glance.
    car.bodyMat.color.setHex(0x14181e);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.12, 2.1),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    roof.position.set(0, 1.42, -0.2);
    car.group.add(roof);
    this.cars.push(car);
    return car;
  }

  spawnCopNear(playerX, playerZ) {
    const cop = new Pedestrian(this.scene, this.rng, true);
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = 18 + this.rng.range(0, 14);
    cop.x = Math.max(-WORLD.half, Math.min(WORLD.half, playerX + Math.cos(angle) * dist));
    cop.z = Math.max(-WORLD.half, Math.min(WORLD.half, playerZ + Math.sin(angle) * dist));
    cop.group.position.set(cop.x, 0.3, cop.z);
    cop.shootTimer = 1 + this.rng.range(0, 1);
    this.cops.push(cop);
    return cop;
  }

  /**
   * One step. Returns OUTCOME_BUSTED / OUTCOME_WASTED when the chase ends that way.
   * `world` carries the player, colliders, effects and a damage callback.
   */
  update(dt, world) {
    const player = world.player;
    const pos = player.position();
    if (this.stars === 0) {
      if (this.cars.length || this.cops.length) this.removeAll();
      return OUTCOME_NONE;
    }

    // Heat: fresh crimes and nearby police keep the chase hot; calm decays the stars.
    const nearestPolice = this.nearestPoliceDistance(pos.x, pos.z);
    if (this.heatTimer > 0) this.heatTimer -= dt;
    if (nearestPolice < 45 || this.heatTimer > 0) {
      this.calmTimer = 0;
    } else {
      this.calmTimer += dt;
      if (this.calmTimer >= POLICE.decaySeconds) {
        this.calmTimer = 0;
        this.stars -= 1;
        if (this.onStarsChanged) this.onStarsChanged(this.stars);
        if (this.stars === 0) {
          this.removeAll();
          return OUTCOME_NONE;
        }
      }
    }

    // Keep the right number of units on the street.
    while (this.cars.length < this.wantedCarCount()) this.spawnCarNear(pos.x, pos.z);
    while (this.cars.length > this.wantedCarCount()) {
      this.cars.pop().remove(this.scene);
    }
    while (this.cops.length < this.wantedCopCount()) this.spawnCopNear(pos.x, pos.z);
    while (this.cops.length > this.wantedCopCount()) {
      this.cops.pop().remove(this.scene);
    }

    // Police cars chase and ram.
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i];
      if (car.dead) {
        car.smokeTimer += dt;
        if (car.smokeTimer > 0.15) {
          car.smokeTimer = 0;
          world.effects.smoke(car.x, 1.2, car.z);
        }
        continue;
      }
      policeDrive(car, dt, pos.x, pos.z, world.colliders);
      // Ramming the player's car dents it and shakes the player.
      if (player.car) {
        const dx = car.x - player.car.x;
        const dz = car.z - player.car.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3.6) {
          const push = (3.6 - dist) * 0.5;
          const nx = dist > 0.01 ? dx / dist : 1;
          const nz = dist > 0.01 ? dz / dist : 0;
          player.car.x -= nx * push;
          player.car.z -= nz * push;
          car.x += nx * push * 0.5;
          car.z += nz * push * 0.5;
          const impact = Math.abs(car.speed - player.car.speed);
          if (impact > 5) {
            player.car.damage(impact * 0.35);
            world.effects.sparks(player.car.x, 0.8, player.car.z);
            if (world.onCrash) world.onCrash(impact);
          }
          car.speed *= 0.6;
        }
      }
      // A wrecked police car is hauled away after a while.
      if (car.health <= 0) {
        car.dead = true;
      }
    }

    // On-foot cops run the player down and, at close range, try to bust or shoot.
    let copAdjacent = false;
    for (const cop of this.cops) {
      if (cop.down) continue;
      const dx = pos.x - cop.x;
      const dz = pos.z - cop.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      cop.heading = Math.atan2(dx, dz);
      const speed = 6.5;
      let nx = cop.x + (dx / (dist || 1)) * speed * dt;
      let nz = cop.z + (dz / (dist || 1)) * speed * dt;
      const fixed = collideCircle(world.colliders, nx, nz, 0.5);
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(cop.walkPhase) * 0.6;
      cop.legs[0].rotation.x = swing;
      cop.legs[1].rotation.x = -swing;
      cop.group.position.set(cop.x, 0.3, cop.z);
      cop.group.rotation.y = cop.heading;
      if (dist < POLICE.bustRange + 2) copAdjacent = true;
      // Cops shoot at a fleeing armed player; they try to bust a slow one.
      if (player.onFoot && dist < 25 && dist > POLICE.bustRange) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = 1.4 + this.rng.range(0, 0.8);
          if (this.rng.chance(0.55)) {
            player.hurt(6);
            world.effects.muzzle(cop.x, 1.4, cop.z, dx / (dist || 1), dz / (dist || 1));
            if (world.onShotAt) world.onShotAt();
          }
        }
      }
    }

    // Busted: on foot, slow, and a cop standing next to you for a few seconds.
    const playerSpeed = player.onFoot ? 0 : Math.abs(player.car.speed);
    if (player.onFoot && copAdjacent && playerSpeed < 2) {
      this.bustTimer += dt;
      if (this.bustTimer >= POLICE.bustSeconds) return OUTCOME_BUSTED;
    } else if (player.onFoot && this.nearestPoliceDistance(pos.x, pos.z) < 4 && playerSpeed < 2) {
      this.bustTimer += dt;
      if (this.bustTimer >= POLICE.bustSeconds) return OUTCOME_BUSTED;
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }

    if (player.health <= 0) return OUTCOME_WASTED;
    return OUTCOME_NONE;
  }

  nearestPoliceDistance(x, z) {
    let best = Infinity;
    for (const car of this.cars) {
      if (car.dead) continue;
      const dx = car.x - x;
      const dz = car.z - z;
      best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
    }
    for (const cop of this.cops) {
      if (cop.down) continue;
      const dx = cop.x - x;
      const dz = cop.z - z;
      best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
    }
    return best;
  }

  /** Every police unit, for the minimap. */
  units() {
    const out = [];
    for (const car of this.cars) if (!car.dead) out.push({ x: car.x, z: car.z, car: true });
    for (const cop of this.cops) if (!cop.down) out.push({ x: cop.x, z: cop.z, car: false });
    return out;
  }
}
