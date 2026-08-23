/* NOCTURNE — the layer that sits above the games.
 *
 * Everything here is about state that outlives a single page: whether the
 * lights are on, which moths have been caught, what you scored. That shared
 * state is what makes the site feel like one building rather than four
 * unrelated pages, so it all funnels through one small store backed by
 * localStorage.
 */

(function () {
  "use strict";

  var KEY_LIGHTS = "nocturne.lights";
  var KEY_MOTHS = "nocturne.moths";
  var KEY_SCORE = "nocturne.best.";
  var KEY_VISITS = "nocturne.visits";

  /* Canonical moth ids, in the order the footer counter shows them. A page
     can host a moth without knowing how many others exist. */
  var MOTHS = ["sign", "cellar", "pulse", "lattice", "echo", "about", "back", "wyrm"];

  /* STATIC stays independent of the moths. A death on the overlay of VEIL,
     SPLICE, or WYRM used to count as "finished"; these floors are what
     "played for real" means. */
  var STATIC_NEED = { veil: 80, splice: 3, wyrm: 10 };

  /* ------------------------------------------------------------- store --- */

  /* localStorage throws in private-mode Safari and when storage is full.
     Nothing here is important enough to break a page over, so every access is
     wrapped and failures degrade to "nothing saved". */
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
      return true;
    } catch (err) {
      return false;
    }
  }

  /* -------------------------------------------------------------- moths --- */

  function caught() {
    var saved = read(KEY_MOTHS, []);
    if (!Array.isArray(saved)) return [];
    /* Filter against MOTHS so a renamed or retired moth cannot leave a stale
       id inflating the count past what the page can actually show. */
    return saved.filter(function (id) {
      return MOTHS.indexOf(id) !== -1;
    });
  }

  function allCaught() {
    return caught().length >= MOTHS.length;
  }

  function catchMoth(id) {
    if (MOTHS.indexOf(id) === -1) return false;
    var have = caught();
    if (have.indexOf(id) !== -1) return false;
    have.push(id);
    write(KEY_MOTHS, have);
    paintCount();
    return true;
  }

  /* --------------------------------------------------------------- HUD --- */

  var toastRail = null;

  function toast(message, accent, ms) {
    if (!toastRail) {
      toastRail = document.createElement("div");
      toastRail.className = "toast-rail";
      document.body.appendChild(toastRail);
    }
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    if (accent) el.style.setProperty("--accent", accent);
    toastRail.appendChild(el);

    window.setTimeout(function () {
      el.classList.add("toast--out");
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 420);
    }, ms || 2600);
  }

  function paintCount() {
    var n = caught().length;
    var nodes = document.querySelectorAll("[data-moth-count]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].innerHTML = "moths <b>" + n + "</b>/" + MOTHS.length;
    }
    document.documentElement.setAttribute("data-moths", String(n));
    if (n >= MOTHS.length) document.documentElement.setAttribute("data-unlocked", "true");
  }

  /* ------------------------------------------------------------ lights --- */

  function lightsOut() {
    return document.documentElement.getAttribute("data-lights") === "out";
  }

  function setLights(state) {
    document.documentElement.setAttribute("data-lights", state);
    write(KEY_LIGHTS, state);
    window.dispatchEvent(new CustomEvent("nocturne:lights", { detail: { state: state } }));
  }

  function toggleLights() {
    var next = lightsOut() ? "on" : "out";
    setLights(next);
    if (next === "out" && caught().length < MOTHS.length) {
      toast("something moved in the dark", "#4ade80");
    }
  }

  /* --------------------------------------------------------- decoration --- */

  var MOTH_SVG =
    '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    '<path d="M16 8 L16 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M16 10 C9 2, 1 6, 3 13 C4.6 18.6, 11 18, 16 15 Z" fill="currentColor" opacity="0.92"/>' +
    '<path d="M16 10 C23 2, 31 6, 29 13 C27.4 18.6, 21 18, 16 15 Z" fill="currentColor" opacity="0.92"/>' +
    '<path d="M16 15 C12 18, 8 22, 10 26 C11.6 29, 15 27, 16 23 Z" fill="currentColor" opacity="0.7"/>' +
    '<path d="M16 15 C20 18, 24 22, 22 26 C20.4 29, 17 27, 16 23 Z" fill="currentColor" opacity="0.7"/>' +
    '<path d="M14 7 L11 3 M18 7 L21 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    "</svg>";

  /* Turns every `[data-moth]` placeholder in the page into a real, clickable
     moth — already-caught ones included, so they can be hidden by CSS rather
     than by each page remembering to skip them. */
  function wireMoths() {
    var have = caught();
    var nodes = document.querySelectorAll("[data-moth]");

    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var id = node.getAttribute("data-moth");
        node.innerHTML = MOTH_SVG;
        node.setAttribute("aria-label", "a moth");
        node.setAttribute("title", "");

        if (have.indexOf(id) !== -1) {
          node.classList.add("moth--found");
          return;
        }

        node.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!catchMoth(id)) return;

          node.classList.add("moth--found");
          var n = caught().length;

          if (n >= MOTHS.length) {
            toast("that is all of them. the back cabinet just woke up.", "#a855f7", 4200);
            window.setTimeout(function () {
              window.dispatchEvent(new CustomEvent("nocturne:unlocked"));
            }, 300);
          } else {
            toast("moth " + n + " of " + MOTHS.length, "#4ade80");
          }
        });
      })(nodes[i]);
    }
  }

  /* Draws the pull cord and wires it to the lighting state. Injected rather
     than written into each page so every page is guaranteed to have one. */
  function wireCord() {
    var cord = document.createElement("button");
    cord.className = "cord";
    cord.type = "button";
    cord.setAttribute("aria-label", "Pull the light cord");
    cord.innerHTML =
      '<svg viewBox="0 0 34 168" fill="none" aria-hidden="true">' +
      '<path class="cord__line" d="M17 0 L17 148"/>' +
      '<ellipse class="cord__knob" cx="17" cy="155" rx="6" ry="9"/>' +
      "</svg>";
    cord.addEventListener("click", toggleLights);
    document.body.appendChild(cord);
  }

  /* -------------------------------------------------------------- codes --- */

  var KONAMI = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a"
  ];

  function wireKonami() {
    var at = 0;
    window.addEventListener("keydown", function (event) {
      var want = KONAMI[at];
      var got = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      /* Reset to 1 rather than 0 when the wrong key restarts the sequence, so
         a stutter on the first key does not cost the whole run. */
      at = got === want ? at + 1 : (got === KONAMI[0] ? 1 : 0);
      if (at !== KONAMI.length) return;

      at = 0;
      var wipe = document.createElement("div");
      wipe.className = "crt-wipe";
      document.body.appendChild(wipe);
      window.setTimeout(function () {
        if (wipe.parentNode) wipe.parentNode.removeChild(wipe);
      }, 950);
      toast("arcade rebooted. nothing changed. probably.", "#38bdf8", 3400);
    });
  }

  /* -------------------------------------------------------------- boot --- */

  function boot() {
    /* Lighting is applied by an inline script in <head> to avoid a flash, so
       here we only reconcile in case that script was blocked. */
    if (!document.documentElement.getAttribute("data-lights")) {
      setLights(read(KEY_LIGHTS, "on"));
    }

    write(KEY_VISITS, (read(KEY_VISITS, 0) || 0) + 1);

    wireCord();
    wireMoths();
    wireKonami();
    paintCount();
  }

  /* --------------------------------------------------------------- api --- */

  window.Nocturne = {
    moths: MOTHS,
    caught: caught,
    allCaught: allCaught,
    catchMoth: catchMoth,
    toast: toast,
    lightsOut: lightsOut,
    setLights: setLights,
    visits: function () { return read(KEY_VISITS, 0) || 0; },

    /* Games call this on game over. Returns true when the run beat the stored
       best, which the caller uses to decide whether to celebrate. */
    submitScore: function (game, score) {
      var best = read(KEY_SCORE + game, 0) || 0;
      if (score <= best) return false;
      write(KEY_SCORE + game, score);
      return true;
    },
    bestScore: function (game) { return read(KEY_SCORE + game, 0) || 0; },

    staticNeed: STATIC_NEED,
    staticReady: function () {
      return (read(KEY_SCORE + "veil", 0) || 0) >= STATIC_NEED.veil &&
             (read(KEY_SCORE + "splice", 0) || 0) >= STATIC_NEED.splice &&
             (read(KEY_SCORE + "wyrm", 0) || 0) >= STATIC_NEED.wyrm;
    },

    /* Reveals a moth that a game has decided you have earned. */
    revealMoth: function (id) {
      var node = document.querySelector('[data-moth="' + id + '"]');
      if (!node || node.classList.contains("moth--found")) return;
      node.classList.remove("moth--hidden");
      node.classList.remove("moth--locked");
      node.style.opacity = "1";
      node.style.pointerEvents = "auto";
    },

    /* Re-bind moths after a same-document room swap. The cord and Konami
       stay on the window and must not be wired a second time. */
    refresh: function () {
      wireMoths();
      paintCount();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
