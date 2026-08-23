/* THE RADIO — a small tuner that sits in the corner of every page.
 *
 * HTML5 <audio> against Icecast mounts, not a hidden YouTube iframe.
 * YouTube will not keep playing a 2px player, and live-video ids go stale.
 * Nightride FM's mounts send CORS * and honour a site Referer, which is
 * what lets the oscilloscope read the stream.
 *
 * Same-origin clicks are intercepted so the next room is swapped into this
 * document instead of loaded as a new one. The Audio element stays mounted.
 * A refresh or a new tab still starts off — browsers will not autoplay with
 * sound before a gesture.
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

  /* -------------------------------------------------------------- rooms --- */

  /* Intercept same-origin clicks and swap the document body around the radio
     instead of following the link. Game loops and window listeners from the
     previous room are dropped by bumping a generation counter and removing
     anything bound after this wrap. */
  var rafGen = 0;
  var origRAF = window.requestAnimationFrame;
  var origWinAdd = window.addEventListener;
  var origWinRemove = window.removeEventListener;
  var pageWinListeners = [];
  var visiting = false;
  var persistReady = false;

  function wrapPageListeners() {
    window.requestAnimationFrame = function (cb) {
      var g = rafGen;
      return origRAF.call(window, function (t) {
        if (g !== rafGen) return;
        cb(t);
      });
    };
    window.addEventListener = function (type, fn, opts) {
      pageWinListeners.push([type, fn, opts]);
      return origWinAdd.call(window, type, fn, opts);
    };
    persistReady = true;
  }

  function leaveRoom() {
    rafGen += 1;
    var i;
    for (i = 0; i < pageWinListeners.length; i++) {
      try {
        origWinRemove.call(window, pageWinListeners[i][0], pageWinListeners[i][1], pageWinListeners[i][2]);
      } catch (err) {}
    }
    pageWinListeners = [];
    window.dispatchEvent(new Event("nocturne:leave"));
  }

  function isSharedScript(src) {
    return /nocturne\.js|radio\.js|shell-boot\.js|shell\.js/.test(src || "");
  }

  function runRoomScripts(root) {
    var scripts = root.querySelectorAll("script");
    var i, old, src, fresh;
    for (i = 0; i < scripts.length; i++) {
      old = scripts[i];
      src = old.getAttribute("src") || "";
      if (isSharedScript(src)) {
        if (old.parentNode) old.parentNode.removeChild(old);
        continue;
      }
      fresh = document.createElement("script");
      if (src) {
        fresh.src = src;
        fresh.async = false;
      } else {
        fresh.textContent = old.textContent;
      }
      old.parentNode.replaceChild(fresh, old);
    }
  }

  function applyRoom(html, href) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var keep = [];
    var nodes, i, n, imported, style, bodyStyle, insertBefore;

    leaveRoom();

    document.title = doc.title;

    document.querySelectorAll("style[data-room]").forEach(function (el) {
      el.parentNode.removeChild(el);
    });
    nodes = doc.querySelectorAll("head style");
    for (i = 0; i < nodes.length; i++) {
      style = document.createElement("style");
      style.setAttribute("data-room", "true");
      style.textContent = nodes[i].textContent;
      document.head.appendChild(style);
    }

    bodyStyle = doc.body.getAttribute("style");
    if (bodyStyle) document.body.setAttribute("style", bodyStyle);
    else document.body.removeAttribute("style");

    [".radio", ".cord", ".toast-rail"].forEach(function (sel) {
      n = document.querySelector(sel);
      if (n) keep.push(n);
    });

    nodes = Array.prototype.slice.call(document.body.childNodes);
    for (i = 0; i < nodes.length; i++) {
      if (keep.indexOf(nodes[i]) === -1) document.body.removeChild(nodes[i]);
    }

    insertBefore = keep[0] || null;
    nodes = Array.prototype.slice.call(doc.body.childNodes);
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.nodeType === 1 && n.tagName === "SCRIPT" && isSharedScript(n.getAttribute("src"))) {
        continue;
      }
      imported = document.importNode(n, true);
      document.body.insertBefore(imported, insertBefore);
    }

    if (window.Nocturne && typeof window.Nocturne.refresh === "function") {
      window.Nocturne.refresh();
    }
    runRoomScripts(document.body);
    window.scrollTo(0, 0);
    history.pushState({ nocturne: true }, "", href);
  }

  function visit(href) {
    if (visiting) return;
    visiting = true;
    fetch(href, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("failed");
      return res.text();
    }).then(function (html) {
      applyRoom(html, href);
    }).catch(function () {
      window.location.href = href;
    }).then(function () {
      visiting = false;
    });
  }

  function bindPersist() {
    wrapPageListeners();
    document.addEventListener("click", function (event) {
      var a, url;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      a = event.target.closest ? event.target.closest("a") : null;
      if (!a || !a.href || a.hasAttribute("download")) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      try {
        url = new URL(a.href, location.href);
      } catch (err) {
        return;
      }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      event.preventDefault();
      visit(url.pathname + url.search + url.hash);
    });
    origWinAdd.call(window, "popstate", function () {
      window.location.reload();
    });
  }

  /* popstate reloads so Back is a real document (Audio dies, which matches
     a browser back). Forward-clicks through the arcade keep the player. */

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
    bindPersist();
  }

  if (document.body) {
    boot();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
