# Realize this intent model — SweepGame

You are the **Developer** for this project. Everything below this line is your specification.
It is an **AIM 5.6 intent model**: a set of `.aim` files describing WHAT this system
commits to do — actors, operations, data, events, sequences, policies — independent of any
technology. Your job is to produce a working implementation (code AND tests) whose behavior
matches the model. The full specification of the language lives at https://raw.githubusercontent.com/juicejs/application-intent-model/refs/heads/master/specification.md — consult it if
you can browse; a condensed reference is included below so you can work fully offline.

## How to work

1. **Read the whole model first** (all files are inlined at the bottom). The tree of intents is
   the table of contents; typed edges (`[verb](aim:address)`) are the behavioral wiring.
2. **The model is the authority.** Where the model speaks, follow it — including a Flow's
   `Steps`, which are normative order, and `## Requirements`, which are commitments your
   implementation must satisfy. Where the model is silent (framework, storage, styling), choose
   sensibly and record the choice.
3. **Do not invent behavior.** A gap in the model is a QUESTION, not an invitation. Collect
   gaps and ambiguities as a numbered list and ask before (or while) building — never silently
   decide something the model's owner should decide.
4. **Human steps stay human.** A Flow step with no operation attached (a prose step) is work a
   person performs — build the software up to that boundary (surface it, wait on it, record its
   outcome), do not automate it away.
5. **Tests come from the model.** Every `## Requirements` bullet and every Contract's
   `### Ensures` clause is a test case. A requirement without a covering test is unfinished.
6. **Report realization back.** When done, output a REALIZATION.md: for each intent, what was
   built where (file/module/route per facet — the model calls these bindings), plus every
   deviation or open question. The owner pastes this back into their AIM tool.

## Language reference (condensed)

# AIM v5.6 — condensed reference (offline fallback)

AIM treats a `.aim` file as a **projection of a node-and-edge graph**. The graph is normative, not
descriptive: facets are units of intent, typed edges are relational intent. `.aim` files are the sole
behavioral authority; the graph is derived, never authored separately.

## Frontmatter
Required: `aim` (lowercase dotted namespace), `kind` (intent | record | schema | flow | contract |
persona | view | event | trigger | mapping | binding). Optional: `parent`, `display`, `tags`,
`provenance` (`inferred` on re-encoded, unconfirmed files), `nature` (projection-only entity
badge on an intent that IS a thing: record | persona | flow | view | event | trigger | capability —
never affects resolution or edge legality; mismatch with content = info only).
NO per-file `version`/`spec` — version lives only in `AGENTS.md` (`aim_version: 5.6`).

## Body
Exactly one H1. H2 sections (`## Summary`, `## Requirements`, `## Tests`, `## Subintents`,
`## Dependencies`) and facet headings `## <FacetType>: <Name>` — names match
`[A-Za-z][A-Za-z0-9_]*` (PascalCase), each heading immediately followed by `### Summary`.
A passive data-thing — stored, read, processed, never acting — is `## Record: <Name>` with its
fields in a `### Schema` sub-block (`## Schema: <Name>` is the deprecated v5.0 spelling; an actor
is a Persona, never a Record). Fields go in fenced `schema` blocks (`aim-attrs` is a deprecated
alias): `name: type modifier*` (required, optional, min, max, ref(Type.field), enum(...),
default(...), list(<type>) — a Record-typed list derives a refs edge). No raw HTML; no task lists.
**Promoted entity (v5.2):** an entity with substance AND its own operations becomes its own
sub-intent — top-level `## Schema` (record) or `## Role`/`## Access` (persona, edges declared
from the intent node), `nature:` as the badge, its operations co-located under it. The cue: the
moment an entity grows an entity-specific Contract, promote it; never leave the entity's contract
on the parent while its data sits elsewhere. Operations stay FACETS under their parent/entity until
they earn a sub-intent (several facets, own entry points, or own requirements) — never wrap a
single contract in its own one-facet sub-intent (§15.2 wrapper smell).

