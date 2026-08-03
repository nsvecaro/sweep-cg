# Sweep

A card game of tens, sevens and four-of-a-kind. Throw higher than the pile or take the whole thing.

Built from the AIM v5.6 intent model in [`amy-sweepgame/`](./amy-sweepgame), which is the behavioural
authority for everything in `src/engine` and `src/lobby`. See [REALIZATION.md](./REALIZATION.md) for
what was built where, and for every interpretation and open question against that model.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — client + room API, no Redis needed
npm test           # 105 tests, one per requirement in the model
npm run build      # type-check (app + api) + production bundle into dist/
```

`npm run coverage:labels` reads the requirement labels straight out of the `.aim` files and fails if
any of them has no test naming it.

## Playing

Pick a name and **host a table**. You get a five-character code — send it to a friend and they join
from wherever they are. *Add a seat on this device* also puts a second player on your own screen for
pass-and-play. Choose the rules and deal.

**Leave game** sits on the table and on the setup screen. It asks first; confirming forfeits your
hand, and in a two-player game the other player wins by default.

| Mode | Setup | Special cards |
| --- | --- | --- |
| Easy | Six cards dealt, you choose three to show | 2, 10, A |
| Medium | Same | 2, 5, 7, 8, 10, A |
| Hard | Three face-up cards dealt blind | 2, 5, 7, 8, 10, A |

The bar across the middle of the table always states what you are allowed to throw right now. Cards
you can legally play stand up out of your hand; cards you cannot sit down and go grey.

## Deploying to Vercel

The client is a static bundle; the room lives in a serverless function backed by Redis. Two things
to set up, once:

1. **Import the repo** at [vercel.com/new](https://vercel.com/new) (or run `npx vercel` here). It
   picks up `vercel.json` and builds without further configuration.
2. **Attach a Redis store.** In the Vercel dashboard open your project → **Storage** → browse the
   Marketplace and add a Redis database (Upstash). Connect it to the project and redeploy.

Connecting the store injects the credentials as environment variables; the server reads
`KV_REST_API_URL` / `KV_REST_API_TOKEN`, and falls back to `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`. Nothing else needs setting. Free tiers on both cover a group of friends
comfortably — a table is a few kilobytes and is deleted a day after its last move.

Without a Redis store the site still builds and loads, but hosting a table returns an error telling
you the connection is missing.

> **Netlify** is no longer a drop-in. `netlify.toml` builds the client, but the room API lives in
> `api/` under Vercel's convention and would need porting to `netlify/functions` before codes work
> across devices.

### Running the server locally

`npm run dev` runs the real `api/room.ts` handler as Vite middleware, backed by an in-memory store
(`src/server/devServer.ts`). No Redis account needed — open two browser windows, host in one, join
with the code in the other, and you are playing. State lives only as long as the dev server does.

**Driving the table solo.** In dev only, `?local` runs the whole game in memory against bots
(`LocalTransport`) so one browser window is a whole table. Add `auto=3&mode=hard` to deal
immediately, or `pass=1` to add a pass-and-play seat:

```
http://localhost:5173/?local&auto=3&mode=hard
```

The branch is behind `import.meta.env.DEV` and imports dynamically, so production never pulls the
bots or the in-memory transport into the bundle.

To rehearse against real Redis instead, use the Vercel CLI:

```bash
npm i -g vercel
vercel link                              # attach this directory to a project
vercel env pull .env.development.local   # pull the Redis credentials down
vercel dev                               # client + /api/room on Vercel's runtime
```

## How the online game works

The server holds the authoritative `GameState`. Clients send a `GameAction`, the server runs the
same `applyAction` the engine has always used, and hands back a redacted snapshot.

- `api/room.ts` — one function. `POST` for commands, `GET` to poll.
- `src/server/room.ts` — pure room logic: seats, who may do what, and the view each player gets.
- `src/server/store.ts` — Redis, with a Lua compare-and-set against a version key. Two players
  acting in the same instant cannot overwrite one another; the loser re-reads and retries.
- `src/net/remoteTransport.ts` — the client. Commands go over HTTP; a poll every ~1.1s during a hand
  (4s in the lobby) picks up what everyone else did. Each poll sends the version it already holds, so
  an unchanged table costs a few bytes.

Your player id lives in `localStorage`, so closing the tab and coming back puts you in the same seat
in the same game.

**What other players' browsers receive:** their own cards, everyone's face-up rows, the pile, and
counts for everything else. Other people's hands, the undealt deck and the shuffle state are replaced
with blanks server-side, so reading the network tab tells you nothing. The one thing still exposed is
your *own* face-down cards — the client needs their ids to flip one, and card ids encode the card.
Closing that hole means opaque card ids through the engine, which is a deeper change than this one.

## How it fits together

```
api/
  room.ts     the HTTP seam: POST commands, GET poll
src/
  engine/     pure rules. no React, no DOM, no I/O
    types.ts    Card, GameState, PlayerState, actions, events
    deck.ts     52-card deck, seeded shuffle
    rules.ts    legality, special-card effects, sweep detection
    game.ts     createGame / applyAction / getLegalMoves
    bot.ts      opponent move choice, driven by getLegalMoves
  lobby/      names, 5-character codes, the lobby contracts
  server/     room logic and the Redis store — runs inside api/room.ts
  net/        transport seam — the only thing the UI talks to
  ui/         screens and card rendering
  hooks/      snapshot subscription
tests/        one test per requirement label, plus a fuzz/invariant driver
```

The engine is a reducer: `applyAction(state, action)` returns a new state plus the events it emitted,
and never mutates its input. The shuffle is seeded and the seed lives in the state, so a game is a
pure function of its seed and the actions played. That is what let the same reducer move to the
server without a rewrite.

`SweepTransport` (`src/net/transport.ts`) is the seam, and its commands are async. `RemoteTransport`
is what the app runs. `LocalTransport` still implements the same interface entirely in memory, bots
and all — it is no longer wired into the app, and is the thing to reach for if you ever want an
offline practice mode back.

## Known gaps

- Bots exist in the engine but no longer appear in the UI; online tables are people only.
- The Lua compare-and-set is covered by an in-memory stand-in (`src/server/memoryRedis.ts`), which
  mirrors its contract rather than running it. Only a real Upstash instance exercises the script.
- A player who closes their tab is not timed out. Their seat waits for them; the others cannot start
  a fresh hand until they come back or the host removes them from the lobby.
