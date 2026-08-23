/* STATIC — hold a drifting station long enough to lock it, then the next
 * one moves faster and the clear band shrinks. Drift off-target and the
 * signal dies. The original single hold-still prompt was not a game.
 */

(function () {
  "use strict";

  var W = 520;
  var H = 340;
  var HOLD_LOCK = 1.55;
  var SIGNAL_MAX = 100;

  var canvas = document.getElementById("dial");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var hint = document.getElementById("dial-hint");
  var reveal = document.getElementById("reveal");
  var elStation = document.getElementById("station");
  var elSignal = document.getElementById("signal");
  var elBest = document.getElementById("best");

  function fit() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  var cx = W / 2, cy = H - 20, radius = H - 60;
  var minA = Math.PI * 1.08, maxA = Math.PI * 1.92;

  var running = false;
  var over = false;
  var needle = (minA + maxA) / 2;
  var target = minA + (maxA - minA) * 0.5;
  var band = 0.06;
  var drift = 0.12;
  var hold = 0;
  var signal = SIGNAL_MAX;
  var locked = 0;
  var dragging = false;
  var revealed = false;
  var noise = [];
  for (var i = 0; i < 48; i++) noise.push(Math.random());

  function angleFrom(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var x = ((clientX - rect.left) / rect.width) * W;
    var y = ((clientY - rect.top) / rect.height) * H;
    var a = Math.atan2(y - cy, x - cx);
    if (a < -Math.PI / 2) a += Math.PI * 2;
    return Math.max(minA, Math.min(maxA, a));
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (!running) return;
    dragging = true;
    needle = angleFrom(e.clientX, e.clientY);
  });
  window.addEventListener("pointermove", function (e) {
    if (!dragging || !running) return;
    needle = angleFrom(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", function () { dragging = false; });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !running) { start(); return; }
    if (!running) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { needle = Math.max(minA, needle - 0.035); e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { needle = Math.min(maxA, needle + 0.035); e.preventDefault(); }
  });
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-label", "Tuning dial");

  overlayBtn.addEventListener("click", start);

  function nextStation() {
    target = minA + 0.12 + Math.random() * (maxA - minA - 0.24);
    band = Math.max(0.028, 0.09 - locked * 0.007);
    drift = (Math.random() < 0.5 ? -1 : 1) * (0.07 + locked * 0.04);
    hold = 0;
  }

  function paintHud() {
    elStation.textContent = String(locked);
    elSignal.textContent = Math.max(0, Math.round(signal)) + "%";
  }

  function start() {
    running = true;
    over = false;
    locked = 0;
    signal = SIGNAL_MAX;
    needle = minA + Math.random() * (maxA - minA);
    nextStation();
    overlay.hidden = true;
    if (reveal) reveal.hidden = true;
    paintHud();
  }

  function finishRun() {
    running = false;
    over = true;
    dragging = false;
    var isBest = window.Nocturne.submitScore("static", locked);
    elBest.textContent = window.Nocturne.bestScore("static");
    overlayTitle.textContent = "Signal lost";
    overlayBody.textContent = isBest
      ? "New best: " + locked + " station" + (locked === 1 ? "" : "s") + "."
      : "Locked " + locked + ". Best is still " + window.Nocturne.bestScore("static") + ".";
    overlayBtn.textContent = "Tune again";
    overlay.hidden = false;
    hint.textContent = "the noise came back.";
  }

  function maybeReveal() {
    if (revealed || locked < 3) return;
    revealed = true;
    if (reveal) reveal.hidden = false;
    window.Nocturne.toast("something under the noise", "#fbbf24", 3200);
  }

  function update(dt) {
    if (!running) {
      for (var n = 0; n < noise.length; n++) {
        noise[n] += (Math.random() - 0.5) * 1.4;
        noise[n] = Math.max(0, Math.min(1, noise[n]));
      }
      return;
    }

    target += drift * dt;
    if (target < minA + 0.08 || target > maxA - 0.08) {
      drift *= -1;
      target = Math.max(minA + 0.08, Math.min(maxA - 0.08, target));
    }

    var inBand = Math.abs(needle - target) < band;
    if (inBand) {
      hold = Math.min(HOLD_LOCK, hold + dt);
      signal = Math.min(SIGNAL_MAX, signal + dt * 7);
      hint.textContent = hold >= HOLD_LOCK * 0.72 ? "holding. keep it." : "there.";
    } else {
      hold = Math.max(0, hold - dt * 1.8);
      signal -= dt * (12 + locked * 2.2);
      hint.textContent = "the station is moving. stay on it.";
    }

    if (hold >= HOLD_LOCK) {
      locked++;
      window.Nocturne.toast("locked " + locked, "#4ade80", 1200);
      maybeReveal();
      nextStation();
      paintHud();
    }

    if (signal <= 0) {
      signal = 0;
      paintHud();
      finishRun();
    } else {
      paintHud();
    }

    var jitter = inBand ? 0.35 : 1.5;
    for (var i = 0; i < noise.length; i++) {
      noise[i] += (Math.random() - 0.5) * jitter;
      noise[i] = Math.max(0, Math.min(1, noise[i]));
    }
  }

  function draw() {
    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, W, H);

    var i;
    var barW = W / noise.length;
    var quiet = over ? 0.12 : 1;
    for (i = 0; i < noise.length; i++) {
      var h = noise[i] * (H - 70) * quiet;
      ctx.fillStyle = "rgba(155,150,179," + (0.1 + noise[i] * 0.12).toFixed(3) + ")";
      ctx.fillRect(i * barW, H - 60 - h, barW - 1, h);
    }

    ctx.strokeStyle = "rgba(36,31,54,0.9)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, minA, maxA);
    ctx.stroke();

    ctx.strokeStyle = running ? "#fbbf24" : "#3b3550";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, target - band, target + band);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needle);
    ctx.shadowBlur = 16;
    ctx.shadowColor = running ? "#e8e6f0" : "#3b3550";
    ctx.strokeStyle = running ? "#e8e6f0" : "#5a5375";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(radius - 4, 0);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#3b3550";
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  var last = performance.now();
  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  elBest.textContent = window.Nocturne.bestScore("static");
  paintHud();
  requestAnimationFrame(loop);
})();
