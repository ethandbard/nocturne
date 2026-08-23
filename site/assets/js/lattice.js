/* LATTICE — rotate the conduits until current reaches every node.
 *
 * Boards are generated as a random spanning tree over the grid, then every
 * cell is spun a random number of quarter turns. That guarantees a solvable
 * board (undo the spins) and guarantees every cell is reachable (a spanning
 * tree touches all of them), so "all cells powered" is a valid win test.
 *
 * Connections are a 4-bit mask: 1=N, 2=E, 4=S, 8=W.
 */

(function () {
  "use strict";

  var N = 1, E = 2, S = 4, W = 8;
  var DX = {}; DX[N] = 0; DX[E] = 1; DX[S] = 0; DX[W] = -1;
  var DY = {}; DY[N] = -1; DY[E] = 0; DY[S] = 1; DY[W] = 0;
  var OPPOSITE = {}; OPPOSITE[N] = S; OPPOSITE[E] = W; OPPOSITE[S] = N; OPPOSITE[W] = E;
  var DIRS = [N, E, S, W];

  var SIZE_FOR_LEVEL = [4, 4, 5, 5, 6, 6, 7];

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elLevel = document.getElementById("level");
  var elMoves = document.getElementById("moves");
  var elBest = document.getElementById("best");

  var CW = 640;
  var CH = 640;

  function fit() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", function () { fit(); draw(); });

  /* ------------------------------------------------------------- state --- */

  var size = 4;
  var cells = [];       /* {mask, angle, target, deg} in row-major order */
  var powered = [];
  var sourceIndex = 0;
  var level = 1;
  var moves = 0;
  var cleared = 0;
  var solved = false;
  var playing = false;
  var winGlow = 0;

  function idx(x, y) { return y * size + x; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < size && y < size; }
  function popcount(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

  /* --------------------------------------------------------- generation --- */

  /* Randomised depth-first spanning tree. Iterative so a 7x7 board cannot
     bump into recursion limits on anything unusual. */
  function carve() {
    var masks = new Array(size * size).fill(0);
    var seen = new Array(size * size).fill(false);
    var sx = Math.floor(size / 2);
    var sy = Math.floor(size / 2);
    sourceIndex = idx(sx, sy);

    var stack = [[sx, sy]];
    seen[sourceIndex] = true;

    while (stack.length) {
      var top = stack[stack.length - 1];
      var x = top[0], y = top[1];

      var options = [];
      for (var i = 0; i < 4; i++) {
        var d = DIRS[i];
        var nx = x + DX[d], ny = y + DY[d];
        if (inBounds(nx, ny) && !seen[idx(nx, ny)]) options.push(d);
      }

      if (!options.length) { stack.pop(); continue; }

      var dir = options[Math.floor(Math.random() * options.length)];
      var tx = x + DX[dir], ty = y + DY[dir];
      masks[idx(x, y)] |= dir;
      masks[idx(tx, ty)] |= OPPOSITE[dir];
      seen[idx(tx, ty)] = true;
      stack.push([tx, ty]);
    }

    return masks;
  }

  function rotateMask(mask, turns) {
    for (var i = 0; i < turns; i++) {
      mask = ((mask << 1) | (mask >> 3)) & 15;
    }
    return mask;
  }

  function build(lvl) {
    size = SIZE_FOR_LEVEL[Math.min(lvl - 1, SIZE_FOR_LEVEL.length - 1)];
    var masks = carve();

    /* `base` is the orientation the cell is drawn in; `turns` counts the
       quarter turns the player has added on top. Keeping them apart is what
       lets the canvas rotation and the logical mask stay in agreement — the
       draw code rotates `base`, and nothing else ever has to un-rotate it. */
    cells = masks.map(function (m) {
      var base = rotateMask(m, Math.floor(Math.random() * 4));
      return {
        base: base,
        turns: 0,
        mask: base,
        deg: popcount(m),
        angle: 0,     /* drawn rotation, eased toward target */
        target: 0
      };
    });

    /* A board that arrives already solved is an anticlimax. Spin one cell,
       in its base orientation so nothing appears to move on arrival. */
    computePower();
    if (isSolved()) {
      var victim = cells[(sourceIndex + 1) % cells.length];
      victim.base = rotateMask(victim.base, 1);
      victim.mask = victim.base;
      computePower();
    }

    moves = 0;
    solved = false;
    winGlow = 0;
    paintHud();
  }

  /* ------------------------------------------------------------- power --- */

  function computePower() {
    powered = new Array(cells.length).fill(false);
    var queue = [sourceIndex];
    powered[sourceIndex] = true;

    while (queue.length) {
      var at = queue.pop();
      var x = at % size;
      var y = Math.floor(at / size);

      for (var i = 0; i < 4; i++) {
        var d = DIRS[i];
        if (!(cells[at].mask & d)) continue;
        var nx = x + DX[d], ny = y + DY[d];
        if (!inBounds(nx, ny)) continue;
        var ni = idx(nx, ny);
        if (powered[ni]) continue;
        /* Both halves of the join must point at each other. */
        if (!(cells[ni].mask & OPPOSITE[d])) continue;
        powered[ni] = true;
        queue.push(ni);
      }
    }
  }

  function isSolved() {
    for (var i = 0; i < powered.length; i++) if (!powered[i]) return false;
    return true;
  }

  /* ------------------------------------------------------------- input --- */

  function cellAt(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var x = ((clientX - rect.left) / rect.width) * CW;
    var y = ((clientY - rect.top) / rect.height) * CH;
    var pad = 30;
    var span = (CW - pad * 2) / size;
    var gx = Math.floor((x - pad) / span);
    var gy = Math.floor((y - pad) / span);
    if (!inBounds(gx, gy)) return -1;
    return idx(gx, gy);
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (!playing || solved) return;
    var at = cellAt(e.clientX, e.clientY);
    if (at < 0) return;

    var cell = cells[at];
    cell.turns++;
    cell.mask = rotateMask(cell.base, cell.turns);
    cell.target = cell.turns * (Math.PI / 2);
    moves++;
    computePower();
    paintHud();

    if (isSolved()) win();
  });

  overlayBtn.addEventListener("click", function () {
    if (!playing) { level = 1; cleared = 0; }
    playing = true;
    overlay.hidden = true;
    build(level);
  });

  /* ---------------------------------------------------------- lifecycle --- */

  function win() {
    solved = true;
    winGlow = 1;
    cleared++;

    var isBest = window.Nocturne.submitScore("lattice", cleared);
    elBest.textContent = window.Nocturne.bestScore("lattice");

    /* First clear of the session is what shakes the moth loose. */
    window.Nocturne.revealMoth("lattice");
    window.Nocturne.toast("current restored in " + moves + " turns", "#a855f7", 2600);

    window.setTimeout(function () {
      level++;
      overlayTitle.textContent = "Level " + level;
      overlayBody.textContent = isBest
        ? "Board " + cleared + " cleared. That is a new record for this browser."
        : "Board " + cleared + " cleared. The next one is bigger.";
      overlayBtn.textContent = "Next board";
      overlay.hidden = false;
    }, 1500);
  }

  function paintHud() {
    elLevel.textContent = level;
    elMoves.textContent = moves;
  }

  /* -------------------------------------------------------------- draw --- */

  function draw() {
    ctx.fillStyle = "#08070e";
    ctx.fillRect(0, 0, CW, CH);

    if (!cells.length) return;

    var pad = 30;
    var span = (CW - pad * 2) / size;
    var half = span / 2;

    for (var i = 0; i < cells.length; i++) {
      var x = i % size;
      var y = Math.floor(i / size);
      var cx = pad + x * span + half;
      var cy = pad + y * span + half;
      var c = cells[i];
      var live = powered[i];

      /* Cell well */
      ctx.fillStyle = live ? "rgba(109,40,217,0.14)" : "rgba(20,18,31,0.75)";
      ctx.strokeStyle = "rgba(36,31,54,0.9)";
      ctx.lineWidth = 1;
      roundRect(cx - half + 3, cy - half + 3, span - 6, span - 6, 8);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(c.angle);

      var colour = live ? "#a855f7" : "#3b3550";
      ctx.strokeStyle = colour;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(4, span * 0.11);
      if (live) {
        ctx.shadowBlur = 14 + winGlow * 22;
        ctx.shadowColor = "#a855f7";
      }

      /* Draw the base orientation; the canvas rotation above supplies the
         player's quarter turns. */
      var drawMask = c.base;
      var reach = half - 6;

      ctx.beginPath();
      if (drawMask & N) { ctx.moveTo(0, 0); ctx.lineTo(0, -reach); }
      if (drawMask & S) { ctx.moveTo(0, 0); ctx.lineTo(0, reach); }
      if (drawMask & W) { ctx.moveTo(0, 0); ctx.lineTo(-reach, 0); }
      if (drawMask & E) { ctx.moveTo(0, 0); ctx.lineTo(reach, 0); }
      ctx.stroke();

      /* A leaf is a lamp: it is the thing you are trying to light. */
      if (c.deg === 1) {
        ctx.fillStyle = live ? "#4ade80" : "#2a2740";
        if (live) { ctx.shadowBlur = 20; ctx.shadowColor = "#4ade80"; }
        ctx.beginPath();
        ctx.arc(0, 0, span * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (i === sourceIndex) {
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = "#38bdf8";
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(cx, cy, span * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (winGlow > 0) {
      ctx.fillStyle = "rgba(74,222,128," + (winGlow * 0.13).toFixed(3) + ")";
      ctx.fillRect(0, 0, CW, CH);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Eases each cell toward its target rotation. Runs forever: the board is
     cheap to draw and it keeps the win glow and rotations smooth without
     start/stop bookkeeping. */
  function tick() {
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var diff = c.target - c.angle;
      if (Math.abs(diff) > 0.001) c.angle += diff * 0.22;
      else c.angle = c.target;
    }
    if (winGlow > 0) winGlow = Math.max(0, winGlow - 0.012);
    draw();
    requestAnimationFrame(tick);
  }

  /* -------------------------------------------------------------- boot --- */

  elBest.textContent = window.Nocturne.bestScore("lattice");
  paintHud();
  tick();
})();
