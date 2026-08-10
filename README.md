# RIPTOP Arena

RIPTOP Arena is a browser-based 3D battle-top prototype inspired by the fast camera work and arcade pressure of modern beyblade-style arena games.

## What It Is

This project is a playable single-player prototype built with `Three.js`, `TypeScript`, and a lightweight custom battle simulation. The goal is simple: launch into the bowl, crash opponents off rhythm, and win by ring out, spin finish, or burst finish.

It is designed as a showcase-ready vertical slice rather than a giant content-heavy game. The focus is on:

- punchy launch-to-battle pacing
- aggressive battle camera framing
- visible build differences between parts
- tournament progression and unlock rewards
- desktop and touch-friendly play

## Current Features

- 3D arena with dynamic camera states, including launch framing, chase shots, and edge-danger emphasis
- Three finish types: `ring out`, `spin finish`, and `burst finish`
- Garage build system with `attackRing`, `core`, and `driver` parts
- Tournament run with unlock progression and champion shelf
- Result screens with reward feedback and part rarity presentation
- Intro title sequence, menu ambience, and champion audio cue
- Touch controls for mobile landscape play

## Controls

### Desktop

- Menu: mouse click
- Launch: hold mouse or `Space`
- Aim: `Q` / `E`
- Dash: click arena or use arrow keys / `WASD`
- Pause: `Esc`

### Touch

- Launch: `Aim -`, `Hold Launch`, `Aim +`
- Battle: `Dash Rival`, `Center`, `Pause`

## Run Locally

```bash
npm install
npm run dev
```

For a production-style local preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4177
```

## Project Docs

- Showcase overview: [docs/showcase.md](docs/showcase.md)
- Private friend-server deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Release checks: [docs/RELEASE.md](docs/RELEASE.md)
- Original design spec: [docs/superpowers/specs/2026-07-04-beyblade-arena-design.md](docs/superpowers/specs/2026-07-04-beyblade-arena-design.md)

## Deployment

The invite, progression, and friend-challenge features require the Node server, WebSocket support, SQLite, and persistent storage. A static host alone cannot run the private friend server.

Use Node.js 24 or newer, run `npm run build`, configure the variables in `.env.production.example`, and start the unified service with `npm start`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for backup, reverse-proxy, health-check, and rollback requirements.

The Cloudflare Pages workflow is manual and provides only a static visual preview. It does not provide identities, progression, challenges, or multiplayer.

## Stack

- `Three.js`
- `TypeScript`
- `Vite`

## Status

This version is a polished private-play prototype. Public friend-server deployment still requires the production checklist in `docs/DEPLOYMENT.md`, including an invite-management operation and persistent off-host backups.
