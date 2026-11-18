// The player: Dario, an ex-getaway driver. On foot he runs, jumps and fights; in a car he
// drives with arcade physics. The camera is a third-person follow camera that orbits with
// the mouse on foot and swings behind the car while driving.
import { CAR, PLAYER, WORLD } from './config.js';
import { collideCircle } from './city.js';
import { makePersonMesh } from './pedestrians.js';

export class Player {
  constructor(scene) {
    const built = makePersonMesh({
      shirt: 0xf2c94c, skin: 0xc89a6a, pants: 0x2a3a5a, hat: 0x22262c,
    });
    this.group = built.group;
    this.legs = built.legs;
    this.arms = built.arms;
    this.x = 0;
    this.z = 20;
    this.y = 0;
    this.vy = 0;
    this.heading = Math.PI;
    this.health = PLAYER.maxHealth;
    this.armed = false;
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.punchAnim = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.car = null;
    this.lastDamageTime = -100;
    this.elapsed = 0;
    /** Camera orbit angles. */
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.cameraPos = new THREE.Vector3(0, 6, 28);
    this.cameraLook = new THREE.Vector3(0, 1, 0);
    scene.add(this.group);
  }

  get onFoot() {
    return this.car === null;
  }

  get speed() {
    return this.car ? Math.abs(this.car.speed) : 0;
  }

  position() {
    if (this.car) return { x: this.car.x, z: this.car.z, y: 0 };
    return { x: this.x, z: this.z, y: this.y };
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    this.lastDamageTime = this.elapsed;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  /** Enter a car: the body hides, the car becomes the player's. */
  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    this.group.visible = false;
  }

  /** Step out beside the car. */
  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.driver = null;
    car.speed = 0;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.x = car.x + sideX * 2.6;
    this.z = car.z + sideZ * 2.6;
    this.y = 0;
    this.heading = car.heading;
    this.camYaw = car.heading;
    this.car = null;
    this.group.visible = true;
    this.group.position.set(this.x, 0, this.z);
  }

  /** On-foot movement from input, relative to the camera yaw. */
  moveOnFoot(dt, input, colliders) {
    const forward = input.forward();
    const strafe = input.strafe();
    const sprint = input.sprint();
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    // Camera-relative directions.
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    let mx = sin * forward + cos * strafe;
    let mz = cos * forward - sin * strafe;
    const len = Math.sqrt(mx * mx + mz * mz);
    this.moving = len > 0.01;
    if (this.moving) {
      mx /= len;
      mz /= len;
      this.heading = Math.atan2(mx, mz);
      let nx = this.x + mx * speed * dt;
      let nz = this.z + mz * speed * dt;
      const fixed = collideCircle(colliders, nx, nz, PLAYER.radius);
      nx = fixed.x;
      nz = fixed.z;
      this.x = Math.max(-WORLD.half, Math.min(WORLD.half, nx));
      this.z = Math.max(-WORLD.half, Math.min(WORLD.half, nz));
      this.walkPhase += dt * speed * 1.6;
    }
    // Jump and gravity (jump() is called by the main loop on a Space press).
    this.vy -= PLAYER.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    if (this.punchAnim > 0) {
      this.punchAnim -= dt;
      this.arms[0].rotation.x = -1.6 * Math.max(0, this.punchAnim) * 2;
      this.arms[1].rotation.x = 0;
    } else {
      this.arms[0].rotation.x = -swing * 0.7;
      this.arms[1].rotation.x = swing * 0.7;
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }

  jump() {
    if (this.y === 0 && this.onFoot) this.vy = PLAYER.jumpSpeed;
  }

  /** Drive the current car from input. Returns true if a crash happened this frame. */
  driveCar(dt, input, colliders) {
    if (!this.car) return false;
    const throttle = input.forward();
    const steer = input.strafe();
    const handbrake = input.handbrake();
    this.car.drive(dt, throttle, steer, handbrake, colliders);
    return (this.car.onCrash || 0) > 0;
  }

  /** Orbit the camera with the mouse; clamp the pitch so it never goes under the ground. */
  orbitCamera(dx, dy) {
    this.camYaw -= dx * 0.0028;
    this.camPitch = Math.max(-0.15, Math.min(1.1, this.camPitch + dy * 0.0022));
  }

  /** Position the camera for this frame: behind the player (or car), smoothed. */
  updateCamera(camera, dt, lookAtCar) {
    let targetX;
    let targetY;
    let targetZ;
    let lookX;
    let lookY;
    let lookZ;
    if (this.car) {
      // Behind the car, following its heading.
      const behind = this.car.heading + Math.PI;
      const dist = 10.5;
      const height = 4.6;
      targetX = this.car.x + Math.sin(behind) * dist;
      targetY = height;
      targetZ = this.car.z + Math.cos(behind) * dist;
      lookX = this.car.x + Math.sin(this.car.heading) * 6;
      lookY = 1.2;
      lookZ = this.car.z + Math.cos(this.car.heading) * 6;
    } else {
      const dist = 7.5;
      const height = 2.2 + Math.sin(this.camPitch) * 5;
      const flat = Math.cos(this.camPitch) * dist;
      targetX = this.x - Math.sin(this.camYaw) * flat;
      targetY = this.y + height;
      targetZ = this.z - Math.cos(this.camYaw) * flat;
      lookX = this.x;
      lookY = this.y + 1.5;
      lookZ = this.z;
    }
    // Keep the camera above the ground and inside the world.
    targetY = Math.max(1.2, targetY);
    targetX = Math.max(-WORLD.half - 6, Math.min(WORLD.half + 6, targetX));
    targetZ = Math.max(-WORLD.half - 6, Math.min(WORLD.half + 6, targetZ));
    const smooth = Math.min(1, dt * (this.car ? 5 : 10));
    this.cameraPos.x += (targetX - this.cameraPos.x) * smooth;
    this.cameraPos.y += (targetY - this.cameraPos.y) * smooth;
    this.cameraPos.z += (targetZ - this.cameraPos.z) * smooth;
    this.cameraLook.x += (lookX - this.cameraLook.x) * Math.min(1, dt * 12);
    this.cameraLook.y += (lookY - this.cameraLook.y) * Math.min(1, dt * 12);
    this.cameraLook.z += (lookZ - this.cameraLook.z) * Math.min(1, dt * 12);
    camera.position.copy(this.cameraPos);
    camera.lookAt(this.cameraLook);
  }

  /** Slowly regain health after a quiet spell. */
  update(dt) {
    this.elapsed += dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.elapsed - this.lastDamageTime > 10 && this.health > 0 && this.health < PLAYER.maxHealth) {
      this.heal(PLAYER.regenPerSecond * dt);
    }
    // A dead car strands the player: step out automatically.
    if (this.car && this.car.dead) this.exitCar();
  }

  reset(x, z) {
    if (this.car) {
      this.car.driver = null;
      this.car = null;
    }
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.health = PLAYER.maxHealth;
    this.armed = false;
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.cameraPos.set(x, 6, z + 10);
  }
}
