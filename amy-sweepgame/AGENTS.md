---
aim_version: 5.6
aim_root: ./aim/
spec: https://raw.githubusercontent.com/juicejs/application-intent-model/refs/heads/master/specification.md
---

# Agents

This project uses the **Agentic Intent Model (AIM) v5.6** for behavioral specification.
The `.aim` files under `./aim/` are the single behavioral authority.

- **Architect** owns the intent in `./aim/`.
- **Developer** implements code and tests from that intent.
- **Reviewer** checks the implementation against the intent and reports drift.

This package was assembled from tester feedback via Amy. See `ADJUSTMENTS.md` for the change
requests that motivated the current state of `./aim/`.

_Project: SweepGame_
