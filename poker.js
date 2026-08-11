// poker.js — pure draw-poker maths for Tide Poker.
//
// Same discipline as tavern.js, regatta.js and reef.js: no DOM, no clock, no
// network, no crypto. The caller supplies hashes as hex; everything here is a
// pure function of its arguments, so it runs identically in a browser, in
// node tests, in an offline verifier, or vendored into a game server that
// wants to re-check a claimed win (BUILDING-GAMES.md §5).
//
// The two-tide construction — the whole point of the game:
//   deal   = first 5 cards of shuffle(deck52,        sha256(blockHashA|mark))
//   redraw = replacements from  shuffle(remaining47, sha256(blockHashB|mark))
// The player chooses holds BETWEEN the two blocks, so the replacement cards
// come from randomness that exists for nobody at decision time. Both stages
// verify independently from public chain data.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const rankOf = (c) => c % 13;          // 0='2' … 12='A'
export const suitOf = (c) => Math.floor(c / 13); // 0=♠ 1=♥ 2=♦ 3=♣
export const cardName = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];

// 8/5 Jacks-or-Better: the classic paytable at an honest ~97.3% return with
// perfect play. Multipliers are "for one": payout = stake × multiplier
// (a paying Jacks pair returns exactly the stake).
export const PAYTABLE = [
  { key: 'royal',     name: 'Royal Flush',     mult: 800 },
  { key: 'sflush',    name: 'Straight Flush',  mult: 50 },
  { key: 'quads',     name: 'Four of a Kind',  mult: 25 },
  { key: 'boat',      name: 'Full House',      mult: 8 },
  { key: 'flush',     name: 'Flush',           mult: 5 },
  { key: 'straight',  name: 'Straight',        mult: 4 },
  { key: 'trips',     name: 'Three of a Kind', mult: 3 },
  { key: 'twopair',   name: 'Two Pair',        mult: 2 },
  { key: 'jacks',     name: 'Jacks or Better', mult: 1 },
];
const MULT = Object.fromEntries(PAYTABLE.map((p) => [p.key, p.mult]));

// ---------------------------------------------------------------- shuffling

// xorshift128 seeded from a hex seed — the fleet's standard PRNG.
function prng(seedHex) {
  const clean = String(seedHex).replace(/[^0-9a-fA-F]/g, '').padEnd(32, '7');
  let a = parseInt(clean.slice(0, 8), 16) | 0;
  let b = parseInt(clean.slice(8, 16), 16) | 0;
  let c = parseInt(clean.slice(16, 24), 16) | 0;
  let d = parseInt(clean.slice(24, 32), 16) | 0;
  return function next() {
    const t = b << 9; let r = b * 5; r = ((r << 7) | (r >>> 25)) * 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
    return ((r >>> 0) / 4294967296);
  };
}

// Deterministic Fisher–Yates over any card list.
export function shuffleFromSeed(seedHex, cards) {
  const rand = prng(seedHex);
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Stage one: the deal. First five off a full-deck shuffle.
export function deal(seedHexA) {
  const deck = shuffleFromSeed(seedHexA, Array.from({ length: 52 }, (_, i) => i));
  return deck.slice(0, 5);
}

// Stage two: the redraw. holds is a boolean[5]; replacements come off a
// SECOND shuffle — of the 47 cards the deal left — seeded by the second
// block. Nothing about the first shuffle leaks into the replacements.
export function redraw(seedHexA, seedHexB, holds) {
  const hand = deal(seedHexA);
  if (!Array.isArray(holds) || holds.length !== 5 || holds.some((h) => typeof h !== 'boolean')) {
    throw new Error('redraw: holds must be five booleans');
  }
  const dealtSet = new Set(hand);
  const remaining = Array.from({ length: 52 }, (_, i) => i).filter((c) => !dealtSet.has(c));
  const stock = shuffleFromSeed(seedHexB, remaining);
  let next = 0;
  const finalHand = hand.map((c, i) => (holds[i] ? c : stock[next++]));
  return { dealt: hand, finalHand, drawn: finalHand.filter((_, i) => !holds[i]) };
}

// ---------------------------------------------------------------- evaluation

// Full 5-card evaluator for the Jacks-or-Better ladder.
export function evaluate(hand) {
  if (new Set(hand).size !== 5) throw new Error('evaluate: five distinct cards required');
  const ranks = hand.map(rankOf).sort((a, b) => a - b);
  const suits = hand.map(suitOf);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const shape = Object.values(counts).sort((a, b) => b - a); // e.g. [3,2]
  const flush = suits.every((s) => s === suits[0]);
  const wheel = ranks.join(',') === '0,1,2,3,12'; // A-2-3-4-5
  const straight = wheel || ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);

  if (flush && straight && ranks[0] === 8) return hit('royal');       // 10-J-Q-K-A suited
  if (flush && straight) return hit('sflush');
  if (shape[0] === 4) return hit('quads');
  if (shape[0] === 3 && shape[1] === 2) return hit('boat');
  if (flush) return hit('flush');
  if (straight) return hit('straight');
  if (shape[0] === 3) return hit('trips');
  if (shape[0] === 2 && shape[1] === 2) return hit('twopair');
  if (shape[0] === 2) {
    const pairRank = Number(Object.keys(counts).find((r) => counts[r] === 2));
    if (pairRank >= 9) return hit('jacks');                            // J,Q,K,A
  }
  return { key: 'nothing', name: 'Nothing', mult: 0 };
  function hit(key) { return { key, name: PAYTABLE.find((p) => p.key === key).name, mult: MULT[key] }; }
}

// ---------------------------------------------------------------- settling

export function settle({ seedHexA, seedHexB, holds, stake }) {
  if (!Number.isInteger(stake) || stake <= 0) throw new Error('settle: stake must be a positive integer');
  const { dealt, finalHand, drawn } = redraw(seedHexA, seedHexB, holds);
  const result = evaluate(finalHand);
  const payout = stake * result.mult;
  return { dealt, finalHand, drawn, result, payout, delta: payout - stake };
}

// Re-derive a whole claimed game from first principles. The caller computes
// seedHexA = sha256(blockHashA|mark) and seedHexB = sha256(blockHashB|mark).
export function verifyGame(args) {
  return settle(args);
}
