# NOCTURNE

A small browser arcade that behaves like a place rather than a page. Three
games sit on the floor, a fourth stays sealed, and the site keeps state across
pages so what you do in one room shows up in another.

Live at **[nocturne.ethandbard.com](https://nocturne.ethandbard.com)**.
Docs at **[ethandbard.github.io/nocturne](https://ethandbard.github.io/nocturne/)**.

No framework, no build step, no server-side state. Static HTML, CSS, and
JavaScript served by nginx in a container.

## The games

| Cabinet | Kind | What you do |
| --- | --- | --- |
| PULSE | Reflex | Dodge drifting shards, collect motes, spend charge on a shockwave. |
| LATTICE | Puzzle | Rotate conduits until current reaches every lamp. |
| ECHO | Memory | Repeat a growing sequence of pads and tones. |
| MOTH | Secret | Climb toward a lamp while your glow — and your view — burns down. |

MOTH is not reachable from a fresh visit. It unlocks after all five hidden
moths are found.

## Running it locally

Any static file server works, because nothing needs a backend:

```bash
npx --yes http-server site -p 4330 -c-1
```

Then open <http://localhost:4330>. To exercise the nginx config as well —
extensionless URLs, the custom 404, cache headers — run the container instead:

```bash
docker compose up --build
```

## Layout

```
site/
  index.html          Arcade floor. Cabinet cards, unlock logic, time-of-day line.
  about.html          What the site keeps, and hints for the moths.
  404.html            A dark corridor with one findable door. Playable.
  games/              One page per cabinet.
  assets/css/         Single stylesheet; both lighting states live here.
  assets/js/
    nocturne.js       Shared layer: lighting, moths, scores, toasts, Konami.
    pulse.js  lattice.js  echo.js  mothgame.js
nginx.conf            Routing, cache policy, /healthz.
Dockerfile            nginx:alpine plus the site. No build stage.
docker-compose.yml    Joins the shared `edge` network. Publishes no host port.
```

## How the pieces connect

Three things persist in `localStorage` and are read by every page:

- `nocturne.lights` — whether the room is lit. The pull cord in the top-right
  corner toggles it, and the state survives navigation, so the whole site
  changes together.
- `nocturne.moths` — which of the five moths have been caught. The count drives
  the fourth cabinet.
- `nocturne.best.<game>` — high scores. The arcade floor reads these back onto
  the cabinet cards.

`nocturne.js` owns all three. Games never touch storage directly; they call
`Nocturne.submitScore()`, `Nocturne.revealMoth()`, and `Nocturne.toast()`.

Lighting is a CSS problem, not a JavaScript one. `data-lights="out"` on `<html>`
swaps a block of custom properties, and every rule that changes between the two
states reads from those properties. Two moths exist only in the dark, which is
the reason the cord is more than a theme switch.

An inline script in each page's `<head>` restores the lighting state before
first paint. Without it, someone who left the lights off gets a flash of a lit
room on every navigation.

## The moths

Five, gated three different ways so that finding them teaches you what the site
can do:

| Moth | Where | Gate |
| --- | --- | --- |
| `sign` | Arcade floor, on the neon sign | Visible, low contrast |
| `cellar` | Arcade floor, in the footer | Lights out |
| `pulse` | PULSE, on the screen bezel | Lights out |
| `lattice` | LATTICE, top-left of the board | Clear one board |
| `echo` | ECHO, below the pads | Reach round 5 |

Catching all five rewrites the fourth cabinet in place and opens
`/games/moth.html`. That page is deliberately guessable: arriving early gets a
"SEALED" panel that tells you what you are missing rather than a wall.

## Deployment

One container on the Hetzner VPS at `/opt/nocturne`, joined to the shared `edge`
Docker network, published at `nocturne.ethandbard.com` through the existing
Cloudflare named tunnel. Nothing is cloned on the server — deploying means
copying the tree over SSH and rebuilding:

```bash
tar czf - Dockerfile docker-compose.yml nginx.conf .dockerignore site \
  | ssh -i ~/.ssh/hetzner_vps root@65.109.238.176 'cd /opt/nocturne && tar xzf -'
ssh -i ~/.ssh/hetzner_vps root@65.109.238.176 'cd /opt/nocturne && docker compose up -d --build'
```

The container publishes no host port. `cloudflared` reaches it by container
name over `edge`, so the app is never exposed on the VPS public IP.

## Accessibility and browser support

Every interactive element is a real `<button>` or `<a>`, so the moths and pads
are keyboard-reachable and screen-reader-announced. `prefers-reduced-motion`
turns off the flicker and pad transitions. The games need a pointer or the
arrow keys; none of them are playable by keyboard alone on a touch device.

ECHO builds its `AudioContext` on the first click, because browsers refuse to
start one before a user gesture. Everything degrades if `localStorage` throws —
you simply get an arcade that forgets you.
