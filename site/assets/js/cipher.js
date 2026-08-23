/* CIPHER — a small crossword whose answers are already in the building.
 * The grid is fixed; only the typed letters move. Completing every white
 * square is the whole run.
 */

(function () {
  "use strict";

  var PATTERN = [
    "PULSE..",
    ".RADIO.",
    "..T....",
    "MOTH...",
    "VEIL...",
    "..CORD.",
    "..ECHO."
  ];

  var WORDS = [
    { n: 1, word: "PULSE", r: 0, c: 0, dir: "across", clue: "Cabinet 01. Shards, motes, a shockwave." },
    { n: 2, word: "LATTICE", r: 0, c: 2, dir: "down", clue: "Cabinet 02. Rotate until every lamp lights." },
    { n: 3, word: "RADIO", r: 1, c: 1, dir: "across", clue: "Corner tuner. Walks with you." },
    { n: 4, word: "MOTH", r: 3, c: 0, dir: "across", clue: "What you catch. Also a sealed cabinet." },
    { n: 5, word: "VEIL", r: 4, c: 0, dir: "across", clue: "Beams that read motion, not place." },
    { n: 6, word: "CORD", r: 5, c: 2, dir: "across", clue: "Hangs from the ceiling. Pull it." },
    { n: 7, word: "ECHO", r: 6, c: 2, dir: "across", clue: "Cabinet 03. Play the phrase back." }
  ];

  var ROWS = PATTERN.length;
  var COLS = PATTERN[0].length;

  var overlay = document.getElementById("overlay");
  var overlayBtn = document.getElementById("overlay-btn");
  var board = document.getElementById("board");
  var gridEl = document.getElementById("grid");
  var cluesEl = document.getElementById("clues");
  var elFilled = document.getElementById("filled");
  var elTotal = document.getElementById("total");
  var elBest = document.getElementById("best");

  var cells = [];
  var letters = [];
  var active = { r: 0, c: 0, dir: "across" };
  var done = false;
  var total = 0;

  function isBlock(r, c) {
    return r < 0 || c < 0 || r >= ROWS || c >= COLS || PATTERN[r][c] === ".";
  }

  function wordAt(r, c, dir) {
    var i;
    for (i = 0; i < WORDS.length; i++) {
      var w = WORDS[i];
      if (w.dir !== dir) continue;
      if (dir === "across" && w.r === r && c >= w.c && c < w.c + w.word.length) return w;
      if (dir === "down" && w.c === c && r >= w.r && r < w.r + w.word.length) return w;
    }
    return null;
  }

  function cellIndex(r, c) { return r * COLS + c; }

  function paint() {
    var current = wordAt(active.r, active.c, active.dir);
    var i;
    for (i = 0; i < cells.length; i++) {
      var node = cells[i];
      if (node.getAttribute("data-block") === "true") continue;
      var r = +node.getAttribute("data-r");
      var c = +node.getAttribute("data-c");
      var on = current && (
        (current.dir === "across" && r === current.r && c >= current.c && c < current.c + current.word.length) ||
        (current.dir === "down" && c === current.c && r >= current.r && r < current.r + current.word.length)
      );
      node.setAttribute("data-on", on ? "true" : "false");
      node.setAttribute("data-here", (r === active.r && c === active.c) ? "true" : "false");
      node.lastChild.textContent = letters[cellIndex(r, c)] || "";
    }
    var items = cluesEl.querySelectorAll("li");
    for (i = 0; i < items.length; i++) {
      items[i].setAttribute("data-on", current && +items[i].getAttribute("data-n") === current.n ? "true" : "false");
    }
    var filled = 0;
    for (i = 0; i < letters.length; i++) if (letters[i]) filled++;
    elFilled.textContent = String(filled);
  }

  function checkWin() {
    if (done) return;
    var r, c;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        if (isBlock(r, c)) continue;
        if (letters[cellIndex(r, c)] !== PATTERN[r][c]) return;
      }
    }
    done = true;
    var isBest = window.Nocturne.submitScore("cipher", WORDS.length);
    elBest.textContent = window.Nocturne.bestScore("cipher");
    window.Nocturne.toast(isBest ? "the house agrees" : "filled again", "#fbbf24", 3200);
    overlay.querySelector("#overlay-title").textContent = "Clear";
    overlay.querySelector("#overlay-body").textContent = "Every square. The house already knew the answers.";
    overlayBtn.textContent = "Again";
    overlay.hidden = false;
  }

  function move(dr, dc) {
    var r = active.r + dr;
    var c = active.c + dc;
    var guard = 0;
    while (isBlock(r, c) && guard < 12) {
      r += dr;
      c += dc;
      guard++;
    }
    if (!isBlock(r, c)) {
      active.r = r;
      active.c = c;
    }
    paint();
  }

  function putLetter(ch) {
    if (done) return;
    letters[cellIndex(active.r, active.c)] = ch;
    if (active.dir === "across") move(0, 1);
    else move(1, 0);
    paint();
    checkWin();
  }

  function erase() {
    if (done) return;
    var idx = cellIndex(active.r, active.c);
    if (letters[idx]) {
      letters[idx] = "";
    } else if (active.dir === "across") {
      move(0, -1);
      letters[cellIndex(active.r, active.c)] = "";
    } else {
      move(-1, 0);
      letters[cellIndex(active.r, active.c)] = "";
    }
    paint();
  }

  function selectWord(w, keepCell) {
    active.dir = w.dir;
    if (!keepCell) {
      active.r = w.r;
      active.c = w.c;
    }
    paint();
  }

  function build() {
    var r, c, i;
    gridEl.innerHTML = "";
    cluesEl.innerHTML = "";
    cells = [];
    letters = [];
    total = 0;
    var numbers = {};
    for (i = 0; i < WORDS.length; i++) {
      numbers[WORDS[i].r + "," + WORDS[i].c] = WORDS[i].n;
    }
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "xword__cell";
        btn.setAttribute("data-r", String(r));
        btn.setAttribute("data-c", String(c));
        if (isBlock(r, c)) {
          btn.setAttribute("data-block", "true");
          btn.tabIndex = -1;
          btn.setAttribute("aria-hidden", "true");
        } else {
          total++;
          letters[cellIndex(r, c)] = "";
          var num = numbers[r + "," + c];
          if (num) {
            var badge = document.createElement("span");
            badge.className = "xword__num";
            badge.textContent = String(num);
            btn.appendChild(badge);
          }
          var glyph = document.createElement("span");
          btn.appendChild(glyph);
          btn.addEventListener("click", function () {
            var rr = +this.getAttribute("data-r");
            var cc = +this.getAttribute("data-c");
            var same = active.r === rr && active.c === cc;
            active.r = rr;
            active.c = cc;
            if (same) {
              var other = active.dir === "across" ? "down" : "across";
              if (wordAt(rr, cc, other)) active.dir = other;
            } else if (!wordAt(rr, cc, active.dir)) {
              active.dir = wordAt(rr, cc, "across") ? "across" : "down";
            }
            paint();
          });
        }
        gridEl.appendChild(btn);
        cells.push(btn);
      }
    }
    for (i = 0; i < WORDS.length; i++) {
      (function (w) {
        var li = document.createElement("li");
        li.setAttribute("data-n", String(w.n));
        li.innerHTML = "<b>" + w.n + " " + w.dir + "</b>" + w.clue;
        li.addEventListener("click", function () { selectWord(w, false); });
        cluesEl.appendChild(li);
      })(WORDS[i]);
    }
    elTotal.textContent = String(total);
    active = { r: 0, c: 0, dir: "across" };
    done = false;
    paint();
  }

  function start() {
    overlay.hidden = true;
    board.hidden = false;
    build();
  }

  overlayBtn.addEventListener("click", start);

  window.addEventListener("keydown", function (e) {
    if (overlay.hidden === false && e.key === "Enter") { start(); return; }
    if (board.hidden || done && e.key.length === 1) return;
    if (e.key === "ArrowRight") { active.dir = "across"; move(0, 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { active.dir = "across"; move(0, -1); e.preventDefault(); }
    else if (e.key === "ArrowDown") { active.dir = "down"; move(1, 0); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active.dir = "down"; move(-1, 0); e.preventDefault(); }
    else if (e.key === "Backspace") { erase(); e.preventDefault(); }
    else if (/^[a-zA-Z]$/.test(e.key)) { putLetter(e.key.toUpperCase()); e.preventDefault(); }
  });

  elBest.textContent = window.Nocturne.bestScore("cipher");
})();
