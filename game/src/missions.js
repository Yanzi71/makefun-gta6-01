// The story of Solmar and its five missions. Each mission is a list of steps — drive to a
// marker, lose the cops, beat a clock, wreck a target car, pull off a multi-part job — with
// a one-line briefing, a cash reward, and pass/fail handling. The mission list drives the
// title screen, the HUD objective line and the beacon in the world.
//
// Story: Dario "Dash" Voss, Solmar's best getaway driver, came home to bury his father and
// found his father's garage in debt to Victor Kaine and the Harbor Syndicate. Mara Solis,
// who runs the garage now, has a plan to buy it back — one job at a time.
export const STORY_INTRO =
  'Dario "Dash" Voss drove getaway cars for ten years and swore he was done. ' +
  'Then his father died, and the Harbor Syndicate came collecting on the family garage. ' +
  'Mara Solis has a plan to buy it back — five jobs, one driver, and a city that never sleeps. ' +
  'Welcome home to Solmar.';

// Fixed story locations, on the street grid so every marker is reachable by car.
export const PLACES = {
  garage: { x: -46, z: -92, name: "Mara's Garage" },
  docks: { x: 138, z: 92, name: 'Solmar Docks' },
  plaza: { x: -23, z: -23, name: 'Meridian Plaza' },
  beach: { x: 138, z: -46, name: 'Boardwalk' },
  stadium: { x: -138, z: 138, name: 'Old Stadium' },
  overlook: { x: -92, z: 46, name: 'Sunset Overlook' },
};

export const MISSIONS = [
  {
    id: 'homecoming',
    title: '1 · Homecoming',
    briefing: 'Mara: "Dash. You\'re back. Get to the garage — any car you like, it\'s Solmar."',
    reward: 250,
    steps: [
      { type: 'goto', place: 'garage', text: 'Drive to Mara\'s Garage', radius: 8 },
    ],
  },
  {
    id: 'heat',
    title: '2 · Heat on the Tail',
    briefing: 'Mara: "Kaine\'s boys tipped off the patrols. Lose the heat — break line of sight and stay gone."',
    reward: 400,
    steps: [
      { type: 'wanted', stars: 2, text: 'The police are onto you — lose them' },
      { type: 'loseWanted', text: 'Stay out of sight until the heat dies down' },
    ],
  },
  {
    id: 'sunset-run',
    title: '3 · Sunset Run',
    briefing: 'Mara: "A crate at the docks leaves with the tide. Ninety seconds. Don\'t ask what\'s in it."',
    reward: 600,
    steps: [
      { type: 'timed', place: 'docks', seconds: 90, text: 'Reach the Solmar Docks before the timer runs out', radius: 10 },
    ],
  },
  {
    id: 'collector',
    title: '4 · The Collector',
    briefing: 'Mara: "Kaine\'s collector is parked by the stadium, shaking down my regulars. His car needs to stop working. Permanently."',
    reward: 900,
    steps: [
      { type: 'goto', place: 'stadium', text: 'Find the collector\'s car at the Old Stadium', radius: 14 },
      { type: 'wreck', text: 'Wreck the collector\'s car — ram it or shoot it' },
    ],
  },
  {
    id: 'last-score',
    title: '5 · The Last Score',
    briefing: 'Mara: "One last job and the garage is ours. Steal Kaine\'s show car from the boardwalk, lose his cops, bring it to the docks."',
    reward: 1500,
    steps: [
      { type: 'goto', place: 'beach', text: 'Steal the show car at the Boardwalk', radius: 10 },
      { type: 'steal', text: 'Get in the show car' },
      { type: 'goto', place: 'docks', text: 'Deliver the show car to the Solmar Docks', radius: 10, needsCar: true },
      { type: 'loseWanted', text: 'Lose the police, then the docks are yours', optional: true },
    ],
  },
];

export class MissionRunner {
  constructor(world) {
    this.world = world;
    this.active = null; // { mission, stepIndex, timer, targetCar }
    this.completed = new Set(world.save.completed || []);
    this.nextIndex = world.save.nextMission || 0;
    this.onEvent = null; // (type, data) — 'started' | 'step' | 'passed' | 'failed'
  }

  get nextMission() {
    return MISSIONS[this.nextIndex] || null;
  }

  get allDone() {
    return this.nextIndex >= MISSIONS.length;
  }

  get objectiveText() {
    if (!this.active) {
      if (this.allDone) return 'All jobs done — Solmar is yours. Free roam, or press M to replay.';
      return `Press M to start: ${this.nextMission.title}`;
    }
    const step = this.active.mission.steps[this.active.stepIndex];
    let text = step.text;
    if (step.type === 'timed' && this.active.timer !== null) {
      text += ` — ${Math.max(0, Math.ceil(this.active.timer))}s left`;
    }
    return text;
  }

