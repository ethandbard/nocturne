/* Keeps the chrome shell honest: the address bar, title, and lighting
 * follow whatever room is loaded in #room. The radio lives on this window
 * and is never rebuilt. ?inroom=1 is an iframe-only flag and is stripped
 * from the public URL.
 */
(function () {
  "use strict";

  var room = document.getElementById("room");
  if (!room) return;

  function publicPath(href) {
    var u = new URL(href, location.origin);
    u.searchParams.delete("inroom");
    return u.pathname + u.search + u.hash;
  }

  function roomPath(href) {
    var u = new URL(href, location.origin);
    u.searchParams.set("inroom", "1");
    return u.pathname + u.search + u.hash;
  }

  function sync() {
    var doc, loc, next, now, lights;
    try {
      loc = room.contentWindow.location;
      if (loc.origin !== location.origin) return;
      next = publicPath(loc.href);
      now = location.pathname + location.search + location.hash;
      if (next !== now) history.replaceState(null, "", next);
      doc = room.contentDocument;
      if (doc && doc.title) document.title = doc.title;
      lights = document.documentElement.getAttribute("data-lights");
      if (doc && lights) doc.documentElement.setAttribute("data-lights", lights);
      room.contentWindow.focus();
    } catch (err) {
      /* Cross-origin (should not happen) or the frame is mid-navigation. */
    }
  }

  room.addEventListener("load", sync);

  window.addEventListener("popstate", function () {
    var want = roomPath(location.href);
    try {
      var have = room.contentWindow.location.pathname +
        room.contentWindow.location.search +
        room.contentWindow.location.hash;
      if (have !== want) room.contentWindow.location.assign(want);
    } catch (err) {
      room.src = want;
    }
  });

  window.addEventListener("nocturne:lights", function (event) {
    try {
      room.contentDocument.documentElement.setAttribute(
        "data-lights",
        event.detail.state
      );
    } catch (err) {}
  });
})();
