// Story mode: endless procedurally generated NES-style stages.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T, W = BM.W, HUD = BM.HUD_H;
  const COLS = 31, ROWS = 13;
  const STAGE_TIME = 200;
  const LIFE_EVERY = 20000;

  const POWER_CYCLE = ['fire', 'bomb', 'remote', 'speed', 'bomb', 'fire', 'bombpass', 'fire',
    'wallpass', 'bomb', 'flamepass', 'mystery', 'speed', 'bomb', 'fire', 'remote'];
  const UNLOCK = [1, 2, 4, 6, 8, 10, 12, 15]; // stage each enemy type appears

  function enemyListFor(stage) {
    let maxTier = 0;
    UNLOCK.forEach((s, i) => { if (stage >= s) maxTier = i; });
    const count = Math.min(5 + Math.floor(stage / 2), 13);
    const list = [];
    for (let i = 0; i < count; i++) {
      let tier;
      if (Math.random() < 0.25) tier = BM.randInt(0, maxTier);
      else tier = Math.max(0, maxTier - BM.randInt(0, 2));
      list.push(BM.ENEMY_ORDER[tier]);
    }
    return list;
  }

  class StoryMode {
    constructor(game) {
      this.game = game;
      this.pausable = true;
      this.stage = 1;
      this.lives = 2;
      this.score = 0;
      this.nextLife = LIFE_EVERY;
      this.power = { bombs: 1, range: 1, speed: 0 };
      this.popups = [];
      this.world = null;
      this.startIntro();
    }

    canPause() {
      return this.phase === 'play';
    }

    startIntro() {
      this.phase = 'intro';
      this.phaseT = 0;
      BM.Sound.music(null);
      BM.Sound.play('start');
    }

    buildStage() {
      const w = new BM.World(COLS, ROWS, 'story');
      w.buildFrame();
      const bricks = [];
      const density = Math.min(0.28 + this.stage * 0.004, 0.36);
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (w.tile(c, r) !== BM.EMPTY || c + r <= 3) continue;
          if (Math.random() < density) {
            w.setTile(c, r, BM.BRICK);
            bricks.push({ c, r });
          }
        }
      }
      BM.shuffle(bricks);
      const doorAt = bricks[0], powerAt = bricks[1];
      w.door = { c: doorAt.c, r: doorAt.r, revealed: false, open: false };
      w.hidden.set(w.k(doorAt.c, doorAt.r), 'door');
      w.hidden.set(w.k(powerAt.c, powerAt.r), POWER_CYCLE[(this.stage - 1) % POWER_CYCLE.length]);

      const player = new BM.Player(w, {
        c: 1, r: 1, color: 0, maxSpeed: 3,
        bombs: this.power.bombs, range: this.power.range, speed: this.power.speed,
      });
      if (this.carry) Object.assign(player, this.carry);
      this.player = player;

      const spots = [];
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (w.tile(c, r) === BM.EMPTY && c + r >= 9) spots.push({ c, r });
        }
      }
      BM.shuffle(spots);
      this.enemies = enemyListFor(this.stage).map((type, i) => {
        const s = spots[i % spots.length];
        return new BM.Enemy(w, type, s.c, s.r);
      });

      w.actors = [player, ...this.enemies];
      w.onEvent = (n, d) => this.onEvent(n, d);
      this.world = w;
      this.time = STAGE_TIME;
      this.timeUp = false;
      this.doorAnnounced = false;
      this.spawnCooldown = 0;
      this.popups = [];
      this.camX = 0;
    }

    onEvent(name, d) {
      const S = BM.Sound;
      switch (name) {
        case 'bomb': S.play('bomb'); break;
        case 'explode': S.play('explode'); this.game.shake(4); break;
        case 'pickup':
          S.play('powerup');
          this.addScore(1000, d.item.c * T, d.item.r * T);
          if (d.item.type === 'mystery') S.play('oneup');
          break;
        case 'itemBurn':
          S.play('burn');
          this.spawnWave(d.c, d.r, 4);
          break;
        case 'doorHit':
          this.spawnWave(d.c, d.r, 4);
          break;
        case 'playerDie': S.play('die'); S.music(null); break;
      }
    }

    // Blasting the door or an item releases a wave of tougher enemies.
    spawnWave(c, r, n) {
      if (this.spawnCooldown > 0) return;
      this.spawnCooldown = 1.5;
      let maxTier = 0;
      UNLOCK.forEach((s, i) => { if (this.stage >= s) maxTier = i; });
      const type = BM.ENEMY_ORDER[Math.min(maxTier + 1, BM.ENEMY_ORDER.length - 1)];
      for (let i = 0; i < n; i++) this.addEnemy(type, c, r);
      BM.Sound.play('time');
    }

    addEnemy(type, c, r) {
      const e = new BM.Enemy(this.world, type, c, r);
      e.spawnGuard = 1.2;
      this.enemies.push(e);
      this.world.actors.push(e);
    }

    addScore(points, x, y) {
      this.score += points;
      if (x != null) this.popups.push({ text: String(points), x: x + 8, y: y, t: 0 });
      while (this.score >= this.nextLife) {
        this.nextLife += LIFE_EVERY;
        this.lives++;
        BM.Sound.play('oneup');
      }
    }

    update(dt) {
      this.phaseT += dt;
      const menu = BM.Input.menu;
      switch (this.phase) {
        case 'intro':
          if (this.phaseT > 2.6 || (this.phaseT > 0.6 && menu.ok)) {
            this.buildStage();
            this.phase = 'play';
            this.phaseT = 0;
            BM.Sound.music('story');
          }
          break;
        case 'play':
          this.updatePlay(dt);
          break;
        case 'dying':
          this.updateWorld(dt, BM.Input.player('any'));
          if (this.player.gone && this.phaseT > 2.4) this.loseLife();
          break;
        case 'clear':
          this.updatePopups(dt);
          if (this.phaseT > 3.2) {
            this.stage++;
            this.startIntro();
          }
          break;
        case 'gameover':
          if (this.phaseT > 1.2 && (menu.ok || menu.back)) {
            BM.Sound.play('select');
            this.game.toTitle();
          }
          break;
      }
    }

    updateWorld(dt, ctrl) {
      const w = this.world, p = this.player;
      p.update(dt, ctrl);
      for (const e of this.enemies) e.update(dt, p);
      w.update(dt);

      for (const hit of w.checkFlames()) {
        const a = hit.actor;
        if (!a.isPlayer) {
          BM.Sound.play('enemyDie');
          this.addScore(a.points, a.x, a.y);
        }
      }
      if (p.alive) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (Math.abs(e.x - p.x) < T - 6 && Math.abs(e.y - p.y) < T - 6) {
            p.kill(e);
            break;
          }
        }
      }
      this.enemies = this.enemies.filter((e) => !e.gone);
      w.actors = w.actors.filter((a) => !a.gone || a === p);
      this.updatePopups(dt);

      const maxCam = COLS * T - W;
      const target = BM.clamp(p.x + T / 2 - W / 2, 0, maxCam);
      this.camX += (target - this.camX) * Math.min(1, dt * 10);
      if (Math.abs(target - this.camX) < 0.5) this.camX = target;
    }

    updatePopups(dt) {
      for (const pp of this.popups) pp.t += dt;
      this.popups = this.popups.filter((pp) => pp.t < 1.2);
    }

    updatePlay(dt) {
      const w = this.world, p = this.player;
      this.updateWorld(dt, BM.Input.player('any'));
      if (this.spawnCooldown > 0) this.spawnCooldown -= dt;

      this.time -= dt;
      if (this.time <= 0 && !this.timeUp) {
        this.timeUp = true;
        this.time = 0;
        BM.Sound.play('time');
        // Out of time: Pontans swarm the stage.
        const spots = [];
        for (let r = 1; r < ROWS - 1; r++) {
          for (let c = 1; c < COLS - 1; c++) {
            const pt = p.tile();
            if (w.tile(c, r) === BM.EMPTY && Math.abs(c - pt.c) + Math.abs(r - pt.r) > 6) spots.push({ c, r });
          }
        }
        BM.shuffle(spots).slice(0, 8).forEach((s) => this.addEnemy('pontan', s.c, s.r));
      }

      const alive = this.enemies.some((e) => e.alive);
      w.door.open = !alive;
      if (!alive && w.door.revealed && !this.doorAnnounced) {
        this.doorAnnounced = true;
        BM.Sound.play('door');
      }
      if (!alive && p.alive && w.door.revealed &&
          Math.abs(p.x - w.door.c * T) < 5 && Math.abs(p.y - w.door.r * T) < 5) {
        this.stageClear();
        return;
      }

      if (!p.alive) {
        this.phase = 'dying';
        this.phaseT = 0;
      }
    }

    stageClear() {
      this.phase = 'clear';
      this.phaseT = 0;
      this.clearBonus = Math.floor(this.time) * 10;
      this.addScore(this.clearBonus);
      const p = this.player;
      this.power = { bombs: p.maxBombs, range: p.range, speed: p.speedLv };
      this.carry = { remote: p.remote, wallPass: p.wallPass, bombPass: p.bombPass, flamePass: p.flamePass };
      BM.Sound.music(null);
      BM.Sound.play('clear');
    }

    loseLife() {
      this.lives--;
      this.carry = null;
      if (this.lives < 0) {
        this.phase = 'gameover';
        this.phaseT = 0;
        this.newHigh = this.game.submitScore(this.score);
        BM.Sound.play('gameover');
      } else {
        this.startIntro();
      }
    }

    // ---- rendering ----------------------------------------------------------
    draw(ctx) {
      const F = BM.Font;
      if (this.phase === 'intro') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, BM.H);
        F.draw(ctx, 'STAGE ' + this.stage, W / 2, 96, { scale: 3, align: 'center', color: '#fff' });
        BM.Sprites.head(ctx, 0, W / 2 - 24, 140);
        F.draw(ctx, 'X ' + Math.max(0, this.lives), W / 2 - 2, 143, { scale: 2, color: '#fff' });
        return;
      }
      if (this.phase === 'gameover') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, BM.H);
        F.draw(ctx, 'GAME OVER', W / 2, 70, { scale: 3, align: 'center', color: '#f84848', shadow: '#401010' });
        F.draw(ctx, 'SCORE ' + this.score, W / 2, 120, { scale: 2, align: 'center' });
        F.draw(ctx, 'STAGE ' + this.stage, W / 2, 140, { scale: 1, align: 'center', color: '#aaa' });
        F.draw(ctx, 'HI SCORE ' + this.game.highScore, W / 2, 156, { align: 'center', color: '#f8d838' });
        if (this.newHigh && Math.floor(this.phaseT * 3) % 2 === 0) {
          F.draw(ctx, 'NEW HIGH SCORE!', W / 2, 172, { align: 'center', color: '#58f898' });
        }
        if (this.phaseT > 1.2) F.draw(ctx, 'PRESS A / ENTER', W / 2, 206, { align: 'center', color: '#888' });
        return;
      }

      const w = this.world, cam = Math.round(this.camX);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HUD, W, BM.H - HUD);
      ctx.clip();
      w.draw(ctx, -cam, HUD, W);
      const actors = w.actors.slice().sort((a, b) => a.y - b.y);
      for (const a of actors) a.draw(ctx, -cam, HUD);
      for (const pp of this.popups) {
        F.draw(ctx, pp.text, pp.x - cam, HUD + pp.y - pp.t * 14, { align: 'center', color: '#fff', shadow: '#000' });
      }
      ctx.restore();

      this.drawHud(ctx);

      if (this.phase === 'clear') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 96, W, 56);
        F.draw(ctx, 'STAGE CLEAR!', W / 2, 106, { scale: 3, align: 'center', color: '#f8d838', shadow: '#000' });
        F.draw(ctx, 'TIME BONUS ' + this.clearBonus, W / 2, 132, { align: 'center' });
      }
    }

    drawHud(ctx) {
      const F = BM.Font, p = this.player;
      ctx.fillStyle = '#bcbcbc';
      ctx.fillRect(0, 0, W, HUD);
      ctx.fillStyle = '#7c7c7c';
      ctx.fillRect(0, HUD - 2, W, 2);
      const t = Math.max(0, Math.ceil(this.time));
      const hurry = t <= 30 && Math.floor(this.world.time * 4) % 2 === 0;
      F.draw(ctx, 'TIME', 8, 6, { color: '#000' });
      F.draw(ctx, String(t), 26, 6, { color: hurry ? '#d82020' : '#000' });
      F.draw(ctx, BM.pad(this.score, 7), W / 2, 6, { align: 'center', color: '#000' });
      F.draw(ctx, 'LEFT ' + Math.max(0, this.lives), W - 8, 6, { align: 'right', color: '#000' });

      F.draw(ctx, 'STAGE ' + this.stage, 8, 18, { color: '#303030' });
      let x = 70;
      const stat = (icon, val) => {
        ctx.save();
        ctx.translate(x, 14);
        ctx.scale(0.625, 0.625);
        BM.Sprites.itemIcon(ctx, icon, 0, 0);
        ctx.restore();
        F.draw(ctx, String(val), x + 12, 18, { color: '#000' });
        x += 26;
      };
      stat('bomb', p.maxBombs);
      stat('fire', p.range);
      stat('speed', p.speedLv);
      for (const k of ['remote', 'wallpass', 'bombpass', 'flamepass']) {
        const has = { remote: p.remote, wallpass: p.wallPass, bombpass: p.bombPass, flamepass: p.flamePass }[k];
        if (!has) continue;
        ctx.save();
        ctx.translate(x, 14);
        ctx.scale(0.625, 0.625);
        BM.Sprites.itemIcon(ctx, k, 0, 0);
        ctx.restore();
        x += 12;
      }
      const enemiesLeft = this.enemies.filter((e) => e.alive).length;
      F.draw(ctx, 'ENEMY ' + enemiesLeft, W - 8, 18, { align: 'right', color: '#303030' });
    }
  }

  BM.StoryMode = StoryMode;
})();
