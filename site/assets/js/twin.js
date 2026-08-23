/* TWIN — sixteen tiles, eight pairs. A match stays face-up; a miss waits
 * a beat and turns back. Score is leftover turns: 16 minus how many you
 * used, floored at 1, so a cleaner run stores a higher best.
 */

(function () {
  "use strict";

  var GLYPHS = [
    { id: "moth", color: "#a855f7", svg: '<path d="M16 7 L16 25" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 9 C8 2 1 7 4 14 C6 20 12 19 16 15 Z" fill="currentColor"/><path d="M16 9 C24 2 31 7 28 14 C26 20 20 19 16 15 Z" fill="currentColor"/>' },
    { id: "ring", color: "#38bdf8", svg: '<circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="3" fill="currentColor"/>' },
    { id: "bolt", color: "#fbbf24", svg: '<path d="M18 4 L8 18 H16 L14 28 L24 14 H16 Z" fill="currentColor"/>' },
    { id: "lamp", color: "#4ade80", svg: '<path d="M10 20 H22 L19 10 H13 Z" fill="currentColor"/><path d="M14 20 v6 h4 v-6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 28 h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    { id: "beam", color: "#e8e6f0", svg: '<path d="M6 16 L26 8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M6 16 L26 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.55"/>' },
    { id: "grid", color: "#38bdf8", svg: '<rect x="7" y="7" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 7 V25 M7 16 H25" stroke="currentColor" stroke-width="2"/>' },
    { id: "wave", color: "#4ade80", svg: '<path d="M4 18 C8 10, 12 10, 16 18 C20 26, 24 26, 28 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    { id: "shard", color: "#a855f7", svg: '<path d="M16 4 L26 22 L16 28 L6 22 Z" fill="currentColor"/>' }
  ];

  var overlay = document.getElementById("overlay");
  var overlayBtn = document.getElementById("overlay-btn");
  var gridEl = document.getElementById("grid");
  var elPairs = document.getElementById("pairs");
  var elTurns = document.getElementById("turns");
  var elBest = document.getElementById("best");

  var deck = [];
  var open = [];
  var matched = 0;
  var turns = 0;
  var locked = false;
  var done = false;

  function shuffle(arr) {
    var i;
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function scoreFor(turnCount) {
    return Math.max(1, 24 - turnCount);
  }

  function paintHud() {
    elPairs.textContent = matched + " / 8";
    elTurns.textContent = String(turns);
  }

  function win() {
    done = true;
    var score = scoreFor(turns);
    var isBest = window.Nocturne.submitScore("twin", score);
    elBest.textContent = window.Nocturne.bestScore("twin");
    overlay.querySelector("#overlay-title").textContent = "Paired";
    overlay.querySelector("#overlay-body").textContent = isBest
      ? "New best: " + score + " after " + turns + " turns."
      : "Scored " + score + " in " + turns + " turns. Best is still " + window.Nocturne.bestScore("twin") + ".";
    overlayBtn.textContent = "Again";
    overlay.hidden = false;
  }

  function faceOf(node) {
    return node.getAttribute("data-face") === "up";
  }

  function setFace(node, up) {
    node.setAttribute("data-face", up ? "up" : "down");
    node.setAttribute("aria-pressed", up ? "true" : "false");
  }

  function flip(node) {
    if (done || locked) return;
    if (node.getAttribute("data-matched") === "true") return;
    if (faceOf(node)) return;
    setFace(node, true);
    open.push(node);
    if (open.length < 2) return;

    turns++;
    paintHud();
    var a = open[0];
    var b = open[1];
    open = [];
    if (a.getAttribute("data-id") === b.getAttribute("data-id")) {
      a.setAttribute("data-matched", "true");
      b.setAttribute("data-matched", "true");
      matched++;
      paintHud();
      if (matched === 8) win();
      return;
    }
    locked = true;
    window.setTimeout(function () {
      setFace(a, false);
      setFace(b, false);
      locked = false;
    }, 640);
  }

  function deal() {
    deck = [];
    GLYPHS.forEach(function (g) {
      deck.push(g);
      deck.push(g);
    });
    shuffle(deck);
    matched = 0;
    turns = 0;
    open = [];
    locked = false;
    done = false;
    gridEl.innerHTML = "";
    gridEl.hidden = false;
    overlay.hidden = true;
    var i;
    for (i = 0; i < deck.length; i++) {
      (function (glyph) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "twin__tile";
        btn.setAttribute("data-id", glyph.id);
        btn.setAttribute("data-face", "down");
        btn.setAttribute("aria-label", "facedown tile");
        btn.setAttribute("aria-pressed", "false");
        btn.innerHTML = '<span class="twin__face" style="color:' + glyph.color + '">' +
          '<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">' + glyph.svg + "</svg></span>";
        btn.addEventListener("click", function () { flip(btn); });
        gridEl.appendChild(btn);
      })(deck[i]);
    }
    paintHud();
  }

  overlayBtn.addEventListener("click", deal);
  window.addEventListener("keydown", function (e) {
    if (overlay.hidden === false && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      deal();
    }
  });

  elBest.textContent = window.Nocturne.bestScore("twin");
})();
