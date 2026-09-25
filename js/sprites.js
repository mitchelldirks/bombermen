// Procedural pixel art: every sprite is generated in code at startup.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Build a sprite from string rows. pal maps char -> color, '.' is transparent.
  function fromRows(rows, pal, flip) {
    const h = rows.length, w = rows[0].length;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      if (rows[y].length !== w) console.warn('sprite row width mismatch', y, rows[y]);
      for (let x = 0; x < w; x++) {
        const ch = rows[y][flip ? w - 1 - x : x];
        if (ch === '.' || !pal[ch]) continue;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  // Build a sprite from a per-pixel color function, then add a 1px outline.
  function fromFn(w, h, fn, outline, post) {
    const grid = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y * w + x] = fn(x, y);
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : grid[y * w + x]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = grid[y * w + x];
        if (col) {
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        } else if (outline && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) {
          g.fillStyle = outline;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    if (post) post(g);
    return c;
  }

  function flipCanvas(src) {
    const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  // Silhouette version of a sprite (all opaque pixels in one color).
  function silhouette(src, color) {
    const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------------------------------------------------------------------------
  // Tiles
  // ---------------------------------------------------------------------------
  const THEMES = {
    story: {
      floor: '#2f8a3a', floor2: '#2f8a3a', dot: '#2a7c34', shadow: '#1d5c27',
      wall: '#a4a4a4', wallLight: '#f0f0f0', wallDark: '#4c4c4c', wallInner: '#b8b8b8',
      brick: '#b8602c', brickLight: '#ec9c68', brickDark: '#5e2610',
    },
    battle: {
      floor: '#3a9858', floor2: '#358f52', dot: '#33884d', shadow: '#23663a',
      wall: '#6676b8', wallLight: '#b8c6f4', wallDark: '#2a3266', wallInner: '#7888cc',
      brick: '#d49a44', brickLight: '#f8d890', brickDark: '#7a4a14',
    },
  };

  function makeFloor(th, alt, shadow) {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    g.fillStyle = alt ? th.floor2 : th.floor;
    g.fillRect(0, 0, T, T);
    g.fillStyle = th.dot;
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(hash(i, alt ? 7 : 3) * 15), y = Math.floor(hash(alt ? 5 : 9, i) * 15);
      g.fillRect(x, y, 1, 1);
    }
    if (shadow) {
      g.fillStyle = th.shadow;
      g.fillRect(0, 0, T, 3);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, 3, T, 1);
    }
    return c;
  }

  function makeWall(th) {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    g.fillStyle = th.wall;
    g.fillRect(0, 0, T, T);
    g.fillStyle = th.wallInner;
    g.fillRect(3, 3, 10, 10);
    g.fillStyle = th.wallLight;
    g.fillRect(0, 0, 15, 2);
    g.fillRect(0, 0, 2, 15);
    g.fillStyle = th.wallDark;
    g.fillRect(1, 14, 15, 2);
    g.fillRect(14, 1, 2, 15);
    g.fillStyle = th.wallLight;
    g.fillRect(4, 4, 2, 1);
    g.fillRect(4, 4, 1, 2);
    return c;
  }

  function makeBrick(th) {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    g.fillStyle = th.brickDark;
    g.fillRect(0, 0, T, T);
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = row % 2 ? 4 : 0;
      for (let bx = -8 + off; bx < T; bx += 8) {
        g.fillStyle = th.brick;
        g.fillRect(bx, y, 7, 3);
        g.fillStyle = th.brickLight;
        g.fillRect(bx, y, 6, 1);
        g.fillRect(bx, y, 1, 3);
      }
    }
    return c;
  }

  const tiles = {};
  for (const name in THEMES) {
    const th = THEMES[name];
    tiles[name] = {
      floor: makeFloor(th, false, false),
      floorShadow: makeFloor(th, false, true),
      floorAlt: makeFloor(th, true, false),
      floorAltShadow: makeFloor(th, true, true),
      wall: makeWall(th),
      brick: makeBrick(th),
      theme: th,
    };
  }

  // ---------------------------------------------------------------------------
  // Player (string art, palette swapped per player color)
  // ---------------------------------------------------------------------------
  const HEAD_DOWN = [
    '.......kk.......',
    '......krrk......',
    '.......kk.......',
    '....kkkkkkkk....',
    '...kwwwwwwwwk...',
    '..kwwwwwwwwwwk..',
    '..kwwkkkkkkwwk..',
    '..kwkppppppkwk..',
    '..kwkpkppkpkwk..',
    '..kwkpkppkpkwk..',
    '..kWwkkkkkkwWk..',
    '...kkbbbbbbkk...',
    '..krkbbyybbkrk..',
  ];
  const HEAD_UP = [
    '.......kk.......',
    '......krrk......',
    '.......kk.......',
    '....kkkkkkkk....',
    '...kwwwwwwwwk...',
    '..kwwwwwwwwwwk..',
    '..kwwwwwwwwwwk..',
    '..kwwwwwwwwwwk..',
    '..kwwwwwwwwwwk..',
    '..kWwwwwwwwwWk..',
    '..kWWwwwwwwWWk..',
    '...kkbbbbbbkk...',
    '..krkbbbbbbkrk..',
  ];
  const HEAD_RIGHT = [
    '.......kk.......',
    '......krrk......',
    '.......kk.......',
    '....kkkkkkkk....',
    '...kwwwwwwwwk...',
    '..kwwwwwwwwwwk..',
    '..kwwwwwkkkkkk..',
    '..kwwwwkpppppk..',
    '..kwwwwkpppkpk..',
    '..kwwwwkpppkpk..',
    '..kWwwwwkkkkkk..',
    '...kkbbbbbbkk...',
    '...kbbbbkrrk....',
  ];
  const LEGS_FRONT = [
    ['....kbbkkbbk....', '...krrk..krrk...', '...kkkk..kkkk...'],
    ['....kbbkkkrrk...', '...krrk..kkkk...', '...kkkk.........'],
    ['...krrkkkbbk....', '...kkkk..krrk...', '.........kkkk...'],
  ];
  const LEGS_SIDE = [
    ['....kbbbbk......', '....krrrrrk.....', '....kkkkkkk.....'],
    ['...kbbkkbbk.....', '..krrk..krrk....', '..kkkk..kkkk....'],
    ['....kbbbbk......', '....krrrrrk.....', '....kkkkkkk.....'],
  ];

  const PLAYER_COLORS = [
    { w: '#f8f8f8', W: '#b0b8d0', b: '#2850e0' }, // white
    { w: '#646478', W: '#3a3a4a', b: '#d82828' }, // black
    { w: '#f84848', W: '#b02020', b: '#f8f8f8' }, // red
    { w: '#48a0f8', W: '#2060c0', b: '#30c048' }, // blue
  ];
  BM.PLAYER_UI_COLORS = ['#f8f8f8', '#9090a8', '#f86060', '#58a8f8'];

  const players = [];
  PLAYER_COLORS.forEach((pc) => {
    const pal = { k: '#000', p: '#f8c8a0', r: '#f878b0', y: '#f8d838', ...pc };
    const flashPal = { k: '#000', p: '#fff0d0', r: '#ffff80', y: '#ffffff', w: '#ffffff', W: '#ffe080', b: '#ff7070' };
    const build = (palette) => {
      const down = LEGS_FRONT.map((l) => fromRows(HEAD_DOWN.concat(l), palette));
      const up = LEGS_FRONT.map((l) => fromRows(HEAD_UP.concat(l), palette));
      const right = LEGS_SIDE.map((l) => fromRows(HEAD_RIGHT.concat(l), palette));
      const left = right.map(flipCanvas);
      return { down, up, right, left };
    };
    const normal = build(pal);
    const flash = build(flashPal);
    const white = silhouette(normal.down[0], '#ffffff');
    players.push({ normal, flash, white });
  });

  // ---------------------------------------------------------------------------
  // Enemies (generated from shape functions)
  // ---------------------------------------------------------------------------
  const ENEMY_ART = {
    balloom: { color: '#f89838', shade: '#c8601c', light: '#fcd8a8', shape: 'round', eyes: 'normal', mouth: 'smile' },
    oneal: { color: '#48a8f8', shade: '#2068c8', light: '#c0e4ff', shape: 'drop', eyes: 'normal', mouth: 'o' },
    doll: { color: '#f890c8', shade: '#c05890', light: '#ffd8ec', shape: 'ghost', eyes: 'normal', mouth: 'smile' },
    minvo: { color: '#f84848', shade: '#a81818', light: '#ffb8b8', shape: 'round', eyes: 'angry', mouth: 'grin' },
    kondoria: { color: '#6068f0', shade: '#3038a8', light: '#c0c4ff', shape: 'ghost', eyes: 'angry', mouth: 'o' },
    ovapi: { color: '#b060f0', shade: '#7030b0', light: '#e8c8ff', shape: 'spiky', eyes: 'normal', mouth: 'grin' },
    pass: { color: '#f8d020', shade: '#c08000', light: '#fff4b0', shape: 'cat', eyes: 'angry', mouth: 'grin' },
    pontan: { color: '#f8b800', shade: '#a86800', light: '#fff0a0', shape: 'coin', eyes: 'none', mouth: 'none' },
  };

  function shapeInside(shape, X, Y, f) {
    const dx = X - 8, dy = Y - 8.5;
    switch (shape) {
      case 'round':
        return f === 0
          ? dx * dx + dy * dy <= 6.2 * 6.2
          : (dx / 6.8) ** 2 + ((dy - 0.6) / 5.6) ** 2 <= 1;
      case 'drop': {
        if ((X - 8) ** 2 + (Y - 9.5) ** 2 <= 5.8 * 5.8) return true;
        const sx = X - 8 + (f ? 1 : -1) * (9.5 - Y) * 0.12;
        return Y > 2.2 && Y < 9.5 && Math.abs(sx) <= (Y - 2.2) * 0.8;
      }
      case 'ghost': {
        if (Y < 8) return dx * dx + (Y - 8) ** 2 <= 6.3 * 6.3;
        if (Math.abs(dx) > 6.3) return false;
        if (Y < 13) return true;
        return Y < 14 && ((Math.floor(X) + f * 2) % 4) < 2;
      }
      case 'spiky': {
        const a = Math.atan2(dy, dx);
        const r = 5.1 + (Math.cos(8 * a + f * Math.PI / 4) > 0.2 ? 1.5 : 0);
        return dx * dx + dy * dy <= r * r;
      }
      case 'cat': {
        const cy = f ? 9.4 : 9;
        if ((X - 8) ** 2 + ((Y - cy) / (f ? 0.92 : 1)) ** 2 <= 6 * 6) return true;
        if (Y < 2 || Y > 6) return false;
        return Math.abs(X - 4.5) <= (Y - 2) * 0.6 || Math.abs(X - 11.5) <= (Y - 2) * 0.6;
      }
      case 'coin': {
        const rx = [6.2, 4.6, 1.8, 4.6][f];
        return (dx / rx) ** 2 + (dy / 6.6) ** 2 <= 1;
      }
    }
    return false;
  }

  function makeEnemy(art, f) {
    const inside = (x, y) => shapeInside(art.shape, x + 0.5, y + 0.5, f);
    const DARK = '#301010';
    return fromFn(T, T, (x, y) => {
      if (!inside(x, y)) return null;
      const X = x + 0.5, Y = y + 0.5, dx = X - 8, dy = Y - 8.5;
      // Face features (looking right).
      if (art.eyes !== 'none') {
        const inEyeL = (x === 5 || x === 6) && y >= 6 && y <= 8;
        const inEyeR = (x === 9 || x === 10) && y >= 6 && y <= 8;
        if (inEyeL || inEyeR) {
          if (art.eyes === 'angry' && y === 6 && (x === 5 || x === 10)) return art.shade;
          if ((x === 6 || x === 10) && y >= 7) return '#101018';
          return '#ffffff';
        }
      }
      if (art.mouth === 'smile' && ((y === 11 && (x === 6 || x === 9)) || (y === 12 && (x === 7 || x === 8)))) return DARK;
      if (art.mouth === 'o' && (x === 7 || x === 8) && (y === 11 || y === 12)) return DARK;
      if (art.mouth === 'grin') {
        if (y === 11 && x >= 5 && x <= 10) return x === 6 || x === 9 ? '#ffffff' : DARK;
        if (y === 12 && x >= 6 && x <= 9) return DARK;
      }
      if (art.shape === 'coin') {
        const rx = [6.2, 4.6, 1.8, 4.6][f];
        const n = (dx / rx) ** 2 + (dy / 6.6) ** 2;
        if (n > 0.45 && n < 0.62) return art.shade;
        if (Math.abs(dx) < rx * 0.25 && Math.abs(dy) < 3) return art.light;
      }
      if (art.shape === 'cat' && y >= 8 && y <= 9 && (x === 3 || x === 12)) return art.shade;
      if ((dx + 2.6) ** 2 + (dy + 2.8) ** 2 < 2.2) return art.light;
      if (dx * 0.55 + dy * 0.75 > 3.3) return art.shade;
      return art.color;
    }, '#000');
  }

  const enemies = {};
  for (const type in ENEMY_ART) {
    const art = ENEMY_ART[type];
    const n = art.shape === 'coin' ? 4 : 2;
    const right = [];
    for (let f = 0; f < n; f++) right.push(makeEnemy(art, f));
    enemies[type] = { right, left: right.map(flipCanvas), white: silhouette(right[0], '#ffffff') };
  }

  // ---------------------------------------------------------------------------
  // Bomb
  // ---------------------------------------------------------------------------
  const bombFrames = [5.6, 6.1, 6.6].map((r) =>
    fromFn(T, T, (x, y) => {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 9.3;
      if (dx * dx + dy * dy > r * r) return null;
      if ((dx + 2.4) ** 2 + (dy + 2.4) ** 2 < 1.1) return '#ffffff';
      if ((dx + 2) ** 2 + (dy + 2) ** 2 < 3.4) return '#8c8cc0';
      if (dx * 0.55 + dy * 0.75 > r * 0.42) return '#12121c';
      return '#2a2a48';
    }, '#000', (g) => {
      const top = Math.round(9.3 - r) - 1;
      g.fillStyle = '#000';
      g.fillRect(6, top - 1, 4, 3);
      g.fillStyle = '#8080a0';
      g.fillRect(7, top, 2, 1);
      g.fillStyle = '#c8b890';
      g.fillRect(9, top - 2, 1, 1);
      g.fillRect(10, top - 3, 1, 1);
    })
  );

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------
  const ICONS = {
    bomb: ['......y.', '.....o.y', '..kkko..', '.kkkkkk.', 'kkgkkkkk', 'kgkkkkkk', 'kkkkkkkk', '.kkkkkk.'],
    fire: ['...r....', '..rr..r.', '..ror.r.', '.rrorrr.', '.royorr.', 'rroyyorr', 'royyyyor', '.rryyrr.'],
    speed: ['..bbb...', '..bwb...', '..bbb...', '..bbbbb.', '..bbbbbb', '..bbbbbb', '.gggggg.', '..k..k..'],
    remote: ['...r....', '...k....', '..gggg..', '..grrg..', '..gggg..', '..gkkg..', '..gkkg..', '..gggg..'],
    wallpass: ['ooowoooo', 'wwwwwwww', 'owoooowo', 'wwwwwwww', 'ooowoooo', 'wwwwwwww', 'owoooowo', 'wwwwwwww'],
    bombpass: ['..kkk...', '.kkkkk..', 'kgkkkkk.', 'kkkkkkk.', '.kkkkk..', '..kkk...', 'yyyyyyy.', '.....y..'],
    flamepass: ['..wwww..', '.w.rr.w.', 'w.rorr.w', 'w.royr.w', 'w.ryyr.w', 'w.ryyr.w', '.w.rr.w.', '..wwww..'],
    mystery: ['..wwww..', '.ww..ww.', '.....ww.', '....ww..', '...ww...', '...ww...', '........', '...ww...'],
    kick: ['bbb.....', 'bbb.....', 'bbb.kkk.', 'bbbkkkkk', 'bbbbkkkk', 'bbbbkkkk', 'wwww.kkk', '........'],
  };
  const ICON_PAL = {
    k: '#101018', g: '#c8c8d8', y: '#f8e040', o: '#f89020', r: '#e83020', w: '#ffffff', b: '#3890f8',
  };
  const items = {};
  for (const type in ICONS) {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(1, 1, 14, 14);
    g.fillStyle = type === 'wallpass' ? '#28a060' : '#2838a8';
    g.fillRect(2, 2, 12, 12);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(2, 2, 12, 1);
    g.fillRect(2, 2, 1, 12);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(2, 13, 12, 1);
    g.fillRect(13, 2, 1, 12);
    const pal = type === 'wallpass' ? { o: '#c86030', w: '#f8d8b0' } : ICON_PAL;
    g.drawImage(fromRows(ICONS[type], pal), 4, 4);
    items[type] = c;
  }

  // ---------------------------------------------------------------------------
  // Door
  // ---------------------------------------------------------------------------
  function makeDoor(open) {
    const c = makeCanvas(T, T), g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(1, 1, 14, 15);
    g.fillStyle = '#9c9c9c';
    g.fillRect(2, 2, 12, 13);
    g.fillStyle = '#e0e0e0';
    g.fillRect(2, 2, 12, 1);
    g.fillRect(2, 2, 1, 13);
    g.fillStyle = open ? '#f8f090' : '#3a1c08';
    g.fillRect(4, 4, 8, 11);
    g.fillStyle = open ? '#ffffff' : '#5a3010';
    g.fillRect(5, 5, 6, 1);
    g.fillStyle = open ? '#f8c040' : '#241004';
    g.fillRect(4, 12, 8, 1);
    g.fillRect(4, 14, 8, 1);
    return c;
  }
  const doors = { closed: makeDoor(false), open: makeDoor(true) };

  // ---------------------------------------------------------------------------
  // Public draw API
  // ---------------------------------------------------------------------------
  const FLAME_COLORS = ['#d82808', '#f88818', '#f8e058', '#ffffff'];

  BM.Sprites = {
    tiles,
    THEMES,

    tile(ctx, theme, name, x, y) {
      ctx.drawImage(tiles[theme][name], x, y);
    },

    brickBreak(ctx, theme, x, y, t) {
      const src = tiles[theme].brick;
      for (let cy = 0; cy < 8; cy++) {
        for (let cx = 0; cx < 8; cx++) {
          if (hash(cx + x, cy + y) < t * 1.15) continue;
          ctx.drawImage(src, cx * 2, cy * 2, 2, 2, x + cx * 2, y + cy * 2, 2, 2);
        }
      }
      ctx.globalAlpha = 0.55 * (1 - t);
      ctx.fillStyle = t < 0.5 ? '#f8e058' : '#f88818';
      ctx.fillRect(x, y, T, T);
      ctx.globalAlpha = 1;
    },

    bomb(ctx, x, y, age) {
      const f = [0, 1, 2, 1][Math.floor(age * 6) % 4];
      ctx.drawImage(bombFrames[f], x, y);
      // Flickering fuse spark.
      const top = Math.round(9.3 - [5.6, 6.1, 6.6][f]) - 1;
      const sx = x + 11, sy = y + top - 4;
      const k = Math.floor(age * 20) % 3;
      ctx.fillStyle = ['#ffffff', '#f8e058', '#f88818'][k];
      ctx.fillRect(sx, sy, 1, 1);
      ctx.fillStyle = '#f88818';
      if (k !== 1) ctx.fillRect(sx - 1 + k, sy - 1, 1, 1);
      if (k !== 2) ctx.fillRect(sx + 1, sy + 1 - k, 1, 1);
    },

    // part: 'center' | 'mid' | 'end'; dir: up/down/left/right; t in [0,1]
    flame(ctx, x, y, part, dir, t) {
      const s = Math.sin(Math.PI * Math.min(1, t * 1.15));
      const w = 6 + Math.round(s * 8); // 6..14
      const horiz = dir === 'left' || dir === 'right';
      for (let layer = 0; layer < 4; layer++) {
        const lw = w - layer * 3;
        if (lw <= 0) break;
        ctx.fillStyle = FLAME_COLORS[layer];
        const o = Math.floor((T - lw) / 2);
        const inset = layer; // ends get shorter per layer to look rounded
        if (part === 'center') {
          ctx.fillRect(x, y + o, T, lw);
          ctx.fillRect(x + o, y, lw, T);
        } else if (part === 'mid') {
          if (horiz) ctx.fillRect(x, y + o, T, lw);
          else ctx.fillRect(x + o, y, lw, T);
        } else {
          const len = 13 - inset;
          const tip = Math.max(0, lw - 4);
          if (dir === 'right') {
            ctx.fillRect(x, y + o, len, lw);
            ctx.fillRect(x + len, y + o + 2, 1, tip);
          } else if (dir === 'left') {
            ctx.fillRect(x + T - len, y + o, len, lw);
            ctx.fillRect(x + T - len - 1, y + o + 2, 1, tip);
          } else if (dir === 'down') {
            ctx.fillRect(x + o, y, lw, len);
            ctx.fillRect(x + o + 2, y + len, tip, 1);
          } else {
            ctx.fillRect(x + o, y + T - len, lw, len);
            ctx.fillRect(x + o + 2, y + T - len - 1, tip, 1);
          }
        }
      }
    },

    item(ctx, type, x, y, age) {
      ctx.drawImage(items[type], x, y);
      const pulse = (Math.sin(age * 8) + 1) / 2;
      ctx.globalAlpha = 0.18 * pulse;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 2, y + 2, 12, 12);
      ctx.globalAlpha = 1;
    },

    itemIcon(ctx, type, x, y) {
      ctx.drawImage(items[type], x, y);
    },

    door(ctx, x, y, open, time) {
      const bright = open && Math.floor(time * 6) % 2 === 0;
      ctx.drawImage(bright ? doors.open : doors.closed, x, y);
    },

    // variant: 'normal' | 'flash'
    player(ctx, x, y, color, dir, frame, variant) {
      const set = players[color][variant === 'flash' ? 'flash' : 'normal'];
      const bob = (dir === 'left' || dir === 'right') && frame === 2 ? -1 : 0;
      ctx.drawImage(set[dir][frame], x, y + bob);
    },

    playerDeath(ctx, x, y, color, t) {
      const p = players[color];
      if (t < 0.35) {
        const white = Math.floor(t * 18) % 2 === 0;
        ctx.drawImage(white ? p.white : p.normal.down[0], x, y);
        return;
      }
      const u = (t - 0.35) / 0.65;
      const h = Math.max(1, Math.round(T * (1 - u)));
      const w = Math.round(T * (1 + u * 0.7));
      ctx.globalAlpha = 1 - u * 0.6;
      ctx.drawImage(p.normal.down[0], x + Math.round((T - w) / 2), y + T - h, w, h);
      ctx.globalAlpha = 1;
    },

    head(ctx, color, x, y) {
      ctx.drawImage(players[color].normal.down[0], 0, 0, T, 12, x, y, T, 12);
    },

    enemy(ctx, type, x, y, frame, dir) {
      const e = enemies[type];
      const set = dir === 'left' ? e.left : e.right;
      ctx.drawImage(set[frame % set.length], x, y);
    },

    enemyFrames(type) {
      return enemies[type].right.length;
    },

    enemyDeath(ctx, type, x, y, t) {
      const e = enemies[type];
      if (t < 0.45) {
        ctx.drawImage(Math.floor(t * 16) % 2 ? e.white : e.right[0], x, y);
        return;
      }
      const u = (t - 0.45) / 0.55;
      const s = Math.max(1, Math.round(T * (1 - u)));
      ctx.globalAlpha = 1 - u;
      ctx.drawImage(e.white, x + (T - s) / 2, y + (T - s), s, s);
      ctx.globalAlpha = 1;
    },
  };
})();
