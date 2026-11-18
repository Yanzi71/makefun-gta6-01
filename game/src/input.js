// Keyboard and mouse input. Held keys are read every frame; one-shot presses (enter a
// car, draw the pistol, pause, start a mission) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. Mouse
// movement orbits the camera while the pointer is locked.
export const ACTION_ENTER = 1;
export const ACTION_TOGGLE_WEAPON = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MISSION = 8;
export const ACTION_HELP = 16;
export const ACTION_MUTE = 32;
export const ACTION_JUMP = 64;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyQ') actions |= ACTION_TOGGLE_WEAPON;
    else if (event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM') actions |= ACTION_MISSION;
    else if (event.code === 'KeyH') actions |= ACTION_HELP;
    else if (event.code === 'KeyN') actions |= ACTION_MUTE;
    else if (event.code === 'Space') actions |= ACTION_JUMP;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += event.movementX || 0;
      mouseDY += event.movementY || 0;
    }
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mouseClicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    /** Forward/back input: 1 forward, -1 back, 0 neither. */
    forward() {
      return (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    },
    /** Strafe/steer input: 1 right, -1 left, 0 neither. */
    strafe() {
      return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    /** Space held: handbrake while driving. */
    handbrake() {
      return keys.has('Space');
    },
    /** Mouse movement since the last call, consumed. */
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    /** True once per click (left mouse button pressed since the last call). */
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    isMouseDown() {
      return mouseDown;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    isLocked() {
      return document.pointerLockElement === canvas;
    },
    lock() {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    },
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };
}
