/**
 * Node tests for the 16 Poker 5-card evaluator and best-combo search.
 * Run: node test-eval.js
 */
"use strict";

var P = require("./poker-eval.js");

var passed = 0;
var failed = 0;
var errors = [];

function ev(list) {
  return P.evaluateFive(P.parseCards(list));
}

function nameOf(list) {
  return ev(list).name;
}

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    errors.push(msg);
    console.error("FAIL:", msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")");
}

function assertGT(a, b, msg) {
  var cmp = P.compareHands(ev(a), ev(b));
  assert(cmp > 0, msg + " — compare=" + cmp + " (" + ev(a).name + " vs " + ev(b).name + ")");
}

function assertEQ(a, b, msg) {
  var cmp = P.compareHands(ev(a), ev(b));
  assert(cmp === 0, msg + " — compare=" + cmp);
}

// ── Category identification ──────────────────────────────────────────
assertEqual(nameOf(["As", "Ks", "Qs", "Js", "Ts"]), "Royal Flush", "royal flush spades");
assertEqual(nameOf(["Ah", "Kh", "Qh", "Jh", "Th"]), "Royal Flush", "royal flush hearts");
assertEqual(nameOf(["9h", "8h", "7h", "6h", "5h"]), "Straight Flush", "SF 9-high");
assertEqual(nameOf(["Ad", "2d", "3d", "4d", "5d"]), "Straight Flush", "steel wheel (A-5 SF)");
assertEqual(nameOf(["9s", "9h", "9d", "9c", "Ks"]), "Four of a Kind", "quads nines");
assertEqual(nameOf(["Kh", "Kd", "Kc", "2s", "2h"]), "Full House", "kings full of twos");
assertEqual(nameOf(["As", "Js", "8s", "4s", "2s"]), "Flush", "ace-high flush");
assertEqual(nameOf(["Ah", "Kd", "Qc", "Js", "Th"]), "Straight", "broadway straight (not flush)");
assertEqual(nameOf(["As", "2h", "3d", "4c", "5s"]), "Straight", "wheel straight");
assertEqual(nameOf(["6s", "5h", "4d", "3c", "2s"]), "Straight", "6-high straight");
assertEqual(nameOf(["7s", "7h", "7d", "Ac", "Qc"]), "Three of a Kind", "trip sevens");
assertEqual(nameOf(["As", "Ah", "Kd", "Kc", "2s"]), "Two Pair", "aces and kings");
assertEqual(nameOf(["As", "Ah", "Kd", "Qc", "2s"]), "Pair", "pair of aces");
assertEqual(nameOf(["As", "Kh", "Qd", "Jc", "9s"]), "High Card", "AKQJ9");

// ── Not a straight ───────────────────────────────────────────────────
assertEqual(nameOf(["As", "Kh", "Qd", "Jc", "9s"]), "High Card", "AKQJ9 is not a straight");
assertEqual(nameOf(["As", "Kh", "Qd", "Jc", "9s"]), "High Card", "gap at 10");
assertEqual(nameOf(["8s", "7h", "6d", "5c", "3s"]), "High Card", "8-7-6-5-3 is not a straight");
assertEqual(nameOf(["As", "Kh", "5d", "4c", "3s"]), "High Card", "A-K-5-4-3 is not a wheel");

// ── Category order ───────────────────────────────────────────────────
assertGT(["As", "Ks", "Qs", "Js", "Ts"], ["9h", "8h", "7h", "6h", "5h"], "royal > SF");
assertGT(["9h", "8h", "7h", "6h", "5h"], ["9s", "9h", "9d", "9c", "As"], "SF > quads");
assertGT(["9s", "9h", "9d", "9c", "2s"], ["Ah", "Ad", "Ac", "Ks", "Kh"], "quads > full house");
assertGT(["Kh", "Kd", "Kc", "2s", "2h"], ["As", "Js", "8s", "4s", "3s"], "full house > flush");
assertGT(["As", "Js", "8s", "4s", "2s"], ["Ah", "Kd", "Qc", "Js", "Th"], "flush > straight");
assertGT(["Ah", "Kd", "Qc", "Js", "Th"], ["7s", "7h", "7d", "Ac", "Kc"], "straight > trips");
assertGT(["7s", "7h", "7d", "Ac", "Kc"], ["As", "Ah", "Kd", "Kc", "2s"], "trips > two pair");
assertGT(["As", "Ah", "Kd", "Kc", "2s"], ["As", "Ad", "Kh", "Qc", "2h"], "two pair > pair");
assertGT(["As", "Ah", "2d", "3c", "4s"], ["Ks", "Qh", "Jd", "9c", "8s"], "pair > high card");

