/* THE RADIO — a small tuner that sits in the corner of every page.
 *
 * HTML5 <audio> against Icecast mounts, not a hidden YouTube iframe.
 * YouTube will not keep playing a 2px player, and live-video ids go stale.
 * Nightride FM's mounts send CORS * and honour a site Referer, which is
 * what lets the oscilloscope read the stream.
 *
 * Playback never survives a navigation — this is a plain multi-page site, so
 * every load tears the player down. What persists is the choice: which
 * station, and how loud. Power always starts off, so nothing plays with
 * sound before you have asked for it.
 */

(function () {
  "use strict";

  var STATIONS = [
    {
      id: "nightride",
      call: "NIGHTRIDE",
      freq: "88.1",
      tag: "synthwave, all night",
      via: "Nightride FM",
      urls: ["https://stream.nightride.fm/nightride.mp3"]
    },
    {
      id: "chillsynth",
      call: "CHILLSYNTH",
      freq: "91.7",
      tag: "lo-fi pads, no vocals",
      via: "Nightride FM",
      urls: ["https://stream.nightride.fm/chillsynth.mp3"]
    },
    {
      id: "darksynth",
      call: "DARKSYNTH",
      freq: "96.4",
      tag: "bass, and a threat",
      via: "Nightride FM",
      urls: ["https://stream.nightride.fm/darksynth.mp3"]
    },
    {
      id: "spacesynth",
      call: "SPACESYNTH",
      freq: "102.8",
      tag: "something between the stars",
      via: "Nightride FM",
      urls: ["https://stream.nightride.fm/spacesynth.mp3"]
    }
  ];

  var KEY_STATION = "nocturne.radio.station";
  var KEY_VOLUME = "nocturne.radio.volume";

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* Nothing here is worth breaking a page over. */
    }
  }

  function stationIndexFromSaved() {
    var saved = read(KEY_STATION, "nightride");
    var i;
    if (typeof saved === "number") {
      if (saved >= 0 && saved < STATIONS.length) return saved;
      return 0;
    }
    for (i = 0; i < STATIONS.length; i++) {
      if (STATIONS[i].id === saved) return i;
    }
    return 0;
  }

  var stationIndex = stationIndexFromSaved();
  var volume = read(KEY_VOLUME, 55);
  if (typeof volume !== "number" || volume < 0 || volume > 100) volume = 55;

  var root, tab, freqEl, callEl, tagEl, viaEl, tabFreq, powerBtn, volSlider, eqCanvas, eqCtx;
  var audio = null;
  var audioCtx = null;
  var analyser = null;
  var timeData = null;
  var urlIndex = 0;
  var on = false;
  var armed = false;
  var state = "idle";
  var vizRaf = 0;
  var reduceMotion = false;

  /* --------------------------------------------------------------- dom --- */

  function build() {
    root = document.createElement("div");
    root.className = "radio";
    root.setAttribute("data-on", "false");
    root.setAttribute("data-open", "false");
    root.setAttribute("data-state", "idle");
    root.innerHTML =
      '<div class="radio__panel">' +
        '<div class="radio__face">' +
          '<span class="radio__band">FM</span>' +
          '<span class="radio__freq" data-freq></span>' +
        '</div>' +
        '<p class="radio__call" data-call></p>' +
        '<canvas class="radio__eq" width="216" height="36" aria-hidden="true"></canvas>' +
        '<p class="radio__tag" data-tag></p>' +
        '<p class="radio__via" data-via></p>' +
        '<div class="radio__row">' +
          '<button class="radio__btn" type="button" data-act="prev" aria-label="Previous station">&lsaquo;</button>' +
          '<button class="radio__btn radio__power" type="button" data-act="power" aria-pressed="false" aria-label="Turn the radio on or off">&#9211;</button>' +
          '<button class="radio__btn" type="button" data-act="next" aria-label="Next station">&rsaquo;</button>' +
        '</div>' +
        '<label class="radio__vol-wrap">' +
          '<span class="radio__vol-mark">vol</span>' +
          '<input class="radio__vol" type="range" min="0" max="100" value="' + volume + '" aria-label="Volume">' +
        '</label>' +
      '</div>' +
      '<button class="radio__tab" type="button" aria-label="Open the radio" aria-expanded="false">' +
        '<span class="radio__led"></span>' +
        '<span class="radio__tab-freq" data-tab-freq></span>' +
        '<span class="radio__tab-unit">FM</span>' +
        '<span class="radio__grille" aria-hidden="true"></span>' +
      '</button>';

    document.body.appendChild(root);

    tab = root.querySelector(".radio__tab");
    freqEl = root.querySelector("[data-freq]");
    callEl = root.querySelector("[data-call]");
    tagEl = root.querySelector("[data-tag]");
    viaEl = root.querySelector("[data-via]");
    tabFreq = root.querySelector("[data-tab-freq]");
    powerBtn = root.querySelector('[data-act="power"]');
    volSlider = root.querySelector(".radio__vol");
    eqCanvas = root.querySelector(".radio__eq");
    eqCtx = eqCanvas.getContext("2d");

    tab.addEventListener("click", function () {
      var open = root.getAttribute("data-open") !== "true";
      setOpen(open);
    });

    root.querySelector('[data-act="prev"]').addEventListener("click", function () { changeStation(-1); });
    root.querySelector('[data-act="next"]').addEventListener("click", function () { changeStation(1); });
    powerBtn.addEventListener("click", togglePower);

    volSlider.addEventListener("input", function () {
      volume = Number(volSlider.value);
      write(KEY_VOLUME, volume);
      if (audio) audio.volume = volume / 100;
    });

    document.addEventListener("click", function (e) {
      if (root.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".cord")) return;
      setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    paintStation();
    fitEq();
    drawEq();
  }

  function setOpen(open) {
    root.setAttribute("data-open", String(open));
    tab.setAttribute("aria-expanded", String(open));
    tab.setAttribute("aria-label", open ? "Close the radio" : "Open the radio");
    if (open) {
      fitEq();
      startViz();
    } else {
      stopViz();
    }
  }

  function paintStation() {
    var s = STATIONS[stationIndex];
    freqEl.textContent = s.freq;
    callEl.textContent = s.call;
    tabFreq.textContent = on ? s.freq : "OFF";
    viaEl.textContent = "via " + s.via;
    if (state === "tuning") tagEl.textContent = "searching the band\u2026";
    else if (state === "lost") tagEl.textContent = "nothing on this frequency";
    else if (on) tagEl.textContent = s.tag;
    else tagEl.textContent = "\u2014\u2014 off air \u2014\u2014";
  }

  function setState(next) {
    state = next;
    root.setAttribute("data-state", next);
    paintStation();
  }

  /* ------------------------------------------------------------ station --- */

  function changeStation(dir) {
    stationIndex = (stationIndex + dir + STATIONS.length) % STATIONS.length;
    urlIndex = 0;
    write(KEY_STATION, STATIONS[stationIndex].id);
    paintStation();
    if (on) tune();
  }

  function togglePower() {
    on = !on;
    root.setAttribute("data-on", String(on));
    powerBtn.setAttribute("data-on", String(on));
    powerBtn.setAttribute("aria-pressed", String(on));
    if (on) {
      urlIndex = 0;
      ensureGraph();
      tune();
      if (root.getAttribute("data-open") === "true") startViz();
    } else {
      setState("idle");
      stopStream();
      if (root.getAttribute("data-open") !== "true") stopViz();
      else drawEq();
    }
    paintStation();
  }

  /* ------------------------------------------------------------- player --- */

  function ensureGraph() {
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "none";
      audio.volume = volume / 100;
      audio.addEventListener("playing", function () {
        if (on) setState("live");
      });
      audio.addEventListener("waiting", function () {
        if (armed && state !== "live") setState("tuning");
      });
      audio.addEventListener("error", function () {
        if (!armed) return;
        tryNextUrl();
      });
    }
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        timeData = new Uint8Array(analyser.fftSize);
        var src = audioCtx.createMediaElementSource(audio);
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function tune() {
    var urls = STATIONS[stationIndex].urls;
    if (urlIndex >= urls.length) {
      armed = false;
      setState("lost");
      stopStream();
      return;
    }
    armed = true;
    setState("tuning");
    audio.pause();
    audio.src = urls[urlIndex];
    audio.volume = volume / 100;
    var play = audio.play();
    if (play && typeof play.catch === "function") {
      play.catch(function () {
        if (armed) tryNextUrl();
      });
    }
  }

  function tryNextUrl() {
    urlIndex += 1;
    tune();
  }

  function stopStream() {
    armed = false;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  /* --------------------------------------------------------------- eq --- */

  function fitEq() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = eqCanvas.clientWidth || 216;
    var h = eqCanvas.clientHeight || 36;
    if (eqCanvas.width !== Math.round(w * dpr) || eqCanvas.height !== Math.round(h * dpr)) {
      eqCanvas.width = Math.round(w * dpr);
      eqCanvas.height = Math.round(h * dpr);
    }
    eqCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startViz() {
    if (vizRaf) return;
    var loop = function () {
      vizRaf = requestAnimationFrame(loop);
      drawEq();
    };
    vizRaf = requestAnimationFrame(loop);
  }

  function stopViz() {
    if (vizRaf) cancelAnimationFrame(vizRaf);
    vizRaf = 0;
    drawEq();
  }

  function drawEq() {
    var w = eqCanvas.clientWidth || 216;
    var h = eqCanvas.clientHeight || 36;
    var mid = h / 2;
    var live = on && state === "live";
    var i, x, y, n;
    eqCtx.clearRect(0, 0, w, h);
    eqCtx.beginPath();
    eqCtx.lineWidth = 1.4;
    eqCtx.strokeStyle = live ? "rgba(251, 191, 36, 0.92)" : "rgba(87, 82, 105, 0.75)";
    eqCtx.shadowColor = live ? "rgba(251, 191, 36, 0.55)" : "transparent";
    eqCtx.shadowBlur = live ? 8 : 0;

    if (analyser && timeData && live && !reduceMotion) {
      analyser.getByteTimeDomainData(timeData);
      n = timeData.length;
      for (i = 0; i < n; i++) {
        x = (i / (n - 1)) * w;
        y = mid + Math.max(-1, Math.min(1, ((timeData[i] - 128) / 128) * 2.6)) * (h * 0.44);
        if (i === 0) eqCtx.moveTo(x, y);
        else eqCtx.lineTo(x, y);
      }
    } else if (live) {
      n = 48;
      for (i = 0; i < n; i++) {
        x = (i / (n - 1)) * w;
        y = mid + Math.sin((i / (n - 1)) * Math.PI * 4) * 3;
        if (i === 0) eqCtx.moveTo(x, y);
        else eqCtx.lineTo(x, y);
      }
    } else if (on && state === "tuning") {
      for (i = 0; i < 40; i++) {
        x = (i / 39) * w;
        y = mid + (reduceMotion ? 0 : (Math.random() - 0.5) * h * 0.72);
        if (i === 0) eqCtx.moveTo(x, y);
        else eqCtx.lineTo(x, y);
      }
    } else {
      eqCtx.moveTo(0, mid);
      eqCtx.lineTo(w, mid);
    }
    eqCtx.stroke();
  }

  /* --------------------------------------------------------------- boot --- */

  function boot() {
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reduceMotion = mq.matches;
      if (mq.addEventListener) mq.addEventListener("change", function (e) { reduceMotion = e.matches; });
      else if (mq.addListener) mq.addListener(function (e) { reduceMotion = e.matches; });
    }
    build();
    window.addEventListener("resize", fitEq);
    window.addEventListener("pagehide", stopStream);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
