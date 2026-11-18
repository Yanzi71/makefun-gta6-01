// SOLMAR — Streets of the Sun. Boot, the one game loop, screens, combat and wiring.
// The world is built from a seed (?seed=N, default random); ?shot=start|drive|chase|mission
// stages a deterministic screenshot scene instead of the title screen.
import { RNG } from './rng.js';
import { CAR, MONEY, PALETTE, PLAYER, WORLD } from './config.js';
import { buildCity } from './city.js';
import { Car, Traffic, spawnParkedCars } from './vehicles.js';
import { Crowd } from './pedestrians.js';
import { Player } from './player.js';
import { OUTCOME_BUSTED, OUTCOME_WASTED, Wanted } from './police.js';
import { MISSIONS, MissionRunner, PLACES, STORY_INTRO } from './missions.js';
import { HUD } from './hud.js';
import { Beacon, Effects } from './effects.js';
import { SoundFX } from './audio.js';
import { clearSave, defaultSave, loadSave, writeSave } from './save.js';
import {
  ACTION_ENTER, ACTION_HELP, ACTION_JUMP, ACTION_MISSION, ACTION_MUTE,
  ACTION_PAUSE, ACTION_TOGGLE_WEAPON, createInput,
} from './input.js';
import { autopilotInput, stageShot } from './shots.js';

/** Fixed simulation step: 60 updates a second whatever the display's rate. */
const STEP = 1 / 60;
/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

function buildWorld() {
  const rng = new RNG(seed);
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 130, 340);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 700);
  camera.position.set(0, 60, 130);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a9a7b, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const city = buildCity(scene, rng);
  const effects = new Effects(scene);
  const beacon = new Beacon(scene);
  const traffic = new Traffic(scene, city, rng);
  const parkedCars = spawnParkedCars(scene, rng, 10);
  const crowd = new Crowd(scene, rng);
  const player = new Player(scene);
  const wanted = new Wanted(scene, rng);
  const sound = new SoundFX();
  const hud = new HUD();
  const input = createInput(canvas);
  const save = loadSave() || defaultSave();

  const G = {
    rng, canvas, renderer, scene, camera, sun, city,
    effects, beacon, traffic, parkedCars, crowd, player, wanted,
    sound, hud, input, save, vehicleModule: { Car },
    targetCars: [],
    shotCars: [],
    money: save.money,
    bestWanted: save.bestWanted || 0,
    carsStolen: save.carsStolen || 0,
    screen: 'title',
    autopilot: 'none',
    elapsed: 0,
    lastHealth: PLAYER.maxHealth,
    titleAngle: 0.6,
  };
  G.missions = new MissionRunner(G);
  G.colliders = city.colliders;

  wanted.onStarsChanged = (stars) => {
    hud.setStars(stars);
    if (stars > G.bestWanted) {
      G.bestWanted = stars;
      persist(G);
    }
  };
  G.missions.onEvent = (type, data) => onMissionEvent(G, type, data);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return G;
}

/** Write the current progress to localStorage. */
function persist(G) {
  writeSave({
    money: G.money,
    completed: [...G.missions.completed],
    nextMission: G.missions.nextIndex,
    bestWanted: G.bestWanted,
    carsStolen: G.carsStolen,
    version: 1,
  });
}

/** Mission events become toasts, cash, confetti and saves. */
function onMissionEvent(G, type, data) {
  if (type === 'started') {
    G.hud.toast(data.mission.title, data.mission.briefing, 7);
    G.sound.pickup();
  } else if (type === 'step') {
    G.hud.toast('New objective', data.step.text, 3);
  } else if (type === 'passed') {
    G.money += data.reward;
    persist(G);
    const pos = G.player.position();
    G.effects.confetti(pos.x, 3, pos.z);
    G.sound.missionDone();
    const next = G.missions.nextMission;
    G.hud.toast(
      'MISSION PASSED',
      `+$${data.reward.toLocaleString('en-US')} — ${next ? `press M for the next job: ${next.title}` : 'the garage is yours. Story complete!'}`,
      6,
    );
    if (G.missions.allDone) {
      document.getElementById('story-complete').classList.remove('hidden');
    }
  } else if (type === 'failed') {
    G.hud.toast('MISSION FAILED', `${data.reason} Press M to retry.`, 5);
  }
}

/** All cars the player could get into right now. */
function enterableCars(G) {
  return [...G.parkedCars, ...G.traffic.cars, ...G.targetCars];
}

