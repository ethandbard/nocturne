/* WYRM — a glowing trail on a dark grid. Old rules, new coat of paint: eat
 * the motes, do not eat yourself, do not touch the wall. Speed climbs with
 * every mote taken, so the board never actually gets easier to read, only
 * faster to die on.
 *
 * Grid-stepped rather than continuous, unlike every other cabinet here — the
 * simulation advances one cell per tick instead of by dt, which is the whole
 * point of the genre.
 */

(function () {
  "use strict";

  var COLS = 24;
  var ROWS = 18;
  var CELL = 24;
  var W = COLS * CELL;
  var H = ROWS * CELL;

  var STEP_START = 0.145;
  var STEP_MIN = 0.058;
  var STEP_SHRINK = 0.0035;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elLength = document.getElementById("length");
  var elSpeed = document.getElementById("speed");
  var elBest = document.getElementById("best");

  function fit() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  /* ------------------------------------------------------------- state --- */

  var running = false;
  var body = [];       /* [{x,y}], index 0 is the head */
  var dir = { x: 1, y: 0 };
  var nextDir = { x: 1, y: 0 };
  var mote = { x: 0, y: 0 };
  var step = STEP_START;
  var acc = 0;
  var last = 0;
  var sparks = [];
  var pulse = 0;

  /* -------------------------------------------------------------- input --- */

  var KEYMAP = {
    arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 }
  };

  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    var want = KEYMAP[k];
    if (want) {
      e.preventDefault();
      /* Reject a reversal onto your own neck rather than queuing it, so a
         fast double-tap cannot cause an instant, unavoidable death. */
      if (body.length > 1 && want.x === -dir.x && want.y === -dir.y) return;
      nextDir = want;
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !running) start();
  });

  overlayBtn.addEventListener("click", start);

  /* ------------------------------------------------------------ spawning --- */

  function placeMote() {
    var free;
    do {
      free = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (body.some(function (s) { return s.x === free.x && s.y === free.y; }));
    mote.x = free.x;
    mote.y = free.y;
  }

  function burst(cx, cy, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 40 + Math.random() * 120;
      sparks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.3, max: 0.65, color: color });
    }
  }

  /* ------------------------------------------------------------ lifecycle --- */

  function reset() {
    body = [
      { x: 6, y: Math.floor(ROWS / 2) },
      { x: 5, y: Math.floor(ROWS / 2) },
      { x: 4, y: Math.floor(ROWS / 2) }
    ];
    dir = nextDir = { x: 1, y: 0 };
    step = STEP_START;
    acc = 0;
    sparks.length = 0;
    placeMote();
  }

  function start() {
    reset();
    running = true;
    overlay.hidden = true;
    last = performance.now();
    paintHud();
    requestAnimationFrame(loop);
  }

  function die() {
    running = false;
    burst((body[0].x + 0.5) * CELL, (body[0].y + 0.5) * CELL, "56,189,248", 30);

    var length = body.length;
    var isBest = window.Nocturne.submitScore("wyrm", length);
    elBest.textContent = window.Nocturne.bestScore("wyrm");

    overlayTitle.textContent = "Off the grid";
    overlayBody.textContent = isBest
      ? "New best: " + length + " long."
      : "Reached " + length + ". Best is still " + window.Nocturne.bestScore("wyrm") + ".";
    overlayBtn.textContent = "Again";

    window.setTimeout(function () { overlay.hidden = false; }, 550);
  }

  function paintHud() {
    elLength.textContent = body.length;
    elSpeed.textContent = (STEP_START / step).toFixed(1) + "x";
  }

  /* --------------------------------------------------------------- step --- */

  function tickGrid() {
    dir = nextDir;
    var head = { x: body[0].x + dir.x, y: body[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { die(); return; }
    if (body.some(function (s) { return s.x === head.x && s.y === head.y; })) { die(); return; }

    body.unshift(head);

    if (head.x === mote.x && head.y === mote.y) {
      burst((mote.x + 0.5) * CELL, (mote.y + 0.5) * CELL, "74,222,128", 12);
      step = Math.max(STEP_MIN, step - STEP_SHRINK);
      placeMote();
      window.Nocturne.toast(body.length + " segments", "#4ade80", 1000);
      if (body.length >= 10) window.Nocturne.revealMoth("wyrm");
    } else {
      body.pop();
    }

    paintHud();
  }

  function update(dt) {
    acc += dt;
    while (acc >= step) {
      acc -= step;
      tickGrid();
      if (!running) { acc = 0; break; }
    }

    pulse += dt * 4;

    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
  }

  /* --------------------------------------------------------------- draw --- */

  function draw() {
    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(36,31,54,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(gx * CELL, 0); ctx.lineTo(gx * CELL, H); }
    for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(0, gy * CELL); ctx.lineTo(W, gy * CELL); }
    ctx.stroke();

    var i;

    ctx.save();
    var mp = 1 + Math.sin(pulse) * 0.14;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#4ade80";
    ctx.fillStyle = "#bbf7d0";
    ctx.beginPath();
    ctx.arc((mote.x + 0.5) * CELL, (mote.y + 0.5) * CELL, CELL * 0.28 * mp, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (i = body.length - 1; i >= 0; i--) {
      var s = body[i];
      var t = i / Math.max(1, body.length - 1);
      ctx.save();
      if (i === 0) {
        ctx.shadowBlur = 22;
        ctx.shadowColor = "#38bdf8";
        ctx.fillStyle = "#e8f6ff";
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#38bdf8";
        ctx.fillStyle = "rgba(56,189,248," + (0.85 - t * 0.5).toFixed(3) + ")";
      }
      var pad = 2;
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5)
        : ctx.rect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.fill();
      ctx.restore();
    }

    for (i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      ctx.fillStyle = "rgba(" + p.color + "," + Math.max(0, p.life / p.max).toFixed(3) + ")";
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
  }

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) update(dt);
    else {
      pulse += dt * 4;
      for (var i = sparks.length - 1; i >= 0; i--) {
        var p = sparks[i];
        p.life -= dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
      }
    }
    draw();
    if (running || sparks.length) requestAnimationFrame(loop);
  }

  /* -------------------------------------------------------------- boot --- */

  body = [{ x: 6, y: Math.floor(ROWS / 2) }, { x: 5, y: Math.floor(ROWS / 2) }, { x: 4, y: Math.floor(ROWS / 2) }];
  placeMote();
  elBest.textContent = window.Nocturne.bestScore("wyrm");
  draw();
})();