// ── Straight flush tie-breaks ────────────────────────────────────────
assertGT(["9h", "8h", "7h", "6h", "5h"], ["8d", "7d", "6d", "5d", "4d"], "higher SF wins");
assertGT(["6c", "5c", "4c", "3c", "2c"], ["Ad", "2d", "3d", "4d", "5d"], "6-high SF beats wheel SF");
assertEQ(["9h", "8h", "7h", "6h", "5h"], ["9s", "8s", "7s", "6s", "5s"], "same SF rank is a tie (suit irrelevant)");

// ── Quads tie-breaks ─────────────────────────────────────────────────
assertGT(["9s", "9h", "9d", "9c", "2s"], ["8s", "8h", "8d", "8c", "As"], "quad nines beat quad eights (kicker ignored)");
assertGT(["9s", "9h", "9d", "9c", "As"], ["9s", "9h", "9d", "9c", "Ks"], "same quads, higher kicker wins");

// ── Full house tie-breaks ────────────────────────────────────────────
assertGT(["Kh", "Kd", "Kc", "2s", "2h"], ["Qh", "Qd", "Qc", "As", "Ah"], "trips rank beats pair rank in FH");
assertGT(["Kh", "Kd", "Kc", "3s", "3h"], ["Kh", "Kd", "Kc", "2s", "2h"], "same trips, higher pair wins FH");

// ── Flush tie-breaks ─────────────────────────────────────────────────
assertGT(["As", "Js", "8s", "4s", "2s"], ["Ks", "Qs", "Js", "Ts", "8s"], "ace-high flush beats king-high flush");
assertGT(["As", "Js", "8s", "4s", "3s"], ["As", "Js", "8s", "4s", "2s"], "flush kicker: 3 beats 2");
assertEQ(["Ah", "Jh", "8h", "4h", "2h"], ["Ad", "Jd", "8d", "4d", "2d"], "identical flush ranks tie");

// ── Straight tie-breaks (including wheel) ────────────────────────────
assertGT(["Ah", "Kd", "Qc", "Js", "Th"], ["Ks", "Qh", "Jd", "Tc", "9s"], "broadway beats K-high straight");
assertGT(["6s", "5h", "4d", "3c", "2s"], ["As", "2h", "3d", "4c", "5s"], "6-high straight beats the wheel");
assertEQ(["As", "2h", "3d", "4c", "5s"], ["Ah", "2c", "3s", "4d", "5h"], "two wheels tie");
assertEQ(["9s", "8h", "7d", "6c", "5s"], ["9h", "8c", "7s", "6d", "5h"], "same straight high ties");

// ── Trips tie-breaks ─────────────────────────────────────────────────
assertGT(["8s", "8h", "8d", "2c", "3s"], ["7s", "7h", "7d", "Ac", "Ks"], "higher trips win regardless of kickers");
assertGT(["7s", "7h", "7d", "Ac", "Ks"], ["7c", "7s", "7h", "Ad", "Qs"], "same trips, first kicker K > Q");
assertGT(["7s", "7h", "7d", "Ac", "5s"], ["7c", "7s", "7h", "Ad", "4s"], "same trips + first kicker, second kicker 5 > 4");

// ── Two pair tie-breaks ──────────────────────────────────────────────
assertGT(["As", "Ah", "Kd", "Kc", "2s"], ["As", "Ah", "Qd", "Qc", "Ks"], "higher second pair: K > Q");
assertGT(["As", "Ah", "3d", "3c", "2s"], ["Ks", "Kh", "Qd", "Qc", "As"], "aces up beat kings up");
assertGT(["As", "Ah", "Kd", "Kc", "3s"], ["Ah", "Ad", "Kh", "Ks", "2c"], "same two pair, kicker 3 > 2");

