/* VEIL — sweeping beams read motion, not position. Stand still and you are
 * nearly invisible to them; sprint across the open floor and you light up
 * like a marquee. Exposure builds while a beam has you and bleeds off while
 * it does not, so a single graze is recoverable — staying reckless is what
 * kills you.
 *
 * Beams are wall-mounted fans and sliding bars, not interior pivots. Interior
 * origins clustered on one side of the floor and left the other side safe.
 *
 * Same fixed 800x600 space and DPR-scaled canvas as PULSE and MOTH; nothing
 * in the simulation thinks in screen pixels.
 */

(function () {
  "use strict";

  var W = 800;
  var H = 600;
  var EXPOSURE_MAX = 100;
  var MAX_FANS = 3;
  var MAX_BARS = 2;

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
  var sinceBeam = 0;
  var sinceMote = 0;

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
    return 1 + elapsed / 28;
  }

  function placeFanOnWall(b) {
    var t = b.along;
    if (b.wall === 0) {
      b.x = 0;
      b.y = 36 + t * (H - 72);
      b.baseAngle = 0;
    } else if (b.wall === 1) {
      b.x = W;
      b.y = 36 + t * (H - 72);
      b.baseAngle = Math.PI;
    } else if (b.wall === 2) {
      b.x = 36 + t * (W - 72);
      b.y = 0;
      b.baseAngle = Math.PI / 2;
    } else {
      b.x = 36 + t * (W - 72);
      b.y = H;
      b.baseAngle = -Math.PI / 2;
    }
  }

  function addFan() {
    var b = {
      kind: "fan",
      wall: Math.floor(Math.random() * 4),
      along: Math.random(),
      alongVel: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.1),
      sweep: 0.7 + Math.random() * 0.35,
      sweepT: Math.random() * Math.PI * 2,
      sweepVel: 0.85 + Math.random() * 0.55,
      half: 0.2 + Math.random() * 0.07,
      reach: 460 + Math.random() * 160,
      x: 0,
      y: 0,
      angle: 0,
      baseAngle: 0
    };
    placeFanOnWall(b);
    b.angle = b.baseAngle;
    beams.push(b);
  }

  function addBar() {
    var horiz = Math.random() < 0.5;
    var span = horiz ? H : W;
    beams.push({
      kind: "bar",
      horiz: horiz,
      pos: 40 + Math.random() * (span - 80),
      vel: (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 70),
      thick: 34 + Math.random() * 14
    });
  }

  function countKind(kind) {
    var n = 0;
    for (var i = 0; i < beams.length; i++) {
      if (beams[i].kind === kind) n++;
    }
    return n;
  }

  function addBeam() {
    var fans = countKind("fan");
    var bars = countKind("bar");
    if (bars < MAX_BARS && (bars === 0 || (fans >= bars && Math.random() < 0.55))) {
      addBar();
      return;
    }
    if (fans < MAX_FANS) addFan();
    else if (bars < MAX_BARS) addBar();
  }

  function addMote() {
    var x;
    var y;
    var tries = 0;
    do {
      x = 50 + Math.random() * (W - 100);
      y = 50 + Math.random() * (H - 100);
      tries++;
    } while (tries < 8 && Math.hypot(x - player.x, y - player.y) < 90);
    motes.push({ x: x, y: y, bob: Math.random() * Math.PI * 2 });
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 30 + Math.random() * 140;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, max: 0.8, color: color });
    }
  }

  function beamHits(b) {
    if (b.kind === "bar") {
      if (b.horiz) return Math.abs(player.y - b.pos) < b.thick / 2 + player.r;
      return Math.abs(player.x - b.pos) < b.thick / 2 + player.r;
    }
    var dx = player.x - b.x;
    var dy = player.y - b.y;
    var dist = Math.hypot(dx, dy);
    if (dist > b.reach) return false;
    var toPlayer = Math.atan2(dy, dx);
    var diff = Math.atan2(Math.sin(toPlayer - b.angle), Math.cos(toPlayer - b.angle));
    return Math.abs(diff) < b.half;
  }

  /* ------------------------------------------------------------ lifecycle --- */

  function reset() {
    elapsed = 0;
    score = 0;
    exposure = 0;
    motesTaken = 0;
    sinceBeam = 0;
    sinceMote = 0;
    beams.length = 0;
    motes.length = 0;
    sparks.length = 0;
    player.x = player.tx = player.px = W / 2;
    player.y = player.ty = player.py = H / 2;
    player.speed = 0;
    addFan();
    addBar();
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
    if (sinceBeam > 9 / d && beams.length < MAX_FANS + MAX_BARS) {
      sinceBeam = 0;
      addBeam();
    }
    sinceMote += dt;
    if (sinceMote > 2.4 && motes.length < 4) {
      sinceMote = 0;
      addMote();
    }

    var lit = false;
    var i;
    for (i = 0; i < beams.length; i++) {
      var b = beams[i];
      if (b.kind === "fan") {
        b.along += b.alongVel * dt;
        if (b.along < 0 || b.along > 1) {
          b.alongVel *= -1;
          b.along = Math.max(0, Math.min(1, b.along));
        }
        placeFanOnWall(b);
        b.sweepT += b.sweepVel * d * dt;
        b.angle = b.baseAngle + Math.sin(b.sweepT) * b.sweep;
      } else {
        b.pos += b.vel * d * dt;
        var span = b.horiz ? H : W;
        if (b.pos < 8 || b.pos > span - 8) {
          b.vel *= -1;
          b.pos = Math.max(8, Math.min(span - 8, b.pos));
        }
      }
      if (beamHits(b)) lit = true;
    }

    /* Standing still inside a beam still leaks exposure; sprinting through
       one fills the meter in about a second. Camping the far wall used to
       work because beams never left their spawn corner. */
    var normSpeed = Math.min(1, player.speed / 260);
    var visibility = 0.42 + 0.58 * normSpeed;

    if (lit) exposure = Math.min(EXPOSURE_MAX, exposure + dt * 78 * visibility);
    else exposure = Math.max(0, exposure - dt * 16);

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
        exposure = Math.max(0, exposure - 7);
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

  function drawFan(b) {
    var grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.reach);
    grad.addColorStop(0, "rgba(56,189,248,0.32)");
    grad.addColorStop(1, "rgba(56,189,248,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.arc(b.x, b.y, b.reach, b.angle - b.half, b.angle + b.half);
    ctx.closePath();
    ctx.fill();
  }

  function drawBar(b) {
    if (b.horiz) {
      ctx.fillStyle = "rgba(56,189,248,0.16)";
      ctx.fillRect(0, b.pos - b.thick / 2, W, b.thick);
      ctx.fillStyle = "rgba(186,230,253,0.55)";
      ctx.fillRect(0, b.pos - 2, W, 4);
    } else {
      ctx.fillStyle = "rgba(56,189,248,0.16)";
      ctx.fillRect(b.pos - b.thick / 2, 0, b.thick, H);
      ctx.fillStyle = "rgba(186,230,253,0.55)";
      ctx.fillRect(b.pos - 2, 0, 4, H);
    }
  }

  function draw() {
    ctx.fillStyle = "#040309";
    ctx.fillRect(0, 0, W, H);

    var i;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < beams.length; i++) {
      if (beams[i].kind === "fan") drawFan(beams[i]);
      else drawBar(beams[i]);
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
