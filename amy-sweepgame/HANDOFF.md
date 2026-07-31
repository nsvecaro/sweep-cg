# Handoff package

This bundle was produced by **Amy** (the AIM Architect) from a tester's feedback on a
running application. It is intended for the **Developer** role in the AIM workflow, working on a
different system.

## Contents

- `aim/` — the updated AIM v5.6 intent tree. **Single source of truth.** Only changes the tester
  accepted have been applied.
- `ADJUSTMENTS.md` — human-readable change-requests with rationale and screenshot references.
- `adjustments.json` — the same, machine-readable for tooling and agents.
- `screenshots/` — evidence images referenced by adjustments.
- `AGENTS.md` — project bootstrap metadata (AIM version + spec URL).

## How to implement this

You are the **Developer**. Work against `aim/` as the authoritative behavioral spec.

1. Read `AGENTS.md` and the AIM v5.6 specification at https://raw.githubusercontent.com/juicejs/application-intent-model/refs/heads/master/specification.md.
2. Bootstrap the AIM **Developer** agent using the copyable prompt at https://intentmodel.dev.
3. Implement code and tests so behavior matches the intent in `aim/`. Use `ADJUSTMENTS.md` to
   understand what changed since the last build and why.
4. Run the **Reviewer** to confirm there is no drift between the implementation and `aim/`.

_Project: SweepGame · generated 2026-07-31T18:32:34.720Z_
