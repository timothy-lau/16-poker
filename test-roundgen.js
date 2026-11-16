/**
 * Node tests for the 16 Poker curated round generator and ranking.
 * Run: node test-roundgen.js
 */
"use strict";
var P = require("./poker-eval.js");
var G = require("./round-gen.js");

var passed = 0, failed = 0, errors = [];
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; errors.push(msg); console.error("FAIL:", msg); }
}

// Deterministic PRNG for reproducible checks (mulberry32).
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── makeHand builds the requested category ──────────────────────────
[2, 3, 4, 5, 6, 7, 8].forEach(function (cat) {
  var ok = true;
  for (var i = 0; i < 200; i++) {
    var h = G.makeHand(cat);
    var ids = {};
    h.forEach(function (c) { ids[c.id] = 1; });
    if (Object.keys(ids).length !== 5 || P.evaluateFive(h).category !== cat) ok = false;
  }
  assert(ok, "makeHand(" + cat + ") always yields 5 distinct cards of " + P.HAND_NAMES[cat]);
});

// Independent recount of a board's decent alternatives (not using quickCheck).
function recount(r) {
  var dc = G.dealerCategory(r.dealt);
  var alts = r.ranking.tiers.slice(1).filter(function (t) {
    return t.key.indexOf("kicker:") !== 0 && t.hand.category >= 1 && t.hand.category > dc;
  });
  return { alts: alts.length, strong: alts.filter(function (t) { return t.hand.category >= 2; }).length };
}
function pct(arr, p) { var s = arr.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }

// ── Generated rounds: structure, unique best, alternatives, mode mix ──
(function () {
  var N = 1200;
  var rng = seeded(7919);
  var bad = { size: 0, dup: 0, unique: 0, kicker: 0, rankMismatch: 0, alts: 0, strong: 0, target: 0, planted: 0, reported: 0 };
  var modes = { planted: 0, natural: 0 }, cats = {}, fallback = 0, times = [], altHist = {};
  for (var i = 0; i < N; i++) {
    var t0 = process.hrtime.bigint();
    var r = G.generateRound({ rng: rng });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (r.fallback) { fallback++; continue; }
    modes[r.mode]++;
    cats[r.target] = (cats[r.target] || 0) + 1;
    if (r.grid.length !== 16 || r.dealt.length !== 3) bad.size++;
    var ids = {};
    r.grid.concat(r.dealt).forEach(function (c) { ids[c.id] = 1; });
    if (Object.keys(ids).length !== 19) bad.dup++;

    // Independent brute-force check of the best hand.
    var best = P.findBestCombo(r.grid, r.dealt);
    var count = 0;
    for (var a = 0; a < 16; a++) for (var b = a + 1; b < 16; b++) {
      if (P.compareHands(P.evaluateFive([r.grid[a], r.grid[b]].concat(r.dealt)), best.hand) === 0) count++;
    }
    if (count !== 1) bad.unique++;
    if (best.hand.category !== r.target) bad.target++;
    if (G.placeOfPick(r.ranking, best.indices) !== 1) bad.rankMismatch++;
    if (r.ranking.tiers[1] && r.ranking.tiers[1].key.indexOf("kicker:") === 0) bad.kicker++;
    var rc = recount(r);
    altHist[rc.alts] = (altHist[rc.alts] || 0) + 1;
    if (rc.alts < 2 || rc.alts > 7) bad.alts++;
    if (rc.strong < 1) bad.strong++;
    if (rc.alts !== r.alts || rc.strong !== r.strongAlts) bad.reported++;
  }
  var ok = N - fallback;
  assert(fallback <= N * 0.005, "fallback is rare (" + fallback + "/" + N + ")");
  assert(bad.size === 0, "every round has 16 grid + 3 dealt cards");
  assert(bad.dup === 0, "no duplicate cards in a round");
  assert(bad.unique === 0, "exactly one pick makes the best hand (" + bad.unique + " bad)");
  assert(bad.kicker === 0, "no other pick makes the best hand with a weaker kicker (" + bad.kicker + " bad)");
  assert(bad.target === 0, "reported target matches the best hand");
  assert(bad.rankMismatch === 0, "the best pick is ranked 1st");
  assert(bad.alts === 0, "2 to 7 decent alternatives on every board (" + bad.alts + " bad)");
  assert(bad.strong === 0, "at least one alternative is two pair or better (" + bad.strong + " bad)");
  assert(bad.reported === 0, "generator's alt counts match an independent recount (" + bad.reported + " bad)");
  var natShare = modes.natural / ok;
  assert(natShare > 0.15 && natShare < 0.25, "about 20% natural rounds (" + (100 * natShare).toFixed(1) + "%)");
  assert(Object.keys(altHist).length >= 4, "alternative count varies board to board (" + JSON.stringify(altHist) + ")");
  assert(Object.keys(cats).length >= 6, "best-hand categories vary (" + JSON.stringify(cats) + ")");
  var p50 = pct(times, 0.5), p95 = pct(times, 0.95), p99 = pct(times, 0.99), mx = Math.max.apply(null, times);
  var mean = times.reduce(function (s, x) { return s + x; }, 0) / times.length;
  assert(mean < 25, "average generation under 25ms (" + mean.toFixed(1) + "ms)");
  assert(p95 < 80, "p95 generation under 80ms (" + p95.toFixed(1) + "ms)");
  assert(p99 < 200, "p99 generation under 200ms (" + p99.toFixed(1) + "ms)");
  console.log("  " + N + " rounds: mean " + mean.toFixed(1) + "ms, p50 " + p50.toFixed(1) + ", p95 " + p95.toFixed(1) + ", p99 " + p99.toFixed(1) + ", max " + mx.toFixed(1) + "ms");
  console.log("  modes " + JSON.stringify(modes) + ", targets " + JSON.stringify(cats) + ", alts " + JSON.stringify(altHist));
})();