## Flow steps (v5.3) — structured, tools parse them
A Flow's `### Steps` is an ordered list projections read directly: ONE numbered item = ONE step
(sequencing is between steps, never within one); inline edge tokens are the step's operations;
two+ `invokes` in one item = ONE step with several operations, rendered side by side, never
chained; a step with NO edges is a human step — first-class in every process view (a manual step
remains a Flow step); a step with only mutates/emits/reads is the flow's own work. When modeling a
process, put EVERY real-world step in `### Steps` — human steps included, as prose items — not
only the ones with contracts.
**Joint work is unordered (v5.5):** operations sharing one step have no order among them — a
realization may run them concurrently — and the FOLLOWING step is the join: it must not begin
until the step's joint operations have completed. Fork-join needs no construct. Co-stepped
operations are EXCLUSIVE (alternatives) only when they are a deciding contract's `### Decides`
outcomes (§7.2); joint work otherwise — exclusivity is the model's call, never the reader's. A
multi-step parallel branch is expressed by promotion (each branch a Flow, one step invoking them
jointly); a RACE (first-wins, rest abandoned) is not admitted — state it in prose.
**Promoted process (v5.3):** a Flow with its own operations, records, and requirements promotes
to a sub-intent like an entity — top-level `## Steps` (edges from the intent node),
`nature: flow` badge, its contracts/records co-located under it. Promote when the org has several
processes; a project that IS one process does not wrap itself in a SINGLE child (never mint a
single-child parent) — but it does split into PHASES once it grows.
**Phases (v5.4):** past ~6 operations a process reads as phases, and a phase is a run of consecutive
steps producing ONE artifact (look for the Records — usually one per phase). The root keeps the
Personas, the Trigger, cross-cutting Requirements, `## Children`, and an orchestrating spine whose
steps `invokes` each phase (`invokes`/`triggers` may target an intent, v5.4 — a promoted process
has no facet node to name). Each phase takes `nature: flow`, its own `## Steps`, its Contracts,
Events and Record. The parent spine names PHASES; a phase spine names STEPS — never both. Edges
cross intent boundaries freely, so a phase operation still `satisfies` a root requirement. Never
propose a single phase.

## Decisions (v5.4) — declared on the deciding operation
A decision is a judgment somebody reaches against criteria, so it belongs to the Contract (or Flow)
that reaches it — reviewing IS deciding, and a separate gateway node would split the judgment from
the `### Authz` that says who may make it. The deciding operation lists its outcomes:
```markdown
### Decides

- **Accurate** — every balance ties to a reconciliation — [emits](aim:#Event:StatementsConfirmed)
- **Inaccurate** — any balance is unexplained — [emits](aim:#Event:DiscrepanciesFound)
```
One bullet per outcome; the bolded label is its name (the YES/NO); the prose after the dash is the
CRITERIA (never omit it — an outcome nobody can check is an unauditable decision); the outcome's
edges ride in its bullet. The block ASSERTS the outcomes are mutually exclusive and exhaustive —
this is the only way to say "one of these, not both", which no edge shape can express. Two or more
outcomes required. Every outcome needs a consumer: an outcome that trails off is the half-modelled
YES/NO of a hand-drawn flowchart. A `### Steps` item whose operations are a deciding contract's
outcomes is exclusive; anything else in one item is joint work.
**Continuation after a decision (v5.5):** the outcome the procedure PROCEEDS on continues as the
NEXT step and declares no continuation of its own (its `emits`, if any, is an announcement —
e.g. what disarms a deadline); every other outcome's consequence — a corrective `invokes`, an
abort `emits` — rides its bullet. A correction loop is the losing outcome invoking (directly or
via its event) the corrective operation, which re-invokes the deciding contract — a LEGAL cycle
among contracts, while `### Steps` stay the linear procedure. Never declare the proceeding
outcome's continuation on the bullet AND as the next step (redundant — one home only); when no
single outcome proceeds, the deciding step must be the sequence's LAST, each outcome carrying its
own continuation. Bound a correction loop with a deadline Trigger, never a count.

