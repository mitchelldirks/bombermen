// Story-mode enemies with classic NES-style personalities.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T;

  // speed: px/frame, turn: chance to change direction at a junction,
  // smart: { range, chance } -> chase the player with BFS when close.
  const ENEMY_DEFS = {
    balloom: { speed: 0.5, turn: 0.25, smart: null, points: 100 },
    oneal: { speed: 0.8, turn: 0.35, smart: { range: 6, chance: 0.5 }, points: 200 },
    doll: { speed: 0.8, turn: 0.05, smart: null, points: 400 },
    minvo: { speed: 1.0, turn: 0.3, smart: { range: 7, chance: 0.6 }, points: 800 },
    kondoria: { speed: 0.4, turn: 0.3, smart: { range: 10, chance: 0.8 }, points: 1000, wallPass: true },
    ovapi: { speed: 0.6, turn: 0.4, smart: { range: 6, chance: 0.5 }, points: 2000, wallPass: true },
    pass: { speed: 1.2, turn: 0.3, smart: { range: 10, chance: 0.9 }, points: 4000 },
    pontan: { speed: 1.35, turn: 0.3, smart: { range: 12, chance: 0.9 }, points: 8000, wallPass: true },
  };
  const ENEMY_ORDER = ['balloom', 'oneal', 'doll', 'minvo', 'kondoria', 'ovapi', 'pass', 'pontan'];
  const DEATH_TIME = 1.0;

  BM.ENEMY_DEFS = ENEMY_DEFS;
  BM.ENEMY_ORDER = ENEMY_ORDER;

  class Enemy {
    constructor(world, type, c, r) {
      this.world = world;
      this.type = type;
      this.def = ENEMY_DEFS[type];
      this.x = c * T;
      this.y = r * T;
      this.tc = c;
      this.tr = r;
      this.dir = BM.choice(BM.DIR_NAMES);
      this.face = Math.random() < 0.5 ? 'left' : 'right';
      this.alive = true;
      this.dying = false;
      this.deathT = 0;
      this.gone = false;
      this.wallPass = !!this.def.wallPass;
      this.bombPass = false;
      this.flamePass = false;
      this.spawnGuard = 0;
      this.anim = Math.random() * 2;
      this.wait = 0;
    }

    get points() {
      return this.def.points;
    }

    update(dt, player) {
      if (this.dying) {
        this.deathT += dt;
        if (this.deathT >= DEATH_TIME) this.gone = true;
        return;
      }
      this.anim += dt;
      if (this.spawnGuard > 0) this.spawnGuard -= dt;
      const w = this.world;

      // Target tile became blocked (e.g. a bomb was dropped there): turn back.
      if ((this.tc * T !== this.x || this.tr * T !== this.y) &&
          !w.passable(this.tc, this.tr, this) && !w.overlapsTile(this, this.tc, this.tr)) {
        this.tc = Math.round(this.x / T);
        this.tr = Math.round(this.y / T);
      }

      let step = this.def.speed * dt * 60;
      while (step > 0) {
        const tx = this.tc * T, ty = this.tr * T;
        if (this.x === tx && this.y === ty) {
          if (this.wait > 0) {
            this.wait -= dt;
            return;
          }
          if (!this.choose(player)) {
            this.wait = 0.3;
            return;
          }
          continue;
        }
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.abs(dx) + Math.abs(dy);
        const adv = Math.min(step, dist);
        if (dx) this.x += Math.sign(dx) * Math.min(adv, Math.abs(dx));
        else this.y += Math.sign(dy) * Math.min(adv, Math.abs(dy));
        if (Math.abs(this.x - tx) < 0.001) this.x = tx;
        if (Math.abs(this.y - ty) < 0.001) this.y = ty;
        step -= adv;
      }
    }

    choose(player) {
      const w = this.world;
      const opts = BM.DIR_NAMES.filter((d) => {
        const v = BM.DIRS[d];
        return w.passable(this.tc + v.x, this.tr + v.y, this) && !w.flames.has(w.k(this.tc + v.x, this.tr + v.y));
      });
      if (!opts.length) return false;

      let dir = null;
      const sm = this.def.smart;
      if (sm && player && player.alive) {
        const p = player.tile();
        const dist = Math.abs(p.c - this.tc) + Math.abs(p.r - this.tr);
        if (dist <= sm.range && Math.random() < sm.chance) dir = this.pathDir(p.c, p.r);
      }
      if (!dir) {
        if (opts.includes(this.dir) && Math.random() >= this.def.turn) dir = this.dir;
        else {
          const fwd = opts.filter((d) => d !== BM.OPPOSITE[this.dir]);
          dir = BM.choice(fwd.length ? fwd : opts);
        }
      }
      if (!opts.includes(dir)) dir = BM.choice(opts);
      this.dir = dir;
      if (dir === 'left' || dir === 'right') this.face = dir;
      this.tc += BM.DIRS[dir].x;
      this.tr += BM.DIRS[dir].y;
      return true;
    }

    // First step of a BFS path to (gc, gr), or null.
    pathDir(gc, gr) {
      const w = this.world;
      const start = w.k(this.tc, this.tr), goal = w.k(gc, gr);
      if (start === goal) return null;
      const first = new Map([[start, null]]);
      const queue = [[this.tc, this.tr]];
      let head = 0;
      while (head < queue.length && head < 400) {
        const [c, r] = queue[head++];
        const fk = first.get(w.k(c, r));
        for (const d of BM.DIR_NAMES) {
          const v = BM.DIRS[d];
          const nc = c + v.x, nr = r + v.y, nk = w.k(nc, nr);
          if (first.has(nk) || !w.passable(nc, nr, this)) continue;
          const f = fk || d;
          if (nk === goal) return f;
          first.set(nk, f);
          queue.push([nc, nr]);
        }
      }
      return null;
    }

    kill() {
      if (!this.alive) return false;
      this.alive = false;
      this.dying = true;
      this.deathT = 0;
      return true;
    }

    draw(ctx, ox, oy) {
      if (this.gone) return;
      const sx = Math.round(this.x + ox), sy = Math.round(this.y + oy) - 1;
      if (this.dying) {
        BM.Sprites.enemyDeath(ctx, this.type, sx, sy, this.deathT / DEATH_TIME);
        return;
      }
      const n = BM.Sprites.enemyFrames(this.type);
      const frame = Math.floor(this.anim * (n > 2 ? 8 : 4)) % n;
      if (this.spawnGuard > 0 && Math.floor(this.spawnGuard * 15) % 2) return;
      BM.Sprites.enemy(ctx, this.type, sx, sy, frame, this.face);
    }
  }

  BM.Enemy = Enemy;
})();
