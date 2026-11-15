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

// ── Generated rounds: structure, unique best, decoys ────────────────
var N = 400;
["easy", "medium", "hard"].forEach(function (diff) {
  var rng = seeded(diff.length * 7919);
  var rules = G.DIFF_RULES[diff];
  var bad = { size: 0, dup: 0, unique: 0, decoys: 0, fallback: 0, target: 0, rankMismatch: 0, kicker: 0 };
  var cats = {};
  var maxMs = 0, totalMs = 0;
  for (var i = 0; i < N; i++) {
    var t0 = process.hrtime.bigint();
    var r = G.generateRound({ difficulty: diff, rng: rng });
    var ms = Number(process.hrtime.bigint() - t0) / 1e6;
    maxMs = Math.max(maxMs, ms); totalMs += ms;
    if (r.fallback) bad.fallback++;
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
    if (!r.fallback && best.hand.category !== r.target) bad.target++;
    if (G.placeOfPick(r.ranking, best.indices) !== 1) bad.rankMismatch++;
    if (!r.fallback && r.ranking.tiers[1] && r.ranking.tiers[1].key.indexOf("kicker:") === 0) bad.kicker++;

    if (!r.fallback) {
      var floor = G.decoyFloor(diff, r.target);
      var decoys = r.ranking.tiers.slice(1).filter(function (t) { return t.hand.category >= floor; });
      if (decoys.length < rules.minDecoys) bad.decoys++;
    }
  }
  assert(bad.size === 0, diff + ": every round has 16 grid + 3 dealt cards");
  assert(bad.dup === 0, diff + ": no duplicate cards in a round");
  assert(bad.unique === 0, diff + ": exactly one pick makes the best hand (" + bad.unique + " bad)");
  assert(bad.target === 0, diff + ": best hand matches the planned category");
  assert(bad.rankMismatch === 0, diff + ": the best pick is ranked 1st");
  assert(bad.kicker === 0, diff + ": both best cards matter (no other pick makes the same hand with a weaker kicker)");
  assert(bad.decoys === 0, diff + ": at least " + rules.minDecoys + " distinct decoy hands near the best (" + bad.decoys + " bad)");
  assert(bad.fallback <= N * 0.01, diff + ": random fallback is rare (" + bad.fallback + "/" + N + ")");
  assert(Object.keys(cats).length >= 5, diff + ": best-hand categories vary (" + JSON.stringify(cats) + ")");
  assert(!cats[9], diff + ": never targets a royal flush");
  assert(totalMs / N < 20, diff + ": average generation under 20ms (" + (totalMs / N).toFixed(1) + "ms)");
  assert(maxMs < 150, diff + ": worst-case generation bounded (" + maxMs.toFixed(1) + "ms)");
  console.log("  " + diff + ": avg " + (totalMs / N).toFixed(1) + "ms, max " + maxMs.toFixed(1) + "ms, targets " + JSON.stringify(cats));
});

// ── Hard puts decoys closer than easy ───────────────────────────────
(function () {
  function avgGap(diff) {
    var rng = seeded(424242), sum = 0, n = 0;
    for (var i = 0; i < 200; i++) {
      var r = G.generateRound({ difficulty: diff, rng: rng });
      if (r.fallback) continue;
      var t = r.ranking.tiers;
      // category gap between best and the 3rd-best distinct hand
      sum += t[0].hand.category - t[Math.min(2, t.length - 1)].hand.category; n++;
    }
    return sum / n;
  }
  var e = avgGap("easy"), h = avgGap("hard");
  assert(h <= e + 0.05, "hard decoys are at least as close as easy (hard " + h.toFixed(2) + " vs easy " + e.toFixed(2) + ")");
})();

// ── No back-to-back category repeats when `used` is passed ───────────
(function () {
  var used = [], ok = true;
  for (var i = 0; i < 5; i++) {
    var r = G.generateRound({ difficulty: "medium", used: used });
    if (!r.fallback && used.indexOf(r.target) !== -1) ok = false;
    used.push(r.target);
  }
  assert(ok, "5 rounds in a game use 5 different best-hand categories");
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
