"use strict";
/* HOPPER — a tiny Tron-flavoured lane runner for hoptools.studio
   Pseudo-3D canvas renderer, three lanes, procedural WebAudio music. */
(() => {
  // ---------------------------------------------------------------- DOM
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const previewCanvas = document.getElementById("preview");
  const pctx = previewCanvas.getContext("2d");

  const el = (id) => document.getElementById(id);
  const screens = {
    setup: el("screen-setup"),
    pause: el("screen-pause"),
    over: el("screen-over"),
  };
  const hud = el("hud");
  const hudScore = el("hud-score");
  const hudBest = el("hud-best");
  const hudName = el("hud-name");
  const powerFill = el("power-fill");
  const powerLabel = el("power-label");
  const blazePips = Array.from(el("blaze-pips").children);

  // ---------------------------------------------------------------- config
  const LANE_X = [-2.3, 0, 2.3];
  const LANE_EDGE = 3.45; // outer edge of track
  const CAM_DIST = 6;
  const CAM_H = 3.1;
  const DRAW_DIST = 95;
  const SPAWN_Z = 88;
  const GRID_STEP = 4;
  const GRAVITY = 23;
  const JUMP_V = 8.2;
  const BLAZE_AT = 0.92;
  const MAX_OBLITERATIONS = 5;

  const STORE = {
    best: "hopper.best",
    muted: "hopper.muted",
    colors: "hopper.colors",
    name: "hopper.name",
  };

  // colour options: [label, swatches[4]]
  const PARTS = [
    { key: "earL", label: "LEFT EAR", options: ["#D65A4F", "#5F6F8F", "#4FC3F7", "#E8B44F"] },
    { key: "earR", label: "RIGHT EAR", options: ["#5F6F8F", "#D65A4F", "#4FC3F7", "#E8B44F"] },
    { key: "border", label: "BORDER", options: ["#F0EDE8", "#4FC3F7", "#D65A4F", "#A78BFA"] },
    { key: "face", label: "FACE", options: ["#3A3A3A", "#5F6F8F", "#8A6F5C", "#D9D2C5"] },
  ];

  // ---------------------------------------------------------------- state
  let W = 0, H = 0, DPR = 1;
  let cx = 0, horizonY = 0, unit = 0;

  let state = "setup"; // setup | playing | paused | over
  let player = loadColors();
  let playerName = localStorage.getItem(STORE.name) || "Hopper";
  let best = parseFloat(localStorage.getItem(STORE.best)) || 0;

  const game = {};
  resetGame();

  function resetGame() {
    Object.assign(game, {
      t: 0, // run time = score
      dist: 0,
      speed: 16,
      power: 0,
      holding: false,
      blazeUsed: 0,
      wasBlaze: false,
      lane: 1,
      x: 0,
      y: 0,
      vy: 0,
      onGround: true,
      bob: 0,
      lean: 0,
      obstacles: [],
      shards: [],
      streaks: [],
      trail: [],
      sinceSpawn: 0,
      lastOpenLane: 1,
      destroyedTotal: 0,
      topSpeed: 0,
      flash: 0,
      flashColor: "255,255,255",
      shake: 0,
    });
  }

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }
  function shade(hex, f) {
    const c = hexToRgb(hex).map((v) => clamp(Math.round(v * f), 0, 255));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  // power colour: blue -> white -> red
  function powerColor(p) {
    return p < 0.5 ? mix("#4FC3F7", "#FFFFFF", p * 2) : mix("#FFFFFF", "#D65A4F", (p - 0.5) * 2);
  }

  function loadColors() {
    const def = { earL: "#D65A4F", earR: "#5F6F8F", border: "#F0EDE8", face: "#3A3A3A" };
    try {
      return { ...def, ...JSON.parse(localStorage.getItem(STORE.colors) || "{}") };
    } catch {
      return def;
    }
  }

  // ---------------------------------------------------------------- audio
  const audio = {
    ctx: null,
    master: null,
    musicGain: null,
    filter: null,
    hatGain: null,
    muted: localStorage.getItem(STORE.muted) === "1",
    nextNote: 0,
    step: 0,
    timer: null,

    ensure() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 900;
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.filter);
      this.filter.connect(this.master);

      this.hatGain = this.ctx.createGain();
      this.hatGain.gain.value = 0;
      this.hatGain.connect(this.master);
    },

    startMusic() {
      this.ensure();
      if (!this.ctx || this.timer) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.nextNote = this.ctx.currentTime + 0.05;
      this.step = 0;
      this.timer = setInterval(() => this.schedule(), 90);
    },
    stopMusic() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    },

    schedule() {
      if (!this.ctx) return;
      const SIXTEENTH = 60 / 116 / 4;
      // A-minor synthwave-ish loop
      const bass = [55, 0, 55, 0, 82.4, 0, 55, 0, 65.4, 0, 65.4, 0, 49, 0, 61.7, 0];
      const arp = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6, 261.6, 329.6, 440, 329.6, 246.9, 293.7, 370, 293.7];
      while (this.nextNote < this.ctx.currentTime + 0.18) {
        const i = this.step % 16;
        if (bass[i]) this.note(bass[i], this.nextNote, SIXTEENTH * 1.9, "sawtooth", 0.5, this.musicGain);
        this.note(arp[i], this.nextNote, SIXTEENTH * 0.9, "square", 0.10, this.musicGain);
        if (i % 4 === 2) this.hat(this.nextNote);
        this.nextNote += SIXTEENTH;
        this.step++;
      }
    },

    note(freq, t, dur, type, vol, dest) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(dest || this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    hat(t) {
      const len = 0.06;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6000;
      s.connect(hp);
      hp.connect(this.hatGain);
      s.start(t);
    },

    // intensity 0..1 follows power: opens the filter, brings in hats
    setIntensity(p) {
      if (!this.ctx) return;
      this.filter.frequency.setTargetAtTime(900 + p * 5200, this.ctx.currentTime, 0.15);
      this.hatGain.gain.setTargetAtTime(p * 0.22, this.ctx.currentTime, 0.2);
    },

    sweep(f0, f1, dur, type, vol) {
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    noise(dur, vol, freq) {
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      s.connect(f);
      f.connect(g);
      g.connect(this.master);
      s.start(t);
    },

    jump() { this.sweep(280, 660, 0.18, "sine", 0.25); },
    land() { this.noise(0.08, 0.12, 500); },
    blazeOn() { this.sweep(440, 1320, 0.3, "triangle", 0.22); },
    destroy() { this.noise(0.3, 0.5, 1400); this.sweep(700, 90, 0.25, "sawtooth", 0.2); },
    powerDown() { this.sweep(880, 220, 0.4, "triangle", 0.15); },
    crash() { this.noise(0.5, 0.6, 300); this.sweep(160, 38, 0.7, "sine", 0.5); },
    click() { this.sweep(700, 900, 0.06, "sine", 0.12); },

    toggleMute() {
      this.ensure();
      this.muted = !this.muted;
      localStorage.setItem(STORE.muted, this.muted ? "1" : "0");
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
      syncMuteButtons();
    },
  };

  function syncMuteButtons() {
    el("btn-mute").classList.toggle("off", audio.muted);
    el("btn-mute2").textContent = audio.muted ? "SOUND: OFF" : "SOUND: ON";
  }

  // ---------------------------------------------------------------- sizing
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const navH = document.querySelector("nav") ? document.querySelector("nav").offsetHeight : 56;
    W = window.innerWidth;
    H = window.innerHeight - navH;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------- projection
  let camX = 0, shakeX = 0, shakeY = 0;
  function proj(x, y, z) {
    const s = unit / (z + CAM_DIST);
    return {
      x: cx + shakeX + (x - camX) * s,
      y: horizonY + shakeY + (CAM_H - y) * s,
      s,
    };
  }

  // ---------------------------------------------------------------- the rabbit
  // Back view, drawn with ground point at (px, py); S = overall scale in px.
  function drawHopper(g, px, py, S, c, opts) {
    const { bob = 0, lean = 0, air = 0, blaze = 0, t = 0 } = opts || {};
    g.save();
    g.translate(px, py);
    g.rotate(lean * 0.3);
    const squash = air > 0 ? 1 + Math.min(0.18, air * 0.02) : 1 - Math.abs(Math.sin(bob)) * 0.05;
    g.scale(2 - squash, squash);

    const lw = Math.max(1.5, S * 0.045);
    g.lineWidth = lw;
    g.strokeStyle = c.border;
    g.shadowColor = blaze > 0 ? powerColor(1) : c.border;
    g.shadowBlur = S * (0.08 + blaze * 0.28);
    g.lineJoin = "round";

    const hopUp = Math.abs(Math.sin(bob)) * S * 0.05;

    // feet (peek out at the sides, alternate with stride)
    const stride = Math.sin(bob * 2) * S * 0.05;
    g.fillStyle = shade(c.face, 0.8);
    g.beginPath();
    g.ellipse(-S * 0.3, -S * 0.04 + stride, S * 0.13, S * 0.07, 0.2, 0, Math.PI * 2);
    g.ellipse(S * 0.3, -S * 0.04 - stride, S * 0.13, S * 0.07, -0.2, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    // ears (drawn behind head, trail slightly against the lean)
    const earSway = -lean * 0.35 + Math.sin(t * 7) * 0.04;
    const ear = (side, color) => {
      g.save();
      g.translate(side * S * 0.15, -S * 0.62 - hopUp);
      g.rotate(side * 0.16 + earSway);
      g.fillStyle = color;
      roundRect(g, -S * 0.085, -S * 0.55, S * 0.17, S * 0.58, S * 0.085);
      g.fill();
      g.stroke();
      g.fillStyle = shade(color, 0.72);
      roundRect(g, -S * 0.045, -S * 0.48, S * 0.09, S * 0.44, S * 0.05);
      g.fill();
      g.restore();
    };
    ear(-1, c.earL);
    ear(1, c.earR);

    // body
    g.fillStyle = c.face;
    g.beginPath();
    g.ellipse(0, -S * 0.3 - hopUp * 0.5, S * 0.36, S * 0.33, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    // head
    g.fillStyle = shade(c.face, 1.12);
    g.beginPath();
    g.arc(0, -S * 0.62 - hopUp, S * 0.26, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    // tail
    g.shadowBlur = S * 0.12;
    g.fillStyle = mix(c.face, "#FFFFFF", 0.75);
    g.beginPath();
    g.arc(0, -S * 0.14, S * 0.09, 0, Math.PI * 2);
    g.fill();

    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---------------------------------------------------------------- setup UI
  function buildSwatches() {
    const wrap = el("swatch-rows");
    wrap.innerHTML = "";
    for (const part of PARTS) {
      const row = document.createElement("div");
      row.className = "swatch-row";
      const label = document.createElement("div");
      label.className = "field-label";
      label.textContent = part.label;
      const swatches = document.createElement("div");
      swatches.className = "swatches";
      for (const color of part.options) {
        const b = document.createElement("button");
        b.className = "swatch" + (player[part.key] === color ? " selected" : "");
        b.style.background = color;
        b.title = color;
        b.addEventListener("click", () => {
          player[part.key] = color;
          localStorage.setItem(STORE.colors, JSON.stringify(player));
          swatches.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
          b.classList.add("selected");
          audio.click();
        });
        swatches.appendChild(b);
      }
      row.appendChild(label);
      row.appendChild(swatches);
      wrap.appendChild(row);
    }
  }

  function renderPreview(t) {
    const w = previewCanvas.width, h = previewCanvas.height;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, w, h);
    const bob = t * 4;
    drawHopper(pctx, w / 2, h * 0.88, 150, player, { bob, t, lean: Math.sin(t * 0.7) * 0.12 });
  }

  // ---------------------------------------------------------------- input
  let mouseLane = 1;
  canvas.addEventListener("mousemove", (e) => {
    const f = e.clientX / W;
    mouseLane = f < 0.38 ? 0 : f > 0.62 ? 2 : 1;
    if (state === "playing") game.lane = mouseLane;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || state !== "playing") return;
    game.holding = true;
    doJump();
  });
  window.addEventListener("mouseup", () => (game.holding = false));
  window.addEventListener("blur", () => {
    game.holding = false;
    if (state === "playing") setPause(true);
  });

  // touch
  canvas.addEventListener("touchstart", (e) => {
    if (state !== "playing") return;
    e.preventDefault();
    game.holding = true;
    doJump();
    touchLane(e);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (state !== "playing") return;
    e.preventDefault();
    touchLane(e);
  }, { passive: false });
  canvas.addEventListener("touchend", () => (game.holding = false));
  function touchLane(e) {
    const f = e.touches[0].clientX / W;
    game.lane = f < 0.38 ? 0 : f > 0.62 ? 2 : 1;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key;
    if (e.target === el("name-input")) {
      if (k === "Enter") startRun();
      return;
    }
    if (k === "m" || k === "M") return audio.toggleMute();
    if (state === "playing") {
      if (k === "ArrowLeft" || k === "a" || k === "A") game.lane = Math.max(0, game.lane - 1);
      else if (k === "ArrowRight" || k === "d" || k === "D") game.lane = Math.min(2, game.lane + 1);
      else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); doJump(); }
      else if (k === "Shift") game.holding = true;
      else if (k === "p" || k === "P" || k === "Escape") setPause(true);
    } else if (state === "paused") {
      if (k === "p" || k === "P" || k === "Escape") setPause(false);
    } else if (state === "over") {
      if (k === " " || k === "Enter") { e.preventDefault(); startRun(); }
    } else if (state === "setup") {
      if (k === "Enter" && document.activeElement !== el("name-input")) startRun();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") game.holding = false;
  });

  function doJump() {
    if (!game.onGround) return;
    game.vy = JUMP_V;
    game.onGround = false;
    audio.jump();
  }

  // ---------------------------------------------------------------- flow
  function show(name) {
    for (const k in screens) screens[k].classList.toggle("active", k === name);
    hud.classList.toggle("active", name === null || name === "pause");
  }

  function startRun() {
    playerName = el("name-input").value.trim() || "Hopper";
    localStorage.setItem(STORE.name, playerName);
    hudName.textContent = playerName;
    resetGame();
    state = "playing";
    show(null);
    audio.ensure();
    audio.startMusic();
    audio.click();
  }

  function setPause(on) {
    if (on && state === "playing") {
      state = "paused";
      show("pause");
      if (audio.ctx) audio.ctx.suspend();
    } else if (!on && state === "paused") {
      state = "playing";
      show(null);
      if (audio.ctx) audio.ctx.resume();
    }
  }

  function gameOver() {
    state = "over";
    game.flash = 1;
    game.flashColor = "214,90,79";
    audio.crash();
    audio.stopMusic();
    audio.setIntensity(0);
    const score = game.t;
    const isBest = score > best;
    if (isBest) {
      best = score;
      localStorage.setItem(STORE.best, String(best));
    }
    el("final-score").textContent = score.toFixed(1);
    el("final-stats").innerHTML =
      (isBest ? `<div class="new-best">★ NEW BEST ★</div>` : `<div>BEST ${best.toFixed(1)}</div>`) +
      `<div>OBLITERATED ${game.destroyedTotal} · TOP SPEED ${Math.round(game.topSpeed * 3.6)} KM/H</div>`;
    setTimeout(() => show("over"), 350);
  }

  el("btn-start").addEventListener("click", startRun);
  el("btn-retry").addEventListener("click", startRun);
  el("btn-resume").addEventListener("click", () => setPause(false));
  el("btn-restart").addEventListener("click", () => { setPause(false); startRun(); });
  el("btn-quit").addEventListener("click", () => {
    if (audio.ctx) audio.ctx.resume();
    audio.stopMusic();
    state = "setup";
    resetGame();
    show("setup");
  });
  el("btn-menu").addEventListener("click", () => {
    audio.stopMusic();
    state = "setup";
    resetGame();
    show("setup");
  });
  el("btn-pause").addEventListener("click", () => setPause(true));
  el("btn-mute").addEventListener("click", () => audio.toggleMute());
  el("btn-mute2").addEventListener("click", () => audio.toggleMute());

  // ---------------------------------------------------------------- spawning
  function difficulty() {
    return clamp(game.t / 100, 0, 1);
  }

  function spawnPattern() {
    const d = difficulty();
    const r = Math.random();
    const lanes = [0, 1, 2];

    if (r < 0.42) {
      // single low block — jump it
      const lane = lanes[(Math.random() * 3) | 0];
      addObstacle(lane, "block");
      game.lastOpenLane = lane === game.lastOpenLane ? clamp(lane + (lane === 2 ? -1 : 1), 0, 2) : game.lastOpenLane;
    } else if (r < 0.72) {
      // single tall gate — go around it
      const lane = lanes[(Math.random() * 3) | 0];
      addObstacle(lane, "gate");
      game.lastOpenLane = lane === game.lastOpenLane ? clamp(lane + (lane === 2 ? -1 : 1), 0, 2) : game.lastOpenLane;
    } else if (r < 0.72 + 0.18 + d * 0.06) {
      // two lanes blocked, one open — keep the open lane reachable
      const candidates = lanes.filter((l) => Math.abs(l - game.lastOpenLane) <= 1);
      const open = candidates[(Math.random() * candidates.length) | 0];
      for (const l of lanes) {
        if (l === open) continue;
        addObstacle(l, Math.random() < 0.5 + d * 0.3 ? "gate" : "block");
      }
      game.lastOpenLane = open;
    } else {
      // full wall of low blocks — jump anywhere (only once it has warmed up)
      if (d < 0.25) {
        addObstacle((Math.random() * 3) | 0, "block");
      } else {
        for (const l of lanes) addObstacle(l, "block");
      }
    }
  }

  function addObstacle(lane, type) {
    game.obstacles.push({
      lane,
      z: SPAWN_Z + rand(0, 4),
      type,
      w: 1.9,
      h: type === "gate" ? 2.9 : 1.0,
      d: 1.2,
      hit: false,
    });
  }

  // ---------------------------------------------------------------- particles
  function explode(obs) {
    const baseColor = obs.type === "gate" ? "#4FC3F7" : "#D65A4F";
    for (let i = 0; i < 16; i++) {
      game.shards.push({
        x: LANE_X[obs.lane] + rand(-0.8, 0.8),
        y: rand(0.1, obs.h),
        z: obs.z + rand(-0.5, 0.5),
        vx: rand(-7, 7),
        vy: rand(2, 11),
        vz: rand(-4, 16),
        life: rand(0.45, 0.8),
        age: 0,
        color: Math.random() < 0.3 ? "#FFFFFF" : baseColor,
      });
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    const g = game;
    g.t += dt;

    // power / speed
    if (g.holding) g.power = clamp(g.power + dt / 1.9, 0, 1);
    else g.power = clamp(g.power - dt / 1.3, 0, 1);

    const blaze = g.power >= BLAZE_AT;
    if (blaze && !g.wasBlaze) { audio.blazeOn(); g.flash = Math.max(g.flash, 0.25); g.flashColor = "255,255,255"; }
    g.wasBlaze = blaze;

    const baseSpeed = 16 + Math.min(15, g.t * 0.17);
    g.speed = baseSpeed * (1 + 1.15 * g.power);
    g.topSpeed = Math.max(g.topSpeed, g.speed);
    g.dist += g.speed * dt;

    // lateral
    const targetX = LANE_X[g.lane];
    const prevX = g.x;
    g.x = lerp(g.x, targetX, 1 - Math.pow(0.0009, dt));
    g.lean = clamp((g.x - prevX) / Math.max(dt, 0.001) / 14, -1, 1);

    // vertical
    if (!g.onGround) {
      g.vy -= GRAVITY * dt;
      g.y += g.vy * dt;
      if (g.y <= 0) {
        g.y = 0;
        g.vy = 0;
        g.onGround = true;
        audio.land();
      }
    }
    g.bob += dt * (5 + g.speed * 0.42);

    // trail afterimages while sprinting
    if (g.power > 0.35) {
      g.trail.push({ x: g.x, y: g.y, age: 0 });
    }
    for (const tr of g.trail) tr.age += dt;
    g.trail = g.trail.filter((tr) => tr.age < 0.22);

    // obstacles
    g.sinceSpawn += g.speed * dt;
    const gap = Math.max(13, 27 - g.t * 0.12);
    if (g.sinceSpawn > gap) {
      g.sinceSpawn = 0;
      spawnPattern();
    }

    for (const o of g.obstacles) o.z -= g.speed * dt;

    // collisions
    for (const o of g.obstacles) {
      if (o.hit || o.z > o.d || o.z < -o.d) continue;
      const overlapX = Math.abs(g.x - LANE_X[o.lane]) < 1.25;
      const underTop = g.y < o.h - 0.12;
      if (overlapX && underTop) {
        if (blaze && g.blazeUsed < MAX_OBLITERATIONS) {
          o.hit = true;
          g.blazeUsed++;
          g.destroyedTotal++;
          explode(o);
          audio.destroy();
          g.shake = Math.max(g.shake, 0.5);
          g.flash = Math.max(g.flash, 0.18);
          g.flashColor = "255,255,255";
          if (g.blazeUsed >= MAX_OBLITERATIONS) {
            g.power = 0; // power bar resets to base blue
            g.blazeUsed = 0;
            g.wasBlaze = false;
            audio.powerDown();
          }
        } else {
          return gameOver();
        }
      }
    }
    g.obstacles = g.obstacles.filter((o) => !o.hit && o.z > -4);

    // shards
    for (const s of g.shards) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += (s.vz - g.speed) * dt;
      s.vy -= GRAVITY * 0.8 * dt;
    }
    g.shards = g.shards.filter((s) => s.age < s.life && s.z > -4);

    // speed streaks
    if (g.power > 0.4 && Math.random() < (g.power - 0.3) * 2.2) {
      const ang = rand(0, Math.PI * 2);
      g.streaks.push({ ang, dist: rand(0.18, 0.42), len: rand(0.05, 0.16) * g.power, age: 0 });
    }
    for (const s of g.streaks) {
      s.age += dt;
      s.dist += (0.6 + 1.6 * g.power) * dt;
    }
    g.streaks = g.streaks.filter((s) => s.age < 0.5 && s.dist < 1.2);

    // camera shake / flash decay
    g.shake = Math.max(0, g.shake - dt * 2.2);
    g.flash = Math.max(0, g.flash - dt * 2.5);

    audio.setIntensity(g.power);
  }

  // ---------------------------------------------------------------- render
  function render(time) {
    const g = game;
    cx = W / 2;
    horizonY = H * 0.4;
    unit = H * (1.06 - 0.10 * g.power); // subtle FOV widening at speed
    camX = g.x * 0.72;

    const shakeAmp = g.shake * 9 + (g.power >= BLAZE_AT ? 2.2 : g.power * 1.1);
    shakeX = (Math.random() - 0.5) * shakeAmp;
    shakeY = (Math.random() - 0.5) * shakeAmp;

    // sky
    ctx.fillStyle = "#141416";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createLinearGradient(0, horizonY - H * 0.22, 0, horizonY + 2);
    const pc = powerColor(g.power);
    glow.addColorStop(0, "rgba(20,20,22,0)");
    glow.addColorStop(1, pc.replace("rgb", "rgba").replace(")", ",0.16)"));
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizonY - H * 0.22, W, H * 0.22 + 2);

    // stars
    ctx.fillStyle = "rgba(240,237,232,0.25)";
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 379 + 83) % 997) / 997 * W;
      const sy = ((i * 211 + 37) % 613) / 613 * horizonY * 0.85;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // ground
    const ground = ctx.createLinearGradient(0, horizonY, 0, H);
    ground.addColorStop(0, "#17181c");
    ground.addColorStop(1, "#101013");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // horizon line
    ctx.strokeStyle = pc.replace("rgb", "rgba").replace(")", ",0.5)");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(W, horizonY);
    ctx.stroke();

    // grid: lane rails
    const railXs = [-LANE_EDGE, -LANE_X[2] / 2 - 0.575, LANE_X[2] / 2 + 0.575, LANE_EDGE];
    ctx.lineWidth = 1.5;
    for (let i = 0; i < railXs.length; i++) {
      const x = railXs[i];
      const outer = i === 0 || i === railXs.length - 1;
      const near = proj(x, 0, -2);
      const far = proj(x, 0, DRAW_DIST);
      ctx.strokeStyle = outer
        ? "rgba(79,195,247,0.55)"
        : "rgba(79,195,247,0.18)";
      ctx.beginPath();
      ctx.moveTo(near.x, near.y);
      ctx.lineTo(far.x, far.y);
      ctx.stroke();
    }

    // grid rungs scrolling toward camera
    const off = game.dist % GRID_STEP;
    ctx.strokeStyle = "rgba(79,195,247,0.13)";
    for (let z = GRID_STEP - off; z < DRAW_DIST; z += GRID_STEP) {
      const a = proj(-LANE_EDGE, 0, z);
      const b = proj(LANE_EDGE, 0, z);
      ctx.globalAlpha = clamp(1.6 - z / DRAW_DIST * 1.6, 0.1, 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // obstacles far -> near
    const sorted = [...g.obstacles].sort((a, b) => b.z - a.z);
    for (const o of sorted) {
      if (o.z < -3 || o.z > DRAW_DIST) continue;
      drawObstacle(o);
    }

    // shards
    for (const s of g.shards) {
      const p = proj(s.x, s.y, s.z);
      if (p.s <= 0) continue;
      const a = 1 - s.age / s.life;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = a;
      const sz = Math.max(1.5, p.s * 0.12);
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    if (state !== "setup") drawPlayer(time);

    // speed streaks (screen space, radiating from centre)
    if (g.streaks.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of g.streaks) {
        const a = (1 - s.age / 0.5) * 0.5;
        const r0 = s.dist * Math.min(W, H);
        const r1 = (s.dist + s.len) * Math.min(W, H);
        ctx.strokeStyle = `rgba(190,225,255,${a.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.ang) * r0, horizonY + Math.sin(s.ang) * r0);
        ctx.lineTo(cx + Math.cos(s.ang) * r1, horizonY + Math.sin(s.ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // vignette
    const vg = ctx.createRadialGradient(cx, H * 0.45, H * 0.35, cx, H * 0.45, H * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // flash
    if (g.flash > 0) {
      ctx.fillStyle = `rgba(${g.flashColor},${(g.flash * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawObstacle(o) {
    const x = LANE_X[o.lane];
    const hw = o.w / 2;
    const zN = o.z - o.d / 2;
    const zF = o.z + o.d / 2;
    if (zN + CAM_DIST < 0.4) return;

    const color = o.type === "gate" ? "#4FC3F7" : "#D65A4F";
    const fade = clamp(1.4 - o.z / DRAW_DIST * 1.4, 0, 1);

    const fa = proj(x - hw, 0, zN);
    const fb = proj(x + hw, 0, zN);
    const fc = proj(x + hw, o.h, zN);
    const fd = proj(x - hw, o.h, zN);
    const bc = proj(x + hw, o.h, zF);
    const bd = proj(x - hw, o.h, zF);

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineJoin = "round";

    // top face
    ctx.fillStyle = "rgba(22,24,28,0.92)";
    ctx.beginPath();
    ctx.moveTo(fd.x, fd.y);
    ctx.lineTo(fc.x, fc.y);
    ctx.lineTo(bc.x, bc.y);
    ctx.lineTo(bd.x, bd.y);
    ctx.closePath();
    ctx.fill();

    // front face
    ctx.fillStyle = "rgba(16,17,20,0.94)";
    ctx.beginPath();
    ctx.moveTo(fa.x, fa.y);
    ctx.lineTo(fb.x, fb.y);
    ctx.lineTo(fc.x, fc.y);
    ctx.lineTo(fd.x, fd.y);
    ctx.closePath();
    ctx.fill();

    // neon edges
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, fa.s * 0.05);
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.min(24, fa.s * 0.3);
    ctx.beginPath();
    ctx.moveTo(fa.x, fa.y);
    ctx.lineTo(fb.x, fb.y);
    ctx.lineTo(fc.x, fc.y);
    ctx.lineTo(fd.x, fd.y);
    ctx.closePath();
    ctx.moveTo(fd.x, fd.y);
    ctx.lineTo(bd.x, bd.y);
    ctx.lineTo(bc.x, bc.y);
    ctx.lineTo(fc.x, fc.y);
    ctx.stroke();

    // chevron hint on jumpable blocks
    if (o.type === "block") {
      const mx = (fa.x + fb.x) / 2;
      const my = (fa.y + fc.y) / 2 - (fa.y - fc.y) * 0.05;
      const s = fa.s * 0.22;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = Math.max(1, fa.s * 0.03);
      ctx.beginPath();
      ctx.moveTo(mx - s / 2, my + s / 3);
      ctx.lineTo(mx, my - s / 3);
      ctx.lineTo(mx + s / 2, my + s / 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(time) {
    const g = game;
    const ground = proj(g.x, 0, 0);
    const pos = proj(g.x, 0, 0);
    const S = pos.s * 1.05;
    const py = ground.y - g.y * pos.s;
    const blaze = g.power >= BLAZE_AT ? 1 : 0;

    // power glow on the track under the rabbit (blue -> white -> red)
    const pc = powerColor(g.power);
    const glowR = S * (0.75 + g.power * 0.8 + Math.sin(time * 12) * 0.05 * g.power);
    const gr = ctx.createRadialGradient(ground.x, ground.y, 0, ground.x, ground.y, glowR);
    gr.addColorStop(0, pc.replace("rgb", "rgba").replace(")", `,${0.4 + g.power * 0.4})`));
    gr.addColorStop(1, pc.replace("rgb", "rgba").replace(")", ",0)"));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, glowR, glowR * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // light ribbon trail behind the rabbit
    for (const tr of g.trail) {
      const a = (1 - tr.age / 0.22) * 0.3 * g.power;
      const tp = proj(tr.x, 0, Math.max(-2.5, -tr.age * g.speed * 0.5));
      ctx.fillStyle = pc.replace("rgb", "rgba").replace(")", `,${a.toFixed(3)})`);
      ctx.beginPath();
      ctx.ellipse(tp.x, tp.y - tr.y * tp.s - S * 0.35, S * 0.3, S * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    drawHopper(ctx, pos.x, py, S, player, {
      bob: g.bob,
      lean: g.lean,
      air: g.onGround ? 0 : Math.abs(g.vy),
      blaze,
      t: time,
    });
  }

  // ---------------------------------------------------------------- HUD
  function renderHud() {
    const g = game;
    hudScore.textContent = g.t.toFixed(1);
    hudBest.textContent = "BEST " + Math.max(best, 0).toFixed(1);
    powerFill.style.width = (g.power * 100).toFixed(1) + "%";
    const blaze = g.power >= BLAZE_AT;
    powerLabel.textContent = blaze ? "⚡ OBLITERATE ⚡" : "SPEED";
    powerLabel.classList.toggle("blaze", blaze);
    blazePips.forEach((pip, i) => pip.classList.toggle("lit", i < g.blazeUsed));
  }

  // ---------------------------------------------------------------- main loop
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - lastT) / 1000);
    lastT = now;
    const t = now / 1000;

    if (state === "playing") {
      update(dt);
      renderHud();
    } else {
      // flash & shake keep decaying on the game-over / setup screens
      game.flash = Math.max(0, game.flash - dt * 2.5);
      game.shake = Math.max(0, game.shake - dt * 2.2);
    }
    if (state === "setup") {
      // idle attract scene drifting behind the panel
      game.dist += 10 * dt;
      game.bob += dt * 6;
      renderPreview(t);
    }
    if (state !== "paused") render(t);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  el("name-input").value = playerName;
  hudName.textContent = playerName;
  buildSwatches();
  syncMuteButtons();
  show("setup");
  requestAnimationFrame(frame);

  // debug/testing hook
  window.__hopper = {
    get state() { return state; },
    game,
    startRun,
    setPower(p) { game.power = p; },
    forceSpawn: spawnPattern,
  };
})();
