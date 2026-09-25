// Boot, main loop, scene switching, pause menu and screen scaling.
(function () {
  'use strict';
  const BM = window.BM;
  const W = BM.W, H = BM.H;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const game = {
    scene: null,
    paused: false,
    pauseSel: 0,
    shakeT: 0,
    shakeMag: 0,
    highScore: BM.store.get('highscore', 0),

    setScene(s) {
      this.scene = s;
      this.paused = false;
      if (s.enter) s.enter();
    },

    toTitle() {
      this.setScene(new BM.TitleScene(this));
    },

    shake(mag) {
      this.shakeMag = Math.max(this.shakeMag, mag);
      this.shakeT = 0.18;
    },

    // Returns true when the score is a new record.
    submitScore(score) {
      if (score <= this.highScore) return false;
      this.highScore = score;
      BM.store.set('highscore', score);
      return true;
    },
  };
  BM.game = game;

  function canPause() {
    const s = game.scene;
    return s && s.pausable && (!s.canPause || s.canPause());
  }

  function step(dt) {
    BM.Input.beginStep();
    const m = BM.Input.menu;

    if (game.paused) {
      if (m.up || m.down) {
        game.pauseSel = 1 - game.pauseSel;
        BM.Sound.play('move');
      }
      if (m.pause || (m.ok && game.pauseSel === 0) || (m.back && !m.pause)) {
        game.paused = false;
        BM.Sound.play('pause');
      } else if (m.ok && game.pauseSel === 1) {
        BM.Sound.play('back');
        game.toTitle();
      }
      return;
    }

    if (m.pause && canPause()) {
      game.paused = true;
      game.pauseSel = 0;
      BM.Sound.play('pause');
      return;
    }

    if (game.shakeT > 0) {
      game.shakeT -= dt;
      if (game.shakeT <= 0) game.shakeMag = 0;
    }
    game.scene.update(dt);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (game.shakeT > 0 && !game.paused) {
      const m = game.shakeMag * (game.shakeT / 0.18);
      ctx.translate(Math.round((Math.random() - 0.5) * m), Math.round((Math.random() - 0.5) * m));
    }
    game.scene.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (game.paused) {
      const F = BM.Font;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      F.draw(ctx, 'PAUSED', W / 2, 84, { scale: 3, align: 'center', color: '#f8d838', shadow: '#000' });
      ['RESUME', 'QUIT TO TITLE'].forEach((t, i) => {
        const on = game.pauseSel === i;
        F.draw(ctx, (on ? '> ' : '  ') + t, W / 2 - 30, 124 + i * 14, { color: on ? '#fff' : '#888' });
      });
    }
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let steps = 0;
    while (acc >= BM.STEP && steps < 8) {
      step(BM.STEP);
      acc -= BM.STEP;
      steps++;
    }
    if (steps === 8) acc = 0;
    render();
    requestAnimationFrame(frame);
  }

  function resize() {
    const stage = document.getElementById('stage');
    const w = stage.clientWidth - 16, h = stage.clientHeight - 16;
    let s = Math.min(w / W, h / H);
    if (s >= 2) s = Math.floor(s);
    s = Math.max(s, 0.5);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
  }

  // Auto-pause when the tab loses focus during play.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && canPause() && !game.paused) {
      game.paused = true;
      game.pauseSel = 0;
    }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  BM.Input.init();
  resize();
  game.toTitle();
  requestAnimationFrame(frame);
})();
