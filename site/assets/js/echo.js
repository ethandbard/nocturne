/* ECHO — the room plays a phrase, you play it back, it gets longer.
 *
 * Nine pads, nine notes of a pentatonic scale, so a wrong answer still sounds
 * like music rather than a buzzer. Audio is built lazily on the first gesture
 * because browsers refuse to start an AudioContext before one.
 */

(function () {
  "use strict";

  /* Pentatonic offsets in semitones from A3. Any subset of these played in any
     order stays consonant, which keeps a long sequence pleasant to sit through. */
  var STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  var BASE = 220;

  var grid = document.getElementById("grid");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayBody = document.getElementById("overlay-body");
  var overlayBtn = document.getElementById("overlay-btn");
  var elRound = document.getElementById("round");
  var elLength = document.getElementById("length");
  var elBest = document.getElementById("best");

  var pads = [];
  var sequence = [];
  var at = 0;
  var round = 0;
  var accepting = false;
  var timers = [];

  /* -------------------------------------------------------------- audio --- */

  var audio = null;

  function tone(step, ms) {
    if (!audio) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
    }
    if (audio.state === "suspended") audio.resume();

    var now = audio.currentTime;
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = BASE * Math.pow(2, step / 12);

    /* Short attack and a long-ish exponential tail: a plain on/off gate clicks
       audibly at these durations. */
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000 + 0.25);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.3);
  }

  /* --------------------------------------------------------------- pads --- */

  for (var i = 0; i < 9; i++) {
    (function (n) {
      var pad = document.createElement("button");
      pad.type = "button";
      pad.className = "pad";
      pad.setAttribute("aria-label", "Pad " + (n + 1));
      /* Hue walks green -> cyan -> blue -> purple across the grid. The top of
         the range stops at 292 deliberately: past that it turns pink and reads
         as the wrong-pad colour. */
      pad.style.setProperty("--hue", String(140 + n * 19));
      pad.addEventListener("click", function () { press(n); });
      grid.appendChild(pad);
      pads.push(pad);
    })(i);
  }

  function flash(n, ms) {
    pads[n].classList.add("pad--lit");
    tone(STEPS[n], ms);
    window.setTimeout(function () {
      pads[n].classList.remove("pad--lit");
    }, ms);
  }

  /* ---------------------------------------------------------- sequencing --- */

  function clearTimers() {
    timers.forEach(window.clearTimeout);
    timers.length = 0;
  }

  function gapForRound() {
    /* Tightens as the sequence grows, with a floor so it stays playable. */
    return Math.max(260, 640 - round * 26);
  }

  function playSequence() {
    accepting = false;
    grid.classList.add("grid--watching");
    var gap = gapForRound();
    var lit = Math.max(150, gap - 130);

    sequence.forEach(function (n, i) {
      timers.push(window.setTimeout(function () { flash(n, lit); }, 450 + i * gap));
    });

    timers.push(window.setTimeout(function () {
      accepting = true;
      at = 0;
      grid.classList.remove("grid--watching");
    }, 450 + sequence.length * gap));
  }

  function nextRound() {
    round++;
    sequence.push(Math.floor(Math.random() * 9));
    paintHud();

    /* Five rounds in, something is drawn to the noise. */
    if (round >= 5) window.Nocturne.revealMoth("echo");

    playSequence();
  }

  function press(n) {
    if (!accepting) return;

    flash(n, 190);

    if (sequence[at] !== n) { lose(n); return; }

    at++;
    if (at < sequence.length) return;

    accepting = false;
    window.setTimeout(nextRound, 700);
  }

  /* ---------------------------------------------------------- lifecycle --- */

  function lose(n) {
    accepting = false;
    clearTimers();
    pads[n].classList.add("pad--wrong");
    window.setTimeout(function () { pads[n].classList.remove("pad--wrong"); }, 600);

    var reached = round;
    var isBest = window.Nocturne.submitScore("echo", reached);
    elBest.textContent = window.Nocturne.bestScore("echo");

    window.setTimeout(function () {
      overlayTitle.textContent = "Out of phase";
      overlayBody.textContent = isBest
        ? "Round " + reached + ", and a new best. The room sounds pleased."
        : "Round " + reached + ". Best is still " + window.Nocturne.bestScore("echo") + ".";
      overlayBtn.textContent = "Listen again";
      overlay.hidden = false;
    }, 750);
  }

  function start() {
    clearTimers();
    sequence.length = 0;
    round = 0;
    at = 0;
    overlay.hidden = true;
    /* One silent tone unlocks the audio context inside the click handler, so
       the first real note is not swallowed. */
    tone(STEPS[0], 1);
    window.setTimeout(nextRound, 400);
  }

  function paintHud() {
    elRound.textContent = round;
    elLength.textContent = sequence.length;
  }

  overlayBtn.addEventListener("click", start);

  /* -------------------------------------------------------------- boot --- */

  elBest.textContent = window.Nocturne.bestScore("echo");
  paintHud();
})();
