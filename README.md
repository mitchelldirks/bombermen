# Bomberman Classic (web)

Remake Bomberman klasik berbasis web — Vanilla JS + Canvas, tanpa build step dan tanpa aset eksternal.
Semua sprite pixel art digambar lewat kode, semua suara & musik disintesis lewat WebAudio.

## Cara main

Buka `index.html` langsung di browser, atau jalankan server lokal:

```bash
python -m http.server 8765
```

lalu buka http://localhost:8765

## Mode

- **Story** — stage prosedural tanpa batas (peta 31x13, kamera scroll). Kalahkan semua musuh, lalu
  temukan pintu keluar yang tersembunyi di bawah bata. Hati-hati: meledakkan pintu atau power-up
  akan memanggil gelombang musuh baru. Waktu habis = Pontan menyerbu.
- **Battle** — 4 slot (Player / COM / Off, maks 2 manusia), best of 3. Saat timer 0:00, blok mulai
  jatuh berputar dari pinggir (sudden death).

## Kontrol

| Aksi       | Story                     | Battle P1       | Battle P2              |
|------------|---------------------------|-----------------|------------------------|
| Gerak      | Panah / WASD              | WASD            | Panah                  |
| Bom        | Space / X / J / Enter     | Space           | Enter                  |
| Detonate   | Z / K / E / Shift         | E               | Shift kanan            |
| Pause      | P / Esc                   | P / Esc         | P / Esc                |

Touch (HP): D-pad, **A** = bom, **B** = detonate, **II** = pause. Gamepad didukung (maks 2).

## Struktur

```
js/core.js     konstanta, util, bitmap font 3x5
js/audio.js    SFX + sequencer musik chiptune (WebAudio)
js/sprites.js  generator pixel art (tile, pemain, musuh, bom, api, item)
js/input.js    keyboard / touch / gamepad
js/world.js    grid, gerak + corner-sliding, bom, ledakan, kick, sudden death
js/player.js   bomber (manusia / bot)
js/enemy.js    musuh story (Balloom … Pontan)
js/bot.js      AI battle (hindari ledakan, hancurkan bata, buru lawan)
js/story.js    mode story
js/battle.js   mode battle
js/menus.js    title, battle setup, how to play
js/main.js     game loop, scene, pause, scaling
```
