/* THE RADIO — a small station dial that sits in the corner of every page.
 *
 * A separate shared module rather than a hook inside nocturne.js, because
 * nocturne.js's boot() fires synchronously the moment it runs (the DOM is
 * already parsed by the time a bottom-of-body script executes), which is
 * before a later <script> tag on the same page would have loaded. Wiring
 * itself independently, the same way nocturne.js does, avoids that race.
 *
 * Playback never survives a navigation — this is a plain multi-page site, so
 * every load tears the player down. What persists is the choice: which
 * station, and how loud. Power always starts off, so nothing plays with
 * sound before you have asked for it.
 */

(function () {
  "use strict";

  /* Long-running lo-fi/synthwave live streams. Picked for the mood, not
     verified against YouTube today — if one of these has gone dark, swap the
     id here. Nothing else needs to change. */
  var STATIONS = [
    { id: "jfKfPfyJRdk", label: "lofi hip hop radio — beats to relax/study to" },
    { id: "4xDzrJKXOOY", label: "synthwave radio — beats to chill/game to" },
    { id: "lTRiuFIWV54", label: "coffee shop radio — beats to relax/study to" }
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

  var stationIndex = read(KEY_STATION, 0);
  if (typeof stationIndex !== "number" || stationIndex < 0 || stationIndex >= STATIONS.length) {
    stationIndex = 0;
  }
  var volume = read(KEY_VOLUME, 55);
  if (typeof volume !== "number" || volume < 0 || volume > 100) volume = 55;

  var root, stationLabel, powerBtn, volSlider;
  var player = null;
  var playerReady = false;
  var pendingPlay = false;
  var on = false;
  var apiRequested = false;

  /* --------------------------------------------------------------- dom --- */

  function build() {
    root = document.createElement("div");
    root.className = "radio";
    root.setAttribute("data-on", "false");
    root.setAttribute("data-open", "false");
    root.innerHTML =
      '<div class="radio__panel">' +
        '<p class="radio__label">The radio</p>' +
        '<p class="radio__station" data-station></p>' +
        '<div class="radio__row">' +
          '<button class="radio__btn" type="button" data-act="prev" aria-label="Previous station">&lsaquo;</button>' +
          '<button class="radio__btn radio__power" type="button" data-act="power" aria-label="Turn the radio on or off">&#9211;</button>' +
          '<button class="radio__btn" type="button" data-act="next" aria-label="Next station">&rsaquo;</button>' +
        '</div>' +
        '<input class="radio__vol" type="range" min="0" max="100" value="' + volume + '" aria-label="Volume">' +
      '</div>' +
      '<button class="radio__tab" type="button" aria-label="Open the radio" aria-expanded="false">' +
        '<span class="radio__dot"></span>' +
      '</button>' +
      '<div class="radio__stage"></div>';

    document.body.appendChild(root);

    var tab = root.querySelector(".radio__tab");
    stationLabel = root.querySelector("[data-station]");
    powerBtn = root.querySelector('[data-act="power"]');
    volSlider = root.querySelector(".radio__vol");

    tab.addEventListener("click", function () {
      var open = root.getAttribute("data-open") !== "true";
      root.setAttribute("data-open", String(open));
      tab.setAttribute("aria-expanded", String(open));
    });

    root.querySelector('[data-act="prev"]').addEventListener("click", function () { changeStation(-1); });
    root.querySelector('[data-act="next"]').addEventListener("click", function () { changeStation(1); });
    powerBtn.addEventListener("click", togglePower);

    volSlider.addEventListener("input", function () {
      volume = Number(volSlider.value);
      write(KEY_VOLUME, volume);
      if (player && playerReady) player.setVolume(volume);
    });

    document.addEventListener("click", function (e) {
      if (root.contains(e.target)) return;
      root.setAttribute("data-open", "false");
      tab.setAttribute("aria-expanded", "false");
    });

    paintStation();
  }

  function paintStation() {
    stationLabel.textContent = on
      ? STATIONS[stationIndex].label
      : "—— off air ——";
  }

  /* ------------------------------------------------------------ station --- */

  function changeStation(dir) {
    stationIndex = (stationIndex + dir + STATIONS.length) % STATIONS.length;
    write(KEY_STATION, stationIndex);
    paintStation();
    if (on) tune();
  }

  function togglePower() {
    on = !on;
    root.setAttribute("data-on", String(on));
    powerBtn.setAttribute("data-on", String(on));
    paintStation();
    if (on) tune();
    else if (player && playerReady) player.pauseVideo();
  }

  /* ------------------------------------------------------------- player --- */

  function tune() {
    if (!window.YT || !window.YT.Player) {
      pendingPlay = true;
      loadApi();
      return;
    }
    if (!player) {
      createPlayer();
      return;
    }
    if (playerReady) {
      player.loadVideoById(STATIONS[stationIndex].id);
      player.setVolume(volume);
    } else {
      pendingPlay = true;
    }
  }

  function loadApi() {
    if (apiRequested) return;
    apiRequested = true;
    var previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof previous === "function") previous();
      if (pendingPlay) { pendingPlay = false; tune(); }
    };
    var script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }

  function createPlayer() {
    var host = root.querySelector(".radio__stage");
    player = new window.YT.Player(host, {
      width: "2",
      height: "2",
      videoId: STATIONS[stationIndex].id,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
      events: {
        onReady: function () {
          playerReady = true;
          player.setVolume(volume);
          if (on) player.playVideo();
        }
      }
    });
  }

  /* --------------------------------------------------------------- boot --- */

  function boot() {
    build();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