// ── Pair tie-breaks ──────────────────────────────────────────────────
assertGT(["As", "Ah", "3d", "4c", "5s"], ["Ks", "Kh", "Ad", "Qc", "Js"], "pair of aces beats pair of kings");
assertGT(["As", "Ah", "Kd", "Qc", "Js"], ["Ah", "Ad", "Ks", "Qh", "Ts"], "same pair, kicker J > T");
assertGT(["As", "Ah", "Kd", "Qc", "5s"], ["Ah", "Ad", "Ks", "Qh", "4c"], "same pair + two kickers, last kicker 5 > 4");

// ── High card tie-breaks ─────────────────────────────────────────────
assertGT(["As", "Kh", "Qd", "Jc", "9s"], ["As", "Kh", "Qd", "Jc", "8s"], "high card last kicker 9 > 8");
assertGT(["As", "Kh", "Qd", "Jc", "9s"], ["As", "Kh", "Qd", "Tc", "9s"], "high card 4th card J > T");
assertEQ(["As", "Kh", "Qd", "Jc", "9s"], ["Ah", "Kc", "Qs", "Jh", "9d"], "identical high-card ranks tie");

// ── findBestCombo ────────────────────────────────────────────────────
// Grid has a pair of aces plus junk; dealt is K Q J offsuit.
// Best is the two aces (pair of aces, KQJ kickers) — actually wait, two aces + KQJ is just a pair.
// Better: put a 10 and 9 of mixed suits... that's still a pair.
// Put T and 9 in the grid with dealt AKQ? That's a straight if we pick T,9... dealt would need to be related.
// Let's be explicit.

// Case 1: dealt 3 hearts  A♥  J♥  8♥. Grid has 4♥ 2♥ (flush) and also K♥ Q♥ would be better flush,
// and also two kings for a pair. Best should be the two highest remaining hearts, or a SF if available.
(function () {
  var dealt = P.parseCards(["Ah", "Jh", "8h"]);
  var grid = P.parseCards([
    "4h", "2h", "Kh", "Qh",
    "Ks", "Kd", "2c", "3c",
    "5s", "6s", "7s", "9c",
    "Tc", "9d", "3d", "2s"
  ]);
  var best = P.findBestCombo(grid, dealt);
  // Best is Kh + Qh + Ah Jh 8h = ace-high flush A-K-Q-J-8
  assertEqual(best.hand.name, "Flush", "best combo should be a flush");
  var labels = best.pair.map(P.cardLabel).sort().join(" ");
  assert(labels.indexOf("K♥") !== -1 && labels.indexOf("Q♥") !== -1, "best pair should be K♥ and Q♥, got " + labels);
})();

// Case 2: two equally good pairs of aces — either ace pair + board is the same hand rank.
(function () {
  var dealt = P.parseCards(["Kd", "Qc", "Js"]);
  var grid = P.parseCards([
    "As", "Ah", "Ad", "2c",
    "3c", "4c", "5d", "6d",
    "7d", "8s", "9s", "2s",
    "3s", "4s", "2h", "3h"
  ]);
  var best = P.findBestCombo(grid, dealt);
  assertEqual(best.hand.name, "Pair", "best is pair of aces");
  assertEqual(best.hand.tie[1], 14, "pair rank is aces");
  // Any two of As/Ah/Ad make an equal hand
  var player = P.evaluatePlayer(grid, dealt, [0, 2]); // As + Ad
  assert(P.handsEqual(player.hand, best.hand), "a different ace pair should tie the best hand");
})();

// Case 3: hidden royal — grid has Ks Qs, dealt As Js Ts
(function () {
  var dealt = P.parseCards(["As", "Js", "Ts"]);
  var grid = P.parseCards([
    "Ks", "Qs", "2h", "3h",
    "4h", "5h", "6d", "7d",
    "8d", "9c", "2c", "3c",
    "4c", "5c", "6c", "7c"
  ]);
  var best = P.findBestCombo(grid, dealt);
  assertEqual(best.hand.name, "Royal Flush", "best combo should be royal flush");
  var labels = best.pair.map(P.cardLabel).sort().join(" ");
  assert(labels.indexOf("K♠") !== -1 && labels.indexOf("Q♠") !== -1, "best pair should be K♠ Q♠, got " + labels);
})();

