/* PULSE — dodge the shards, gather the light, spend it to clear the screen.
 *
 * The whole game runs in one logical 800x600 space; the canvas backing store is
 * scaled by devicePixelRatio and CSS stretches it to whatever the layout gives
 * us. Every coordinate below is therefore in that fixed space and never needs
 * to know the element's real size.
 */

(function () {
  "use strict";

  var W = 800;
  var H = 600;
  var MOTES_PER_CHARGE = 8;
  var MAX_CHARGES = 3;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elScore = document.getElementById("score");
  var elCharge = document.getElementById("charge");
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
  var motes = 0;
  var charges = 0;
  var shake = 0;

  var player = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, r: 9, trail: [] };
  var shards = [];
  var lights = [];
  var sparks = [];
  var waves = [];

  var keys = Object.create(null);

  /* -------------------------------------------------------------- input --- */

  /* Pointer position arrives in CSS pixels relative to the viewport; map it
     back into the fixed 800x600 space the simulation thinks in. */
  function pointTo(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    player.tx = ((clientX - rect.left) / rect.width) * W;
    player.ty = ((clientY - rect.top) / rect.height) * H;
  }

  canvas.addEventListener("pointermove", function (e) {
    pointTo(e.clientX, e.clientY);
  });

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    pointTo(e.clientX, e.clientY);
    if (running) firePulse();
  });

  window.addEventListener("keydown", function (e) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (running) firePulse();
      else if (!over) start();
    }
    if (e.key === "Enter" && !running) start();
  });

  window.addEventListener("keyup", function (e) {
    keys[e.key.toLowerCase()] = false;
  });

  overlayBtn.addEventListener("click", start);

  /* ------------------------------------------------------------ spawning --- */

  function difficulty() {
    /* Ramps quickly for the first minute, then keeps creeping so a good run
       still ends eventually. */
    return 1 + elapsed / 26;
  }

  function spawnShard() {
    var d = difficulty();
    var edge = Math.floor(Math.random() * 4);
    var x, y;
    if (edge === 0) { x = -40; y = Math.random() * H; }
    else if (edge === 1) { x = W + 40; y = Math.random() * H; }
    else if (edge === 2) { x = Math.random() * W; y = -40; }
    else { x = Math.random() * W; y = H + 40; }

    /* Aim near the player, with enough spread that shards do not all converge
       on one point and become trivially dodgeable by standing still. */
    var ang = Math.atan2(player.y - y, player.x - x) + (Math.random() - 0.5) * 1.5;
    var speed = (70 + Math.random() * 60) * Math.min(d, 3.2);
    var r = 9 + Math.random() * 16;

    shards.push({
      x: x, y: y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: r,
      spin: (Math.random() - 0.5) * 3,
      rot: Math.random() * Math.PI
    });
  }

  function spawnLight() {
    lights.push({
      x: 60 + Math.random() * (W - 120),
      y: 60 + Math.random() * (H - 120),
      r: 6,
      life: 9 + Math.random() * 5,
      bob: Math.random() * Math.PI * 2
    });
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 40 + Math.random() * 180;
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5, max: 0.9,
        color: color
      });
    }
  }

  /* -------------------------------------------------------------- pulse --- */

  function firePulse() {
    if (charges <= 0) return;
    charges--;
    waves.push({ x: player.x, y: player.y, r: 10, max: 210 });
    shake = 0.35;

    for (var i = shards.length - 1; i >= 0; i--) {
      var s = shards[i];
      var dx = s.x - player.x;
      var dy = s.y - player.y;
      if (dx * dx + dy * dy < 210 * 210) {
        burst(s.x, s.y, "168,85,247", 10);
        score += 25;
        shards.splice(i, 1);
      }
    }
    paintHud();
  }

  /* ------------------------------------------------------------ lifecycle --- */

  function reset() {
    elapsed = 0;
    score = 0;
    motes = 0;
    charges = 1;
    shards.length = 0;
    lights.length = 0;
    sparks.length = 0;
    waves.length = 0;
    player.x = player.tx = W / 2;
    player.y = player.ty = H / 2;
    player.trail.length = 0;
    for (var i = 0; i < 3; i++) spawnLight();
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
    burst(player.x, player.y, "56,189,248", 40);
    shake = 0.7;

    var final = Math.round(score);
    var isBest = window.Nocturne.submitScore("pulse", final);
    elBest.textContent = window.Nocturne.bestScore("pulse");

    overlayTitle.textContent = "Lights out";
    overlayBody.textContent = isBest
      ? "New best: " + final + ". Nothing here to beat but yourself."
      : "Scored " + final + ". Best is still " + window.Nocturne.bestScore("pulse") + ".";
    overlayBtn.textContent = "Again";

    /* Render one last frame so the death burst is visible behind the overlay,
       then show it. */
    window.setTimeout(function () { overlay.hidden = false; }, 700);
  }

  function paintHud() {
    elScore.textContent = Math.round(score);
    elCharge.textContent = charges + " / " + MAX_CHARGES;
  }

  /* --------------------------------------------------------------- step --- */

  var sinceShard = 0;
  var sinceLight = 0;

  function update(dt) {
    elapsed += dt;
    score += dt * 4;

    /* Keyboard nudges the target point so mouse and keys can be mixed freely
       rather than fighting over the same variable. */
    var kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    var ky = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (kx || ky) {
      player.tx += kx * 420 * dt;
      player.ty += ky * 420 * dt;
    }

    player.tx = Math.max(player.r, Math.min(W - player.r, player.tx));
    player.ty = Math.max(player.r, Math.min(H - player.r, player.ty));

    /* Ease toward the target instead of snapping. The lag is the game: it is
       what makes a sudden reversal cost you something. */
    player.x += (player.tx - player.x) * Math.min(1, dt * 12);
    player.y += (player.ty - player.y) * Math.min(1, dt * 12);

    player.trail.unshift({ x: player.x, y: player.y });
    if (player.trail.length > 14) player.trail.pop();

    var d = difficulty();
    sinceShard += dt;
    if (sinceShard > Math.max(0.16, 0.95 / d)) {
      sinceShard = 0;
      spawnShard();
    }
    sinceLight += dt;
    if (sinceLight > 1.5 && lights.length < 5) {
      sinceLight = 0;
      spawnLight();
    }

    var i, s;

    for (i = shards.length - 1; i >= 0; i--) {
      s = shards[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      if (s.x < -90 || s.x > W + 90 || s.y < -90 || s.y > H + 90) {
        shards.splice(i, 1);
        continue;
      }
      var dx = s.x - player.x;
      var dy = s.y - player.y;
      var hit = s.r + player.r - 3;
      if (dx * dx + dy * dy < hit * hit) {
        die();
        return;
      }
    }

    for (i = lights.length - 1; i >= 0; i--) {
      var l = lights[i];
      l.life -= dt;
      l.bob += dt * 3;
      if (l.life <= 0) { lights.splice(i, 1); continue; }
      var ldx = l.x - player.x;
      var ldy = l.y - player.y;
      if (ldx * ldx + ldy * ldy < (l.r + player.r + 6) * (l.r + player.r + 6)) {
        lights.splice(i, 1);
        motes++;
        score += 30;
        burst(l.x, l.y, "74,222,128", 8);
        if (motes % MOTES_PER_CHARGE === 0 && charges < MAX_CHARGES) charges++;
        paintHud();
      }
    }

    decay(dt);
    paintHud();
  }

  /* Purely cosmetic motion: particles, shockwave rings, screen shake. Split out
     of update() because it must keep running after death, so the final burst
     plays out instead of freezing mid-air. */
  function decay(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    for (i = waves.length - 1; i >= 0; i--) {
      waves[i].r += dt * 620;
      if (waves[i].r > waves[i].max) waves.splice(i, 1);
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 2);
  }

  /* --------------------------------------------------------------- draw --- */

  function draw() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
    }

    ctx.fillStyle = "#08070e";
    ctx.fillRect(-30, -30, W + 60, H + 60);

    /* Faint grid, so motion has something to read against. */
    ctx.strokeStyle = "rgba(109,40,217,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var g = 0; g <= W; g += 50) { ctx.moveTo(g, 0); ctx.lineTo(g, H); }
    for (var h = 0; h <= H; h += 50) { ctx.moveTo(0, h); ctx.lineTo(W, h); }
    ctx.stroke();

    var i;

    for (i = 0; i < waves.length; i++) {
      var wv = waves[i];
      var t = 1 - wv.r / wv.max;
      ctx.strokeStyle = "rgba(168,85,247," + (t * 0.9).toFixed(3) + ")";
      ctx.lineWidth = 3 + t * 5;
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (i = 0; i < lights.length; i++) {
      var l = lights[i];
      var pulse = 1 + Math.sin(l.bob) * 0.16;
      var fade = Math.min(1, l.life / 2);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowBlur = 24;
      ctx.shadowColor = "#4ade80";
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#a855f7";
    for (i = 0; i < shards.length; i++) {
      var s = shards[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = "#2b1147";
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -s.r);
      ctx.lineTo(s.r * 0.86, s.r * 0.5);
      ctx.lineTo(-s.r * 0.86, s.r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    for (i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      ctx.fillStyle = "rgba(" + p.color + "," + Math.max(0, p.life / p.max).toFixed(3) + ")";
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }

    for (i = player.trail.length - 1; i >= 0; i--) {
      var tr = player.trail[i];
      var a = (1 - i / player.trail.length) * 0.4;
      ctx.fillStyle = "rgba(56,189,248," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, player.r * (1 - i / player.trail.length) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!over) {
      ctx.save();
      ctx.shadowBlur = 30;
      ctx.shadowColor = "#38bdf8";
      ctx.fillStyle = "#e8f6ff";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      /* A ring for each stored charge, so charge count is readable without
         looking away from the play area. */
      for (i = 0; i < charges; i++) {
        ctx.strokeStyle = "rgba(74,222,128,0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r + 7 + i * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) update(dt);
    else decay(dt);
    draw();
    if (running || shake > 0 || sparks.length || waves.length) requestAnimationFrame(loop);
  }

  /* --------------------------------------------------------------- boot --- */

  elBest.textContent = window.Nocturne.bestScore("pulse");
  draw();
})();
