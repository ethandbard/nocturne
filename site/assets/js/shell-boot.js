/* Runs in <head> of every page, synchronously, before anything paints.
 *
 * A full navigation destroys the Audio element, so the radio cannot survive
 * as a normal multi-page site. The top window stops parsing itself, rebuilds
 * as a chrome shell, and loads the real page in #room with ?inroom=1.
 * Framed copies, and the inroom copy, no-op. Without JS the original
 * document is left alone and still works.
 *
 * document.write cannot do this job: during parse it inserts into the
 * current document instead of replacing it, and the original body still
 * runs — two radios, two games.
 */
(function () {
  "use strict";

  if (window !== window.top || window.frameElement) return;
  var params = new URLSearchParams(location.search);
  if (params.get("inroom") === "1") return;

  window.stop();

  var roomSrc;
  try {
    var u = new URL(location.href);
    u.searchParams.set("inroom", "1");
    roomSrc = u.pathname + u.search + u.hash;
  } catch (err) {
    roomSrc = location.pathname + "?inroom=1";
  }

  var root = document.documentElement;
  root.setAttribute("lang", "en");
  root.setAttribute("data-shell", "true");
  try {
    var lights = JSON.parse(localStorage.getItem("nocturne.lights") || '"on"');
    root.setAttribute("data-lights", lights === "out" ? "out" : "on");
  } catch (err) {
    root.setAttribute("data-lights", "on");
  }

  while (root.firstChild) root.removeChild(root.firstChild);

  var head = document.createElement("head");
  head.innerHTML =
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>NOCTURNE</title>" +
    '<meta name="color-scheme" content="dark">' +
    '<link rel="icon" href="/assets/moth.svg" type="image/svg+xml">' +
    '<link rel="stylesheet" href="/assets/css/site.css">';
  root.appendChild(head);

  var body = document.createElement("body");
  var iframe = document.createElement("iframe");
  iframe.id = "room";
  iframe.title = "NOCTURNE";
  iframe.src = roomSrc;
  body.appendChild(iframe);
  root.appendChild(body);

  ["nocturne.js", "radio.js", "shell.js"].forEach(function (name) {
    var script = document.createElement("script");
    script.src = "/assets/js/" + name;
    script.async = false;
    body.appendChild(script);
  });
})();