## Typed edges (the core)
One CommonMark token connects nodes, declared once at the ACTING node:
`[verb](aim:<address>)`  where address = `<component>#<FacetType>:<Name>` (component elidable
within the same file → `#<FacetType>:<Name>`).
Closed verbs and their from→to facet types:
- exposes: view → contract (user-initiated action)
- invokes: flow|view|contract|persona|intent → contract|flow|intent|capability (from a View = programmatic; from an intent = a promoted Persona acting; to an intent = a promoted process, v5.4; to a Capability = consults that source-kind, v5.6 — no inverse derives)
- reads: contract|flow|view → record
- mutates: contract|flow → record
- emits: flow|contract → event
- subscribes: flow|contract|component → event
- accesses: persona|intent → view|component (component-level target = the whole screen/feature; intent source = a promoted Persona)
- navigates: view → view
- triggers: trigger → contract|flow|intent (intent target = a promoted process, v5.4)
- refs: record field → record field (the `ref()` modifier)
- satisfies: contract|flow|view|trigger → requirement item, `[satisfies](aim:#Requirements[n])` (1-based) or `aim:#Requirements[LABEL]` for a labeled bullet (`- **NET14** — …`; labels survive reordering)
Derived (never authored): triggered-by, emitted-by, satisfied-by. Do NOT author
`### Trigger`/`### Emitted By` inverse blocks — they are derived.

## Trigger facet
`## Trigger: <Name>` models non-actor entry points (cron/webhook/external) with `### Kind`,
`### Schedule`, and `### Fires` → `[triggers](aim:#Flow:X)`.

## External information (v5.6)
What an operation CONSULTS is a commitment; how it is fetched is not (§1.4). Declare the KIND of
an outside source or service as a `## Capability: <Alias>` surface (Summary states the kind —
"an official weather source, per city" — `### Operations` its query shapes), required via
`## Dependencies → ### Requires`, and wire the consuming operation `[invokes](aim:#Capability:X)`.
Resolution is either a mapping (`## Map:` — the provider is a modeled intent) or a `### Bindings`
on the surface itself (`system:` locator — an external system; per-operation form
`- binds: \`table:erp.customers#credit_limit\` — as: CreditLimit`). Unresolved by either = hard
error. Never name a vendor in intent; never put query mechanics or credentials anywhere in the
model. Document-shaped information is acquired as a step: a collect Contract consults the
capability and `mutates` a Record; downstream operations `read` it. A `### Decides` with no
`reads`, no capability `invokes`, and no `### Input` is a judgment with no stated basis (info).

## Bindings — an inline property (v5.1)
A binding attaches to the node it realizes as a `### Bindings` sub-block (on an intent or facet):
`- binds:` bullets with a locator (`file#symbol`, `route:`, `topic:`, `table:` — open scheme set)
plus an optional `- provenance: inferred` line, the binding's own trust stamp separate from the
authored node around it. Bindings record realization, not behavior. Deprecated but accepted: the
`kind: binding` sidecar with `## Bind: <FacetType>:<Name>` headings, co-located with its intent
(never a separate `aim/bindings/` tree). `kind: mapping` files stay co-located as before.

## Hard errors
Missing/invalid frontmatter or facet type; facet name violating the name grammar; header/path
mismatch; missing H1 or empty `## Requirements`; dangling edge (target resolves to nothing);
illegal `(verb, from, to)` triple; satisfies index out of range.
The traceability chain Requirement → satisfied-by behavior, Persona/Trigger → View → Contract →
Flow/Record/Event is derived from edges and checkable.

## Open change requests

These adjustments were recorded against the running system and accepted into the model —
they are context for WHY the current model looks the way it does:

1. **Add multiplayer lobbies and player names** — Introduced a lobby system. Players can set custom or randomized names. They can host a new lobby (which generates a unique 5-character code) or join an existing lobby using its code.

## Required inputs and external access

Resolve these BEFORE starting — this is what the model needs provided from outside; a source the
model names is connected, never invented:


**Produced artifacts:** PlayerProfile, Lobby — write them under `records/<Name>/`.

