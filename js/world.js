// The grid world: tiles, bombs, flames, items, movement and explosions.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T, EMPTY = BM.EMPTY, WALL = BM.WALL, BRICK = BM.BRICK;

  const FUSE = 2.5;          // seconds until a bomb explodes
  const FLAME_TIME = 0.5;    // seconds a flame stays
  const BREAK_TIME = 0.5;    // brick crumbling duration
  const SLIDE_SPEED = 3.2;   // kicked bomb speed (px / frame)
  const DROP_TIME = 0.45;    // sudden-death block fall duration
  const EPS = 0.001;

  BM.FUSE = FUSE;

  const axisOf = (dir) => (dir === 'left' || dir === 'right' ? 'h' : 'v');

  class World {
    constructor(cols, rows, theme) {
      this.cols = cols;
      this.rows = rows;
      this.theme = theme;
      this.grid = new Uint8Array(cols * rows);
      this.bombs = [];
      this.flames = new Map();
      this.items = new Map();
      this.hidden = new Map();   // things under bricks: item type or 'door'
      this.breaking = [];
      this.burning = [];         // items being burned (animation)
      this.drops = [];           // falling blocks (battle sudden death)
      this.door = null;
      this.actors = [];
      this.time = 0;
      this.onEvent = null;
    }

    emit(name, data) {
      if (this.onEvent) this.onEvent(name, data);
    }

    k(c, r) { return r * this.cols + c; }
    inside(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
    tile(c, r) { return this.inside(c, r) ? this.grid[r * this.cols + c] : WALL; }
    setTile(c, r, v) { if (this.inside(c, r)) this.grid[r * this.cols + c] = v; }

    // Border walls + pillars on every even (col,row).
    buildFrame() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const edge = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
          this.setTile(c, r, edge || (c % 2 === 0 && r % 2 === 0) ? WALL : EMPTY);
        }
      }
    }

    bombAt(c, r) {
      for (const b of this.bombs) if (b.c === c && b.r === r) return b;
      return null;
    }

    isBreaking(c, r) {
      return this.breaking.some((b) => b.c === c && b.r === r);
    }

    passable(c, r, ent) {
      const t = this.tile(c, r);
      if (t === WALL) return false;
      if (t === BRICK && !(ent && ent.wallPass)) return false;
      const b = this.bombAt(c, r);
      if (b && !(ent && (ent.bombPass || b.ignore.has(ent)))) return false;
      return true;
    }

    overlapsTile(a, c, r, shrink = 0) {
      return (
        a.x + shrink < (c + 1) * T - EPS && a.x + T - shrink > c * T + EPS &&
        a.y + shrink < (r + 1) * T - EPS && a.y + T - shrink > r * T + EPS
      );
    }

    // Grid movement with corner sliding. Returns distance moved.
    moveEntity(e, dir, dist) {
      const d = BM.DIRS[dir];
      const horiz = d.x !== 0;
      const main = horiz ? 'x' : 'y';
      const perp = horiz ? 'y' : 'x';
      const sgn = horiz ? d.x : d.y;
      const passAt = (m, l) => (horiz ? this.passable(m, l, e) : this.passable(l, m, e));
      let moved = 0;

      // 1) Align on the perpendicular axis (corner assist).
      let lane = Math.round(e[perp] / T);
      const off = e[perp] - lane * T;
      if (Math.abs(off) > EPS) {
        const curMain = Math.round(e[main] / T);
        const ahead = curMain + sgn;
        let target = null;
        if (passAt(ahead, lane)) target = lane;
        else {
          const other = lane + Math.sign(off);
          if (passAt(ahead, other) && passAt(curMain, other)) target = other;
        }
        if (target === null) {
          const blocker = horiz ? [ahead, lane] : [lane, ahead];
          this._blocked(e, dir, blocker[0], blocker[1]);
          return 0;
        }
        const delta = target * T - e[perp];
        const step = Math.min(Math.abs(delta), dist);
        e[perp] += Math.sign(delta) * step;
        if (Math.abs(target * T - e[perp]) < EPS) e[perp] = target * T;
        dist -= step;
        moved += step;
        if (e[perp] !== target * T || dist <= 0) return moved;
        lane = target;
      } else {
        e[perp] = lane * T;
      }

      // 2) Move along the main axis, clamping at blocked tiles.
      const pos = e[main];
      let np = pos + sgn * dist;
      if (sgn > 0) {
        const cur = Math.floor((pos + T - EPS) / T);
        const next = Math.floor((np + T - EPS) / T);
        for (let t = cur + 1; t <= next; t++) {
          if (!passAt(t, lane)) {
            np = (t - 1) * T;
            this._blocked(e, dir, horiz ? t : lane, horiz ? lane : t);
            break;
          }
        }
        np = Math.max(np, pos);
      } else {
        const cur = Math.floor((pos + EPS) / T);
        const next = Math.floor((np + EPS) / T);
        for (let t = cur - 1; t >= next; t--) {
          if (!passAt(t, lane)) {
            np = (t + 1) * T;
            this._blocked(e, dir, horiz ? t : lane, horiz ? lane : t);
            break;
          }
        }
        np = Math.min(np, pos);
      }
      moved += Math.abs(np - pos);
      e[main] = np;
      return moved;
    }

    _blocked(e, dir, c, r) {
      if (!e.canKick) return;
      const b = this.bombAt(c, r);
      if (b && !b.slide) this.kick(b, dir);
    }

    // ---- bombs --------------------------------------------------------------
    placeBomb(owner, c, r, range, remote) {
      if (this.tile(c, r) !== EMPTY || this.bombAt(c, r)) return null;
      const b = {
        c, r, owner, range, remote: !!remote,
        timer: FUSE, age: 0, ignore: new Set(), slide: null, slideOff: 0,
      };
      for (const a of this.actors) if (a.alive && this.overlapsTile(a, c, r)) b.ignore.add(a);
      this.bombs.push(b);
      this.emit('bomb', b);
      return b;
    }

    countBombs(owner) {
      let n = 0;
      for (const b of this.bombs) if (b.owner === owner) n++;
      return n;
    }

    detonateOldest(owner) {
      const b = this.bombs.find((x) => x.owner === owner && x.remote);
      if (b) this.explode(b);
    }

    _bombCanEnter(c, r) {
      if (this.tile(c, r) !== EMPTY || this.bombAt(c, r) || this.items.has(this.k(c, r))) return false;
      if (this.door && this.door.revealed && this.door.c === c && this.door.r === r) return false;
      for (const a of this.actors) if (a.alive && this.overlapsTile(a, c, r)) return false;
      return true;
    }

    kick(b, dir) {
      const d = BM.DIRS[dir];
      if (!this._bombCanEnter(b.c + d.x, b.r + d.y)) return;
      b.slide = dir;
      b.slideOff = 0;
      b.ignore.clear();
      this.emit('kick', b);
    }

    _slideBomb(b, dt) {
      const d = BM.DIRS[b.slide];
      let step = SLIDE_SPEED * dt * 60;
      while (step > 0 && b.slide) {
        if (b.slideOff === 0 && !this._bombCanEnter(b.c + d.x, b.r + d.y)) {
          b.slide = null;
          break;
        }
        const adv = Math.min(step, T - b.slideOff);
        b.slideOff += adv;
        step -= adv;
        if (b.slideOff >= T - EPS) {
          b.c += d.x;
          b.r += d.y;
          b.slideOff = 0;
          if (this.flames.has(this.k(b.c, b.r))) return this.explode(b);
        }
      }
    }

    // Tiles a blast would cover (no side effects). Used by bots.
    blastTiles(c, r, range) {
      const tiles = [{ c, r }], bricks = [];
      for (const dir of BM.DIR_NAMES) {
        const d = BM.DIRS[dir];
        for (let i = 1; i <= range; i++) {
          const x = c + d.x * i, y = r + d.y * i;
          const t = this.tile(x, y);
          if (t === WALL) break;
          if (t === BRICK) { bricks.push({ c: x, r: y }); break; }
          tiles.push({ c: x, r: y });
          if (this.bombAt(x, y) || this.items.has(this.k(x, y))) break;
        }
      }
      return { tiles, bricks };
    }

    explode(b) {
      if (b.exploded) return;
      b.exploded = true;
      const i = this.bombs.indexOf(b);
      if (i >= 0) this.bombs.splice(i, 1);
      if (b.slide && b.slideOff > T / 2) {
        const d = BM.DIRS[b.slide];
        b.c += d.x;
        b.r += d.y;
      }
      this._addFlame(b.c, b.r, 'center', null, b.owner);
      let doorHit = this._isDoor(b.c, b.r);
      for (const dir of BM.DIR_NAMES) {
        const d = BM.DIRS[dir];
        for (let n = 1; n <= b.range; n++) {
          const c = b.c + d.x * n, r = b.r + d.y * n;
          const t = this.tile(c, r);
          if (t === WALL) break;
          if (t === BRICK) {
            this._breakBrick(c, r);
            break;
          }
          const other = this.bombAt(c, r);
          if (other) {
            this.explode(other);
            break;
          }
          const key = this.k(c, r);
          const item = this.items.get(key);
          this._addFlame(c, r, n === b.range ? 'end' : 'mid', dir, b.owner);
          if (item) {
            this.items.delete(key);
            this.burning.push({ c, r, type: item.type, t: 0 });
            this.emit('itemBurn', item);
            break;
          }
          if (this._isDoor(c, r)) doorHit = true;
        }
      }
      this.emit('explode', b);
      if (doorHit) this.emit('doorHit', this.door);
    }

    _isDoor(c, r) {
      return this.door && this.door.revealed && this.door.c === c && this.door.r === r;
    }

    _addFlame(c, r, part, dir, owner) {
      const key = this.k(c, r);
      const ex = this.flames.get(key);
      if (ex) {
        if (ex.part === 'center' || part === 'center' || axisOf(ex.dir) !== axisOf(dir)) part = 'center';
        else if (ex.part === 'mid' || part === 'mid' || ex.dir !== dir) part = 'mid';
      }
      this.flames.set(key, { c, r, part, dir, t: 0, owner });
    }

    _breakBrick(c, r) {
      if (this.isBreaking(c, r)) return;
      this.breaking.push({ c, r, t: 0 });
      this.emit('brick', { c, r });
    }

    // Returns the flame touching an actor's (shrunken) hitbox, if any.
    flameAt(a, shrink = 4) {
      const x0 = Math.floor((a.x + shrink) / T), x1 = Math.floor((a.x + T - shrink - EPS) / T);
      const y0 = Math.floor((a.y + shrink) / T), y1 = Math.floor((a.y + T - shrink - EPS) / T);
      for (let r = y0; r <= y1; r++) {
        for (let c = x0; c <= x1; c++) {
          const f = this.flames.get(this.k(c, r));
          if (f) return f;
        }
      }
      return null;
    }

    // Kill every actor touching a flame. Returns [{actor, flame}].
    checkFlames() {
      const hits = [];
      if (!this.flames.size) return hits;
      for (const a of this.actors) {
        if (!a.alive || a.flamePass || a.invincible > 0 || a.spawnGuard > 0) continue;
        const f = this.flameAt(a);
        if (f && a.kill(f)) hits.push({ actor: a, flame: f });
      }
      return hits;
    }

    // ---- sudden death -------------------------------------------------------
    dropBlock(c, r) {
      this.drops.push({ c, r, t: 0 });
    }

    _landBlock(c, r) {
      this.setTile(c, r, WALL);
      const key = this.k(c, r);
      this.items.delete(key);
      this.hidden.delete(key);
      this.flames.delete(key);
      this.breaking = this.breaking.filter((b) => b.c !== c || b.r !== r);
      const b = this.bombAt(c, r);
      if (b) {
        b.exploded = true;
        this.bombs.splice(this.bombs.indexOf(b), 1);
      }
      this.emit('crush', { c, r });
    }

    // ---- update -------------------------------------------------------------
    update(dt) {
      this.time += dt;

      for (const b of this.bombs.slice()) {
        if (b.exploded) continue;
        b.age += dt;
        if (b.slide) this._slideBomb(b, dt);
        if (b.exploded) continue;
        for (const a of b.ignore) if (!a.alive || !this.overlapsTile(a, b.c, b.r)) b.ignore.delete(a);
        if (b.remote && !(b.owner && b.owner.alive && b.owner.remote)) b.remote = false;
        if (!b.remote) b.timer -= dt;
        if (b.timer <= 0 || this.flames.has(this.k(b.c, b.r))) this.explode(b);
      }

      for (const [key, f] of this.flames) {
        f.t += dt;
        if (f.t >= FLAME_TIME) this.flames.delete(key);
      }

      for (let i = this.breaking.length - 1; i >= 0; i--) {
        const br = this.breaking[i];
        br.t += dt;
        if (br.t < BREAK_TIME) continue;
        this.breaking.splice(i, 1);
        this.setTile(br.c, br.r, EMPTY);
        const key = this.k(br.c, br.r);
        const h = this.hidden.get(key);
        if (h) {
          this.hidden.delete(key);
          if (h === 'door') {
            this.door.revealed = true;
            this.emit('doorReveal', this.door);
          } else {
            this.items.set(key, { c: br.c, r: br.r, type: h, age: 0 });
          }
        }
      }

      for (const it of this.items.values()) it.age += dt;
      for (let i = this.burning.length - 1; i >= 0; i--) {
        this.burning[i].t += dt;
        if (this.burning[i].t > 0.6) this.burning.splice(i, 1);
      }

      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.t += dt;
        if (d.t >= DROP_TIME) {
          this.drops.splice(i, 1);
          this._landBlock(d.c, d.r);
        }
      }
    }

    // ---- rendering ----------------------------------------------------------
    // ox, oy: screen position of the world origin. viewW: visible width.
    draw(ctx, ox, oy, viewW) {
      ox = Math.round(ox);
      oy = Math.round(oy);
      const S = BM.Sprites, th = this.theme;
      const c0 = Math.max(0, Math.floor(-ox / T));
      const c1 = Math.min(this.cols - 1, Math.floor((viewW - ox) / T));
      const alt = th === 'battle';

      for (let r = 0; r < this.rows; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = ox + c * T, y = oy + r * T;
          const t = this.grid[r * this.cols + c];
          if (t === WALL) {
            S.tile(ctx, th, 'wall', x, y);
            continue;
          }
          const above = this.tile(c, r - 1);
          const shadow = above === WALL || (above === BRICK && !this.isBreaking(c, r - 1));
          const isAlt = alt && (c + r) % 2 === 1;
          S.tile(ctx, th, (isAlt ? 'floorAlt' : 'floor') + (shadow ? 'Shadow' : ''), x, y);
          if (t === BRICK && !this.isBreaking(c, r)) S.tile(ctx, th, 'brick', x, y);
        }
      }

      for (const br of this.breaking) S.brickBreak(ctx, th, ox + br.c * T, oy + br.r * T, br.t / BREAK_TIME);

      if (this.door && this.door.revealed) {
        S.door(ctx, ox + this.door.c * T, oy + this.door.r * T, this.door.open, this.time);
      }

      for (const it of this.items.values()) S.item(ctx, it.type, ox + it.c * T, oy + it.r * T, it.age);
      for (const it of this.burning) {
        if (Math.floor(it.t * 20) % 2 === 0) S.itemIcon(ctx, it.type, ox + it.c * T, oy + it.r * T);
      }

      for (const b of this.bombs) {
        let bx = b.c * T, by = b.r * T;
        if (b.slide) {
          const d = BM.DIRS[b.slide];
          bx += d.x * b.slideOff;
          by += d.y * b.slideOff;
        }
        S.bomb(ctx, ox + Math.round(bx), oy + Math.round(by), b.age);
      }

      for (const f of this.flames.values()) {
        S.flame(ctx, ox + f.c * T, oy + f.r * T, f.part, f.dir, f.t / FLAME_TIME);
      }
    }

    // Falling blocks are drawn above actors.
    drawDrops(ctx, ox, oy) {
      for (const d of this.drops) {
        const u = d.t / DROP_TIME;
        const x = Math.round(ox + d.c * T), y = Math.round(oy + d.r * T);
        ctx.fillStyle = 'rgba(0,0,0,' + (0.2 + u * 0.4) + ')';
        const s = Math.round(6 + u * 10);
        ctx.fillRect(x + (T - s) / 2, y + (T - s) / 2, s, s);
        BM.Sprites.tile(ctx, this.theme, 'wall', x, Math.round(y - (1 - u) * 72));
      }
    }
  }

  BM.World = World;
})();
