/* STATIC — the reward is not a fourth cabinet's worth of game, it is one
 * quiet room. Drag the needle until it holds inside the clear band; hold it
 * there and the noise resolves into something that was always underneath it.
 */

(function () {
  "use strict";

  var W = 520;
  var H = 340;
  var HOLD_TARGET = 1.6;

  var canvas = document.getElementById("dial");
  var ctx = canvas.getContext("2d");
  var hint = document.getElementById("dial-hint");
  var reveal = document.getElementById("reveal");

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
  var target = minA + (maxA - minA) * (0.3 + Math.random() * 0.4);
  var band = 0.055;

  var needle = minA + Math.random() * (maxA - minA);
  var dragging = false;
  var hold = 0;
  var done = false;
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
    if (done) return;
    dragging = true;
    needle = angleFrom(e.clientX, e.clientY);
  });
  window.addEventListener("pointermove", function (e) {
    if (!dragging || done) return;
    needle = angleFrom(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", function () { dragging = false; });

  window.addEventListener("keydown", function (e) {
    if (done) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { needle = Math.max(minA, needle - 0.03); e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { needle = Math.min(maxA, needle + 0.03); e.preventDefault(); }
  });
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-label", "Tuning dial");

  function update(dt) {
    if (done) return;
    var inBand = Math.abs(needle - target) < band;
    hold = inBand ? Math.min(HOLD_TARGET, hold + dt) : Math.max(0, hold - dt * 1.4);
    hint.textContent = inBand
      ? (hold >= HOLD_TARGET ? "holding." : "there. hold it.")
      : "turning static into something else, somewhere near here.";

    if (hold >= HOLD_TARGET) finish();

    for (var i = 0; i < noise.length; i++) {
      noise[i] += (Math.random() - 0.5) * (inBand ? 0.4 : 1.6);
      noise[i] = Math.max(0, Math.min(1, noise[i]));
    }
  }

  function finish() {
    done = true;
    hint.textContent = "clear.";
    window.Nocturne.toast("signal holds", "#fbbf24", 3200);
    window.setTimeout(function () { reveal.hidden = false; }, 500);
  }

  function draw() {
    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, W, H);

    var i;
    var barW = W / noise.length;
    for (i = 0; i < noise.length; i++) {
      var h = noise[i] * (H - 70) * (done ? 0.08 : 1);
      ctx.fillStyle = "rgba(155,150,179," + (0.1 + noise[i] * 0.12).toFixed(3) + ")";
      ctx.fillRect(i * barW, H - 60 - h, barW - 1, h);
    }

    ctx.strokeStyle = "rgba(36,31,54,0.9)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, minA, maxA);
    ctx.stroke();

    ctx.strokeStyle = done ? "#4ade80" : "#fbbf24";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, target - band, target + band);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needle);
    ctx.shadowBlur = 16;
    ctx.shadowColor = done ? "#4ade80" : "#e8e6f0";
    ctx.strokeStyle = done ? "#4ade80" : "#e8e6f0";
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
  requestAnimationFrame(loop);
})();
