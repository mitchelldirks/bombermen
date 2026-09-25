// Title screen, battle setup and help screens.
(function () {
  'use strict';
  const BM = window.BM;
  const T = BM.T, W = BM.W, H = BM.H;
  const TITLE_COLORS = ['#fff8c8', '#f8d838', '#f8a020', '#f06010', '#c83010'];

  function drawBackdrop(ctx, t) {
    const S = BM.Sprites;
    const off = Math.floor((t * 12) % 32);
    for (let r = -1; r < H / T + 1; r++) {
      for (let c = -1; c < W / T + 1; c++) {
        const x = c * T + off - 16, y = r * T;
        const wall = (c + 100) % 2 === 0 && (r + 100) % 2 === 0;
        S.tile(ctx, 'battle', wall ? 'wall' : (c + r) % 2 ? 'floorAlt' : 'floor', x, y);
      }
    }
    ctx.fillStyle = 'rgba(6,6,20,0.72)';
    ctx.fillRect(0, 0, W, H);
  }

  function menuList(ctx, items, sel, x, y, gap = 13) {
    const F = BM.Font;
    items.forEach((label, i) => {
      const on = i === sel;
      if (on) {
        ctx.fillStyle = 'rgba(248,216,56,0.14)';
        ctx.fillRect(x - 60, y + i * gap - 3, 120, 11);
      }
      F.draw(ctx, label, x, y + i * gap, { align: 'center', color: on ? '#fff' : '#9090a8' });
      if (on) BM.Sprites.bomb(ctx, x - 62, y + i * gap - 6, performance.now() / 1000);
    });
  }

  // ---------------------------------------------------------------------------
  class TitleScene {
    constructor(game) {
      this.game = game;
      this.sel = 0;
      this.t = 0;
    }

    enter() {
      BM.Sound.music('title');
    }

    items() {
      return [
        'STORY MODE',
        'BATTLE MODE',
        'HOW TO PLAY',
        'SOUND: ' + (BM.Sound.soundOn ? 'ON' : 'OFF'),
        'MUSIC: ' + (BM.Sound.musicOn ? 'ON' : 'OFF'),
      ];
    }

    update(dt) {
      this.t += dt;
      const m = BM.Input.menu, n = this.items().length;
      if (m.up) { this.sel = (this.sel + n - 1) % n; BM.Sound.play('move'); }
      if (m.down) { this.sel = (this.sel + 1) % n; BM.Sound.play('move'); }
      const toggle = m.ok || m.left || m.right;
      if (m.ok && this.sel <= 2) {
        BM.Sound.play('select');
        if (this.sel === 0) this.game.setScene(new BM.StoryMode(this.game));
        else if (this.sel === 1) this.game.setScene(new BattleSetupScene(this.game));
        else this.game.setScene(new HelpScene(this.game));
      } else if (toggle && this.sel === 3) {
        BM.Sound.setSound(!BM.Sound.soundOn);
        BM.Sound.play('select');
      } else if (toggle && this.sel === 4) {
        BM.Sound.setMusic(!BM.Sound.musicOn);
        BM.Sound.play('select');
      }
    }

    draw(ctx) {
      const F = BM.Font, t = this.t;
      drawBackdrop(ctx, t);

      const bob = Math.round(Math.sin(t * 2.2) * 2);
      F.draw(ctx, 'BOMBERMAN', W / 2, 30 + bob, { scale: 5, align: 'center', rowColors: TITLE_COLORS, shadow: '#3a0a00' });
      F.draw(ctx, 'CLASSIC', W / 2, 62 + bob, { scale: 2, align: 'center', color: '#fff', shadow: '#000' });

      // Parade of characters.
      const px = ((t * 40) % (W + 120)) - 60;
      const frame = [0, 1, 0, 2][Math.floor(t * 8) % 4];
      BM.Sprites.player(ctx, Math.round(px), 84, 0, 'right', frame, 'normal');
      ['balloom', 'oneal', 'doll'].forEach((e, i) => {
        BM.Sprites.enemy(ctx, e, Math.round(px - 28 - i * 22), 86, Math.floor(t * 4 + i) % 2, 'right');
      });

      menuList(ctx, this.items(), this.sel, W / 2, 116);

      F.draw(ctx, 'HI SCORE ' + BM.pad(this.game.highScore, 7), W / 2, 196, { align: 'center', color: '#f8d838' });
      if (Math.floor(t * 2) % 2 === 0) {
        F.draw(ctx, 'ARROWS/WASD + ENTER', W / 2, 214, { align: 'center', color: '#707090' });
      }
      F.draw(ctx, 'FAN REMAKE', W / 2, 228, { align: 'center', color: '#484860' });
    }
  }

  // ---------------------------------------------------------------------------
  const SLOT_TYPES = ['human', 'bot', 'off'];
  const SLOT_LABEL = { human: 'PLAYER', bot: 'COM', off: 'OFF' };
  const LEVELS = ['easy', 'normal', 'hard'];

  class BattleSetupScene {
    constructor(game) {
      this.game = game;
      const saved = BM.store.get('battle', null);
      this.slots = saved && saved.slots ? saved.slots.slice(0, 4) : ['human', 'bot', 'bot', 'bot'];
      this.level = saved && LEVELS.includes(saved.level) ? saved.level : 'normal';
      this.sel = 5;
      this.t = 0;
      this.msgT = 0;
    }

    enter() {
      BM.Sound.music('title');
    }

    rows() {
      return 7; // P1..P4, LEVEL, START, BACK
    }

    cycleSlot(i, step) {
      let idx = SLOT_TYPES.indexOf(this.slots[i]);
      for (let n = 0; n < 3; n++) {
        idx = (idx + step + 3) % 3;
        const type = SLOT_TYPES[idx];
        const humans = this.slots.filter((s, j) => j !== i && s === 'human').length;
        if (type === 'human' && humans >= 2) continue;
        this.slots[i] = type;
        return;
      }
    }

    controlHint(i) {
      const humans = this.slots.map((s, j) => (s === 'human' ? j : -1)).filter((j) => j >= 0);
      if (this.slots[i] !== 'human') return '';
      if (humans.length === 1) return 'ALL KEYS';
      return humans[0] === i ? 'WASD+SPACE' : 'ARROWS+ENTER';
    }

    update(dt) {
      this.t += dt;
      if (this.msgT > 0) this.msgT -= dt;
      const m = BM.Input.menu, n = this.rows();
      if (m.up) { this.sel = (this.sel + n - 1) % n; BM.Sound.play('move'); }
      if (m.down) { this.sel = (this.sel + 1) % n; BM.Sound.play('move'); }
      const step = m.left ? -1 : m.right ? 1 : 0;
      if (this.sel < 4 && (step || m.ok)) {
        this.cycleSlot(this.sel, step || 1);
        BM.Sound.play('move');
      } else if (this.sel === 4 && (step || m.ok)) {
        const i = LEVELS.indexOf(this.level);
        this.level = LEVELS[(i + (step || 1) + 3) % 3];
        BM.Sound.play('move');
      } else if (this.sel === 5 && m.ok) {
        const active = this.slots.filter((s) => s !== 'off').length;
        if (active < 2) {
          this.msgT = 2;
          BM.Sound.play('back');
        } else {
          BM.store.set('battle', { slots: this.slots, level: this.level });
          BM.Sound.play('select');
          this.game.setScene(new BM.BattleMode(this.game, { slots: this.slots.slice(), level: this.level }));
        }
      } else if ((this.sel === 6 && m.ok) || m.back) {
        BM.Sound.play('back');
        this.game.toTitle();
      }
    }

    draw(ctx) {
      const F = BM.Font;
      drawBackdrop(ctx, this.t);
      F.draw(ctx, 'BATTLE SETUP', W / 2, 16, { scale: 2, align: 'center', color: '#f8d838', shadow: '#3a0a00' });

      for (let i = 0; i < 4; i++) {
        const y = 44 + i * 26, on = this.sel === i;
        ctx.fillStyle = on ? 'rgba(248,216,56,0.16)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(24, y - 4, W - 48, 22);
        if (this.slots[i] === 'off') ctx.globalAlpha = 0.35;
        BM.Sprites.head(ctx, i, 32, y);
        ctx.globalAlpha = 1;
        F.draw(ctx, 'P' + (i + 1), 54, y + 4, { color: BM.PLAYER_UI_COLORS[i] });
        const val = SLOT_LABEL[this.slots[i]];
        F.draw(ctx, (on ? '< ' : '  ') + val + (on ? ' >' : ''), 118, y + 4, { align: 'center', color: on ? '#fff' : '#b0b0c8' });
        F.draw(ctx, this.controlHint(i), W - 32, y + 4, { align: 'right', color: '#7878a0' });
      }

      const lv = this.sel === 4;
      F.draw(ctx, 'COM LEVEL', 60, 154, { color: lv ? '#fff' : '#9090a8' });
      F.draw(ctx, (lv ? '< ' : '') + this.level.toUpperCase() + (lv ? ' >' : ''), 180, 154, { align: 'center', color: lv ? '#fff' : '#b0b0c8' });

      menuList(ctx, ['START', 'BACK'], this.sel - 5, W / 2, 176);

      F.draw(ctx, 'BEST OF 3 - SUDDEN DEATH AT 0:00', W / 2, 212, { align: 'center', color: '#606080' });
      if (this.msgT > 0) {
        F.draw(ctx, 'NEED AT LEAST 2 PLAYERS!', W / 2, 224, { align: 'center', color: '#f84848' });
      }
    }
  }

  // ---------------------------------------------------------------------------
  class HelpScene {
    constructor(game) {
      this.game = game;
      this.page = 0;
      this.t = 0;
    }

    update(dt) {
      this.t += dt;
      const m = BM.Input.menu;
      if (m.left || m.right) {
        this.page = 1 - this.page;
        BM.Sound.play('move');
      }
      if (m.ok) {
        if (this.page === 0) this.page = 1;
        else this.game.toTitle();
        BM.Sound.play('select');
      }
      if (m.back) {
        BM.Sound.play('back');
        this.game.toTitle();
      }
    }

    draw(ctx) {
      const F = BM.Font;
      drawBackdrop(ctx, this.t);
      F.draw(ctx, this.page === 0 ? 'CONTROLS' : 'POWER-UPS', W / 2, 12, { scale: 2, align: 'center', color: '#f8d838', shadow: '#3a0a00' });

      if (this.page === 0) {
        const lines = [
          ['STORY', '#f8d838'],
          ['MOVE      ARROWS / WASD', '#fff'],
          ['BOMB      SPACE / X / J / ENTER', '#fff'],
          ['DETONATE  Z / K / E / SHIFT', '#fff'],
          ['', ''],
          ['BATTLE', '#f8d838'],
          ['1ST HUMAN WASD + SPACE (E)', '#fff'],
          ['2ND HUMAN ARROWS + ENTER (R.SHIFT)', '#fff'],
          ['', ''],
          ['PAUSE     P / ESC', '#fff'],
          ['TOUCH     D-PAD, A=BOMB, B=DETONATE', '#fff'],
          ['GAMEPAD   SUPPORTED (UP TO 2)', '#fff'],
          ['', ''],
          ['STORY: KILL ALL ENEMIES, THEN FIND', '#9090c0'],
          ['THE EXIT DOOR HIDDEN UNDER A BRICK.', '#9090c0'],
          ["DON'T BOMB THE DOOR OR ITEMS!", '#f88080'],
        ];
        lines.forEach(([txt, col], i) => F.draw(ctx, txt, 20, 36 + i * 11, { color: col }));
      } else {
        const items = [
          ['bomb', 'BOMB UP', '+1 BOMB AT ONCE'],
          ['fire', 'FIRE UP', '+1 BLAST RANGE'],
          ['speed', 'SPEED UP', 'WALK FASTER'],
          ['remote', 'REMOTE', 'DETONATE WITH B'],
          ['wallpass', 'WALL PASS', 'WALK THROUGH BRICKS'],
          ['bombpass', 'BOMB PASS', 'WALK OVER BOMBS'],
          ['flamepass', 'FLAME PASS', 'IMMUNE TO BLASTS'],
          ['mystery', 'MYSTERY', 'INVINCIBLE FOR A WHILE'],
          ['kick', 'KICK', 'WALK INTO BOMBS (BATTLE)'],
        ];
        items.forEach(([icon, name, desc], i) => {
          const y = 34 + i * 20;
          BM.Sprites.itemIcon(ctx, icon, 20, y);
          F.draw(ctx, name, 42, y + 2, { color: '#f8d838' });
          F.draw(ctx, desc, 42, y + 10, { color: '#c0c0d8' });
        });
      }
      F.draw(ctx, '< ' + (this.page + 1) + '/2 >', W / 2, 226, { align: 'center', color: '#707090' });
    }
  }

  BM.TitleScene = TitleScene;
  BM.BattleSetupScene = BattleSetupScene;
  BM.HelpScene = HelpScene;
})();
