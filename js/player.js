// A bomber (human or bot controlled).
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T;

  const BASE_SPEED = 1.1;   // px per frame
  const SPEED_STEP = 0.3;
  const DEATH_TIME = 1.3;
  const WALK = [0, 1, 0, 2];

  class Player {
    constructor(world, o) {
      this.world = world;
      this.slot = o.slot || 0;
      this.color = o.color || 0;
      this.x = o.c * T;
      this.y = o.r * T;
      this.dir = 'down';
      this.moving = false;
      this.anim = 0;
      this.stepT = 0;
      this.alive = true;
      this.dying = false;
      this.deathT = 0;
      this.gone = false;
      this.isPlayer = true;

      this.maxBombs = o.bombs || 1;
      this.range = o.range || 1;
      this.speedLv = o.speed || 0;
      this.maxSpeedLv = o.maxSpeed == null ? 4 : o.maxSpeed;
      this.remote = !!o.remote;
      this.wallPass = !!o.wallPass;
      this.bombPass = !!o.bombPass;
      this.flamePass = !!o.flamePass;
      this.canKick = !!o.kick;
      this.invincible = o.invincible || 0;
      this.quietSteps = !!o.quietSteps;
    }

    get speed() {
      return BASE_SPEED + this.speedLv * SPEED_STEP;
    }

    tile() {
      return { c: Math.round(this.x / T), r: Math.round(this.y / T) };
    }

    update(dt, ctrl) {
      if (this.dying) {
        this.deathT += dt;
        if (this.deathT >= DEATH_TIME) this.gone = true;
        return;
      }
      if (!this.alive) return;
      if (this.invincible > 0) this.invincible -= dt;

      this.moving = false;
      if (ctrl.dir) {
        this.dir = ctrl.dir;
        let dist = this.speed * dt * 60;
        if (ctrl.limit != null) dist = Math.min(dist, ctrl.limit);
        this.world.moveEntity(this, ctrl.dir, dist);
        this.moving = true;
        this.anim += dt;
        this.stepT += dt;
        if (this.stepT > 0.2 && !this.quietSteps) {
          this.stepT = 0;
          BM.Sound.play('step');
        }
      }
      if (ctrl.bomb) this.dropBomb();
      if (ctrl.det && this.remote) this.world.detonateOldest(this);
      this.collect();
    }

    canDropBomb() {
      const { c, r } = this.tile();
      return this.world.countBombs(this) < this.maxBombs &&
        this.world.tile(c, r) === BM.EMPTY && !this.world.bombAt(c, r);
    }

    dropBomb() {
      if (!this.canDropBomb()) return false;
      const { c, r } = this.tile();
      return !!this.world.placeBomb(this, c, r, this.range, this.remote);
    }

    collect() {
      const { c, r } = this.tile();
      const key = this.world.k(c, r);
      const item = this.world.items.get(key);
      if (!item) return;
      this.world.items.delete(key);
      this.applyItem(item.type);
      this.world.emit('pickup', { player: this, item });
    }

    applyItem(type) {
      switch (type) {
        case 'bomb': this.maxBombs = Math.min(this.maxBombs + 1, 10); break;
        case 'fire': this.range = Math.min(this.range + 1, 10); break;
        case 'speed': this.speedLv = Math.min(this.speedLv + 1, this.maxSpeedLv); break;
        case 'remote': this.remote = true; break;
        case 'wallpass': this.wallPass = true; break;
        case 'bombpass': this.bombPass = true; break;
        case 'flamepass': this.flamePass = true; break;
        case 'mystery': this.invincible = 15; break;
        case 'kick': this.canKick = true; break;
      }
    }

    // Returns true if the player actually died.
    kill(cause, force) {
      if (!this.alive) return false;
      if (!force && this.invincible > 0) return false;
      this.alive = false;
      this.dying = true;
      this.deathT = 0;
      this.world.emit('playerDie', { player: this, cause });
      return true;
    }

    draw(ctx, ox, oy) {
      if (this.gone) return;
      const sx = Math.round(this.x + ox), sy = Math.round(this.y + oy) - 3;
      if (this.dying) {
        BM.Sprites.playerDeath(ctx, sx, sy, this.color, this.deathT / DEATH_TIME);
        return;
      }
      const frame = this.moving ? WALK[Math.floor(this.anim * 8) % 4] : 0;
      const flash = this.invincible > 0 && Math.floor(this.invincible * 12) % 2 === 0;
      BM.Sprites.player(ctx, sx, sy, this.color, this.dir, frame, flash ? 'flash' : 'normal');
    }
  }

  BM.Player = Player;
})();
