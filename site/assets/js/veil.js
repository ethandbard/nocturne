/* VEIL — sweeping beams read motion, not position. Stand still and you are
 * nearly invisible to them; sprint across the open floor and you light up
 * like a marquee. Exposure builds while a beam has you and bleeds off while
 * it does not, so a single graze is recoverable — staying reckless is what
 * kills you.
 *
 * Same fixed 800x600 space and DPR-scaled canvas as PULSE and MOTH; nothing
 * in the simulation thinks in screen pixels.
 */

(function () {
  "use strict";

  var W = 800;
  var H = 600;
  var EXPOSURE_MAX = 100;
  var MOTES_TARGET = 5;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elScore = document.getElementById("score");
  var elExposure = document.getElementById("exposure");
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
  var over = false;
  var last = 0;
  var elapsed = 0;
  var score = 0;
  var exposure = 0;
  var motesTaken = 0;

  var player = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, r: 9, px: W / 2, py: H / 2, speed: 0 };
  var beams = [];
  var motes = [];
  var sparks = [];

  var keys = Object.create(null);

  /* -------------------------------------------------------------- input --- */

  function pointTo(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    player.tx = ((clientX - rect.left) / rect.width) * W;
    player.ty = ((clientY - rect.top) / rect.height) * H;
  }

  canvas.addEventListener("pointermove", function (e) { pointTo(e.clientX, e.clientY); });
  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); pointTo(e.clientX, e.clientY); });

  window.addEventListener("keydown", function (e) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === "Enter" && !running && !over) start();
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });

  overlayBtn.addEventListener("click", start);

  /* ------------------------------------------------------------ spawning --- */

  function difficulty() {
    return 1 + elapsed / 34;
  }

  function addBeam() {
    var margin = 90;
    beams.push({
      x: margin + Math.random() * (W - margin * 2),
      y: margin + Math.random() * (H - margin * 2),
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4),
      half: 0.28 + Math.random() * 0.08,
      reach: 230 + Math.random() * 80
    });
  }

  function addMote() {
    motes.push({
      x: 50 + Math.random() * (W - 100),
      y: 50 + Math.random() * (H - 100),
      bob: Math.random() * Math.PI * 2
    });
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 30 + Math.random() * 140;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, max: 0.8, color: color });
    }
  }

  /* ------------------------------------------------------------ lifecycle --- */

  function reset() {
    elapsed = 0;
    score = 0;
    exposure = 0;
    motesTaken = 0;
    beams.length = 0;
    motes.length = 0;
    sparks.length = 0;
    player.x = player.tx = player.px = W / 2;
    player.y = player.ty = player.py = H / 2;
    player.speed = 0;
    addBeam();
    addBeam();
    for (var i = 0; i < 3; i++) addMote();
  }

  function start() {
    reset();
    over = false;
    running = true;
    overlay.hidden = true;
    last = performance.now();
    paintHud();
    requestAnimationFrame(loop);
  }

  function die() {
    running = false;
    over = true;
    burst(player.x, player.y, "56,189,248", 36);

    var final = Math.round(score);
    var isBest = window.Nocturne.submitScore("veil", final);
    elBest.textContent = window.Nocturne.bestScore("veil");

    overlayTitle.textContent = "Caught in the open";
    overlayBody.textContent = isBest
      ? "New best: " + final + ". Stillness would have saved you."
      : "Scored " + final + ". Best is still " + window.Nocturne.bestScore("veil") + ".";
    overlayBtn.textContent = "Again";

    window.setTimeout(function () { overlay.hidden = false; }, 650);
  }

  function paintHud() {
    elScore.textContent = Math.round(score);
    elExposure.textContent = Math.round((exposure / EXPOSURE_MAX) * 100) + "%";
  }

  /* --------------------------------------------------------------- step --- */

  var sinceBeam = 0;
  var sinceMote = 0;

  function update(dt) {
    elapsed += dt;
    score += dt * 5;

    var kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    var ky = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (kx || ky) {
      player.tx += kx * 360 * dt;
      player.ty += ky * 360 * dt;
    }
    player.tx = Math.max(player.r, Math.min(W - player.r, player.tx));
    player.ty = Math.max(player.r, Math.min(H - player.r, player.ty));

    player.px = player.x;
    player.py = player.y;
    player.x += (player.tx - player.x) * Math.min(1, dt * 10);
    player.y += (player.ty - player.y) * Math.min(1, dt * 10);

    var moved = Math.hypot(player.x - player.px, player.y - player.py);
    var instSpeed = dt > 0 ? moved / dt : 0;
    player.speed += (instSpeed - player.speed) * Math.min(1, dt * 6);

    var d = difficulty();
    sinceBeam += dt;
    if (sinceBeam > 16 / d && beams.length < 5) {
      sinceBeam = 0;
      addBeam();
    }
    sinceMote += dt;
    if (sinceMote > 2.2 && motes.length < 4) {
      sinceMote = 0;
      addMote();
    }

    var lit = false;
    var i;
    for (i = 0; i < beams.length; i++) {
      var b = beams[i];
      b.angle += b.spin * d * dt;
      var dx = player.x - b.x;
      var dy = player.y - b.y;
      var dist = Math.hypot(dx, dy);
      if (dist > b.reach) continue;
      var toPlayer = Math.atan2(dy, dx);
      var diff = Math.atan2(Math.sin(toPlayer - b.angle), Math.cos(toPlayer - b.angle));
      if (Math.abs(diff) < b.half) lit = true;
    }

    /* Visibility scales with how fast you are moving, not just whether you
       are lit — standing still inside a beam still leaks exposure, but far
       slower than sprinting through one. */
    var normSpeed = Math.min(1, player.speed / 260);
    var visibility = 0.22 + 0.78 * normSpeed;

    if (lit) exposure = Math.min(EXPOSURE_MAX, exposure + dt * 62 * visibility);
    else exposure = Math.max(0, exposure - dt * 34);

    if (exposure >= EXPOSURE_MAX) { die(); return; }

    for (i = motes.length - 1; i >= 0; i--) {
      var m = motes[i];
      m.bob += dt * 3;
      var mdx = m.x - player.x;
      var mdy = m.y - player.y;
      if (mdx * mdx + mdy * mdy < 22 * 22) {
        motes.splice(i, 1);
        motesTaken++;
        score += 40;
        exposure = Math.max(0, exposure - 12);
        burst(m.x, m.y, "74,222,128", 8);
      }
    }

    for (i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    paintHud();
  }

  /* --------------------------------------------------------------- draw --- */

  function draw() {
    ctx.fillStyle = "#040309";
    ctx.fillRect(0, 0, W, H);

    var i;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < beams.length; i++) {
      var b = beams[i];
      var grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.reach);
      grad.addColorStop(0, "rgba(56,189,248,0.28)");
      grad.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.arc(b.x, b.y, b.reach, b.angle - b.half, b.angle + b.half);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      ctx.save();
      ctx.shadowBlur = 22;
      ctx.shadowColor = "#4ade80";
      ctx.fillStyle = "#bbf7d0";
      ctx.beginPath();
      ctx.arc(m.x, m.y + Math.sin(m.bob) * 3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      ctx.fillStyle = "rgba(" + p.color + "," + Math.max(0, p.life / p.max).toFixed(3) + ")";
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }

    if (!over) {
      var t = exposure / EXPOSURE_MAX;
      ctx.save();
      ctx.shadowBlur = 16 + t * 20;
      ctx.shadowColor = t > 0.6 ? "#f87171" : "#38bdf8";
      ctx.fillStyle = t > 0.6 ? "#fecaca" : "#e8f6ff";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) update(dt);
    draw();
    if (running) requestAnimationFrame(loop);
  }

  /* -------------------------------------------------------------- boot --- */

  elBest.textContent = window.Nocturne.bestScore("veil");
  draw();
})();
