# Realization — SweepGame

Implementation of the AIM v5.6 intent model in `amy-sweepgame/aim/`. Written by the Developer role.
Open questions are listed first; nothing in the model was silently decided.

## Open questions

1. **When does the game end?** `WIN` retires a player at zero cards but nothing says the game is
   over. Assumed: play continues until one player is left holding cards, and that player loses.
2. Is a ten on a King or an Ace legal (interpretation 1)? The `Decides` block and `SPECIAL_10`
   disagree.
3. May a five be played on an Ace in medium and hard (interpretation 2)? `SPECIAL_ACE` and
   `SPECIAL_5` disagree.
4. What does a five played on a King, a Queen or an Ace mirror (interpretation 3)?
5. Do fives chain — what is in force after 8, 5, 5?
6. May a ten be played against the force-lower demand from a seven (interpretation 4)?
7. Do two eights thrown together skip two players, or one (interpretation 5)?
8. Should the first move be a forced 3 rather than "the lowest card opens" (interpretation 6)?
9. May a player take the pile when they *do* hold a legal card? `PICKUP` says "cannot or chooses not
   to", which reads as yes; confirm.
10. What should happen when a player leaves a lobby, and when the host leaves?
11. Is there a maximum table size? Six was assumed.
12. Should the lobby offer a rematch that keeps the seats, or does it always return to waiting?
13. Should a player who closes the tab be able to rejoin the same game? This decides whether lobbies
    and games need persistence, and it should be settled before the multiplayer server is written.

## Choices where the model is silent

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict | The model's schemas are typed; the compiler enforces them |
| Rules | A pure reducer (`applyAction`) over an immutable `GameState`, seeded RNG stored in state | The same module can run on an authoritative server unchanged, which multiplayer will need |
| UI | React 18 + Vite | Smallest thing that renders a stateful table well and deploys as a static bundle |
| Storage | In memory, per browser tab | The model names no persistence. See question 13 |
| Tests | Vitest, one test named after each requirement label | `npm run coverage:labels` parses the `.aim` files and fails on any uncovered label |

## Bindings

### `sweepgame` — root

| Node | Built at |
| --- | --- |
| `Record:Card` | `src/engine/types.ts#Card`, deck in `src/engine/deck.ts#buildDeck` |
| `Record:GameState` | `src/engine/types.ts#GameState` |
| `Record:PlayerState` | `src/engine/types.ts#PlayerState` |
| `Persona:Player` | `src/net/localTransport.ts#LocalTransport.selfId` — every seat acts through the transport |
| `View:GameBoard` | `src/ui/GameTable.tsx` |
| `Flow:GameEngine` | `src/engine/game.ts#applyAction` (transitions) + `src/net/localTransport.ts#dispatch` (subscription and fan-out) |
| `Event:CardsPlayed` / `PileSwept` / `PlayerReady` / `PlayRejected` | `src/engine/types.ts#GameEvent`, emitted by `game.ts`, consumed in `src/net/localTransport.ts#record` and `src/ui/PlayLog.tsx` |

### `sweepgame.cards`

| Node | Built at |
| --- | --- |
| `Flow:SetupGame` | `src/engine/game.ts#createGame` — step 1 deals face-down for all difficulties, step 2 deals six and waits on `SetFaceUpCards` for easy/medium, step 3 deals face-up automatically for hard |
| `Contract:SetFaceUpCards` | `src/engine/game.ts#setFaceUpCards` |
| `Contract:PlayCards` | `src/engine/game.ts#playCards`; the `### Decides` outcomes are `resolvePlay` (Sweep / ValidPlay) and `reject` (Invalid) |
| `Flow:ResolveTurnEnd` | `src/engine/game.ts#resolvePlay` → `drawToMinimum` then `checkFinished`, in that order |
| `Contract:DrawCards` | `src/engine/game.ts#drawToMinimum` |
| `Contract:PickUpPile` | `src/engine/game.ts#pickUpPile` |
| `Contract:PlayFaceDownCard` | `src/engine/game.ts#playFaceDownCard` |
| Special-card rules | `src/engine/rules.ts#canPlayValue`, `#applyValueEffect`, `#isSweep` |

### `sweepgame.lobby`

| Node | Built at |
| --- | --- |
| `Record:PlayerProfile` | `src/lobby/types.ts#PlayerProfile` |
| `Record:Lobby` | `src/lobby/types.ts#Lobby` |
| `Contract:SetUsername` | `src/lobby/service.ts#LobbyService.setUsername` |
| `Contract:CreateLobby` | `src/lobby/service.ts#LobbyService.createLobby`, codes from `src/lobby/codes.ts` |
| `Contract:JoinLobby` | `src/lobby/service.ts#LobbyService.joinLobby` |
| `View:MainMenu` | `src/ui/MainMenu.tsx` |
| `Event:LobbyCreated` / `PlayerJoined` | `src/lobby/types.ts#LobbyEvent` |

