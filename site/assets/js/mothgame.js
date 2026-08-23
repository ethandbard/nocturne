/* MOTH — climb toward the lamp before your light goes out.
 *
 * Two things can end a run: falling off the bottom of a view that keeps
 * rising, and letting your glow burn down to nothing. The glow doubles as the
 * draw radius, so running low on light literally means you cannot see the next
 * beam coming. That coupling is the game.
 *
 * World space has +y pointing up, with the camera tracking upward. Screen y is
 * derived at draw time; nothing in the simulation thinks in screen pixels.
 */

(function () {
  "use strict";

  var W = 800;
  var H = 600;
  var GRAVITY = 900;
  var FLUTTER = -330;
  var GLOW_MAX = 270;
  var GLOW_START = 210;
  var GLOW_DECAY = 15;
  var GAP_Y = 210;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elHeight = document.getElementById("height");
  var elGlow = document.getElementById("glow");
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
  var last = 0;
  var cameraY = 0;
  var climb = 40;
  var glow = GLOW_START;
  var best = 0;
  var flap = 0;

  var moth = { x: W / 2, tx: W / 2, y: 260, vy: 0, r: 11 };
  /* Height is scored on the highest point reached, not where you ended up.
     Falling the last few metres should not erase the climb. */
  var peak = 0;
  var beams = [];
  var motes = [];
  var dust = [];
  var nextBeamY = 320;

  var keys = Object.create(null);

  function screenY(worldY) { return H - (worldY - cameraY); }

  /* -------------------------------------------------------------- input --- */

  function aimX(clientX) {
    var rect = canvas.getBoundingClientRect();
    moth.tx = ((clientX - rect.left) / rect.width) * W;
  }

  canvas.addEventListener("pointermove", function (e) { aimX(e.clientX); });

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    aimX(e.clientX);
    if (running) flutter();
  });

  window.addEventListener("keydown", function (e) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === " " || e.code === "Space" || e.key === "ArrowUp" || e.key === "w") {
      e.preventDefault();
      if (running) flutter();
      else start();
    }
  });

  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });

  overlayBtn.addEventListener("click", start);

  function flutter() {
    moth.vy = FLUTTER;
    flap = 1;
    for (var i = 0; i < 4; i++) {
      dust.push({
        x: moth.x + (Math.random() - 0.5) * 16,
        y: moth.y - 8,
        vx: (Math.random() - 0.5) * 40,
        vy: -40 - Math.random() * 60,
        life: 0.5 + Math.random() * 0.4
      });
    }
  }

  /* ----------------------------------------------------------- geometry --- */

  function addBeam(y) {
    var gapW = Math.max(120, 230 - cameraY / 90);
    var gapX = 60 + Math.random() * (W - 120 - gapW);
    beams.push({ y: y, gapX: gapX, gapW: gapW });

    /* One mote per beam, parked in the gap often enough to reward the tight
       line but sometimes off to the side, so the safe route is not the free one. */
    var mx = Math.random() < 0.45
      ? gapX + gapW / 2
      : 50 + Math.random() * (W - 100);
    motes.push({ x: mx, y: y + GAP_Y * 0.5, taken: false, bob: Math.random() * 6 });
  }

  /* ---------------------------------------------------------- lifecycle --- */

  function reset() {
    cameraY = 0;
    /* The floor does not start chasing you. It builds up over the first few
       seconds, which buys a new player time to work out what the button does
       before anything can kill them. */
    climb = 0;
    glow = GLOW_START;
    moth.x = moth.tx = W / 2;
    moth.y = 260;
    /* Open mid-flutter rather than in free fall. */
    moth.vy = FLUTTER;
    peak = moth.y;
    beams.length = 0;
    motes.length = 0;
    dust.length = 0;
    nextBeamY = 340;
    for (var i = 0; i < 5; i++) { addBeam(nextBeamY); nextBeamY += GAP_Y; }
  }

  function start() {
    reset();
    running = true;
    overlay.hidden = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function die(reason) {
    running = false;
    var height = Math.max(0, Math.floor((peak - 260) / 10));
    var isBest = window.Nocturne.submitScore("moth", height);
    elBest.textContent = window.Nocturne.bestScore("moth");

    overlayTitle.textContent = reason === "dark" ? "Your light went out" : "You fell out of the dark";
    overlayBody.textContent = (isBest ? "New best: " : "Reached ") + height + "m." +
      (reason === "dark"
        ? " The lamp was still up there somewhere."
        : " The floor is a long way down and it does not wait.");
    overlayBtn.textContent = "Climb again";
    window.setTimeout(function () { overlay.hidden = false; }, 500);
  }

  /* --------------------------------------------------------------- step --- */

  function update(dt) {
    climb = Math.min(climb + dt * 9, 190);
    cameraY += climb * dt;

    var kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    if (kx) moth.tx += kx * 430 * dt;
    moth.tx = Math.max(moth.r, Math.min(W - moth.r, moth.tx));
    moth.x += (moth.tx - moth.x) * Math.min(1, dt * 11);

    moth.vy += GRAVITY * dt;
    moth.y -= moth.vy * dt;
    if (flap > 0) flap = Math.max(0, flap - dt * 4);

    glow = Math.max(0, glow - GLOW_DECAY * dt);
    if (glow <= 0) { die("dark"); return; }

    /* Below the bottom edge of the rising view. */
    if (moth.y < cameraY - 20) { die("fall"); return; }
    /* Ceiling, so you cannot simply outrun every beam. */
    if (moth.y > cameraY + H - 30) { moth.y = cameraY + H - 30; moth.vy = 0; }

    while (nextBeamY < cameraY + H + GAP_Y * 2) {
      addBeam(nextBeamY);
      nextBeamY += GAP_Y;
    }

    var i;

    for (i = beams.length - 1; i >= 0; i--) {
      var b = beams[i];
      if (b.y < cameraY - 120) { beams.splice(i, 1); continue; }
      /* Beams are 16 units thick. A circle-vs-band test is enough here: the
         gap is the only opening, so anything overlapping the band and outside
         the gap is a hit. */
      if (Math.abs(moth.y - b.y) < 8 + moth.r) {
        if (moth.x - moth.r < b.gapX || moth.x + moth.r > b.gapX + b.gapW) {
          die("fall");
          return;
        }
      }
    }

    for (i = motes.length - 1; i >= 0; i--) {
      var m = motes[i];
      if (m.y < cameraY - 120) { motes.splice(i, 1); continue; }
      m.bob += dt * 3;
      if (m.taken) continue;
      var dx = m.x - moth.x;
      var dy = m.y - moth.y;
      if (dx * dx + dy * dy < 26 * 26) {
        m.taken = true;
        glow = Math.min(GLOW_MAX, glow + 78);
        for (var k = 0; k < 8; k++) {
          dust.push({
            x: m.x, y: m.y,
            vx: (Math.random() - 0.5) * 130,
            vy: (Math.random() - 0.5) * 130,
            life: 0.4 + Math.random() * 0.4
          });
        }
      }
    }

    for (i = dust.length - 1; i >= 0; i--) {
      var p = dust[i];
      p.life -= dt;
      if (p.life <= 0) { dust.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (moth.y > peak) peak = moth.y;
    elHeight.textContent = Math.max(0, Math.floor((peak - 260) / 10));
    elGlow.textContent = Math.round((glow / GLOW_MAX) * 100) + "%";
  }

  /* --------------------------------------------------------------- draw --- */

  function draw() {
    ctx.fillStyle = "#04030a";
    ctx.fillRect(0, 0, W, H);

    var i;

    for (i = 0; i < beams.length; i++) {
      var b = beams[i];
      var y = screenY(b.y);
      if (y < -40 || y > H + 40) continue;
      ctx.fillStyle = "#2a2440";
      ctx.fillRect(0, y - 8, b.gapX, 16);
      ctx.fillRect(b.gapX + b.gapW, y - 8, W - (b.gapX + b.gapW), 16);
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(b.gapX - 3, y - 8, 3, 16);
      ctx.fillRect(b.gapX + b.gapW, y - 8, 3, 16);
    }

    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      if (m.taken) continue;
      var my = screenY(m.y);
      if (my < -30 || my > H + 30) continue;
      ctx.save();
      ctx.shadowBlur = 26;
      ctx.shadowColor = "#4ade80";
      ctx.fillStyle = "#bbf7d0";
      ctx.beginPath();
      ctx.arc(m.x, my + Math.sin(m.bob) * 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (i = 0; i < dust.length; i++) {
      var p = dust[i];
      ctx.fillStyle = "rgba(203,213,255," + Math.max(0, p.life).toFixed(2) + ")";
      ctx.fillRect(p.x - 1, screenY(p.y) - 1, 2, 2);
    }

    /* The moth itself: two wings that close as it flaps. */
    var mx = moth.x;
    var myS = screenY(moth.y);
    var spread = 1 - flap * 0.55;
    ctx.save();
    ctx.translate(mx, myS);
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#e9d5ff";
    ctx.fillStyle = "#efe7ff";
    ctx.beginPath();
    ctx.ellipse(-7 * spread, 0, 8 * spread, 11, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7 * spread, 0, 8 * spread, 11, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cbb6f0";
    ctx.beginPath();
    ctx.ellipse(0, 1, 3, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* Darkness last: a radial hole punched around the moth. Everything drawn
       above survives only inside the glow radius. */
    var g = ctx.createRadialGradient(mx, myS, Math.max(8, glow * 0.35), mx, myS, Math.max(20, glow));
    g.addColorStop(0, "rgba(4,3,10,0)");
    g.addColorStop(0.65, "rgba(4,3,10,0.72)");
    g.addColorStop(1, "rgba(4,3,10,0.985)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* The lamp you are climbing toward, always just out of reach. */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur = 60;
    ctx.shadowColor = "#fbbf24";
    ctx.fillStyle = "rgba(251,191,36,0.5)";
    ctx.beginPath();
    ctx.arc(W / 2, -70, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) update(dt);
    draw();
    if (running) requestAnimationFrame(loop);
  }

  /* -------------------------------------------------------------- boot --- */

  best = window.Nocturne.bestScore("moth");
  elBest.textContent = best;
  draw();
})();
