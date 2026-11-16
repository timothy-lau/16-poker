/**
 * 16 Poker — curated round generator and ranking.
 * About 80% of rounds plant only the winning hand (3 dealer cards + 2 grid cards)
 * and deal the other 14 grid cards at random; about 20% are fully random deals.
 * A board is kept only if it has one clear best pick and 2-7 decent alternatives,
 * at least one of them two pair or better.
 * Works in Node (module.exports) and the browser (global RoundGen).
 * Depends on PokerEval (poker-eval.js).
 */
(function (root) {
  "use strict";

  var P = root.PokerEval || (typeof require === "function" ? require("./poker-eval.js") : null);
  var SUITS = ["s", "h", "d", "c"];

  // Target best-hand categories and weights for planted rounds.
  // 2 Two Pair, 3 Trips, 4 Straight, 5 Flush, 6 Full House, 7 Quads, 8 Straight Flush
  var WEIGHTS = { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 7: 1.5, 8: 0.7 };

  // Board quality bar (applies to every round).
  //  minAlts / maxAlts: distinct decent alternatives (pair or better, beating the dealer cards alone)
  //  minStrong: alternatives that are two pair or better
  var RULES = { minAlts: 2, maxAlts: 7, minStrong: 1 };
  var NATURAL_SHARE = 0.2;   // share of fully random ("natural") rounds
  var PER_TARGET = 400;      // attempts per planted target before switching target
  var MAX_ATTEMPTS = 4000;   // total attempts before the fallback chain

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

  function chooseTarget(used, rng, exclude) {
    var all = Object.keys(WEIGHTS).map(Number);
    var cats = all.filter(function (c) {
      return (!used || used.indexOf(c) === -1) && (!exclude || exclude.indexOf(c) === -1);
    });
    if (!cats.length) cats = all.filter(function (c) { return !used || used.indexOf(c) === -1; });
    if (!cats.length) cats = all;
    var total = cats.reduce(function (s, c) { return s + WEIGHTS[c]; }, 0);
    var x = (rng || Math.random)() * total;
    for (var i = 0; i < cats.length; i++) {
      x -= WEIGHTS[cats[i]];
      if (x <= 0) return cats[i];
    }
    return cats[cats.length - 1];
  }

  /** Category made by the 3 dealer cards alone: 0 nothing, 1 pair, 3 trips. */
  function dealerCategory(d) {
    var a = d[0].rank, b = d[1].rank, c = d[2].rank;
    if (a === b && b === c) return 3;
    if (a === b || b === c || a === c) return 1;
    return 0;
  }

  /**
   * Fast board check without building the full ranking.
   * Returns null if the board fails, else { bestIdx, best, alts, strong, altCategories }.
   * A decent alternative is a distinct hand (kicker-only variants grouped, as in the
   * ranking) other than the best, pair or better, that beats the dealer cards alone.
   * plantedIds (optional): the planted pair must be the unique best.
   */
  function quickCheck(grid, dealt, rules, plantedIds) {
    var n = grid.length, hands = [], best = null, bi = -1, bj = -1, ties = 0;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var h = P.evaluateFive([grid[i], grid[j], dealt[0], dealt[1], dealt[2]]);
        hands.push(h);
        var c = best ? P.compareHands(h, best) : 1;
        if (c > 0) { best = h; bi = i; bj = j; ties = 0; } else if (c === 0) ties++;
      }
    }
    if (ties) return null; // more than one pick makes the exact best hand
    if (plantedIds) {
      var pa = grid[bi].id, pb = grid[bj].id;
      if (!((pa === plantedIds[0] && pb === plantedIds[1]) || (pa === plantedIds[1] && pb === plantedIds[0]))) return null;
    }
    var bestKey = coarseKey(best);
    var dc = dealerCategory(dealt);
    var keys = {}, alts = 0, strong = 0, cats = {};
    for (var k = 0; k < hands.length; k++) {
      var hh = hands[k];
      if (hh === best) continue;
      var key = coarseKey(hh);
      if (key === bestKey) return null; // same hand as the best with a weaker kicker
      if (hh.category < 1 || hh.category <= dc || keys[key]) continue;
      keys[key] = true;
      alts++;
      if (alts > rules.maxAlts) return null;
      if (hh.category >= 2) strong++;
      cats[hh.category] = true;
    }
    if (alts < rules.minAlts || strong < rules.minStrong) return null;
    return { bestIdx: [bi, bj], best: best, alts: alts, strong: strong, altCategories: Object.keys(cats).length };
  }

  /** Planted round: 3 dealer cards + 2 grid cards form the target; the other 14 grid cards are random. */
  function attemptPlanted(target, rules, rng) {
    var five = makeHand(target, rng);
    if (!five) return null;
    five = shuffle(five, rng);
    var dealt = five.slice(0, 3);
    var pair = five.slice(3);
    var used = idSet(five);
    var rest = shuffle(P.buildDeck().filter(function (c) { return !used[c.id]; }), rng);
    var grid = shuffle(pair.concat(rest.slice(0, 14)), rng);
    var q = quickCheck(grid, dealt, rules, [pair[0].id, pair[1].id]);
    if (!q || q.best.category !== target) return null;
    return { grid: grid, dealt: dealt, check: q };
  }

  /** Natural round: a fully random deal of 3 dealer + 16 grid cards. */
  function attemptNatural(rules, rng) {
    var deck = shuffle(P.buildDeck(), rng);
    var grid = deck.slice(0, 16), dealt = deck.slice(16, 19);
    var q = quickCheck(grid, dealt, rules, null);
    if (!q) return null;
    return { grid: grid, dealt: dealt, check: q };
  }

  function idSet(cards) {
    var o = {};
    cards.forEach(function (c) { o[c.id] = true; });
    return o;
  }

  function nowFn() {
    return (typeof performance !== "undefined" && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };
  }

  function finish(r, extra) {
    var ranking = rankAllPicks(r.grid, r.dealt);
    var out = {
      grid: r.grid, dealt: r.dealt, target: ranking.tiers[0].hand.category, ranking: ranking,
      alts: r.check ? r.check.alts : null, strongAlts: r.check ? r.check.strong : null,
      altCategories: r.check ? r.check.altCategories : null
    };
    for (var k in extra) out[k] = extra[k];
    return out;
  }

  /**
   * Incremental round builder, so the game can prepare the next board in small
   * background slices. step(ms) works for up to `ms` milliseconds and returns the
   * finished round, or null if it needs more time. opts as for generateRound.
   */
  function createBuilder(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var rules = opts.rules || RULES;
    var perTarget = opts.perTarget || PER_TARGET;
    var maxAttempts = opts.maxAttempts || MAX_ATTEMPTS;
    var share = opts.naturalShare != null ? opts.naturalShare : NATURAL_SHARE;
    var mode = opts.mode || (opts.target ? "planted" : (rng() < share ? "natural" : "planted"));
    var target = mode === "planted" ? (opts.target || chooseTarget(opts.used, rng)) : null;
    var failedTargets = [];
    var attempts = 0, onTarget = 0, result = null;
    var now = nowFn();

    function fallbacks() {
      // Fallback 1: natural deal with a relaxed bar (unique best, at least 2 decent alternatives).
      var relaxed = { minAlts: 2, maxAlts: 99, minStrong: 0 };
      for (var f = 0; f < 300; f++) {
        var fr = attemptNatural(relaxed, rng);
        if (fr) return finish(fr, { mode: mode, attempts: attempts + f + 1, fallback: "relaxed" });
      }
      // Fallback 2: plain random deal (still playable and ranked).
      var deck = shuffle(P.buildDeck(), rng);
      return finish({ grid: deck.slice(0, 16), dealt: deck.slice(16, 19) }, { mode: mode, attempts: attempts + 300, fallback: true });
    }

    function step(ms) {
      if (result) return result;
      var t0 = now();
      var limit = ms == null ? Infinity : ms;
      do {
        if (attempts >= maxAttempts) { result = fallbacks(); return result; }
        attempts++;
        var r;
        if (mode === "natural") {
          r = attemptNatural(rules, rng);
        } else {
          onTarget++;
          r = attemptPlanted(target, rules, rng);
          if (!r && onTarget >= perTarget && !opts.target) {
            failedTargets.push(target);
            target = chooseTarget(opts.used, rng, failedTargets);
            onTarget = 0;
          }
        }
        if (r) {
          result = finish(r, { mode: mode, attempts: attempts, fallback: false });
          return result;
        }
      } while (now() - t0 < limit);
      return null;
    }

    return {
      step: step,
      mode: mode,
      attempts: function () { return attempts; },
      done: function () { return !!result; }
    };
  }

  /**
   * Generate a round synchronously.
   * opts: { used?: [categories already used this game], target?: category, mode?: "planted"|"natural",
   *         naturalShare?, rng?, rules?, perTarget?, maxAttempts? }
   * Result: { grid, dealt, target, ranking, mode, alts, strongAlts, altCategories, attempts, fallback }
   */
  function generateRound(opts) {
    return createBuilder(opts).step(Infinity);
  }

  var RoundGen = {
    WEIGHTS: WEIGHTS,
    RULES: RULES,
    NATURAL_SHARE: NATURAL_SHARE,
    PER_TARGET: PER_TARGET,
    dealerCategory: dealerCategory,
    quickCheck: quickCheck,
    createBuilder: createBuilder,
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
