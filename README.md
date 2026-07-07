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

- Showcase overview: [docs/showcase.md](C:/Users/Terla/Documents/战斗陀螺项目/docs/showcase.md)
- Release and deployment notes: [docs/RELEASE.md](C:/Users/Terla/Documents/战斗陀螺项目/docs/RELEASE.md)
- Original design spec: [docs/superpowers/specs/2026-07-04-beyblade-arena-design.md](C:/Users/Terla/Documents/战斗陀螺项目/docs/superpowers/specs/2026-07-04-beyblade-arena-design.md)

## Deploy to Cloudflare Pages

This repository includes a GitHub Actions workflow at `.github/workflows/pages-deployment.yml`.

Create a Cloudflare Pages project named `riptop-arena`, then add these GitHub repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

After the secrets are set, every push to `main` will run `npm ci`, `npm run build`, and deploy the `dist/` output to Cloudflare Pages.

## Stack

- `Three.js`
- `TypeScript`
- `Vite`

## Status

This version is a polished prototype. It is suitable for local playtests, visual showcase, and static-host deployment of the current slice.
