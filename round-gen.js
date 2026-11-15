/**
 * 16 Poker — curated round generator and ranking.
 * Builds deals with one clear best 2-card pick plus several near-miss decoys.
 * Works in Node (module.exports) and the browser (global RoundGen).
 * Depends on PokerEval (poker-eval.js).
 */
(function (root) {
  "use strict";

  var P = root.PokerEval || (typeof require === "function" ? require("./poker-eval.js") : null);
  var SUITS = ["s", "h", "d", "c"];

  // Target best-hand categories and weights per difficulty.
  // 2 Two Pair, 3 Trips, 4 Straight, 5 Flush, 6 Full House, 7 Quads, 8 Straight Flush
  var TARGET_WEIGHTS = {
    easy:   { 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 0.4 },
    medium: { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 7: 1.5, 8: 0.7 },
    hard:   { 2: 1.5, 3: 2, 4: 3, 5: 3, 6: 3, 7: 1.5, 8: 1 }
  };

  // How decoys are chosen per difficulty.
  //  window: decoy hands must be within this many categories below the best
  //  plant: how many decoy pairs to plant in the grid
  //  minDecoys: minimum distinct decoy hand values required in the window
  //  closeness: 0 = random spread inside the window, 1 = strongly prefer the closest hands
  var DIFF_RULES = {
    easy:   { window: 3, plant: 3, minDecoys: 3, closeness: 0.2 },
    medium: { window: 2, plant: 4, minDecoys: 3, closeness: 0.5 },
    hard:   { window: 2, plant: 5, minDecoys: 4, closeness: 0.9 }
  };

  // Per-target decoy floors where "best minus window" is impossible
  // (e.g. a quads hand always has a paired dealer board, so no flush decoys).
  var FLOORS = {
    easy:   { 2: 2, 7: 2, 8: 4 },
    medium: { 2: 2, 6: 3, 7: 3, 8: 4 },
    hard:   { 2: 2, 6: 3, 7: 2, 8: 5 }
  };
  function decoyFloor(difficulty, target) {
    var f = FLOORS[difficulty] && FLOORS[difficulty][target];
    return f || Math.max(1, target - DIFF_RULES[difficulty].window);
  }

  // Points by finishing position (1st = best hand). Beyond the list: CONSOLATION.
  var RANK_POINTS = [100, 60, 40, 25, 15];
  var CONSOLATION = 5;

  function rnd(n, rng) { return Math.floor((rng || Math.random)() * n); }
  function pick(arr, rng) { return arr[rnd(arr.length, rng)]; }
  function shuffle(a, rng) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = rnd(i + 1, rng);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function card(r, s) { return P.makeCard(r, s); }
  function distinctRanks(n, exclude, rng) {
    var pool = [];
    for (var r = 2; r <= 14; r++) if (!exclude || exclude.indexOf(r) === -1) pool.push(r);
    return shuffle(pool, rng).slice(0, n);
  }
  function randomSuits(n, rng) {
    return shuffle(SUITS, rng).slice(0, n);
  }

  /** Build 5 random cards forming the given category. */
  function makeHand(category, rng) {
    var r, s, i, cards;
    for (var guard = 0; guard < 50; guard++) {
      cards = [];
      if (category === 2) {
        r = distinctRanks(3, null, rng);
        randomSuits(2, rng).forEach(function (x) { cards.push(card(r[0], x)); });
        randomSuits(2, rng).forEach(function (x) { cards.push(card(r[1], x)); });
        cards.push(card(r[2], pick(SUITS, rng)));
      } else if (category === 3) {
        r = distinctRanks(3, null, rng);
        randomSuits(3, rng).forEach(function (x) { cards.push(card(r[0], x)); });
        cards.push(card(r[1], pick(SUITS, rng)));
        cards.push(card(r[2], pick(SUITS, rng)));
      } else if (category === 4 || category === 8) {
        var high = category === 8 ? 5 + rnd(9, rng) : 5 + rnd(10, rng); // SF: 5..13 (no royal)
        s = pick(SUITS, rng);
        for (i = 0; i < 5; i++) {
          var rank = high - i;
          if (rank === 1) rank = 14;
          cards.push(card(rank, category === 8 ? s : pick(SUITS, rng)));
        }
      } else if (category === 5) {
        s = pick(SUITS, rng);
        distinctRanks(5, null, rng).forEach(function (x) { cards.push(card(x, s)); });
      } else if (category === 6) {
        r = distinctRanks(2, null, rng);
        randomSuits(3, rng).forEach(function (x) { cards.push(card(r[0], x)); });
        randomSuits(2, rng).forEach(function (x) { cards.push(card(r[1], x)); });
      } else if (category === 7) {
        r = distinctRanks(2, null, rng);
        SUITS.forEach(function (x) { cards.push(card(r[0], x)); });
        cards.push(card(r[1], pick(SUITS, rng)));
      } else {
        throw new Error("Unsupported target category " + category);
      }
      if (P.evaluateFive(cards).category === category) return cards;
    }
    return null;
  }

  function tieKey(hand) { return hand.tie.join(","); }

  // How many leading tie-break values define a "different hand" for ranking.
  // Kicker-only differences (e.g. Three 8s with an A vs a Q kicker) count as the same hand.
  var COARSE_LEN = { 0: 2, 1: 2, 2: 3, 3: 2, 4: 2, 5: 3, 6: 3, 7: 2, 8: 2, 9: 2 };
  function coarseKey(hand) { return hand.tie.slice(0, COARSE_LEN[hand.category]).join(","); }

  /**
   * Rank every 2-card pick from the grid.
   * Place 1 is the exact best hand. Every other place is a distinct hand
   * (kicker-only differences are grouped together), strongest first.
   * Returns { tiers: [{ hand, key, picks: [[i,j],...] }...], total }.
   * Each tier's `hand` is the strongest version within that group.
   */
  function rankAllPicks(grid, dealt) {
    var all = [];
    for (var i = 0; i < grid.length; i++) {
      for (var j = i + 1; j < grid.length; j++) {
        all.push({ pick: [i, j], hand: P.evaluateFive([grid[i], grid[j], dealt[0], dealt[1], dealt[2]]) });
      }
    }
    all.sort(function (a, b) { return P.compareHands(b.hand, a.hand); });
    var tiers = [];
    var map = {};
    var best = all[0].hand;
    all.forEach(function (e) {
      var k = P.compareHands(e.hand, best) === 0 ? "best" : coarseKey(e.hand);
      if (k !== "best" && k === coarseKey(best)) k = "kicker:" + k; // same hand as best, weaker kicker
      if (!map[k]) {
        map[k] = { hand: e.hand, key: k, picks: [] };
        tiers.push(map[k]);
      }
      map[k].picks.push(e.pick);
    });
    return { tiers: tiers, total: all.length };
  }

  /** 1-based place of a pick (indices into grid) in the ranking. */
  function placeOfPick(ranking, pick) {
    var a = Math.min(pick[0], pick[1]);
    var b = Math.max(pick[0], pick[1]);
    for (var t = 0; t < ranking.tiers.length; t++) {
      var ps = ranking.tiers[t].picks;
      for (var q = 0; q < ps.length; q++) {
        if (ps[q][0] === a && ps[q][1] === b) return t + 1;
      }
    }
    return ranking.tiers.length + 1;
  }

  function pointsForPlace(place) {
    return place >= 1 && place <= RANK_POINTS.length ? RANK_POINTS[place - 1] : CONSOLATION;
  }

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  var PLURAL = { 2: "2s", 3: "3s", 4: "4s", 5: "5s", 6: "6s", 7: "7s", 8: "8s", 9: "9s", 10: "10s", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces" };
  /** Human description, e.g. "Flush, A-high", "Full House, Kings over 7s". */
  function describe(hand) {
    var t = hand.tie;
    var R = P.RANK_CHARS;
    switch (hand.category) {
      case 0: return "High Card " + R[t[1]];
      case 1: return "Pair of " + PLURAL[t[1]];
      case 2: return "Two Pair, " + PLURAL[t[1]] + " & " + PLURAL[t[2]];
      case 3: return "Three " + PLURAL[t[1]];
      case 4: return "Straight, " + R[t[1]] + "-high";
      case 5: return "Flush, " + R[t[1]] + "-" + R[t[2]] + " high";
      case 6: return "Full House, " + PLURAL[t[1]] + " over " + PLURAL[t[2]];
      case 7: return "Four " + PLURAL[t[1]];
      case 8: return "Straight Flush, " + R[t[1]] + "-high";
      default: return "Royal Flush";
    }
  }

  function chooseTarget(difficulty, used, rng) {
    var w = TARGET_WEIGHTS[difficulty] || TARGET_WEIGHTS.medium;
    var cats = Object.keys(w).map(Number).filter(function (c) { return !used || used.indexOf(c) === -1; });
    if (!cats.length) cats = Object.keys(w).map(Number);
    var total = cats.reduce(function (s, c) { return s + w[c]; }, 0);
    var x = (rng || Math.random)() * total;
    for (var i = 0; i < cats.length; i++) {
      x -= w[cats[i]];
      if (x <= 0) return cats[i];
    }
    return cats[cats.length - 1];
  }

  /** Validate a deal; returns stats or null if it fails the quality bar. */
  function assess(grid, dealt, target, rules, minCat) {
    var ranking = rankAllPicks(grid, dealt);
    var top = ranking.tiers[0];
    if (top.hand.category !== target) return null;
    if (top.picks.length !== 1) return null; // unique best pick
    // Both best cards must matter: no other pick may make the same hand with a weaker kicker
    // (e.g. dealer K-K-K + any card = quads would make the round trivial).
    if (ranking.tiers[1] && ranking.tiers[1].key.indexOf("kicker:") === 0) return null;
    var decoys = 0;
    var decoyCats = {};
    for (var t = 1; t < ranking.tiers.length; t++) {
      var c = ranking.tiers[t].hand.category;
      if (c < minCat) break;
      decoys++;
      decoyCats[c] = true;
    }
    if (decoys < rules.minDecoys) return null;
    return { ranking: ranking, decoys: decoys, decoyCategories: Object.keys(decoyCats).length };
  }

  function idSet(cards) {
    var o = {};
    cards.forEach(function (c) { o[c.id] = true; });
    return o;
  }

  /** One attempt at building a curated deal for a target category. */
  function attempt(target, rules, minCat, rng) {
    var five = makeHand(target, rng);
    if (!five) return null;
    five = shuffle(five, rng);
    var dealt = five.slice(0, 3);
    var bestPair = five.slice(3);
    var used = idSet(five);
    var rest = P.buildDeck().filter(function (c) { return !used[c.id]; });
    var bestHand = P.evaluateFive(five);

    // Candidate decoy pairs from the rest of the deck: weaker than best, inside the window.
    // Pre-filter cards that could matter (share a rank/suit with the board or sit near it)
    // so the scan stays small and fast on a phone.
    var cands = [];
    var rs = shuffle(rest, rng);
    for (var i = 0; i < rs.length && cands.length < 400; i++) {
      for (var j = i + 1; j < rs.length; j++) {
        var h = P.evaluateFive([rs[i], rs[j], dealt[0], dealt[1], dealt[2]]);
        if (h.category >= minCat && P.compareHands(h, bestHand) < 0) {
          cands.push({ a: rs[i], b: rs[j], hand: h });
        }
      }
    }
    if ((rng || Math.random)() < rules.closeness) {
      // Prefer the closest hands (by category, then by full value).
      cands.sort(function (x, y) { return P.compareHands(y.hand, x.hand); });
      // keep some variety: shuffle within the top slice
      var slice = Math.min(cands.length, 6 + rules.plant * 3);
      cands = shuffle(cands.slice(0, slice), rng).concat(cands.slice(slice));
    }

    // A card is safe if pairing it with any card already in the grid (or its own
    // decoy partner) can't tie or beat the planted best hand.
    function safe(c, cur, partners) {
      var others = partners ? cur.concat(partners) : cur;
      for (var q = 0; q < others.length; q++) {
        var hh = P.evaluateFive([c, others[q], dealt[0], dealt[1], dealt[2]]);
        if (P.compareHands(hh, bestHand) >= 0) return false;
      }
      return true;
    }

    var grid = bestPair.slice();
    var taken = idSet(grid);
    var seenVal = {};
    var seenCat = {};
    var planted = 0;
    // Two passes: first favour new categories (variety), then fill remaining slots.
    for (var pass = 0; pass < 2 && planted < rules.plant; pass++) {
      for (var k = 0; k < cands.length && planted < rules.plant; k++) {
        var d = cands[k];
        if (taken[d.a.id] || taken[d.b.id]) continue;
        var key = coarseKey(d.hand);
        if (seenVal[key] || key === coarseKey(bestHand)) continue;
        if (pass === 0 && seenCat[d.hand.category]) continue;
        if (!safe(d.a, grid, [d.b]) || !safe(d.b, grid, [d.a])) continue;
        grid.push(d.a, d.b);
        taken[d.a.id] = taken[d.b.id] = true;
        seenVal[key] = true;
        seenCat[d.hand.category] = true;
        planted++;
      }
    }

    var filler = shuffle(rest.filter(function (c) { return !taken[c.id]; }), rng);
    for (var f = 0; f < filler.length && grid.length < 16; f++) {
      if (safe(filler[f], grid, null)) grid.push(filler[f]);
    }
    if (grid.length < 16) return null;
    grid = shuffle(grid, rng);

    var stats = assess(grid, dealt, target, rules, minCat);
    if (!stats) return null;
    return { grid: grid, dealt: dealt, target: target, ranking: stats.ranking, decoys: stats.decoys, decoyCategories: stats.decoyCategories };
  }

  /**
   * Generate a curated round.
   * opts: { difficulty: "easy"|"medium"|"hard", target?: category, used?: [categories already used], rng?, maxAttempts?, timeBudgetMs? }
   */
  function generateRound(opts) {
    opts = opts || {};
    var difficulty = DIFF_RULES[opts.difficulty] ? opts.difficulty : "medium";
    var rules = DIFF_RULES[difficulty];
    var rng = opts.rng || Math.random;
    var maxAttempts = opts.maxAttempts || 40;
    var budget = opts.timeBudgetMs || 80;
    var now = (typeof performance !== "undefined" && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };
    var t0 = now();
    var target = opts.target || chooseTarget(difficulty, opts.used, rng);
    var attempts = 0;
    while (attempts < maxAttempts && now() - t0 < budget) {
      attempts++;
      // After many failures, try a different target.
      if (!opts.target && attempts % 12 === 0) target = chooseTarget(difficulty, opts.used, rng);
      var r = attempt(target, rules, decoyFloor(difficulty, target), rng);
      if (r) {
        r.attempts = attempts;
        r.fallback = false;
        r.difficulty = difficulty;
        return r;
      }
    }
    // Fallback 1: a flush round with relaxed rules (almost always succeeds first try).
    for (var f = 0; f < 5; f++) {
      var relaxed = { window: 3, plant: rules.plant, minDecoys: 2, closeness: rules.closeness };
      var fr = attempt(5, relaxed, 2, rng);
      if (fr) {
        fr.attempts = attempts + f + 1;
        fr.fallback = "relaxed";
        fr.difficulty = difficulty;
        return fr;
      }
    }
    // Fallback 2: plain random deal (still playable and ranked).
    var deck = shuffle(P.buildDeck(), rng);
    var grid = deck.slice(0, 16);
    var dealt = deck.slice(16, 19);
    var ranking = rankAllPicks(grid, dealt);
    return { grid: grid, dealt: dealt, target: ranking.tiers[0].hand.category, ranking: ranking, decoys: 0, attempts: attempts, fallback: true, difficulty: difficulty };
  }

  var RoundGen = {
    TARGET_WEIGHTS: TARGET_WEIGHTS,
    DIFF_RULES: DIFF_RULES,
    decoyFloor: decoyFloor,
    RANK_POINTS: RANK_POINTS,
    CONSOLATION: CONSOLATION,
    makeHand: makeHand,
    rankAllPicks: rankAllPicks,
    placeOfPick: placeOfPick,
    coarseKey: coarseKey,
    pointsForPlace: pointsForPlace,
    ordinal: ordinal,
    describe: describe,
    chooseTarget: chooseTarget,
    generateRound: generateRound
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = RoundGen;
  }
  root.RoundGen = RoundGen;
})(typeof globalThis !== "undefined" ? globalThis : this);
