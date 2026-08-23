/* SPLICE — a wire panel with two columns of terminals. Match every color on
 * the left to its twin on the right before the clock on this board runs out.
 * A clean match buys you a sliver of time back; a wrong guess costs more
 * than it saves, so the panel punishes guessing far harder than it rewards
 * being fast.
 *
 * Terminals are canvas-drawn and hit-tested by distance, the same way
 * LATTICE hit-tests grid cells — no DOM per terminal, so a full board redraws
 * cheaply every frame.
 */

(function () {
  "use strict";

  var W = 640;
  var H = 560;
  var PAD_X = 84;
  var PAD_Y = 60;
  var R = 13;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elRound = document.getElementById("round");
  var elTime = document.getElementById("time");
  var elBest = document.getElementById("best");

  function fit() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", function () { fit(); draw(); });

  /* ------------------------------------------------------------- state --- */

  var round = 0;
  var cleared = 0;
  var playing = false;   /* true for the whole session, false only before start and after a loss */
  var roundActive = false; /* true while the current board is live and clickable */
  var left = [];   /* {hue, y, done} */
  var right = [];  /* {hue, y, done} */
  var picked = -1; /* index into left, or -1 */
  var timeLeft = 0;
  var timeMax = 0;
  var sparks = [];
  var shake = 0;
  var flashBad = 0;
  var last = 0;

  function huesForCount(n) {
    var hues = [];
    for (var i = 0; i < n; i++) hues.push(Math.round((360 / n) * i));
    return hues;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function pairCount() {
    return Math.min(4 + (round - 1), 8);
  }

  function timeForRound() {
    return Math.max(6, 14 - (round - 1) * 0.7);
  }

  function layout(list) {
    var n = list.length;
    var span = H - PAD_Y * 2;
    for (var i = 0; i < n; i++) {
      list[i].y = PAD_Y + (n === 1 ? span / 2 : (span / (n - 1)) * i);
      list[i].done = false;
    }
  }

  function build(n) {
    var hues = huesForCount(n);
    left = hues.map(function (h) { return { hue: h }; });
    right = shuffle(hues.slice()).map(function (h) { return { hue: h }; });
    layout(left);
    layout(right);
    picked = -1;
    timeMax = timeForRound();
    timeLeft = timeMax;
  }

  function startRound() {
    round++;
    build(pairCount());
    paintHud();
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 40 + Math.random() * 150;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.35, max: 0.7, color: color });
    }
  }

  /* -------------------------------------------------------------- input --- */

  function hit(list, x, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var px = ((clientX - rect.left) / rect.width) * W;
    var py = ((clientY - rect.top) / rect.height) * H;
    if (Math.abs(px - x) > R + 10) return -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].done) continue;
      if (Math.abs(py - list[i].y) < R + 10) return i;
    }
    return -1;
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (!roundActive) return;

    var li = hit(left, PAD_X, e.clientX, e.clientY);
    if (li !== -1) { picked = li; return; }

    var ri = hit(right, W - PAD_X, e.clientX, e.clientY);
    if (ri !== -1 && picked !== -1) {
      if (left[picked].hue === right[ri].hue) {
        left[picked].done = true;
        right[ri].done = true;
        timeLeft = Math.min(timeMax, timeLeft + 0.4);
        burst(W - PAD_X, right[ri].y, hueColor(right[ri].hue, 1), 10);
        burst(PAD_X, left[picked].y, hueColor(left[picked].hue, 1), 10);
        picked = -1;
        if (left.every(function (t) { return t.done; })) win();
      } else {
        timeLeft = Math.max(0, timeLeft - 1.4);
        shake = 0.4;
        flashBad = 0.35;
        picked = -1;
        if (timeLeft <= 0) lose();
      }
    }
  });

  overlayBtn.addEventListener("click", function () {
    if (!playing) { round = 0; cleared = 0; }
    playing = true;
    overlay.hidden = true;
    startRound();
    roundActive = true;
    last = performance.now();
    requestAnimationFrame(loop);
  });

  /* ---------------------------------------------------------- lifecycle --- */

  function win() {
    roundActive = false;
    cleared++;
    var isBest = window.Nocturne.submitScore("splice", cleared);
    elBest.textContent = window.Nocturne.bestScore("splice");

    window.Nocturne.toast("panel " + cleared + " spliced clean", "#fbbf24", 2400);

    window.setTimeout(function () {
      overlayTitle.textContent = "Panel clear";
      overlayBody.textContent = isBest
        ? "Board " + cleared + " done. New best for this browser."
        : "Board " + cleared + " done. Best is still " + window.Nocturne.bestScore("splice") + ".";
      overlayBtn.textContent = "Next panel";
      overlay.hidden = false;
    }, 500);
  }

  function lose() {
    playing = false;
    roundActive = false;
    var reached = cleared;
    var isBest = window.Nocturne.submitScore("splice", reached);
    elBest.textContent = window.Nocturne.bestScore("splice");

    window.setTimeout(function () {
      overlayTitle.textContent = "Panel dead";
      overlayBody.textContent = isBest
        ? "Cleared " + reached + ". A new best, for what it is worth."
        : "Cleared " + reached + ". Best is still " + window.Nocturne.bestScore("splice") + ".";
      overlayBtn.textContent = "Rewire";
      overlay.hidden = false;
    }, 500);
  }

  function paintHud() {
    elRound.textContent = round;
    elTime.textContent = Math.ceil(timeLeft) + "s";
  }

  /* --------------------------------------------------------------- step --- */

  function update(dt) {
    if (roundActive) {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; lose(); }
      paintHud();
    }

    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 2.4);
    if (flashBad > 0) flashBad = Math.max(0, flashBad - dt * 1.8);
  }

  /* --------------------------------------------------------------- draw --- */

  function hueColor(h, a) { return "hsla(" + h + ",75%,58%," + a + ")"; }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);

    ctx.fillStyle = "#08070e";
    ctx.fillRect(-20, -20, W + 40, H + 40);

    ctx.strokeStyle = "rgba(36,31,54,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD_X - 40, 20, W - (PAD_X - 40) * 2, H - 40);

    var i;

    if (picked !== -1 && !left[picked].done) {
      ctx.strokeStyle = "rgba(232,230,240,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(PAD_X, left[picked].y);
      ctx.lineTo(W - PAD_X, left[picked].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (i = 0; i < left.length; i++) {
      if (left[i].done) {
        ctx.strokeStyle = hueColor(left[i].hue, 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PAD_X, left[i].y);
        for (var j = 0; j < right.length; j++) {
          if (right[j].done && right[j].hue === left[i].hue) { ctx.lineTo(W - PAD_X, right[j].y); break; }
        }
        ctx.stroke();
      }
    }

    drawTerminals(left, PAD_X);
    drawTerminals(right, W - PAD_X);

    for (i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      ctx.fillStyle = "rgba(255,255,255," + Math.max(0, p.life / p.max * 0.9).toFixed(3) + ")";
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }

    if (flashBad > 0) {
      ctx.fillStyle = "rgba(239,68,68," + (flashBad * 0.22).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function drawTerminals(list, x) {
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var selected = list === left && i === picked;
      ctx.save();
      if (!t.done) {
        ctx.shadowBlur = selected ? 26 : 12;
        ctx.shadowColor = hueColor(t.hue, 1);
      }
      ctx.fillStyle = t.done ? hueColor(t.hue, 0.28) : hueColor(t.hue, 0.95);
      ctx.strokeStyle = selected ? "#e8e6f0" : hueColor(t.hue, 1);
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, t.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    if (playing || sparks.length || shake > 0 || flashBad > 0) requestAnimationFrame(loop);
  }

  /* -------------------------------------------------------------- boot --- */

  elBest.textContent = window.Nocturne.bestScore("splice");
  paintHud();
  draw();
})();
