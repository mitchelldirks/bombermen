// Core constants, helpers and the 3x5 bitmap font.
(function () {
  'use strict';
  const BM = (window.BM = window.BM || {});

  BM.T = 16;          // tile size in pixels
  BM.W = 256;         // logical screen width
  BM.H = 240;         // logical screen height
  BM.HUD_H = 32;      // HUD bar height
  BM.STEP = 1 / 60;   // fixed update step

  BM.EMPTY = 0;
  BM.WALL = 1;
  BM.BRICK = 2;

  BM.DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  BM.DIR_NAMES = ['up', 'down', 'left', 'right'];
  BM.OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  BM.rand = (a, b) => a + Math.random() * (b - a);
  BM.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  BM.choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  BM.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  BM.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  BM.pad = (n, len) => String(Math.max(0, Math.floor(n))).padStart(len, '0');

  // Weighted pick from { key: weight } object.
  BM.weighted = (table) => {
    let total = 0;
    for (const k in table) total += table[k];
    let r = Math.random() * total;
    for (const k in table) {
      r -= table[k];
      if (r <= 0) return k;
    }
    return Object.keys(table)[0];
  };

  // localStorage wrapper that never throws.
  BM.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('bomberman.' + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('bomberman.' + key, JSON.stringify(value));
      } catch (e) { /* storage unavailable */ }
    },
  };

  // ---------------------------------------------------------------------
  // 3x5 bitmap font. Each glyph: 5 rows of 3 pixels, rows separated by space.
  // ---------------------------------------------------------------------
  const GLYPHS = {
    A: '### #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '### #.. #.. #.. ###',
    D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..',
    G: '### #.. #.# #.# ###', H: '#.# #.# ### #.# #.#', I: '### .#. .#. .#. ###',
    J: '..# ..# ..# #.# ###', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
    M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '### #.# #.# #.# ###',
    P: '### #.# ### #.. #..', Q: '### #.# #.# ##. .##', R: '### #.# ##. #.# #.#',
    S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.', U: '#.# #.# #.# #.# ###',
    V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
    Y: '#.# #.# ### .#. .#.', Z: '### ..# .#. #.. ###',
    0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '### ..# ### #.. ###',
    3: '### ..# .## ..# ###', 4: '#.# #.# ### ..# ..#', 5: '### #.. ### ..# ###',
    6: '### #.. ### #.# ###', 7: '### ..# ..# ..# ..#', 8: '### #.# ### #.# ###',
    9: '### #.# ### ..# ###',
    ' ': '... ... ... ... ...', '.': '... ... ... ... .#.', ',': '... ... ... .#. #..',
    ':': '... .#. ... .#. ...', '!': '.#. .#. .#. ... .#.', '?': '### ..# .## ... .#.',
    '-': '... ... ### ... ...', '+': '... .#. ### .#. ...', '/': '..# ..# .#. #.. #..',
    '(': '.#. #.. #.. #.. .#.', ')': '.#. ..# ..# ..# .#.', '>': '#.. .#. ..# .#. #..',
    '<': '..# .#. #.. .#. ..#', '=': '... ### ... ### ...', "'": '.#. .#. ... ... ...',
    '%': '#.# ..# .#. #.. #.#', '*': '#.# .#. #.# ... ...', '&': '.#. #.# .#. #.# .##',
    '#': '#.# ### #.# ### #.#', '_': '... ... ... ... ###', '"': '#.# #.# ... ... ...',
  };

  // Pre-parse glyphs to lists of lit pixel coordinates.
  const PARSED = {};
  for (const ch in GLYPHS) {
    const rows = GLYPHS[ch].split(' ');
    const pts = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < 3; x++) if (row[x] === '#') pts.push(x, y);
    });
    PARSED[ch] = pts;
  }

  BM.Font = {
    ADV: 4,
    measure(text, scale = 1) {
      const n = String(text).length;
      return n ? (n * 4 - 1) * scale : 0;
    },
    // opts: { color, scale, align: 'left'|'center'|'right', shadow, rowColors }
    draw(ctx, text, x, y, opts = {}) {
      text = String(text).toUpperCase();
      const scale = opts.scale || 1;
      const w = this.measure(text, scale);
      let sx = x;
      if (opts.align === 'center') sx = x - Math.floor(w / 2);
      else if (opts.align === 'right') sx = x - w;
      sx = Math.round(sx);
      y = Math.round(y);
      if (opts.shadow) this._draw(ctx, text, sx + scale, y + scale, scale, opts.shadow, null);
      this._draw(ctx, text, sx, y, scale, opts.color || '#fff', opts.rowColors || null);
      return w;
    },
    _draw(ctx, text, x, y, s, color, rowColors) {
      ctx.fillStyle = color;
      for (let i = 0; i < text.length; i++) {
        const pts = PARSED[text[i]] || PARSED['?'];
        const ox = x + i * 4 * s;
        for (let p = 0; p < pts.length; p += 2) {
          if (rowColors) ctx.fillStyle = rowColors[pts[p + 1]];
          ctx.fillRect(ox + pts[p] * s, y + pts[p + 1] * s, s, s);
        }
      }
    },
  };
})();