**Actors involved:** Player — route their steps and approvals to them, never perform them yourself.

## The intent model

### FILE: aim/sweepgame/cards/sweepgame.cards.aim

````markdown
---
aim: sweepgame.cards
kind: intent
parent: sweepgame
tags: [software]
---

# Cards

## Summary
The logic and rules for playing cards, drawing, sweeping, and resolving turn outcomes in Sweep.

## Requirements
- **RULES** — Enforces valid plays and special card rules.
- **DECK_PILE** — Manages drawing from the deck and picking up the pile.

## Flow: SetupGame

### Summary
The initial dealing and setup phase before gameplay begins. Setup logic branches based on game difficulty.

### Steps
1. Deal 3 cards face-down to each player — [mutates](aim:sweepgame#Record:PlayerState), [satisfies](aim:sweepgame#Requirements[SETUP]).
2. If difficulty is Easy or Medium: Deal 6 cards to each player's hand. Each player selects 3 from their hand to place face-up — [invokes](aim:#Contract:SetFaceUpCards), [satisfies](aim:sweepgame#Requirements[DIFF_EASY]), [satisfies](aim:sweepgame#Requirements[DIFF_MEDIUM]).
3. If difficulty is Hard: Deal 3 cards face-up to each player automatically, then deal 3 cards to their hand — [mutates](aim:sweepgame#Record:PlayerState), [satisfies](aim:sweepgame#Requirements[DIFF_HARD]).

## Contract: SetFaceUpCards

### Summary
During setup (in Easy/Medium difficulty), the player selects 3 cards from their 6-card hand to place face-up on top of their face-down cards, leaving them with exactly 3 cards in their hand to start the game.

### Input
```schema
selectedCards: list(Card)
```

### Authz
- Player must be in the game, and the game difficulty must be Easy or Medium.

### Ensures
- The 3 chosen cards are moved from the player's hand to their `faceUp` list — [mutates](aim:sweepgame#Record:PlayerState).
- Emits a setup ready event — [emits](aim:sweepgame#Event:PlayerReady).

## Contract: PlayCards

### Summary
Player throws one or more cards of the exact same value from their hand (or face-up cards, if hand is empty). 

### Authz
- Player must be the active player (or it's the very first move of the game).

### Expects
- If playing from face-up cards, the player's hand MUST be completely empty — [satisfies](aim:sweepgame#Requirements[PLAY_ORDER]).

### Decides
- **Sweep** — The cards are 10s, OR the play completes an exact 4-of-a-kind (four cards of the same face value consecutively) on top of the pile. The pile is moved to the graveyard, the player draws if needed, and the player gets another turn — [mutates](aim:sweepgame#Record:GameState), [emits](aim:sweepgame#Event:PileSwept), [satisfies](aim:sweepgame#Requirements[SPECIAL_10]), [satisfies](aim:sweepgame#Requirements[SWEEP_FOUR]).
- **ValidPlay** — The cards are valid (>= active value, or <= active value if 7 was played prior, or special). The cards are added to the pile.
  - If 7 is played, the game state updates to force the next player to play 7 or lower — [mutates](aim:sweepgame#Record:GameState), [satisfies](aim:sweepgame#Requirements[SPECIAL_7]).
  - If 8 is played, the turn advances twice (skipping the next player) — [satisfies](aim:sweepgame#Requirements[SPECIAL_8]).
  - If 5 is played, it sets the active value to 0 if played on an empty pile. If played on an 8, it copies the value but does not skip. If played on a 7, it copies the value and maintains the force-lower requirement — [satisfies](aim:sweepgame#Requirements[SPECIAL_5]).
  - Otherwise, the turn advances normally and any "force lower" state is cleared.
  — [mutates](aim:sweepgame#Record:GameState), [emits](aim:sweepgame#Event:CardsPlayed), [satisfies](aim:sweepgame#Requirements[VALID_PLAY]), [satisfies](aim:sweepgame#Requirements[SPECIAL_2]), [satisfies](aim:sweepgame#Requirements[SPECIAL_ACE]), [satisfies](aim:sweepgame#Requirements[PLAY_MULTIPLES]), [satisfies](aim:sweepgame#Requirements[FIRST_MOVE]), [satisfies](aim:#Requirements[RULES]), [invokes](aim:#Flow:ResolveTurnEnd).
- **Invalid** — The cards are not a valid play. The action is rejected — [emits](aim:sweepgame#Event:PlayRejected).

## Flow: ResolveTurnEnd

### Summary
After a valid play (that isn't a sweep), resolves drawing cards and checking win conditions.

### Steps
1. Check hand size: if the player has < 3 cards and the deck is not empty, draw cards until the hand has 3 — [invokes](aim:#Contract:DrawCards), [satisfies](aim:sweepgame#Requirements[MIN_HAND]).
2. Check win condition: if the player's hand, face-up, and face-down are all empty, mark them as finished — [mutates](aim:sweepgame#Record:PlayerState), [satisfies](aim:sweepgame#Requirements[WIN]).

## Contract: DrawCards

### Summary
Draws cards from the deck to the player's hand.

### Ensures
- Moves cards from the deck to the player's hand — [mutates](aim:sweepgame#Record:GameState), [mutates](aim:sweepgame#Record:PlayerState), [satisfies](aim:#Requirements[DECK_PILE]).

## Contract: PickUpPile

### Summary
Player picks up the entire pile into their hand.

### Ensures
- All cards in the pile are added to the player's hand.
- The pile is emptied, and any "force lower" state is reset — [mutates](aim:sweepgame#Record:GameState), [mutates](aim:sweepgame#Record:PlayerState), [satisfies](aim:sweepgame#Requirements[PICKUP]), [satisfies](aim:#Requirements[DECK_PILE]).
- The turn advances to the next player.

## Contract: PlayFaceDownCard

### Summary
During the endgame, the player blind-plays one of their face-down cards.

### Expects
- The player's hand and face-up cards MUST be completely empty — [satisfies](aim:sweepgame#Requirements[PLAY_ORDER]).

### Decides
- **Sweep** — The revealed card is a 10 or completes a 4-of-a-kind. Pile swept, player goes again — [emits](aim:sweepgame#Event:PileSwept).
- **ValidPlay** — The revealed card is valid according to current board state. It is added to the pile, turn advances — [emits](aim:sweepgame#Event:CardsPlayed), [satisfies](aim:sweepgame#Requirements[ENDGAME]), [invokes](aim:#Flow:ResolveTurnEnd).
- **Invalid** — The revealed card is not a valid play. The card and the entire pile are picked up into the player's hand. The turn advances — [invokes](aim:#Contract:PickUpPile).
````

### FILE: aim/sweepgame/lobby/sweepgame.lobby.aim

````markdown
---
aim: sweepgame.lobby
kind: intent
parent: sweepgame
tags: [software]
---

# Multiplayer Lobby

## Summary
Manages player identities, lobby creation, and matchmaking before a game of Sweep begins.

## Requirements
- **PLAYER_NAME** — A player can set a custom username or generate a randomized one.
- **LOBBY_CREATE** — A player can create a new multiplayer lobby, becoming its host.
- **LOBBY_CODE** — Every lobby has a unique 5-character alphanumeric join code.
- **LOBBY_JOIN** — Players can join a lobby using its 5-character code.

## Record: PlayerProfile

### Summary
A player's pre-game identity.

### Schema
```schema
playerId: string required
username: string required
```

## Record: Lobby

### Summary
A pre-game waiting room where players gather.

### Schema
```schema
code: string required min(5) max(5)
hostId: string required ref(PlayerProfile.playerId)
playerIds: list(string)
status: enum(waiting, playing) required
```

## Contract: SetUsername

### Summary
Saves the player's chosen or randomized username.

### Input
```schema
username: string required
isRandomized: boolean required
```

### Ensures
- The player's username is saved — [mutates](aim:#Record:PlayerProfile), [satisfies](aim:#Requirements[PLAYER_NAME]), [satisfies](aim:sweepgame#Requirements[MULTIPLAYER]).

## Contract: CreateLobby

### Summary
Creates a new lobby and assigns the creator as the host.

### Ensures
- A new Lobby is created with a unique 5-character code — [mutates](aim:#Record:Lobby), [satisfies](aim:#Requirements[LOBBY_CODE]), [satisfies](aim:#Requirements[LOBBY_CREATE]), [satisfies](aim:sweepgame#Requirements[MULTIPLAYER]).
- The creator is added to the lobby and set as the host.
- Emits a lobby created event — [emits](aim:#Event:LobbyCreated).

## Contract: JoinLobby

### Summary
Adds a player to an existing lobby via its code.

### Input
```schema
code: string required
```

### Expects
- The code must match an active lobby.

### Ensures
- The player is added to the lobby's participant list — [mutates](aim:#Record:Lobby), [satisfies](aim:#Requirements[LOBBY_JOIN]), [satisfies](aim:sweepgame#Requirements[MULTIPLAYER]).
- Emits a player joined event — [emits](aim:#Event:PlayerJoined).

## View: MainMenu

### Summary
The entry screen where players set their name and choose to host or join.

### Display
- Input for username and a randomize button.
- Input for a 5-character join code.

### Actions
- Set username — [exposes](aim:#Contract:SetUsername).
- Create a new lobby — [exposes](aim:#Contract:CreateLobby).
- Join an existing lobby — [exposes](aim:#Contract:JoinLobby).

## Event: LobbyCreated

### Summary
Emitted when a new lobby is opened.

### Payload
```schema
code: string required
hostId: string required
```

## Event: PlayerJoined

### Summary
Emitted when a player successfully joins a lobby.

### Payload
```schema
code: string required
playerId: string required
```
````

### FILE: aim/sweepgame/sweepgame.aim

````markdown
---
aim: sweepgame
kind: intent
tags: [software]
---

# SweepGame

## Summary
The core engine for the card game 'Sweep'. Players are dealt a hand, face-up cards, and blind face-down cards. They must play cards of equal or higher value to the pile, utilizing special cards (2, 10, Ace) and 4-of-a-kind sweeps to avoid picking up the pile. The goal is to empty all cards from hand, face-up, and face-down. New difficulties introduce automated setup and complex special cards. Multiplayer matchmaking lets players group up before a game via unique 5-character codes.

## Requirements
- **SETUP** — Each player receives 3 face-down cards.
- **DIFF_EASY** — In Easy mode, players receive 6 cards to their hand and select 3 to place face-up. Special cards are A, 2, 10.
- **DIFF_MEDIUM** — In Medium mode, setup matches Easy, but introduces special cards 5, 7, and 8.
- **DIFF_HARD** — In Hard mode, players receive 3 face-up cards dealt randomly (no choice), and 3 cards to their hand. Uses Medium's special cards.
- **PLAY_ORDER** — Players MUST play cards from their hand if they have any. Face-up cards can only be played if the hand is completely empty. Face-down cards can only be played if both the hand and face-up cards are empty.
- **MIN_HAND** — Players must maintain at least 3 cards in their hand by drawing from the deck after their turn, until the deck is empty.
- **VALID_PLAY** — A played card must be equal to or higher than the current top card of the pile, unless altered by a special card rule.
- **PLAY_MULTIPLES** — Players may play multiple cards of the exact same value in a single turn.
- **SWEEP_FOUR** — If exactly four cards of the same face value (e.g. four 4s, four 7s, four 8s) land consecutively on top of the pile, the pile is swept to the graveyard and the player plays again. Mirrored sequences (like A, 5, A, 5) do not count as a sweep.
- **SPECIAL_ACE** — Aces can be played on any card. The next player must play an Ace or a 2.
- **SPECIAL_2** — 2s can be played on any card. The pile's active value resets to 2.
- **SPECIAL_5** — 5s can be played on any card. On an empty pile, the pile's value becomes 0 (any card can be played next). When played on an 8, it mirrors the value 8 but does not copy the skip effect. When played on a 7, it mirrors the value 7 and maintains the "force lower" effect.
- **SPECIAL_7** — 7s can only be played on a 7 or lower. When played, the next player MUST play a card 7 or lower (or a valid special card like A, 2, 5).
- **SPECIAL_8** — 8s can only be played on an 8 or lower. When played, the next player's turn is skipped.
- **SPECIAL_10** — 10s can be played on an empty pile or any card less than 10. The pile (including the 10) is swept to the graveyard, and the player plays again.
- **PICKUP** — If a player cannot or chooses not to play a valid card, they must pick up the entire pile into their hand.
- **ENDGAME** — Face-down cards can only be played one at a time, blindly, when the hand and face-up cards are empty. If the revealed card is invalid, the player picks up the pile.
- **WIN** — A player wins and leaves the game when they have zero cards in hand, zero face-up cards, and zero face-down cards.
- **FIRST_MOVE** — The game begins when the first player throws a card (typically a 3).
- **MULTIPLAYER** — Players can set usernames and join multiplayer lobbies before starting a game.

## Children
- [cards](./cards/sweepgame.cards.aim) — Core card playing rules and actions
- [lobby](./lobby/sweepgame.lobby.aim) — Multiplayer matchmaking, player names, and lobby codes

## Record: Card

### Summary
A playing card.

### Schema
```schema
suit: enum(hearts, diamonds, clubs, spades) required
value: number required min(2) max(14)
```

## Record: GameState

### Summary
The state of the shared game board.

### Schema
```schema
difficulty: enum(easy, medium, hard) required
deck: list(Card)
pile: list(Card)
graveyard: list(Card)
activeValue: number optional
forceLower: boolean default(false)
```

## Record: PlayerState

### Summary
The state of an individual player's cards.

### Schema
```schema
playerId: string required
hand: list(Card)
faceUp: list(Card)
faceDown: list(Card)
isFinished: boolean required
```

## Persona: Player

### Role
A participant in the Sweep game.

### Access
- [accesses](aim:sweepgame.lobby)
- [accesses](aim:#View:GameBoard)

## View: GameBoard

### Summary
The main table view showing the deck, pile, graveyard, and players' hands/table cards.

### Display
- The active [reads](aim:#Record:GameState).
- The player's own [reads](aim:#Record:PlayerState).

### Actions
- Set 3 face-up cards — [exposes](aim:sweepgame.cards#Contract:SetFaceUpCards)
- Play card(s) from hand or face-up — [exposes](aim:sweepgame.cards#Contract:PlayCards)
- Play a blind face-down card — [exposes](aim:sweepgame.cards#Contract:PlayFaceDownCard)
- Take the pile — [exposes](aim:sweepgame.cards#Contract:PickUpPile)

## Flow: GameEngine

### Summary
Orchestrates game state transitions based on player events.

### Steps
1. Initialize the game setup phase — [invokes](aim:sweepgame.cards#Flow:SetupGame).
2. A player finishes setup — [subscribes](aim:#Event:PlayerReady).
3. A player completes a valid play — [subscribes](aim:#Event:CardsPlayed).
4. A player triggers a sweep — [subscribes](aim:#Event:PileSwept).
5. A play is rejected — [subscribes](aim:#Event:PlayRejected).

## Event: CardsPlayed

### Summary
Emitted when cards are successfully played.

### Payload
```schema
playerId: string required
cards: list(Card)
```

## Event: PileSwept

### Summary
Emitted when the pile is cleared to the graveyard.

### Payload
```schema
playerId: string required
```

## Event: PlayerReady

### Summary
Emitted when a player finishes setting their face-up cards.

### Payload
```schema
playerId: string required
```

## Event: PlayRejected

### Summary
Emitted when a player attempts an invalid play.

### Payload
```schema
playerId: string required
```
````

---

Begin by (1) summarizing the model back in a few sentences — the actors, the main operations,
the records, and every process with its steps — so your understanding can be checked, then
(2) list your open questions, then (3) propose your implementation plan. Wait for confirmation
before writing code if the owner is present; otherwise proceed and keep the questions visible
at the top of your report.
