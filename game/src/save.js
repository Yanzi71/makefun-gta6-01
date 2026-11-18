// Save games in localStorage: money, completed missions and the player's last spot.
// Everything is wrapped in try/catch: private windows and blocked storage just mean the
// save lasts this visit only, never a crash.
const SAVE_KEY = 'solmar.save.v1';

export function defaultSave() {
  return {
    money: 500,
    completed: [],
    /** Index of the next mission to play. */
    nextMission: 0,
    /** Best (highest) wanted level ever reached, shown on the title screen. */
    bestWanted: 0,
    /** Cars stolen in total, a little stat for the title screen. */
    carsStolen: 0,
    version: 1,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const save = defaultSave();
    if (typeof parsed.money === 'number') save.money = parsed.money;
    if (Array.isArray(parsed.completed)) save.completed = parsed.completed.filter((id) => typeof id === 'string');
    if (typeof parsed.nextMission === 'number') save.nextMission = parsed.nextMission;
    if (typeof parsed.bestWanted === 'number') save.bestWanted = parsed.bestWanted;
    if (typeof parsed.carsStolen === 'number') save.carsStolen = parsed.carsStolen;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable: play on without saving.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
