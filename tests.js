// tests.js — run: node tests.js  (exits non-zero on failure)
import { createHash } from 'node:crypto';
import {
  PAYTABLE, RANKS, SUITS, rankOf, suitOf, cardName,
  shuffleFromSeed, deal, redraw, evaluate, settle,
} from './poker.js';

let fails = 0;
function ok(cond, name, detail) {
  if (cond) console.log('  ok ', name);
  else { fails++; console.error('  FAIL', name, detail ?? ''); }
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
// build a hand by name: C('A♠','K♠',...)
const C = (...names) => names.map((n) => {
  const suit = SUITS.indexOf(n.slice(-1));
  const rank = RANKS.indexOf(n.slice(0, -1));
  if (suit < 0 || rank < 0) throw new Error('bad card ' + n);
  return suit * 13 + rank;
});

// ---- card identities
ok(cardName(C('A♠')[0]) === 'A♠' && cardName(C('2♣')[0]) === '2♣', 'card names round-trip');
ok(rankOf(C('10♥')[0]) === 8 && suitOf(C('10♥')[0]) === 1, 'rank and suit decompose');

// ---- evaluator, one of each rung
const HANDS = [
  ['royal',    C('10♠','J♠','Q♠','K♠','A♠')],
  ['sflush',   C('5♦','6♦','7♦','8♦','9♦')],
  ['quads',    C('7♠','7♥','7♦','7♣','2♠')],
  ['boat',     C('K♠','K♥','K♦','4♠','4♥')],
  ['flush',    C('2♥','6♥','9♥','J♥','K♥')],
  ['straight', C('6♠','7♥','8♦','9♣','10♠')],
  ['trips',    C('9♠','9♥','9♦','K♣','2♠')],
  ['twopair',  C('J♠','J♥','4♦','4♣','A♠')],
  ['jacks',    C('Q♠','Q♥','7♦','4♣','2♠')],
];
for (const [key, hand] of HANDS) {
  ok(evaluate(hand).key === key, `evaluator: ${key}`, evaluate(hand).key);
}
ok(evaluate(C('A♠','2♠','3♠','4♠','5♠')).key === 'sflush', 'the steel wheel is a straight flush');
ok(evaluate(C('A♦','2♠','3♥','4♣','5♦')).key === 'straight', 'the wheel straight (A-2-3-4-5)');
ok(evaluate(C('A♠','K♥','Q♦','J♣','9♠')).key === 'nothing', 'A-high no pair pays nothing');
ok(evaluate(C('10♠','10♥','7♦','4♣','2♠')).key === 'nothing', 'a pair of tens pays nothing (jacks or BETTER)');
ok(evaluate(C('J♠','J♥','7♦','4♣','2♠')).key === 'jacks', 'a pair of jacks pays');
ok(evaluate(C('A♠','A♥','7♦','4♣','2♠')).key === 'jacks', 'a pair of aces pays');
ok(evaluate(C('2♠','3♠','4♠','5♠','7♠')).key === 'flush', 'flush without straight');
ok(evaluate(C('J♠','Q♠','K♠','A♠','2♠')).key === 'flush', 'J-Q-K-A-2 suited is only a flush (no wraparound)');
ok(evaluate(C('J♦','Q♦','K♦','A♦','10♦')).key === 'royal', 'royal in any suit order');
{
  let threw = 0;
  try { evaluate(C('A♠','A♠','2♦','3♦','4♦')); } catch { threw++; }
  ok(threw === 1, 'duplicate cards are refused');
}

// ---- paytable sanity
ok(PAYTABLE[0].mult === 800 && PAYTABLE[PAYTABLE.length-1].mult === 1, '8/5 table: royal 800, jacks 1');
ok(PAYTABLE.find((p)=>p.key==='boat').mult === 8 && PAYTABLE.find((p)=>p.key==='flush').mult === 5,
  'the 8/5 in 8/5 Jacks-or-Better');
{
  let desc = true;
  for (let i = 1; i < PAYTABLE.length; i++) if (PAYTABLE[i].mult >= PAYTABLE[i-1].mult) desc = false;
  ok(desc, 'paytable strictly descends');
}

// ---- shuffling
{
  const s = sha256('deck-seed');
  const a = shuffleFromSeed(s, Array.from({length:52},(_,i)=>i));
  const b = shuffleFromSeed(s, Array.from({length:52},(_,i)=>i));
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed shuffles identically');
  ok(new Set(a).size === 52, 'a shuffle is a permutation');
  ok(JSON.stringify(shuffleFromSeed(sha256('x'), a)) !== JSON.stringify(a), 'different seeds differ');
}
{
  // uniformity: over many seeds, each card leads the deal about equally often
  const counts = new Array(52).fill(0);
  const N = 26_000;
  for (let i = 0; i < N; i++) counts[deal(sha256('u' + i))[0]]++;
  const expected = N / 52, worst = Math.max(...counts.map((c) => Math.abs(c - expected)));
  ok(worst < 4 * Math.sqrt(expected), '26k deals: every card leads at fair frequency (4 sigma)',
    `worst dev ${worst.toFixed(0)} vs ${(4*Math.sqrt(expected)).toFixed(0)}`);
}

// ---- the two-tide redraw
{
  const A = sha256('block-a|mark'), B = sha256('block-b|mark');
  const dealt = deal(A);
  const holds = [true, false, true, false, true];
  const { finalHand, drawn } = redraw(A, B, holds);
  ok(finalHand[0]===dealt[0] && finalHand[2]===dealt[2] && finalHand[4]===dealt[4],
    'held cards stay exactly where they were');
  ok(drawn.length === 2 && drawn.every((c) => !dealt.includes(c)),
    'replacements never come from the dealt five');
  ok(new Set(finalHand).size === 5, 'the final hand has five distinct cards');
  const again = redraw(A, B, holds);
  ok(JSON.stringify(again.finalHand) === JSON.stringify(finalHand), 'the redraw replays identically');
  // the second seed alone changes the replacements, never the deal
  const other = redraw(A, sha256('block-b2|mark'), holds);
  ok(JSON.stringify(other.dealt) === JSON.stringify(dealt), 'the deal is fixed by seed A alone');
  ok(JSON.stringify(other.finalHand) !== JSON.stringify(finalHand), 'seed B decides the replacements');
  // hold everything: seed B is irrelevant
  const all = redraw(A, B, [true,true,true,true,true]);
  ok(JSON.stringify(all.finalHand) === JSON.stringify(dealt), 'holding all five keeps the dealt hand');
  let threw = 0;
  for (const bad of [[true,true,true,true], [1,0,1,0,1], null]) {
    try { redraw(A, B, bad); } catch { threw++; }
  }
  ok(threw === 3, 'malformed holds are refused');
}

// ---- settle
{
  const A = sha256('sa'), B = sha256('sb');
  const s = settle({ seedHexA: A, seedHexB: B, holds: [false,false,false,false,false], stake: 10 });
  ok(s.payout === 10 * s.result.mult && s.delta === s.payout - 10, 'payout is stake × multiplier');
  let threw = 0;
  for (const bad of [0, -5, 2.5]) { try { settle({ seedHexA:A, seedHexB:B, holds:[true,true,true,true,true], stake: bad }); } catch { threw++; } }
  ok(threw === 3, 'bad stakes are refused');
}

// ---- long-run: dealt-hand frequencies track theory (no draw, just the deal)
{
  const N = 26_000, tally = {};
  for (let i = 0; i < N; i++) {
    const k = evaluate(deal(sha256('freq' + i))).key;
    tally[k] = (tally[k] || 0) + 1;
  }
  // theoretical 5-card frequencies FOR THIS LADDER: 'nothing' includes the
  // non-paying pairs 2..10 (no-pair 50.12% + low pairs 29.25% ≈ 79.37%);
  // 'jacks' is the J/Q/K/A slice of one-pair hands, (4/13)·42.26% ≈ 13.00%.
  const theory = { nothing: 0.7937, jacks: 0.1300, twopair: 0.04754, trips: 0.02113 };
  let close = true;
  for (const [k, p] of Object.entries(theory)) {
    const got = (tally[k] || 0) / N, sd = Math.sqrt(p * (1 - p) / N);
    if (Math.abs(got - p) > 4.5 * sd) { close = false; console.error('   ', k, got.toFixed(4), 'vs', p); }
  }
  ok(close, '26k deals: nothing/pair/two-pair/trips frequencies track theory (4.5 sigma)');
}

if (fails) { console.error(`\n${fails} failing`); process.exit(1); }
console.log('\nall tests pass');
