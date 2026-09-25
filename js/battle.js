// Battle mode: up to 4 bombers (humans / bots), best of 3, sudden death.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T, W = BM.W, HUD = BM.HUD_H;
  const COLS = 15, ROWS = 13;
  const OX = (W - COLS * T) / 2;
  const ROUND_TIME = 120;
  const DROP_EVERY = 0.14;
  const WINS_NEEDED = 2;
  const SPAWNS = [{ c: 1, r: 1 }, { c: 13, r: 11 }, { c: 13, r: 1 }, { c: 1, r: 11 }];
  const ITEM_TABLE = { bomb: 32, fire: 32, speed: 16, kick: 12 };

  // Clockwise spiral over the arena interior, outside-in.
  function spiral() {
    const out = [];
    let top = 1, left = 1, bottom = ROWS - 2, right = COLS - 2;
    while (top <= bottom && left <= right) {
      for (let c = left; c <= right; c++) out.push({ c, r: top });
      for (let r = top + 1; r <= bottom; r++) out.push({ c: right, r });
      if (top < bottom) for (let c = right - 1; c >= left; c--) out.push({ c, r: bottom });
      if (left < right) for (let r = bottom - 1; r > top; r--) out.push({ c: left, r });
      top++; left++; bottom--; right--;
    }
    // The innermost 5x3 area is left open at first so survivors must fight;
    // it only fills in (slowly) if the stalemate lasts too long.
    return { main: out.slice(0, out.length - 15), final: out.slice(out.length - 15) };
  }
  const FINAL_DELAY = 15;
  const FINAL_DROP_EVERY = 0.6;

  class BattleMode {
    constructor(game, cfg) {
      this.game = game;
      this.cfg = cfg;
      this.pausable = true;
      this.wins = [0, 0, 0, 0];
      this.round = 0;
      const humans = cfg.slots.map((s, i) => (s === 'human' ? i : -1)).filter((i) => i >= 0);
      this.controls = {};
      if (humans.length === 1) this.controls[humans[0]] = 'any';
      else humans.forEach((i, n) => { this.controls[i] = n === 0 ? 'A' : 'B'; });
      this.startRound();
    }

    canPause() {
      return this.phase === 'play' || this.phase === 'intro';
    }

    label(i) {
      return this.cfg.slots[i] === 'human' ? 'P' + (i + 1) : 'COM';
    }

    startRound() {
      this.round++;
      const w = new BM.World(COLS, ROWS, 'battle');
      w.buildFrame();
      const safe = new Set();
      for (const s of SPAWNS) {
        safe.add(w.k(s.c, s.r));
        safe.add(w.k(s.c + (s.c === 1 ? 1 : -1), s.r));
        safe.add(w.k(s.c, s.r + (s.r === 1 ? 1 : -1)));
      }
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (w.tile(c, r) !== BM.EMPTY || safe.has(w.k(c, r))) continue;
          if (Math.random() < 0.72) {
            w.setTile(c, r, BM.BRICK);
            if (Math.random() < 0.32) w.hidden.set(w.k(c, r), BM.weighted(ITEM_TABLE));
          }
        }
      }

      this.players = [];
      this.cfg.slots.forEach((type, i) => {
        if (type === 'off') return;
        const s = SPAWNS[i];
        const p = new BM.Player(w, {
          c: s.c, r: s.r, slot: i, color: i, bombs: 1, range: 2, maxSpeed: 4, quietSteps: type === 'bot',
        });
        if (type === 'bot') p.brain = new BM.BotBrain(p, w, this.cfg.level);
        else p.ctrl = this.controls[i];
        this.players.push(p);
      });
      w.actors = this.players.slice();
      w.onEvent = (n, d) => this.onEvent(n, d);
      this.world = w;
      this.time = ROUND_TIME;
      this.sudden = false;
      this.dropList = null;
      this.dropT = 0;
      this.endT = -1;
      this.winner = null;
      this.phase = 'intro';
      this.phaseT = 0;
      this.sel = 0;
      BM.Sound.music(null);
      BM.Sound.play('start');
    }

    onEvent(name, d) {
      const S = BM.Sound;
      switch (name) {
        case 'bomb': S.play('bomb'); break;
        case 'explode': S.play('explode'); this.game.shake(3); break;
        case 'pickup': S.play('powerup'); break;
        case 'itemBurn': S.play('burn'); break;
        case 'kick': S.play('kick'); break;
        case 'playerDie': S.play('die'); break;
        case 'crush':
          S.play('crush');
          for (const p of this.players) {
            if (p.alive && this.world.overlapsTile(p, d.c, d.r, 3)) p.kill('crush', true);
          }
          break;
      }
    }

    update(dt) {
      this.phaseT += dt;
      const menu = BM.Input.menu;
      switch (this.phase) {
        case 'intro':
          if (this.phaseT > 2.2) {
            this.phase = 'play';
            this.phaseT = 0;
            BM.Sound.music('battle');
          }
          break;
        case 'play':
          this.updatePlay(dt);
          break;
        case 'roundEnd':
          this.stepWorld(dt, true);
          if (this.phaseT > 3.5 || (this.phaseT > 1.2 && menu.ok)) {
            const champ = this.wins.findIndex((n) => n >= WINS_NEEDED);
            if (champ >= 0) {
              this.phase = 'matchEnd';
              this.phaseT = 0;
              this.champion = champ;
              BM.Sound.play('win');
            } else {
              this.startRound();
            }
          }
          break;
        case 'matchEnd':
          if (this.phaseT < 1) break;
          if (menu.up || menu.down) {
            this.sel = 1 - this.sel;
            BM.Sound.play('move');
          }
          if (menu.ok) {
            BM.Sound.play('select');
            if (this.sel === 0) {
              this.wins = [0, 0, 0, 0];
              this.round = 0;
              this.startRound();
            } else {
              this.game.toTitle();
            }
          } else if (menu.back) {
            this.game.toTitle();
          }
          break;
      }
    }

    stepWorld(dt, frozen) {
      for (const p of this.players) {
        let ctrl = { dir: null, bomb: false, det: false };
        if (!frozen && p.alive) ctrl = p.brain ? p.brain.update(dt, this.players) : BM.Input.player(p.ctrl);
        p.update(dt, ctrl);
      }
      this.world.update(dt);
      this.world.checkFlames();
    }

    updatePlay(dt) {
      if (this.sudden) this.updateSuddenDeath(dt);
      this.stepWorld(dt, false);

      if (!this.sudden) {
        this.time -= dt;
        if (this.time <= 0) {
          this.time = 0;
          this.sudden = true;
          this.hurryT = 0;
          const sp = spiral();
          this.dropList = sp.main;
          this.finalList = sp.final;
          this.finalT = 0;
          this.dropEvery = DROP_EVERY;
          BM.Sound.play('hurry');
        }
      }

      const alive = this.players.filter((p) => p.alive);
      if (alive.length <= 1 && this.endT < 0) this.endT = 0;
      if (this.endT >= 0) {
        this.endT += dt;
        if (this.endT > 1.4) {
          const still = this.players.filter((p) => p.alive);
          this.winner = still.length === 1 ? still[0].slot : -1;
          if (this.winner >= 0) this.wins[this.winner]++;
          this.phase = 'roundEnd';
          this.phaseT = 0;
          BM.Sound.music(null);
          BM.Sound.play(this.winner >= 0 ? 'clear' : 'gameover');
        }
      }
    }

    updateSuddenDeath(dt) {
      const w = this.world;
      this.hurryT += dt;
      // The last bomber standing is spared: stop the walls closing in.
      if (this.players.filter((p) => p.alive).length <= 1) return;
      // Stalemate in the center: slowly fill the last area too.
      if (!this.dropList.length && this.finalList) {
        this.finalT += dt;
        if (this.finalT > FINAL_DELAY) {
          this.dropList = this.finalList;
          this.finalList = null;
          this.dropEvery = FINAL_DROP_EVERY;
          this.dropT = 0;
          this.hurryT = 0;
          BM.Sound.play('hurry');
        }
      }
      this.dropT += dt;
      while (this.dropT >= this.dropEvery && this.dropList.length) {
        this.dropT -= this.dropEvery;
        let next = this.dropList.shift();
        while (next && w.tile(next.c, next.r) === BM.WALL) next = this.dropList.shift();
        if (next) w.dropBlock(next.c, next.r);
      }
      // Tell bots which tiles are about to be crushed.
      const hints = [];
      let t = this.dropEvery - this.dropT + 0.45;
      for (let i = 0; i < Math.min(8, this.dropList.length); i++) {
        hints.push({ c: this.dropList[i].c, r: this.dropList[i].r, time: t });
        t += this.dropEvery;
      }
      for (const d of w.drops) hints.push({ c: d.c, r: d.r, time: 0 });
      for (const p of this.players) if (p.brain) p.brain.dropHints = hints;
    }

    // ---- rendering ----------------------------------------------------------
    draw(ctx) {
      const F = BM.Font, w = this.world;
      ctx.fillStyle = '#10301c';
      ctx.fillRect(0, HUD, W, BM.H - HUD);
      w.draw(ctx, OX, HUD, W);
      const actors = this.players.slice().sort((a, b) => a.y - b.y);
      for (const p of actors) p.draw(ctx, OX, HUD);
      w.drawDrops(ctx, OX, HUD);
      this.drawHud(ctx);

      if (this.phase === 'intro') {
        const go = this.phaseT > 1.5;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 108, W, 36);
        if (go) F.draw(ctx, 'GO!', W / 2, 116, { scale: 4, align: 'center', color: '#f8d838', shadow: '#000' });
        else F.draw(ctx, 'ROUND ' + this.round, W / 2, 118, { scale: 3, align: 'center', color: '#fff', shadow: '#000' });
      }

      if (this.sudden && this.hurryT < 2.5 && Math.floor(this.hurryT * 4) % 2 === 0) {
        F.draw(ctx, 'HURRY UP!', W / 2, 120, { scale: 3, align: 'center', color: '#f84848', shadow: '#000' });
      }

      if (this.phase === 'roundEnd') this.drawRoundEnd(ctx);
      if (this.phase === 'matchEnd') this.drawMatchEnd(ctx);
    }

    drawScoreboard(ctx, y) {
      const F = BM.Font;
      const active = this.players.map((p) => p.slot);
      const gap = 56, x0 = W / 2 - ((active.length - 1) * gap) / 2;
      active.forEach((slot, i) => {
        const x = x0 + i * gap;
        BM.Sprites.head(ctx, slot, x - 8, y);
        F.draw(ctx, this.label(slot), x, y + 15, { align: 'center', color: BM.PLAYER_UI_COLORS[slot] });
        for (let n = 0; n < WINS_NEEDED; n++) {
          ctx.fillStyle = n < this.wins[slot] ? '#f8d838' : '#404050';
          ctx.fillRect(x - 7 + n * 9, y + 24, 6, 6);
        }
      });
    }

    drawRoundEnd(ctx) {
      const F = BM.Font;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 70, W, 110);
      if (this.winner >= 0) {
        const name = this.label(this.winner) === 'COM' ? 'COM ' + (this.winner + 1) : 'PLAYER ' + (this.winner + 1);
        F.draw(ctx, name + ' WINS!', W / 2, 84, { scale: 2, align: 'center', color: BM.PLAYER_UI_COLORS[this.winner], shadow: '#000' });
      } else {
        F.draw(ctx, 'DRAW GAME', W / 2, 84, { scale: 2, align: 'center', color: '#fff', shadow: '#000' });
      }
      this.drawScoreboard(ctx, 116);
    }

    drawMatchEnd(ctx) {
      const F = BM.Font, c = this.champion;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, HUD, W, BM.H - HUD);
      F.draw(ctx, 'CHAMPION', W / 2, 56, { scale: 3, align: 'center', color: '#f8d838', shadow: '#503800' });
      const bounce = Math.abs(Math.sin(this.phaseT * 5)) * 6;
      ctx.save();
      ctx.translate(W / 2 - 16, 86 - bounce);
      ctx.scale(2, 2);
      BM.Sprites.player(ctx, 0, 0, c, 'down', 0, 'normal');
      ctx.restore();
      const name = this.label(c) === 'COM' ? 'COM ' + (c + 1) : 'PLAYER ' + (c + 1);
      F.draw(ctx, name, W / 2, 128, { scale: 2, align: 'center', color: BM.PLAYER_UI_COLORS[c] });
      this.drawScoreboard(ctx, 148);
      if (this.phaseT > 1) {
        ['REMATCH', 'TITLE'].forEach((t, i) => {
          const y = 194 + i * 12;
          const on = this.sel === i;
          F.draw(ctx, (on ? '> ' : '  ') + t, W / 2 - 22, y, { color: on ? '#fff' : '#888' });
        });
      }
    }

    drawHud(ctx) {
      const F = BM.Font;
      ctx.fillStyle = '#1c1c34';
      ctx.fillRect(0, 0, W, HUD);
      ctx.fillStyle = '#3a3a60';
      ctx.fillRect(0, HUD - 2, W, 2);
      const xs = [8, 58, 170, 220];
      for (let i = 0; i < 4; i++) {
        const x = xs[i];
        if (this.cfg.slots[i] === 'off') {
          F.draw(ctx, '--', x + 8, 12, { align: 'center', color: '#44445a' });
          continue;
        }
        const p = this.players.find((q) => q.slot === i);
        if (p && !p.alive) ctx.globalAlpha = 0.35;
        BM.Sprites.head(ctx, i, x, 4);
        ctx.globalAlpha = 1;
        F.draw(ctx, this.label(i), x + 8, 20, { align: 'center', color: BM.PLAYER_UI_COLORS[i] });
        F.draw(ctx, String(this.wins[i]), x + 22, 8, { scale: 2, color: '#f8d838' });
      }
      const t = Math.ceil(this.time);
      const txt = this.sudden ? '0:00' : Math.floor(t / 60) + ':' + BM.pad(t % 60, 2);
      const warn = !this.sudden && t <= 30 && Math.floor(this.time * 4) % 2 === 0;
      ctx.fillStyle = '#000';
      ctx.fillRect(W / 2 - 22, 6, 44, 18);
      F.draw(ctx, txt, W / 2, 9, { scale: 2, align: 'center', color: this.sudden || warn ? '#f84848' : '#fff' });
    }
  }

  BM.BattleMode = BattleMode;
})();
