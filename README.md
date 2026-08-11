# Tide Poker 🃏

**One block deals. You choose your holds. The next block draws.**

Draw poker across two tides — the fleet's first game with a real decision
*between* two randomnesses. In **⚓ Tide** mode your stake and a random mark
name a testnet4 block that does not exist yet; when it is mined (plus one
confirmation), your five cards are the top of a full-deck shuffle seeded by
`sha256(blockA | mark)`. You choose your holds, and the discards are replaced
from a **second** shuffle — of the 47 cards the deal left — seeded by the
*next* block: `sha256(blockB | mark)`. The replacement cards exist for nobody
when you decide. Both stages verify independently from public chain data, and
**verify ✓** in the log recomputes the whole hand in your browser (reporting
honestly if either block reorged).

Paytable: classic **8/5 Jacks-or-Better** — ≈2.7% house edge with perfect
play, and your skill at choosing holds genuinely matters.

Pure static — one `index.html` plus [`poker.js`](poker.js), cards and sounds
from code. No build, no assets, no server.

**Play: <https://tide-games.github.io/tide-poker/>** · part of
[the fleet](https://tide-games.github.io/)

## The maths is a library

`poker.js` is pure — no DOM, no clock, no network, no crypto. A full 5-card
evaluator (wheel and steel-wheel included), deterministic Fisher–Yates
shuffles, the two-seed redraw construction, and an offline verifier.

```sh
node tests.js   # 32 checks: every ladder rung, redraw invariants, 26k-deal
                # uniformity and hand-frequency theory at 4σ+
```

## Honest notes

- A **practice** hand abandoned mid-hold (page closed before drawing) loses
  its stake — practice state is not persisted. Tide hands survive anything:
  the pending state machine picks up exactly where the chain left it.
- Unlike the fleet's pure-chance games, the quoted edge assumes perfect play;
  worse hold choices raise it. That's poker.

## Roadmap

- [x] The game — two-tide provably fair draw poker, play money, 1-conf
      settlement on both blocks, reorg-aware verify
- [ ] Courier in/out: sealed gold via the trail, gated on
      [tideholm#154](https://github.com/melvincarvalho/tideholm/issues/154)

Doubloons are play money. Testnet4 only. When a boundary isn't airtight, the
page says so.