function nearestCar(G, x, z, range) {
  let best = null;
  let bestDist = range;
  for (const car of enterableCars(G)) {
    if (car.dead) continue;
    const dx = car.x - x;
    const dz = car.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

function stealCar(G, car) {
  // Take the car out of whatever system owned it.
  G.traffic.cars = G.traffic.cars.filter((c) => c !== car);
  G.parkedCars = G.parkedCars.filter((c) => c !== car);
  G.player.enterCar(car);
  G.carsStolen += 1;
  // Stealing in front of witnesses (or while already wanted) raises the heat.
  const pos = G.player.position();
  if (G.crowd.witnessNear(pos.x, pos.z, 30) || G.wanted.stars > 0) {
    G.wanted.addStar();
  }
  G.sound.pickup();
  persist(G);
}

/** Walk up the parent chain to find the car or pedestrian a raycast mesh belongs to. */
function findRef(object) {
  let node = object;
  while (node) {
    if (node.userData && node.userData.carRef) return { kind: 'car', ref: node.userData.carRef };
    if (node.userData && node.userData.pedRef) return { kind: 'ped', ref: node.userData.pedRef };
    node = node.parent;
  }
  return null;
}

const raycaster = new THREE.Raycaster();

/** Fire the pistol along the camera's centre line. */
function shoot(G) {
  const player = G.player;
  if (player.shootCooldown > 0) return;
  player.shootCooldown = PLAYER.pistolCooldown;
  G.sound.shot();
  raycaster.setFromCamera({ x: 0, y: 0 }, G.camera);
  raycaster.far = PLAYER.pistolRange;
  const targets = [G.city.group];
  for (const car of [...G.traffic.cars, ...G.parkedCars, ...G.targetCars, ...G.wanted.cars]) {
    targets.push(car.group);
  }
  for (const ped of G.crowd.peds) targets.push(ped.group);
  for (const cop of G.wanted.cops) targets.push(cop.group);
  const hits = raycaster.intersectObjects(targets, true);
  const pos = player.position();
  const dirX = Math.sin(player.heading);
  const dirZ = Math.cos(player.heading);
  G.effects.muzzle(pos.x + dirX, 1.4, pos.z + dirZ, dirX, dirZ);
  player.camPitch = Math.min(1.1, player.camPitch + 0.03);
  if (hits.length === 0) return;
  const hit = hits[0];
  const found = findRef(hit.object);
  if (found && found.kind === 'ped') {
    const ped = found.ref;
    ped.hit(PLAYER.pistolDamage, pos.x, pos.z);
    G.effects.blood(hit.point.x, hit.point.y, hit.point.z);
    G.crowd.scare(pos.x, pos.z, 30);
    if (ped.cop) G.wanted.addStar();
    else if (G.wanted.stars < 2) G.wanted.commitCrime(2);
  } else if (found && found.kind === 'car') {
    const car = found.ref;
    car.damage(PLAYER.pistolDamage);
    G.effects.sparks(hit.point.x, hit.point.y, hit.point.z);
    if (car.police) G.wanted.addStar();
    else if (G.wanted.stars < 1) G.wanted.commitCrime(1);
  } else {
    G.effects.sparks(hit.point.x, hit.point.y, hit.point.z);
  }
  // Gunfire always draws attention.
  if (G.wanted.stars === 0) G.wanted.commitCrime(1);
  else G.wanted.heatTimer = 12;
}

/** A punch at the nearest pedestrian in front of the player. */
function punch(G) {
  const player = G.player;
  if (player.punchCooldown > 0) return;
  player.punchCooldown = 0.45;
  player.punchAnim = 0.35;
  G.sound.punch();
  const pos = player.position();
  const ped = G.crowd.nearest(pos.x, pos.z, PLAYER.punchRange);
  if (!ped) return;
  const dx = ped.x - pos.x;
  const dz = ped.z - pos.z;
  const facing = dx * Math.sin(player.heading) + dz * Math.cos(player.heading);
  if (facing < 0) return;
  ped.hit(PLAYER.punchDamage, pos.x, pos.z);
  G.effects.blood(ped.x, 1.4, ped.z);
  G.crowd.scare(pos.x, pos.z, 25);
  if (ped.down && G.wanted.stars < 1) G.wanted.commitCrime(1);
}

/** Player car vs traffic/parked cars: shove apart, dent both, spark. */
function collidePlayerCar(G) {
  const car = G.player.car;
  if (!car || car.dead) return;
  const others = [...G.traffic.cars, ...G.parkedCars, ...G.targetCars];
  for (const other of others) {
    if (other === car || other.dead) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= 4.1 || dist < 0.01) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    const push = (4.1 - dist) / 2;
    car.x += nx * push;
    car.z += nz * push;
    other.x -= nx * push;
    other.z -= nz * push;
    const impact = Math.abs(car.speed - other.speed);
    if (impact > 4) {
      car.damage(impact * 0.5);
      other.damage(impact * 0.6);
      G.effects.sparks((car.x + other.x) / 2, 0.8, (car.z + other.z) / 2);
      G.sound.crash(impact);
      if (other.driver === 'traffic') other.speed *= 0.3;
      car.speed *= 0.55;
    }
    other.syncMesh(0);
  }
  // Running over pedestrians: they go down, the heat goes up.
  if (Math.abs(car.speed) > 2) {
    for (const ped of G.crowd.peds) {
      if (ped.down) continue;
      const dx = ped.x - car.x;
      const dz = ped.z - car.z;
      if (dx * dx + dz * dz < 2.3 * 2.3) {
        ped.hit(100, car.x, car.z);
        G.effects.blood(ped.x, 1, ped.z);
        G.crowd.scare(car.x, car.z, 30);
        G.wanted.addStar();
        G.sound.crash(8);
        car.speed *= 0.85;
      }
    }
  }
  // A smoking wreck of a car puffs smoke.
  if (car.health < 40 && !car.dead) {
    car.smokeTimer += STEP;
    if (car.smokeTimer > 0.2) {
      car.smokeTimer = 0;
      G.effects.smoke(car.x, 1.1, car.z);
    }
  }
}

/** Screen switching: show one overlay, hide the rest, show or hide the HUD. */
function setScreen(G, screen) {
  G.screen = screen;
  const title = document.getElementById('title-screen');
  const pause = document.getElementById('pause-screen');
  const end = document.getElementById('end-screen');
  title.classList.toggle('hidden', screen !== 'title');
  pause.classList.toggle('hidden', screen !== 'paused');
  end.classList.toggle('hidden', screen !== 'busted' && screen !== 'wasted');
  if (screen === 'playing') G.hud.show();
  else G.hud.hide();
  if (screen !== 'playing') G.input.unlock();
}

function startPlaying(G, fresh) {
  if (fresh) {
    clearSave();
    G.save = defaultSave();
    G.money = MONEY.start;
    G.missions.completed = new Set();
    G.missions.nextIndex = 0;
    G.missions.active = null;
    G.bestWanted = 0;
    G.carsStolen = 0;
    G.player.reset(0, 20);
    G.wanted.clear();
    G.hud.setStars(0);
    persist(G);
  }
  G.sound.ensure();
  setScreen(G, 'playing');
  G.input.lock();
  if (fresh) {
    G.missions.startNext();
  } else if (!G.missions.active && G.missions.nextMission) {
    G.hud.toast('Welcome back', `Press M to start: ${G.missions.nextMission.title}`, 4);
  }
  renderMissionList(G);
}

function showEndScreen(G, outcome) {
  const fine = outcome === OUTCOME_BUSTED ? MONEY.bustedFine : MONEY.wastedFine;
  const title = outcome === OUTCOME_BUSTED ? 'BUSTED' : 'WASTED';
  const body = outcome === OUTCOME_BUSTED
    ? 'The Solmar patrols caught up with you. The garage can wait — but the fine can\'t.'
    : 'You went down in the streets of Solmar. The garage still needs its driver.';
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-body').textContent = body;
  document.getElementById('end-fine').textContent = `Fine: $${fine} — mission progress kept.`;
  setScreen(G, outcome === OUTCOME_BUSTED ? 'busted' : 'wasted');
  G.pendingFine = fine;
}

function respawn(G) {
  G.money = Math.max(0, G.money - (G.pendingFine || 0));
  G.pendingFine = 0;
  G.wanted.clear();
  G.hud.setStars(0);
  // Back on your feet at the garage; the active mission restarts from its first step.
  const active = G.missions.active;
  const restartIndex = active ? MISSIONS.indexOf(active.mission) : -1;
  G.missions.active = null;
  G.beacon.hide();
  G.player.reset(PLACES.garage.x + 4, PLACES.garage.z + 6);
  persist(G);
  setScreen(G, 'playing');
  G.input.lock();
  if (restartIndex >= 0) G.missions.start(restartIndex);
}

/** Fill the title screen's mission list with ticks and the next job. */
function renderMissionList(G) {
  const list = document.getElementById('mission-list');
  if (!list) return;
  list.innerHTML = MISSIONS.map((mission, i) => {
    const done = G.missions.completed.has(mission.id);
    const next = i === G.missions.nextIndex && !done;
    const mark = done ? '✓' : next ? '▶' : '○';
    return `<li class="${done ? 'done' : next ? 'next' : ''}">${mark} ${mission.title} — $${mission.reward}</li>`;
  }).join('');
  document.getElementById('stat-money').textContent = `$${G.money.toLocaleString('en-US')}`;
  document.getElementById('stat-wanted').textContent = `${G.bestWanted}★`;
  document.getElementById('stat-cars').textContent = String(G.carsStolen);
  const hasSave = G.save.completed.length > 0 || G.save.money !== MONEY.start || G.save.nextMission > 0;
  document.getElementById('continue-btn').classList.toggle('hidden', !hasSave);
  document.getElementById('story-complete').classList.toggle('hidden', !G.missions.allDone);
}

/** One fixed simulation step while playing. */
function stepPlaying(G, dt) {
  const player = G.player;
  const input = G.input;
  const actions = input.takeActions();
  const mouse = input.takeMouse();

  // Autopilot (screenshot scenes) overrides the real input for driving.
  let driveInput = null;
  if (G.autopilot === 'drive' && player.car) {
    driveInput = autopilotInput(G);
  }

  if (actions & ACTION_PAUSE) {
    setScreen(G, 'paused');
    return;
  }
  if (actions & ACTION_HELP) {
    const help = document.getElementById('help');
    help.classList.toggle('hidden');
  }
  if (actions & ACTION_MUTE) {
    G.sound.toggleMute();
    G.hud.toast('Sound', G.sound.muted ? 'Muted (N to unmute)' : 'Sound on', 2);
  }
  if (actions & ACTION_MISSION) {
    if (!G.missions.active) G.missions.startNext();
  }
  if (actions & ACTION_ENTER) {
    if (player.onFoot) {
      const pos = player.position();
      const car = nearestCar(G, pos.x, pos.z, PLAYER.enterRange);
      if (car) stealCar(G, car);
    } else {
      player.exitCar();
    }
  }
  if (actions & ACTION_TOGGLE_WEAPON && player.onFoot) {
    player.armed = !player.armed;
    G.hud.setCrosshair(player.armed);
    G.sound.click();
  }
  if (actions & ACTION_JUMP && player.onFoot) player.jump();

  // Mouse: orbit the camera on foot; click to punch or shoot.
  player.orbitCamera(mouse.dx, mouse.dy);
  if (input.takeClick() && player.onFoot) {
    if (player.armed) shoot(G);
    else punch(G);
  } else if (input.isMouseDown() && player.onFoot && player.armed) {
    shoot(G);
  }

  // Movement.
  if (player.onFoot) {
    player.moveOnFoot(dt, input, G.colliders);
  } else if (driveInput) {
    player.car.drive(dt, driveInput.forward, driveInput.strafe, false, G.colliders);
  } else {
    player.driveCar(dt, input, G.colliders);
  }
  player.update(dt);

  // The world around the player.
  G.traffic.update(dt, player.car);
  G.traffic.recycle(player.position().x, player.position().z);
  G.crowd.update(dt, G.colliders);
  G.effects.update(dt);
  G.beacon.update(dt);
  G.missions.update(dt);
  collidePlayerCar(G);

  // Wanted: police, decay, busted/wasted.
  const outcome = G.wanted.update(dt, {
    player, colliders: G.colliders, effects: G.effects,
    onCrash: (impact) => G.sound.crash(impact),
    onShotAt: () => G.sound.shot(),
  });
  if (outcome === OUTCOME_BUSTED || outcome === OUTCOME_WASTED) {
    showEndScreen(G, outcome);
    return;
  }

  // Damage flash when health drops.
  if (player.health < G.lastHealth) G.hud.damageFlash();
  G.lastHealth = player.health;

  // Sound beds.
  G.sound.engine(player.car ? Math.abs(player.car.speed) : 0, !!player.car);
  G.sound.siren(G.wanted.stars > 0, dt);

  // HUD.
  G.hud.setStars(G.wanted.stars);
  G.hud.setMoney(G.money);
  G.hud.setHealth(player.health);
  G.hud.setSpeed(player.car ? Math.abs(player.car.speed) * 3.6 : 0, !!player.car);
  G.hud.setObjective(G.missions.objectiveText);
  G.hud.update(dt);
  const pos = player.position();
  G.hud.drawMinimap({
    playerX: pos.x, playerZ: pos.z,
    heading: player.car ? player.car.heading : player.heading,
    marker: G.missions.marker,
    police: G.wanted.units(),
  });
  if (player.onFoot) {
    const car = nearestCar(G, pos.x, pos.z, PLAYER.enterRange);
    G.hud.setInteract(car ? 'Press E to take the car' : '');
  } else {
    G.hud.setInteract(Math.abs(player.car.speed) < 1 ? 'Press E to get out' : '');
  }

  // Camera and the sun's shadow frustum follow the player.
  player.updateCamera(G.camera, dt);
  const focus = new THREE.Vector3(pos.x, 0, pos.z);
  G.sun.position.set(focus.x + 60, 95, focus.z + 45);
  G.sun.target.position.copy(focus);
  G.city.wheel.rotation.z += dt * 0.25;
}

/** One fixed step on the title screen: the city lives, the camera orbits. */
function stepTitle(G, dt) {
  G.titleAngle += dt * 0.045;
  const radius = 125;
  const cx = Math.cos(G.titleAngle) * radius;
  const cz = Math.sin(G.titleAngle) * radius;
  G.camera.position.set(cx, 52, cz);
  G.camera.lookAt(0, 4, 0);
  G.sun.position.set(60, 95, 45);
  G.sun.target.position.set(0, 0, 0);
  G.traffic.update(dt, null);
  G.crowd.update(dt, G.colliders);
  G.effects.update(dt);
  G.city.wheel.rotation.z += dt * 0.25;
}

/** Wire the title, pause and end screens' buttons. */
function wireScreens(G) {
  document.getElementById('new-game-btn').addEventListener('click', () => {
    G.sound.ensure();
    G.sound.click();
    startPlaying(G, true);
  });
  document.getElementById('continue-btn').addEventListener('click', () => {
    G.sound.ensure();
    G.sound.click();
    startPlaying(G, false);
  });
  document.getElementById('howto-btn').addEventListener('click', () => {
    document.getElementById('howto').classList.toggle('hidden');
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    G.sound.click();
    setScreen(G, 'playing');
    G.input.lock();
  });
  document.getElementById('restart-btn').addEventListener('click', () => {
    G.sound.click();
    const active = G.missions.active;
    const index = active ? MISSIONS.indexOf(active.mission) : G.missions.nextIndex;
    G.missions.active = null;
    G.beacon.hide();
    G.wanted.clear();
    G.player.reset(0, 20);
    setScreen(G, 'playing');
    G.input.lock();
    if (index >= 0 && index < MISSIONS.length) G.missions.start(index);
  });
  document.getElementById('quit-btn').addEventListener('click', () => {
    G.sound.click();
    persist(G);
    renderMissionList(G);
    setScreen(G, 'title');
  });
  document.getElementById('respawn-btn').addEventListener('click', () => {
    G.sound.click();
    respawn(G);
  });
  // Clicking the canvas while playing grabs the mouse for the camera.
  G.canvas.addEventListener('click', () => {
    if (G.screen === 'playing' && !G.input.isLocked()) G.input.lock();
  });
  // Losing the pointer lock mid-game pauses (Esc does this in Chrome).
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && G.screen === 'playing' && !shot) {
      setScreen(G, 'paused');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'playing' && !shot) setScreen(G, 'paused');
  });
  document.getElementById('story-intro').textContent = STORY_INTRO;
  renderMissionList(G);
}

function boot() {
  if (typeof THREE === 'undefined') {
    document.getElementById('title-screen').innerHTML =
      '<div class="panel"><h1>SOLMAR</h1><p>Three.js failed to load. Check that game/vendor/three.min.js is present and reload.</p></div>';
    return;
  }
  const G = buildWorld();
  // A debug handle: the state is inspectable from the console (and testable headlessly).
  window.__game = G;
  wireScreens(G);

  let screen = 'title';
  if (shot) {
    const staged = stageShot(shot, G);
    screen = staged.screen;
    G.autopilot = staged.autopilot;
    setScreen(G, screen);
    if (screen === 'playing') G.hud.show();
  } else {
    setScreen(G, 'title');
  }

  let accumulator = 0;
  let last = performance.now();
  let ready = false;

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      G.elapsed += STEP;
      if (G.screen === 'playing') stepPlaying(G, STEP);
      else if (G.screen === 'title') stepTitle(G, STEP);
    }
    G.renderer.render(G.scene, G.camera);
    if (!ready) {
      ready = true;
      document.body.dataset.ready = '1';
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(frame);
}

boot();