// Case 4: wheel is found, but a higher straight is better
(function () {
  var dealt = P.parseCards(["As", "2h", "3d"]);
  // 4c 5s makes a wheel; 4d + 5d also wheel; 5c + 6s is not a straight with A23
  // Wait A-2-3-4-5 is a wheel. There's no higher straight available from A-2-3 unless we have...
  // A23 + 4 + 5 is the only straight. Good enough — just confirm wheel is found.
  var grid = P.parseCards([
    "4c", "5s", "Kh", "Kd",
    "Kc", "Qh", "Qd", "Qc",
    "Jh", "Jd", "9c", "8c",
    "7c", "6h", "9d", "8d"
  ]);
  var best = P.findBestCombo(grid, dealt);
  assertEqual(best.hand.name, "Straight", "A-2-3-4-5 should be found as a straight");
  assertEqual(best.hand.tie[1], 5, "wheel high card is 5, not ace");
})();

// Case 5: full house on board-ish — dealt 9 9 9, grid has KK and AA; AA should be better FH
(function () {
  var dealt = P.parseCards(["9s", "9h", "9d"]);
  var grid = P.parseCards([
    "As", "Ah", "Ks", "Kh",
    "2c", "3c", "4c", "5c",
    "6c", "7d", "8d", "Td",
    "Jd", "Qd", "2s", "3s"
  ]);
  var best = P.findBestCombo(grid, dealt);
  assertEqual(best.hand.name, "Full House", "nines full should be a full house");
  assertEqual(best.hand.tie[1], 9, "trips are nines");
  assertEqual(best.hand.tie[2], 14, "pair should be aces, not kings");
})();

// Case 6: evaluatePlayer vs best — suboptimal pick does not equal best
(function () {
  var dealt = P.parseCards(["Ah", "Jh", "8h"]);
  var grid = P.parseCards([
    "4h", "2h", "Kh", "Qh",
    "Ks", "Kd", "2c", "3c",
    "5s", "6s", "7s", "9c",
    "Tc", "9d", "3d", "2s"
  ]);
  var best = P.findBestCombo(grid, dealt);
  var weak = P.evaluatePlayer(grid, dealt, [4, 5]); // Ks Kd → two pair or pair? Ks Kd + Ah Jh 8h = pair of kings
  assertEqual(weak.hand.name, "Pair", "kings offsuit with heart board is a pair");
  assert(P.compareHands(best.hand, weak.hand) > 0, "flush should beat the pair of kings");
  assert(!P.handsEqual(weak.hand, best.hand), "suboptimal pick should not get the perfect bonus");
})();

// ── Deck integrity ───────────────────────────────────────────────────
(function () {
  var deck = P.buildDeck();
  assertEqual(deck.length, 52, "standard deck has 52 cards");
  var ids = {};
  var dup = false;
  for (var i = 0; i < deck.length; i++) {
    if (ids[deck[i].id]) dup = true;
    ids[deck[i].id] = true;
  }
  assert(!dup, "deck has no duplicate cards");
  var shuffled = P.shuffle(deck);
  assertEqual(shuffled.length, 52, "shuffled deck still has 52");
  assert(deck[0].id === "2s", "shuffle should not mutate the original deck");
})();

// ── Parse helpers ────────────────────────────────────────────────────
assertEqual(P.parseCard("10h").rank, 10, "parse 10h rank");
assertEqual(P.parseCard("Td").rank, 10, "parse Td rank");
assertEqual(P.parseCard("AS").suit, "s", "parse AS suit");
assertEqual(P.cardLabel(P.parseCard("Qd")), "Q♦", "label Qd");

console.log("");
console.log("Passed: " + passed);
console.log("Failed: " + failed);
if (failed) {
  console.log("\nFailures:");
  errors.forEach(function (e) { console.log(" - " + e); });
  process.exit(1);
} else {
  console.log("All evaluator tests passed.");
}
