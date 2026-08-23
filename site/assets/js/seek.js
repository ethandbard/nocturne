/* SEEK — a letter field seeded with words the arcade already uses.
 * Placement is random each run; the bank is not. Drag in a straight line
 * (any of eight directions) to claim a word.
 */

(function () {
  "use strict";

  var SIZE = 10;
  var LIST = ["PULSE", "ECHO", "VEIL", "WYRM", "MOTH", "CORD", "RADIO", "NEON", "BEAM", "MOTE"];
  var DIRS = [
    { r: 0, c: 1 }, { r: 0, c: -1 },
    { r: 1, c: 0 }, { r: -1, c: 0 },
    { r: 1, c: 1 }, { r: 1, c: -1 },
    { r: -1, c: 1 }, { r: -1, c: -1 }
  ];
  var FILL = "ABCDEFGHILMNOPRSTUVWXY";

  var overlay = document.getElementById("overlay");
  var overlayBtn = document.getElementById("overlay-btn");
  var board = document.getElementById("board");
  var gridEl = document.getElementById("grid");
  var bankEl = document.getElementById("bank");
  var elFound = document.getElementById("found");
  var elTotal = document.getElementById("total");
  var elBest = document.getElementById("best");

  var grid = [];
  var placed = [];
  var found = [];
  var cells = [];
  var drag = null;
  var done = false;

  function idx(r, c) { return r * SIZE + c; }

  function inBounds(r, c) {
    return r >= 0 && c >= 0 && r < SIZE && c < SIZE;
  }

  function canPlace(word, r, c, dir) {
    var i;
    for (i = 0; i < word.length; i++) {
      var rr = r + dir.r * i;
      var cc = c + dir.c * i;
      if (!inBounds(rr, cc)) return false;
      var ch = grid[idx(rr, cc)];
      if (ch && ch !== word[i]) return false;
    }
    return true;
  }

  function place(word, r, c, dir) {
    var cellsAt = [];
    var i;
    for (i = 0; i < word.length; i++) {
      var rr = r + dir.r * i;
      var cc = c + dir.c * i;
      grid[idx(rr, cc)] = word[i];
      cellsAt.push({ r: rr, c: cc });
    }
    placed.push({ word: word, cells: cellsAt });
  }

  function seed() {
    grid = new Array(SIZE * SIZE);
    placed = [];
    var words = LIST.slice();
    var w, attempt, placedOk;
    for (w = 0; w < words.length; w++) {
      placedOk = false;
      for (attempt = 0; attempt < 80; attempt++) {
        var dir = DIRS[Math.floor(Math.random() * DIRS.length)];
        var r = Math.floor(Math.random() * SIZE);
        var c = Math.floor(Math.random() * SIZE);
        if (canPlace(words[w], r, c, dir)) {
          place(words[w], r, c, dir);
          placedOk = true;
          break;
        }
      }
      if (!placedOk) {
        /* A tight 10x10 can refuse a word; retry the whole seed rather than
           ship a bank that cannot be finished. */
        return false;
      }
    }
    var i;
    for (i = 0; i < grid.length; i++) {
      if (!grid[i]) grid[i] = FILL[Math.floor(Math.random() * FILL.length)];
    }
    return true;
  }

  function lineBetween(a, b) {
    var dr = b.r - a.r;
    var dc = b.c - a.c;
    var steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return [a];
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
    var sr = dr === 0 ? 0 : dr / Math.abs(dr);
    var sc = dc === 0 ? 0 : dc / Math.abs(dc);
    var out = [];
    var i;
    for (i = 0; i <= steps; i++) out.push({ r: a.r + sr * i, c: a.c + sc * i });
    return out;
  }

  function lettersOf(path) {
    return path.map(function (p) { return grid[idx(p.r, p.c)]; }).join("");
  }

  function markPath(path, attr, value) {
    var i;
    for (i = 0; i < cells.length; i++) cells[i].setAttribute("data-mark", "off");
    if (!path) return;
    for (i = 0; i < path.length; i++) {
      cells[idx(path[i].r, path[i].c)].setAttribute("data-mark", value);
    }
  }

  function paintFound() {
    var i, j;
    for (i = 0; i < placed.length; i++) {
      if (found.indexOf(placed[i].word) === -1) continue;
      for (j = 0; j < placed[i].cells.length; j++) {
        var p = placed[i].cells[j];
        cells[idx(p.r, p.c)].setAttribute("data-found", "true");
      }
    }
    var items = bankEl.querySelectorAll("li");
    for (i = 0; i < items.length; i++) {
      items[i].setAttribute("data-found", found.indexOf(items[i].getAttribute("data-word")) !== -1 ? "true" : "false");
    }
    elFound.textContent = String(found.length);
  }

  function claim(word) {
    var i;
    for (i = 0; i < placed.length; i++) {
      var fwd = placed[i].word;
      var rev = fwd.split("").reverse().join("");
      if (word !== fwd && word !== rev) continue;
      if (found.indexOf(fwd) !== -1) return;
      found.push(fwd);
      window.Nocturne.toast(fwd.toLowerCase(), "#4ade80", 1200);
      paintFound();
      if (found.length === LIST.length) win();
      return;
    }
  }

  function win() {
    done = true;
    var isBest = window.Nocturne.submitScore("seek", found.length);
    elBest.textContent = window.Nocturne.bestScore("seek");
    overlay.querySelector("#overlay-title").textContent = "All of them";
    overlay.querySelector("#overlay-body").textContent = isBest
      ? "New best: every word in the field."
      : "The field is empty. Best is still " + window.Nocturne.bestScore("seek") + ".";
    overlayBtn.textContent = "Again";
    overlay.hidden = false;
  }

  function cellFromEvent(e) {
    var node = e.target.closest(".seek__cell");
    if (!node) return null;
    return { r: +node.getAttribute("data-r"), c: +node.getAttribute("data-c") };
  }

  function build() {
    var tries = 0;
    while (!seed() && tries < 12) tries++;
    found = [];
    done = false;
    gridEl.innerHTML = "";
    bankEl.innerHTML = "";
    cells = [];
    var r, c, i;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seek__cell";
        btn.setAttribute("data-r", String(r));
        btn.setAttribute("data-c", String(c));
        btn.textContent = grid[idx(r, c)];
        gridEl.appendChild(btn);
        cells.push(btn);
      }
    }
    for (i = 0; i < LIST.length; i++) {
      var li = document.createElement("li");
      li.setAttribute("data-word", LIST[i]);
      li.textContent = LIST[i];
      bankEl.appendChild(li);
    }
    elTotal.textContent = String(LIST.length);
    paintFound();
  }

  gridEl.addEventListener("pointerdown", function (e) {
    if (done || board.hidden) return;
    var at = cellFromEvent(e);
    if (!at) return;
    drag = { start: at, path: [at] };
    gridEl.setPointerCapture(e.pointerId);
    markPath(drag.path, "on");
    e.preventDefault();
  });

  gridEl.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var at = cellFromEvent(e);
    if (!at) return;
    var path = lineBetween(drag.start, at);
    if (path) {
      drag.path = path;
      markPath(path, "on");
    }
  });

  function endDrag() {
    if (!drag) return;
    var text = lettersOf(drag.path);
    var rev = text.split("").reverse().join("");
    claim(text);
    claim(rev);
    markPath(null, "off");
    drag = null;
  }

  gridEl.addEventListener("pointerup", endDrag);
  gridEl.addEventListener("pointercancel", endDrag);

  function start() {
    overlay.hidden = true;
    board.hidden = false;
    build();
  }

  overlayBtn.addEventListener("click", start);
  window.addEventListener("keydown", function (e) {
    if (overlay.hidden === false && e.key === "Enter") start();
  });

  elBest.textContent = window.Nocturne.bestScore("seek");
})();