## Requirement coverage

Every label below is named by at least one test. Verified mechanically by
`npm run coverage:labels` (26/26).

| Requirement | Tests |
| --- | --- |
| `SETUP`, `DIFF_EASY`, `DIFF_MEDIUM`, `DIFF_HARD`, `FIRST_MOVE` | `tests/setup.test.ts` |
| `VALID_PLAY`, `PLAY_MULTIPLES`, `PLAY_ORDER`, `MIN_HAND`, `PICKUP`, `ENDGAME`, `WIN`, `RULES`, `DECK_PILE` | `tests/play.test.ts` |
| `SPECIAL_ACE`, `SPECIAL_2`, `SPECIAL_5`, `SPECIAL_7`, `SPECIAL_8`, `SPECIAL_10`, `SWEEP_FOUR` | `tests/specials.test.ts` |
| `MULTIPLAYER`, `PLAYER_NAME`, `LOBBY_CREATE`, `LOBBY_CODE`, `LOBBY_JOIN` | `tests/lobby.test.ts` |
| `RULES`, `DECK_PILE` (whole-game) | `tests/invariants.test.ts` — 90 seeded games across all difficulties and 2–4 players, driven only through `getLegalMoves`, asserting 52 cards conserved, no illegal action accepted, no turn with zero options, no finished player on turn, and termination |

Contract `### Ensures` clauses are covered alongside their requirement: `SetFaceUpCards` (cards move
to `faceUp`, `PlayerReady` emitted) in `tests/setup.test.ts`; `DrawCards` and `PickUpPile` in
`tests/play.test.ts`; `SetUsername`, `CreateLobby` and `JoinLobby` in `tests/lobby.test.ts`.

## Interpretations

Where the model admitted more than one reading, this is what was built. Each has a matching open
question above.

1. **Legality gates the Sweep outcome.** `PlayCards`' Sweep criteria reads "the cards are 10s"
   unconditionally, but `SPECIAL_10` restricts tens to an empty pile or a card below ten. The
   requirement is treated as the legality gate: a ten on a King is rejected, and a blind ten on a
   King is a miss.
2. **A five still answers an Ace in medium and hard.** `SPECIAL_ACE` says the next player "must play
   an Ace or a 2", but `SPECIAL_5` says fives go on any card. Where both are special, the five is
   treated as wild and beats an Ace; in easy, where fives are ordinary, it does not.
3. **A five mirrors the active value, not the card beneath it.** The model spells out empty pile, on
   an eight, and on a seven. Implemented as "the value currently in force", which reproduces all
   three cases and makes five-on-five chain correctly rather than crash.
4. **Ten escapes force-lower.** `SPECIAL_7` lists escapes as "a valid special card like A, 2, 5" —
   an open list. A ten is admitted since seven is below ten and the play burns the pile anyway.
5. **One skip per eight.** Two eights in one throw skip two players.
6. **The lowest card opens.** `FIRST_MOVE` says "typically a 3"; the player holding the lowest card
   in hand takes the first turn. No card is forced.
7. **Taking the pile is voluntary from hand or face-up, but not in the blind phase**, where
   `ENDGAME` says the flip is the move.
8. **Face-up cards are public.** Every seat renders its opponents' face-up cards.
9. **Strict active-player enforcement.** `PlayCards`' Authz allows "or it's the very first move";
   with one authoritative reducer that race cannot occur, so only the active player may act.

## Deviations and additions

- `Card` carries an `id`. The modelled record is suit and value only; an identity is needed to move
  a specific card between zones and to key it in the UI. Ids are derived from suit and value, so no
  new information exists.
- `PlayerState` carries `name` and `isBot`; `GameState` carries `phase`, `players`, `activePlayerId`,
  `finishOrder`, `turn`, `rng` and `lastReveal`. `Record:GameState` models the shared board only —
  turn order and game lifecycle have to live somewhere.
- Events beyond the four modelled ones (`PileTaken`, `CardsDrawn`, `PlayerSkipped`, `PlayerFinished`,
  `GameOver`) exist for the play log. All four modelled events are emitted as specified.
- **Bots** are not in the model. They exist so the game is playable and testable without a server,
  and they act only through `getLegalMoves`, so they cannot produce a state a human could not.
- **Extra seats on one device** (pass-and-play) with a handover screen, for the same reason.
- The lobby gained leaving, host reassignment when the host leaves, and a six-player cap. None are
  modelled — see questions 10 and 11.
