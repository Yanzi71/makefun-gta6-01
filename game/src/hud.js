// The HUD: wanted stars, health, money, speed, objective line, toast banners, and a
// live canvas minimap (roads, player arrow, mission blip, police blips). All DOM except
// the minimap, which is 2D canvas redrawn every frame.
import { WORLD } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      stars: document.getElementById('stars'),
      money: document.getElementById('money'),
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      speed: document.getElementById('speed'),
      speedValue: document.getElementById('speed-value'),
      objective: document.getElementById('objective'),
      toast: document.getElementById('toast'),
      toastTitle: document.getElementById('toast-title'),
      toastBody: document.getElementById('toast-body'),
      help: document.getElementById('help'),
      crosshair: document.getElementById('crosshair'),
      interact: document.getElementById('interact'),
      wantedFlash: document.getElementById('wanted-flash'),
    };
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastMoney = -1;
    this.lastHealth = -1;
    this.lastObjective = '';
  }

  show() {
    this.el.hud.classList.remove('hidden');
  }

  hide() {
    this.el.hud.classList.add('hidden');
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    let stars = '';
    for (let i = 0; i < 5; i += 1) {
      stars += `<span class="star ${i < n ? 'lit' : ''}">★</span>`;
    }
    this.el.stars.innerHTML = stars;
    this.el.stars.classList.toggle('hot', n > 0);
  }

  setMoney(n) {
    if (n === this.lastMoney) return;
    this.lastMoney = n;
    this.el.money.textContent = `$${n.toLocaleString('en-US')}`;
  }

  setHealth(n) {
    const rounded = Math.ceil(n);
    if (rounded === this.lastHealth) return;
    this.lastHealth = rounded;
    this.el.healthFill.style.width = `${Math.max(0, Math.min(100, n))}%`;
    this.el.healthFill.classList.toggle('low', n < 30);
    this.el.healthText.textContent = `${rounded}`;
  }

  setSpeed(kph, driving) {
    this.el.speed.classList.toggle('hidden', !driving);
    if (driving) this.el.speedValue.textContent = String(Math.round(kph));
  }

  setObjective(text) {
    if (text === this.lastObjective) return;
    this.lastObjective = text;
    this.el.objective.textContent = text;
  }

  setCrosshair(visible) {
    this.el.crosshair.classList.toggle('hidden', !visible);
  }

  setInteract(text) {
    this.el.interact.textContent = text || '';
    this.el.interact.classList.toggle('hidden', !text);
  }

  setHelpVisible(visible) {
    this.el.help.classList.toggle('hidden', !visible);
  }

  toast(title, body, seconds) {
    this.el.toastTitle.textContent = title;
    this.el.toastBody.textContent = body || '';
    this.el.toast.classList.remove('hidden');
    this.el.toast.classList.remove('show');
    // Restart the CSS animation.
    void this.el.toast.offsetWidth;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds || 4;
  }

  hideToast() {
    this.el.toast.classList.add('hidden');
    this.toastTimer = 0;
  }

  /** A red vignette pulse when the player takes damage. */
  damageFlash() {
    this.el.wantedFlash.classList.remove('flash');
    void this.el.wantedFlash.offsetWidth;
    this.el.wantedFlash.classList.add('flash');
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
  }

  /**
   * Draw the minimap: the street grid, the park, the water, the player arrow, the
   * mission blip and police blips. `view` is { playerX, playerZ, heading, marker,
   * police: [{x, z}], targetCar }.
   */
  drawMinimap(view) {
    const ctx = this.mapCtx;
    const size = this.minimap.width;
    const half = WORLD.half;
    const scale = size / (half * 2);
    const toMapX = (x) => (x + half) * scale;
    const toMapZ = (z) => (z + half) * scale;

    ctx.fillStyle = '#2a3325';
    ctx.fillRect(0, 0, size, size);
    // Water on the east edge.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(toMapX(WORLD.waterStart), 0, size - toMapX(WORLD.waterStart), size);
    // Park.
    const park = WORLD.blocks[WORLD.parkBlock];
    ctx.fillStyle = '#5d8a4a';
    const parkSize = WORLD.blockSize * scale;
    ctx.fillRect(toMapX(park - WORLD.blockSize / 2), toMapZ(park - WORLD.blockSize / 2), parkSize, parkSize);
    // Roads.
    ctx.strokeStyle = '#565d63';
    ctx.lineWidth = Math.max(2, WORLD.roadWidth * scale);
    ctx.lineCap = 'square';
    for (const s of WORLD.streets) {
      ctx.beginPath();
      ctx.moveTo(0, toMapZ(s));
      ctx.lineTo(size, toMapZ(s));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toMapX(s), 0);
      ctx.lineTo(toMapX(s), size);
      ctx.stroke();
    }
    // Mission marker: a pulsing yellow diamond.
    if (view.marker) {
      const mx = toMapX(view.marker.x);
      const mz = toMapZ(view.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Police blips: red and blue dots.
    for (const unit of view.police || []) {
      ctx.fillStyle = unit.car ? '#ff4444' : '#4488ff';
      ctx.beginPath();
      ctx.arc(toMapX(unit.x), toMapZ(unit.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow: a white triangle pointing along the heading.
    const px = toMapX(view.playerX);
    const pz = toMapZ(view.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(view.heading), Math.cos(view.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
