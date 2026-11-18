// Cheap particles: one THREE.Points pool for sparks, smoke, muzzle flashes and the
// mission beacon's shimmer. No per-particle meshes, no allocation after boot.
const MAX_PARTICLES = 400;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.32,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // Park every particle far underground until it is used.
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.positions[i * 3 + 1] = -100;
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx;
    this.velocities[i * 3 + 1] = vy;
    this.velocities[i * 3 + 2] = vz;
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  burst(x, y, z, count, speed, life, r, g, b) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(
        x, y, z,
        Math.cos(angle) * s, up * s * 0.7, Math.sin(angle) * s,
        life * (0.6 + Math.random() * 0.8), r, g, b,
      );
    }
  }

  sparks(x, y, z) {
    this.burst(x, y, z, 14, 6, 0.5, 1.0, 0.8, 0.25);
  }

  smoke(x, y, z) {
    this.burst(x, y, z, 3, 1.2, 1.4, 0.25, 0.25, 0.25);
  }

  muzzle(x, y, z, dirX, dirZ) {
    this.burst(x, y, z, 5, 3, 0.12, 1.0, 0.9, 0.4);
    this.spawn(x + dirX, y, z + dirZ, dirX * 8, 0.5, dirZ * 8, 0.15, 1.0, 0.7, 0.2);
  }

  blood(x, y, z) {
    this.burst(x, y, z, 8, 3, 0.5, 0.7, 0.1, 0.1);
  }

  confetti(x, y, z) {
    this.burst(x, y, z, 30, 7, 1.2, 1.0, 0.85, 0.2);
    this.burst(x, y, z, 20, 6, 1.2, 0.3, 0.8, 1.0);
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      this.velocities[i * 3 + 1] -= 6 * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.05) this.positions[i * 3 + 1] = 0.05;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

/** The mission beacon: a glowing pillar of light plus a pulsing ground ring. */
export class Beacon {
  constructor(scene) {
    this.group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf2c94c, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 30, 12, 1, true), beamMat);
    this.beam.position.y = 15;
    this.group.add(this.beam);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf2c94c, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.group.add(this.ring);
    const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), diamondMat);
    this.diamond.position.y = 5;
    this.group.add(this.diamond);
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;
  }

  show(x, z) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 3) * 0.12;
    this.ring.scale.set(pulse, pulse, 1);
    this.diamond.position.y = 5 + Math.sin(this.time * 2) * 0.6;
    this.diamond.rotation.y += dt * 2;
    this.beam.material.opacity = 0.3 + Math.sin(this.time * 3) * 0.08;
  }
}