// ── Planted rounds: the planted target stays the unique best ─────────
[2, 3, 4, 5, 6, 7, 8].forEach(function (cat) {
  var rng = seeded(cat * 101), ok = true;
  for (var i = 0; i < 25; i++) {
    var r = G.generateRound({ target: cat, rng: rng });
    if (r.fallback || r.mode !== "planted" || r.target !== cat || r.ranking.tiers[0].hand.category !== cat || r.ranking.tiers[0].picks.length !== 1) ok = false;
  }
  assert(ok, "planted " + P.HAND_NAMES[cat] + " target is always the unique best");
});

// ── Natural rounds can be forced and still pass the bar ──────────────
(function () {
  var rng = seeded(31337), ok = true;
  for (var i = 0; i < 100; i++) {
    var r = G.generateRound({ mode: "natural", rng: rng });
    var rc = recount(r);
    if (r.fallback || r.mode !== "natural" || r.ranking.tiers[0].picks.length !== 1 || rc.alts < 2 || rc.alts > 7 || rc.strong < 1) ok = false;
  }
  assert(ok, "natural rounds pass the same quality bar");
})();

// ── Builder works in small slices and matches the one-shot result ────
(function () {
  var b1 = G.createBuilder({ rng: seeded(99), target: 8 });
  var r1 = null, slices = 0;
  while (!r1 && slices < 100000) { r1 = b1.step(0); slices++; }
  var r2 = G.generateRound({ rng: seeded(99), target: 8 });
  assert(r1 && slices > 1, "builder can be stepped in slices (" + slices + " slices)");
  assert(r1 && r1.grid.map(function (c) { return c.id; }).join() === r2.grid.map(function (c) { return c.id; }).join(), "sliced build gives the same board as a one-shot build");
  var b3 = G.createBuilder({ rng: seeded(5), rules: { minAlts: 99, maxAlts: 99, minStrong: 0 }, maxAttempts: 50 });
  var r3 = b3.step(Infinity);
  assert(r3 && r3.fallback && r3.grid.length === 16, "impossible rules fall back instead of hanging");
})();

// ── Per-target cap switches target ───────────────────────────────────
(function () {
  var r = G.generateRound({ rng: seeded(11), mode: "planted", used: [2, 3, 4, 5, 6, 7], perTarget: 1, maxAttempts: 4000 });
  assert(!r.fallback && r.target >= 2, "with a tiny per-target cap the builder switches target and still succeeds (got " + r.target + ")");
})();

