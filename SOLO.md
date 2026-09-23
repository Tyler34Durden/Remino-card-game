# Remino — solo branch

This branch plays Remino on your own against the café regulars. It has no server and no network.

```bash
npm install
npm run dev
```

Open the address Vite prints. That is the whole game.

## What is different from `master`

- The rules engine, the bots and the room manager all run inside the page. They are the same files the online server runs, so a solo game behaves exactly like an online one: same opening rules, same joker rules, same bots, same shuffle ritual.
- `src/soloGame.ts` drives the room manager directly and hands the screens the same shape the socket used to. No screen knows the difference.
- `server/random.ts` replaces Node's crypto with the Web Crypto API, which both Node and browsers provide.
- The home screen has no join-by-code, the lobby has no invite code, and the top bar has no room code. There is nobody to invite.
- `socket.io-client` is no longer in the bundle.

The multiplayer server files are still on the branch, unused, so this branch stays easy to merge with `master`.

## Deploying

The build is plain static files, so any static host works.

```bash
npm run build
```

On Vercel, import the repository and pick this branch. `vercel.json` already sets the framework, the build command and the `dist` output, so there is nothing to configure and no server to pay for.