  get marker() {
    if (!this.active) return null;
    const step = this.active.mission.steps[this.active.stepIndex];
    if (step.type === 'wreck' && this.active.targetCar) {
      return { x: this.active.targetCar.x, z: this.active.targetCar.z };
    }
    if (step.place) return PLACES[step.place];
    return null;
  }

  start(index) {
    const mission = MISSIONS[index];
    if (!mission) return false;
    this.active = { mission, stepIndex: 0, timer: null, targetCar: null };
    this.enterStep();
    if (this.onEvent) this.onEvent('started', { mission });
    return true;
  }

  startNext() {
    if (this.active) return false;
    if (this.allDone) return false;
    return this.start(this.nextIndex);
  }

  /** Set up the current step: timers, wanted levels, target cars, the beacon. */
  enterStep() {
    const step = this.active.mission.steps[this.active.stepIndex];
    const world = this.world;
    this.active.timer = step.type === 'timed' ? step.seconds : null;
    if (step.type === 'wanted') {
      world.wanted.commitCrime(step.stars);
    }
    if (step.type === 'wreck' && !this.active.targetCar) {
      // The collector's car: a black sedan parked by the stadium.
      const place = PLACES.stadium;
      const { Car } = world.vehicleModule;
      const car = new Car(world.scene, place.x + 6, place.z - 4, Math.PI / 2, 0x18181e, { driver: null });
      car.isTarget = true;
      this.active.targetCar = car;
      world.targetCars.push(car);
    }
    if (step.type === 'steal' && !this.active.targetCar) {
      // The show car: a gold coupe on the boardwalk.
      const place = PLACES.beach;
      const { Car } = world.vehicleModule;
      const car = new Car(world.scene, place.x - 4, place.z + 2, 0, 0xd8a820, { driver: null });
      car.isTarget = true;
      this.active.targetCar = car;
      world.targetCars.push(car);
    }
    const marker = this.marker;
    if (marker) world.beacon.show(marker.x, marker.z);
    else world.beacon.hide();
    if (this.onEvent) this.onEvent('step', { mission: this.active.mission, step });
  }

  advance() {
    this.active.stepIndex += 1;
    if (this.active.stepIndex >= this.active.mission.steps.length) {
      this.pass();
      return;
    }
    this.enterStep();
  }

  pass() {
    const mission = this.active.mission;
    const reward = mission.reward;
    this.completed.add(mission.id);
    if (MISSIONS.indexOf(mission) === this.nextIndex) this.nextIndex += 1;
    this.active = null;
    this.world.beacon.hide();
    if (this.onEvent) this.onEvent('passed', { mission, reward });
  }

  fail(reason) {
    const mission = this.active.mission;
    this.active = null;
    this.world.beacon.hide();
    if (this.onEvent) this.onEvent('failed', { mission, reason });
  }

  /** One step of the active mission. Returns nothing; events fire through onEvent. */
  update(dt) {
    if (!this.active) return;
    const step = this.active.mission.steps[this.active.stepIndex];
    const world = this.world;
    const player = world.player;
    const pos = player.position();

    if (step.type === 'timed') {
      this.active.timer -= dt;
      if (this.active.timer <= 0) {
        this.fail('Out of time.');
        return;
      }
    }
    if (step.type === 'goto' || step.type === 'timed') {
      const place = PLACES[step.place];
      const dx = pos.x - place.x;
      const dz = pos.z - place.z;
      const radius = step.radius || 8;
      if (dx * dx + dz * dz < radius * radius) {
        if (step.type === 'timed' || !step.needsCar || player.car) {
          this.advance();
          return;
        }
      }
    }
    if (step.type === 'wanted') {
      // The heat is on as soon as the step begins; move straight to losing it.
      this.advance();
      return;
    }
    if (step.type === 'loseWanted') {
      if (world.wanted.stars === 0) {
        this.advance();
        return;
      }
      // The final mission's last step is a bonus: reaching the docks already passed.
      if (step.optional && this.active.stepIndex === this.active.mission.steps.length - 1) {
        const place = PLACES.docks;
        const dx = pos.x - place.x;
        const dz = pos.z - place.z;
        if (dx * dx + dz * dz < 12 * 12 && world.wanted.stars <= 1) {
          this.advance();
        }
      }
    }
    if (step.type === 'wreck') {
      const car = this.active.targetCar;
      if (car && car.dead) {
        this.advance();
        return;
      }
      // Keep the beacon on the target car as it gets shoved around.
      if (car) world.beacon.show(car.x, car.z);
    }
    if (step.type === 'steal') {
      const car = this.active.targetCar;
      if (car && player.car === car) {
        world.wanted.commitCrime(3);
        this.advance();
      }
    }
  }
}
