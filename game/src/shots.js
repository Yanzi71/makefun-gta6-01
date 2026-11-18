// The screenshot scenes behind ?shot=start|drive|chase|mission (with &seed=1). Each one
// sets up a deterministic moment of the real game — the same seed always builds the same
// city, the same car, the same chase — and the main loop's autopilot keeps the drive and
// chase shots moving while the screenshot is taken.
import { PLACES } from './missions.js';
import { Car } from './vehicles.js';

/**
 * Move traffic off the player's screenshot street near the start, so the drive stays
 * clean — but leave cars further down the road, where they read as traffic ahead.
 */
function clearStreet(traffic, streetZ, band) {
  for (const car of traffic.cars) {
    if (Math.abs(car.z - streetZ) < band && car.x > -80 && car.x < 100) {
      car.z = streetZ + 46;
      car.traffic.street = streetZ + 46;
      car.traffic.vertical = false;
    }
  }
}

/** Put the player in a fresh car on the eastbound lane of Meridian Avenue (z = 0). */
function stageDrive(G) {
  const car = new Car(G.scene, -40, -3, Math.PI / 2, 0xc23b2e, { driver: null });
  G.shotCars.push(car);
  G.player.enterCar(car);
  G.player.camYaw = Math.PI / 2;
  clearStreet(G.traffic, 0, 9);
  G.hud.show();
}

/**
 * Set the game to the named scene and return its screen and autopilot mode.
 * Autopilot 'drive' holds the car on Meridian Avenue heading east; 'none' stands still.
 */
export function stageShot(name, G) {
  if (name === 'drive') {
    stageDrive(G);
    G.missions.start(0);
    G.hud.setObjective(G.missions.objectiveText);
    return { screen: 'playing', autopilot: 'drive' };
  }
  if (name === 'chase') {
    stageDrive(G);
    G.missions.start(1);
    // Step past the "heat is on" beat to the getaway objective, then raise it to 3 stars.
    G.missions.update(0.01);
    G.wanted.commitCrime(3);
    // Three patrol cars right behind the player, already in pursuit.
    const spots = [[-58, -3], [-66, 3], [-74, -3]];
    for (const [x, z] of spots) {
      const cop = G.wanted.spawnCarNear(G.player.car.x, G.player.car.z);
      cop.x = x;
      cop.z = z;
      cop.heading = Math.PI / 2;
      cop.speed = 25;
      cop.syncMesh(0);
    }
    G.hud.show();
    return { screen: 'playing', autopilot: 'drive' };
  }
  if (name === 'mission') {
    G.player.reset(-46, -58);
    G.player.heading = Math.PI;
    G.player.camYaw = Math.PI;
    G.player.group.rotation.y = Math.PI;
    G.missions.start(0);
    G.hud.show();
    return { screen: 'playing', autopilot: 'none' };
  }
  // 'start' and anything else: the title screen over the living city.
  return { screen: 'title', autopilot: 'none' };
}

/**
 * Autopilot input for the drive/chase shots: full throttle east along Meridian Avenue,
 * steering back to the lane and the heading. Returns { forward, strafe }.
 */
export function autopilotInput(G) {
  const car = G.player.car;
  if (!car) return { forward: 0, strafe: 0 };
  const targetHeading = Math.PI / 2;
  let err = targetHeading - car.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const laneErr = -3 - car.z;
  let steer = err * 1.6 + laneErr * 0.06;
  steer = Math.max(-1, Math.min(1, steer));
  return { forward: 1, strafe: steer };
}

export { PLACES };
