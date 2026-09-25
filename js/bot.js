// Battle-mode AI: dodges blasts, breaks bricks, grabs items and hunts players.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T;

  const LEVELS = {
    easy: { aware: 0.85, aggr: 0.3, cooldown: 1.4, idle: 0.35, maxEscape: 5, mistakes: 0.008 },
    normal: { aware: 0.97, aggr: 0.6, cooldown: 0.7, idle: 0.15, maxEscape: 6, mistakes: 0 },
    hard: { aware: 1, aggr: 1, cooldown: 0.25, idle: 0.05, maxEscape: 7, mistakes: 0 },
  };

  class BotBrain {
    constructor(player, world, level) {
      this.p = player;
      this.w = world;
      this.L = LEVELS[level] || LEVELS.normal;
      this.target = null;
      this.cooldown = 1 + Math.random();
      this.idle = 0;
      this.stuck = 0;
      this.lastX = player.x;
      this.lastY = player.y;
      this.dropHints = null; // [{c, r, time}] from battle sudden death
    }

    update(dt, players) {
      const p = this.p, ctrl = { dir: null, bomb: false, det: false, limit: null };
      if (!p.alive) return ctrl;
      this.cooldown -= dt;

      const cur = p.tile();
      const aligned = Math.abs(p.x - cur.c * T) < 0.01 && Math.abs(p.y - cur.r * T) < 0.01;
      if (aligned) {
        p.x = cur.c * T;
        p.y = cur.r * T;
      }

      // Stuck detection.
      if (Math.abs(p.x - this.lastX) + Math.abs(p.y - this.lastY) < 0.01) this.stuck += dt;
      else this.stuck = 0;
      this.lastX = p.x;
      this.lastY = p.y;
      if (this.stuck > 0.6 && this.target) {
        this.target = aligned ? null : cur;
        this.stuck = 0;
      }

      if (aligned && (!this.target || (this.target.c === cur.c && this.target.r === cur.r))) {
        this.target = null;
        if (this.idle > 0) {
          this.idle -= dt;
          // Still react to immediate danger while idling.
          if (!this.computeDanger().has(this.w.k(cur.c, cur.r))) return ctrl;
          this.idle = 0;
        }
        this.decide(cur, players, ctrl);
      } else if (!this.target) {
        this.target = cur;
      }

      if (this.target) {
        const dx = this.target.c * T - p.x, dy = this.target.r * T - p.y;
        if (Math.abs(dx) > 0.01) {
          ctrl.dir = dx > 0 ? 'right' : 'left';
          ctrl.limit = Math.abs(dx);
        } else if (Math.abs(dy) > 0.01) {
          ctrl.dir = dy > 0 ? 'down' : 'up';
          ctrl.limit = Math.abs(dy);
        }
        // Abort a step into a tile that just caught fire or got a bomb.
        const tk = this.w.k(this.target.c, this.target.r);
        if (ctrl.dir && !(this.target.c === cur.c && this.target.r === cur.r) &&
            (this.w.flames.has(tk) || (this.w.bombAt(this.target.c, this.target.r) && !p.bombPass))) {
          ctrl.dir = null;
          this.target = null;
        }
      }
      return ctrl;
    }

    // Map tileKey -> seconds until it burns (0 = burning now).
    computeDanger() {
      const w = this.w, danger = new Map();
      const set = (k, t) => {
        const ex = danger.get(k);
        if (ex === undefined || t < ex) danger.set(k, t);
      };
      for (const k of w.flames.keys()) set(k, 0);
      const list = w.bombs.map((b) => ({
        b, t: b.remote ? 1.5 : Math.max(0, b.timer), tiles: w.blastTiles(b.c, b.r, b.range).tiles,
      }));
      // Chain reactions: a bomb inside another blast goes off with it.
      for (let pass = 0; pass < 3; pass++) {
        for (const a of list) {
          for (const o of list) {
            if (o === a || o.t <= a.t) continue;
            if (a.tiles.some((t) => t.c === o.b.c && t.r === o.b.r)) o.t = a.t;
          }
        }
      }
      for (const e of list) for (const t of e.tiles) set(w.k(t.c, t.r), e.t);
      if (this.dropHints) for (const d of this.dropHints) set(w.k(d.c, d.r), d.time);
      return danger;
    }

    walkable(c, r) {
      const w = this.w;
      if (w.tile(c, r) !== BM.EMPTY) return false;
      if (w.flames.has(w.k(c, r))) return false;
      if (w.bombAt(c, r) && !this.p.bombPass) return false;
      return true;
    }

    // BFS; returns array of tiles (first step .. goal) or null.
    findPath(start, isGoal, danger, fleeing, maxDepth = 40) {
      const w = this.w;
      const stepTime = T / (this.p.speed * 60);
      const sk = w.k(start.c, start.r);
      const prev = new Map([[sk, null]]);
      const queue = [{ c: start.c, r: start.r, d: 0 }];
      let head = 0;
      while (head < queue.length) {
        const n = queue[head++];
        if (n.d > 0 && isGoal(n.c, n.r)) {
          const path = [];
          let k = w.k(n.c, n.r), node = n;
          while (node) {
            path.unshift({ c: node.c, r: node.r });
            node = prev.get(k);
            k = node ? w.k(node.c, node.r) : null;
            if (node && node.d === 0) break;
          }
          return path;
        }
        if (n.d >= maxDepth) continue;
        for (const dir of BM.DIR_NAMES) {
          const v = BM.DIRS[dir];
          const c = n.c + v.x, r = n.r + v.y, k = w.k(c, r);
          if (prev.has(k) || !this.walkable(c, r)) continue;
          const dt = danger.get(k);
          if (dt !== undefined) {
            if (!fleeing) continue;
            const arrive = (n.d + 1) * stepTime;
            if (dt < arrive + stepTime + 0.15) continue;
          }
          prev.set(k, n);
          queue.push({ c, r, d: n.d + 1 });
        }
      }
      return null;
    }

    decide(cur, players, ctrl) {
      const w = this.w, p = this.p, L = this.L;
      const danger = this.computeDanger();
      const here = w.k(cur.c, cur.r);

      // 1) Escape danger.
      if (danger.has(here) && Math.random() < L.aware) {
        const path = this.findPath(cur, (c, r) => !danger.has(w.k(c, r)), danger, true);
        if (path) {
          this.target = path[0];
          return;
        }
        // Cornered: step to the neighbour that burns last.
        let bestT = danger.get(here), best = null;
        for (const dir of BM.DIR_NAMES) {
          const v = BM.DIRS[dir], c = cur.c + v.x, r = cur.r + v.y;
          if (!this.walkable(c, r)) continue;
          const t = danger.has(w.k(c, r)) ? danger.get(w.k(c, r)) : 99;
          if (t > bestT) { bestT = t; best = { c, r }; }
        }
        this.target = best;
        return;
      }

      // 2) Bomb if worthwhile and an escape route exists.
      const opponents = players.filter((o) => o !== p && o.alive);
      if (this.cooldown <= 0 && p.canDropBomb()) {
        const value = this.bombValue(cur, opponents, danger);
        if (value > 0 && (this.hasEscape(cur, danger) || Math.random() < L.mistakes)) {
          ctrl.bomb = true;
          this.cooldown = L.cooldown * (0.6 + Math.random() * 0.8);
          return;
        }
      }

      // 3) Pick a goal: items > brick spots > opponents.
      const goal = this.chooseGoal(cur, opponents, danger);
      if (goal && goal.path.length) this.target = goal.path[0];
      else this.idle = L.idle + Math.random() * 0.2;
    }

    bombValue(at, opponents, danger) {
      const w = this.w;
      const { tiles, bricks } = w.blastTiles(at.c, at.r, this.p.range);
      let v = 0;
      for (const b of bricks) {
        if (!w.isBreaking(b.c, b.r) && !danger.has(w.k(b.c, b.r)) && !this._brickDoomed(b, danger)) v += 1;
      }
      for (const o of opponents) {
        const t = o.tile();
        if (tiles.some((x) => x.c === t.c && x.r === t.r)) v += 4 * this.L.aggr + 0.5;
        else if (Math.abs(t.c - at.c) + Math.abs(t.r - at.r) <= 2) v += 1.5 * this.L.aggr;
      }
      return v;
    }

    // A brick adjacent to an existing blast will already be destroyed.
    _brickDoomed(b, danger) {
      const w = this.w;
      for (const bomb of w.bombs) {
        if (w.blastTiles(bomb.c, bomb.r, bomb.range).bricks.some((x) => x.c === b.c && x.r === b.r)) return true;
      }
      return false;
    }

    hasEscape(at, danger) {
      const w = this.w;
      const d2 = new Map(danger);
      for (const t of w.blastTiles(at.c, at.r, this.p.range).tiles) {
        const k = w.k(t.c, t.r);
        const ex = d2.get(k);
        if (ex === undefined || ex > BM.FUSE) d2.set(k, BM.FUSE);
      }
      const path = this.findPath(at, (c, r) => !d2.has(w.k(c, r)), d2, true, this.L.maxEscape);
      return !!path;
    }

    chooseGoal(cur, opponents, danger) {
      const w = this.w, L = this.L;
      const oppTiles = opponents.map((o) => o.tile());
      let best = null;
      // BFS over safe tiles, scoring each.
      const prev = new Map([[w.k(cur.c, cur.r), null]]);
      const queue = [{ c: cur.c, r: cur.r, d: 0 }];
      let head = 0;
      const canBombSoon = w.countBombs(this.p) < this.p.maxBombs;
      while (head < queue.length) {
        const n = queue[head++];
        let score = -n.d * 0.45 + Math.random() * 0.4;
        const item = w.items.get(w.k(n.c, n.r));
        if (item) score += 9;
        if (canBombSoon) {
          const { bricks } = w.blastTiles(n.c, n.r, this.p.range);
          let fresh = 0;
          for (const b of bricks) if (!w.isBreaking(b.c, b.r) && !this._brickDoomed(b, danger)) fresh++;
          score += fresh * 2.2;
        }
        let near = 99;
        for (const t of oppTiles) near = Math.min(near, Math.abs(t.c - n.c) + Math.abs(t.r - n.r));
        if (near < 99) score += Math.max(0, 6 - near) * L.aggr * 0.9;
        if (n.d > 0 && (!best || score > best.score)) best = { score, node: n };
        if (n.d === 0) best = { score, node: n };
        if (n.d >= 14) continue;
        for (const dir of BM.DIR_NAMES) {
          const v = BM.DIRS[dir];
          const c = n.c + v.x, r = n.r + v.y, k = w.k(c, r);
          if (prev.has(k) || !this.walkable(c, r) || danger.has(k)) continue;
          prev.set(k, n);
          queue.push({ c, r, d: n.d + 1 });
        }
      }
      if (!best || best.node.d === 0) return null;
      const path = [];
      let node = best.node;
      while (node && node.d > 0) {
        path.unshift({ c: node.c, r: node.r });
        node = prev.get(w.k(node.c, node.r));
      }
      return { path };
    }
  }

  BM.BotBrain = BotBrain;
})();
