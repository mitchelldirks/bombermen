// Keyboard, touch and gamepad input unified into virtual key codes.
(function () {
  'use strict';
  const BM = window.BM;

  // Virtual codes: T_* = touch, P0_*/P1_* = gamepads.
  const SETS = {
    // Player 1 in battle (WASD) + touch + gamepad 1
    A: {
      up: ['KeyW', 'T_up', 'P0_up'], down: ['KeyS', 'T_down', 'P0_down'],
      left: ['KeyA', 'T_left', 'P0_left'], right: ['KeyD', 'T_right', 'P0_right'],
      bomb: ['Space', 'KeyF', 'T_a', 'P0_a'], det: ['KeyE', 'KeyQ', 'T_b', 'P0_b'],
    },
    // Player 2 in battle (arrows) + gamepad 2
    B: {
      up: ['ArrowUp', 'P1_up'], down: ['ArrowDown', 'P1_down'],
      left: ['ArrowLeft', 'P1_left'], right: ['ArrowRight', 'P1_right'],
      bomb: ['Enter', 'NumpadEnter', 'Slash', 'Numpad0', 'P1_a'], det: ['ShiftRight', 'Period', 'Numpad1', 'P1_b'],
    },
    // Single player: everything
    any: {
      up: ['KeyW', 'ArrowUp', 'T_up', 'P0_up', 'P1_up'],
      down: ['KeyS', 'ArrowDown', 'T_down', 'P0_down', 'P1_down'],
      left: ['KeyA', 'ArrowLeft', 'T_left', 'P0_left', 'P1_left'],
      right: ['KeyD', 'ArrowRight', 'T_right', 'P0_right', 'P1_right'],
      bomb: ['Space', 'KeyX', 'KeyJ', 'Enter', 'NumpadEnter', 'T_a', 'P0_a', 'P1_a'],
      det: ['KeyZ', 'KeyK', 'KeyE', 'ShiftLeft', 'ShiftRight', 'T_b', 'P0_b', 'P1_b'],
    },
  };

  const MENU = {
    up: ['ArrowUp', 'KeyW', 'T_up', 'P0_up', 'P1_up'],
    down: ['ArrowDown', 'KeyS', 'T_down', 'P0_down', 'P1_down'],
    left: ['ArrowLeft', 'KeyA', 'T_left', 'P0_left', 'P1_left'],
    right: ['ArrowRight', 'KeyD', 'T_right', 'P0_right', 'P1_right'],
    ok: ['Enter', 'NumpadEnter', 'Space', 'KeyX', 'KeyJ', 'T_a', 'P0_a', 'P1_a'],
    back: ['Escape', 'Backspace', 'KeyZ', 'KeyK', 'T_b', 'P0_b', 'P1_b'],
    pause: ['Escape', 'KeyP', 'T_start', 'P0_start', 'P1_start'],
  };

  const HANDLED = new Set();
  for (const s of Object.values(SETS)) for (const list of Object.values(s)) list.forEach((c) => HANDLED.add(c));
  for (const list of Object.values(MENU)) list.forEach((c) => HANDLED.add(c));

  const Input = {
    down: new Set(),
    time: {},
    counter: 0,
    pending: new Set(),
    pressed: new Set(),
    menu: {},
    onFirstGesture: null,

    press(code) {
      if (this.down.has(code)) return;
      this.down.add(code);
      this.time[code] = ++this.counter;
      this.pending.add(code);
    },

    release(code) {
      this.down.delete(code);
    },

    gesture() {
      BM.Sound.unlock();
    },

    init() {
      window.addEventListener('keydown', (e) => {
        this.gesture();
        if (HANDLED.has(e.code)) e.preventDefault();
        if (!e.repeat) this.press(e.code);
      });
      window.addEventListener('keyup', (e) => this.release(e.code));
      window.addEventListener('blur', () => this.down.clear());
      window.addEventListener('pointerdown', () => this.gesture());
      this.initTouch();
    },

    initTouch() {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (hasTouch) document.body.classList.add('has-touch');

      const dpad = document.getElementById('dpad');
      if (dpad) {
        let active = null;
        const setDir = (dir) => {
          for (const d of BM.DIR_NAMES) {
            if (d === dir) this.press('T_' + d);
            else this.release('T_' + d);
          }
          if (dir) dpad.dataset.dir = dir;
          else delete dpad.dataset.dir;
        };
        const fromEvent = (e) => {
          const r = dpad.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          if (Math.hypot(dx, dy) < r.width * 0.12) return null;
          return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        };
        dpad.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          active = e.pointerId;
          try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
          setDir(fromEvent(e));
        });
        dpad.addEventListener('pointermove', (e) => {
          if (e.pointerId === active) setDir(fromEvent(e));
        });
        const end = (e) => {
          if (e.pointerId !== active) return;
          active = null;
          setDir(null);
        };
        dpad.addEventListener('pointerup', end);
        dpad.addEventListener('pointercancel', end);
      }

      document.querySelectorAll('[data-key]').forEach((btn) => {
        const code = btn.dataset.key;
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { btn.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
          btn.classList.add('pressed');
          this.press(code);
        });
        const up = () => {
          btn.classList.remove('pressed');
          this.release(code);
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    },

    pollPads() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < 2; i++) {
        const gp = pads && pads[i];
        const pre = 'P' + i + '_';
        const st = { up: false, down: false, left: false, right: false, a: false, b: false, start: false };
        if (gp && gp.connected) {
          const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
          const b = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
          st.up = ay < -0.5 || b(12);
          st.down = ay > 0.5 || b(13);
          st.left = ax < -0.5 || b(14);
          st.right = ax > 0.5 || b(15);
          st.a = b(0) || b(2);
          st.b = b(1) || b(3);
          st.start = b(9);
          if (st.a || st.start) this.gesture();
        }
        for (const k in st) {
          if (st[k]) this.press(pre + k);
          else this.release(pre + k);
        }
      }
    },

    // Call once per fixed update step, before game logic.
    beginStep() {
      this.pollPads();
      this.pressed = this.pending;
      this.pending = new Set();
      for (const k in MENU) this.menu[k] = MENU[k].some((c) => this.pressed.has(c));
    },

    // Control state for a key set: { dir, bomb, det }
    player(setName) {
      const s = SETS[setName] || SETS.any;
      let best = null, bt = -1;
      for (const d of BM.DIR_NAMES) {
        for (const code of s[d]) {
          if (this.down.has(code) && this.time[code] > bt) {
            bt = this.time[code];
            best = d;
          }
        }
      }
      return {
        dir: best,
        bomb: s.bomb.some((c) => this.pressed.has(c)),
        det: s.det.some((c) => this.pressed.has(c)),
      };
    },
  };

  BM.Input = Input;
})();
