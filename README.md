# Sweep

A card game of tens, sevens and four-of-a-kind. Throw higher than the pile or take the whole thing.

Built from the AIM v5.6 intent model in [`amy-sweepgame/`](./amy-sweepgame), which is the behavioural
authority for everything in `src/engine` and `src/lobby`. See [REALIZATION.md](./REALIZATION.md) for
what was built where, and for every interpretation and open question against that model.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 67 tests, one per requirement in the model
npm run build      # type-check + production bundle into dist/
```

`npm run coverage:labels` reads the requirement labels straight out of the `.aim` files and fails if
any of them has no test naming it.

## Playing

Pick a name, **host a table**, then fill the seats — *add a bot* for an opponent the machine plays, or
*add a seat on this device* for pass-and-play. Choose the rules and deal.

| Mode | Setup | Special cards |
| --- | --- | --- |
| Easy | Six cards dealt, you choose three to show | 2, 10, A |
| Medium | Same | 2, 5, 7, 8, 10, A |
| Hard | Three face-up cards dealt blind | 2, 5, 7, 8, 10, A |

The bar across the middle of the table always states what you are allowed to throw right now. Cards
you can legally play stand up out of your hand; cards you cannot sit down and go grey.

## How it fits together

```
src/
  engine/     pure rules. no React, no DOM, no I/O
    types.ts    Card, GameState, PlayerState, actions, events
    deck.ts     52-card deck, seeded shuffle
    rules.ts    legality, special-card effects, sweep detection
    game.ts     createGame / applyAction / getLegalMoves
    bot.ts      opponent move choice, driven by getLegalMoves
  lobby/      names, 5-character codes, the lobby contracts
  net/        transport seam — the only thing the UI talks to
  ui/         screens and card rendering
  hooks/      snapshot subscription
tests/        one test per requirement label, plus a fuzz/invariant driver
```

The engine is a reducer: `applyAction(state, action)` returns a new state plus the events it emitted,
and never mutates its input. The shuffle is seeded and the seed lives in the state, so a game is a
pure function of its seed and the actions played. That is deliberate — the same reducer can run on a
server later without a rewrite, which is what real multiplayer needs.

`SweepTransport` (`src/net/transport.ts`) is the seam. Today `LocalTransport` implements it entirely
in memory. A networked implementation satisfies the same interface and nothing in `src/ui` changes.

## Deploying

The app is a static bundle with no environment variables and no backend, so either host works with no
configuration:

- **Vercel** — `npx vercel` from this directory, or import the repo on vercel.com. `vercel.json` is
  already here.
- **Netlify** — `npx netlify deploy --prod`, or import the repo. `netlify.toml` is already here.

**What that gets you today:** everyone who opens the link can play against bots or pass-and-play on
one device. Lobby codes will *not* connect two different browsers, because the lobby lives in memory
in each tab.

## Going properly multiplayer

Codes only work across devices once a server holds the authoritative `GameState`. The engine was
written for this: the server runs the same `applyAction`, clients send `GameAction`, the server
broadcasts snapshots. The work is a second `SweepTransport` implementation plus a small server — no
change to the rules or the UI.

Vercel and Netlify functions cannot hold a WebSocket open, so the server needs somewhere else to
live. In rough order of how well they fit this codebase:

| Option | Shape | What it costs you |
| --- | --- | --- |
| **Cloudflare Durable Objects** | One object per lobby code, WebSockets built in, static assets served from the same Worker | A Cloudflare account. Free tier covers a group of friends. |
| **Railway / Render / Fly** | One small Node process with `ws`, client stays on Vercel or Netlify | An account on one of them. Free or a few dollars a month. |
| **Supabase Realtime** | Broadcast channels, no server code | A Supabase project URL and anon key. Authority stays client-side unless you add edge functions. |

To wire any of them up I need from you: which host you picked, an account with the CLI logged in on
this machine (`npx wrangler login`, `railway login`, …), and the GitHub repo URL if you want
push-to-deploy. Also worth deciding first: whether a player who closes the tab should be able to
rejoin the same game, and whether tables should be joinable by link as well as by code.