// ── No category repeats when `used` is passed ────────────────────────
(function () {
  var used = [], ok = true;
  for (var i = 0; i < 5; i++) {
    var r = G.generateRound({ used: used, mode: "planted" });
    if (!r.fallback && used.indexOf(r.target) !== -1) ok = false;
    used.push(r.target);
  }
  assert(ok, "5 planted rounds in a game use 5 different best-hand categories");
})();

// ── Ranking & scoring on a hand-built deal ───────────────────────────
(function () {
  var dealt = P.parseCards(["7h", "8h", "9h"]);
  var grid = P.parseCards([
    "Th", "Jh",   // straight flush J-high (best)
    "2h", "Kh",   // flush K-high
    "Tc", "6d",   // straight T-high
    "5s", "6s",   // straight 9-high
    "9c", "9d",   // three 9s
    "2c", "3d", "4s", "Qc", "Ks", "Ad"
  ]);
  var rk = G.rankAllPicks(grid, dealt);
  assert(rk.total === 120, "120 possible picks");
  assert(rk.tiers[0].hand.category === 8 && rk.tiers[0].picks.length === 1, "best is a unique straight flush");
  assert(G.placeOfPick(rk, [0, 1]) === 1, "Th+Jh ranks 1st");
  var flushPlace = G.placeOfPick(rk, [1, 3]); // Jh Kh → K-J flush
  assert(flushPlace === 2, "best flush ranks 2nd (got " + flushPlace + ")");
  var straightT = G.placeOfPick(rk, [4, 5]);
  var straight9 = G.placeOfPick(rk, [6, 7]);
  assert(straightT < straight9, "T-high straight outranks 9-high straight");
  assert(G.placeOfPick(rk, [8, 9]) > straight9, "trips rank below straights");
  // kicker-only differences share a place
  var a = G.placeOfPick(rk, [12, 14]); // 4s Ks → high-card/pair? both no pair: high card
  var b = G.placeOfPick(rk, [12, 15]);
  assert(a > 5 && b > 5, "junk picks rank outside the top 5");
  assert(G.pointsForPlace(1) === 100 && G.pointsForPlace(2) === 60 && G.pointsForPlace(3) === 40, "points: 100 / 60 / 40 for top 3");
  assert(G.pointsForPlace(4) === 25 && G.pointsForPlace(5) === 15 && G.pointsForPlace(9) === G.CONSOLATION, "points: 25 / 15, then consolation");
  assert(G.ordinal(1) === "1st" && G.ordinal(2) === "2nd" && G.ordinal(3) === "3rd" && G.ordinal(11) === "11th" && G.ordinal(22) === "22nd", "ordinals");
})();

(function () {
  // Kicker-only variants of the same hand share one place.
  var dealt = P.parseCards(["8h", "8d", "8c"]);
  var grid = P.parseCards(["Kc", "Ks", "Ah", "2d", "Qh", "3s", "4c", "5d", "6s", "7h", "9c", "Td", "Jc", "2s", "3h", "4h"]);
  var rk = G.rankAllPicks(grid, dealt);
  assert(rk.tiers[0].hand.category === 6, "pair of Kings completes the full house");
  var pAQ = G.placeOfPick(rk, [2, 4]); // A + Q kickers
  var p23 = G.placeOfPick(rk, [3, 5]); // 2 + 3 kickers
  assert(pAQ === p23, "Three 8s with different kickers share a place (" + pAQ + " vs " + p23 + ")");
})();

// ── Describe ─────────────────────────────────────────────────────────
assert(G.describe(P.evaluateFive(P.parseCards(["Kh", "Kd", "Ks", "7c", "7d"]))) === "Full House, Kings over 7s", "describe full house");
assert(G.describe(P.evaluateFive(P.parseCards(["Ah", "Jh", "9h", "4h", "2h"]))) === "Flush, A-J high", "describe flush");
assert(G.describe(P.evaluateFive(P.parseCards(["5h", "6d", "7s", "8c", "9d"]))) === "Straight, 9-high", "describe straight");

console.log("");
console.log("Passed: " + passed);
console.log("Failed: " + failed);
if (failed) { errors.forEach(function (e) { console.log(" - " + e); }); process.exit(1); }
else console.log("All round-generator tests passed.");
