/**
 * 16 Poker — 5-card hand evaluator with kicker tie-breaks.
 * Works in Node (module.exports) and the browser (global PokerEval).
 */
(function (root) {
  "use strict";

  var HAND_NAMES = [
    "High Card",
    "Pair",
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
    "Royal Flush"
  ];

  // Points awarded for the player's made hand.
  var HAND_POINTS = [10, 25, 40, 60, 85, 110, 150, 200, 280, 400];
  var PERFECT_BONUS = 75;

  var RANK_CHARS = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
    10: "10", 11: "J", 12: "Q", 13: "K", 14: "A"
  };
  var SUIT_CHARS = { s: "♠", h: "♥", d: "♦", c: "♣" };
  var SUIT_COLORS = { s: "black", h: "red", d: "red", c: "black" };
  var CHAR_TO_RANK = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    T: 10, t: 10, J: 11, j: 11, Q: 12, q: 12, K: 13, k: 13, A: 14, a: 14
  };

  function makeCard(rank, suit) {
    return { rank: rank, suit: suit, id: rank + suit };
  }

  /**
   * Parse strings like "As", "Td", "10h", "KH".
   */
  function parseCard(str) {
    var s = String(str).trim();
    var suit = s.charAt(s.length - 1).toLowerCase();
    var rankPart = s.slice(0, -1);
    var rank = rankPart === "10" ? 10 : CHAR_TO_RANK[rankPart];
    if (!rank || !SUIT_CHARS[suit]) {
      throw new Error("Invalid card: " + str);
    }
    return makeCard(rank, suit);
  }

  function parseCards(list) {
    return list.map(function (c) {
      return typeof c === "string" ? parseCard(c) : c;
    });
  }

  function cardLabel(card) {
    return RANK_CHARS[card.rank] + SUIT_CHARS[card.suit];
  }

  function buildDeck() {
    var suits = ["s", "h", "d", "c"];
    var deck = [];
    for (var r = 2; r <= 14; r++) {
      for (var i = 0; i < suits.length; i++) {
        deck.push(makeCard(r, suits[i]));
      }
    }
    return deck;
  }

  function shuffle(deck) {
    var a = deck.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  /**
   * Evaluate a 5-card poker hand.
   * Returns { category, name, tie, points } where `tie` is a comparable
   * array (higher is better) including category as the first element.
   */
  function evaluateFive(cards) {
    if (!cards || cards.length !== 5) {
      throw new Error("evaluateFive requires exactly 5 cards");
    }
    var ranks = cards.map(function (c) { return c.rank; }).sort(function (a, b) { return b - a; });
    var suits = cards.map(function (c) { return c.suit; });
    var isFlush = suits.every(function (s) { return s === suits[0]; });

    var counts = {};
    for (var i = 0; i < ranks.length; i++) {
      counts[ranks[i]] = (counts[ranks[i]] || 0) + 1;
    }
    var groups = Object.keys(counts).map(function (r) {
      return { rank: +r, count: counts[r] };
    }).sort(function (a, b) {
      return b.count - a.count || b.rank - a.rank;
    });

    var unique = [];
    for (var u = 0; u < ranks.length; u++) {
      if (unique.indexOf(ranks[u]) === -1) unique.push(ranks[u]);
    }
    unique.sort(function (a, b) { return b - a; });

    var straightHigh = 0;
    if (unique.length === 5) {
      if (unique[0] - unique[4] === 4) {
        straightHigh = unique[0];
      } else if (
        unique[0] === 14 &&
        unique[1] === 5 &&
        unique[2] === 4 &&
        unique[3] === 3 &&
        unique[4] === 2
      ) {
        straightHigh = 5; // wheel A-2-3-4-5
      }
    }
    var isStraight = straightHigh > 0;

    var category;
    var tie;
    if (isFlush && isStraight && straightHigh === 14) {
      category = 9;
      tie = [9, 14];
    } else if (isFlush && isStraight) {
      category = 8;
      tie = [8, straightHigh];
    } else if (groups[0].count === 4) {
      category = 7;
      tie = [7, groups[0].rank, groups[1].rank];
    } else if (groups[0].count === 3 && groups[1] && groups[1].count === 2) {
      category = 6;
      tie = [6, groups[0].rank, groups[1].rank];
    } else if (isFlush) {
      category = 5;
      tie = [5].concat(ranks);
    } else if (isStraight) {
      category = 4;
      tie = [4, straightHigh];
    } else if (groups[0].count === 3) {
      category = 3;
      var tripKickers = groups.slice(1).map(function (g) { return g.rank; }).sort(function (a, b) { return b - a; });
      tie = [3, groups[0].rank].concat(tripKickers);
    } else if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
      category = 2;
      tie = [2, groups[0].rank, groups[1].rank, groups[2].rank];
    } else if (groups[0].count === 2) {
      category = 1;
      var pairKickers = groups.slice(1).map(function (g) { return g.rank; }).sort(function (a, b) { return b - a; });
      tie = [1, groups[0].rank].concat(pairKickers);
    } else {
      category = 0;
      tie = [0].concat(ranks);
    }

    return {
      category: category,
      name: HAND_NAMES[category],
      tie: tie,
      points: HAND_POINTS[category]
    };
  }

  function compareHands(a, b) {
    var ta = a.tie || a;
    var tb = b.tie || b;
    var n = Math.max(ta.length, tb.length);
    for (var i = 0; i < n; i++) {
      var da = ta[i] || 0;
      var db = tb[i] || 0;
      if (da !== db) return da - db;
    }
    return 0;
  }

  function handsEqual(a, b) {
    return compareHands(a, b) === 0;
  }

  /**
   * Among all C(grid.length, 2) pairs, find the best 5-card hand
   * formed with the 3 dealt cards. Returns { pair, cards, hand }.
   * If several pairs tie, the first (lowest indices) is returned.
   */
  function findBestCombo(grid, dealt) {
    if (!grid || grid.length < 2 || !dealt || dealt.length !== 3) {
      throw new Error("findBestCombo requires at least 2 grid cards and 3 dealt cards");
    }
    var best = null;
    for (var i = 0; i < grid.length; i++) {
      for (var j = i + 1; j < grid.length; j++) {
        var pair = [grid[i], grid[j]];
        var five = pair.concat(dealt);
        var hand = evaluateFive(five);
        if (!best || compareHands(hand, best.hand) > 0) {
          best = { pair: pair, cards: five, hand: hand, indices: [i, j] };
        }
      }
    }
    return best;
  }

  function evaluatePlayer(grid, dealt, indices) {
    var pair = [grid[indices[0]], grid[indices[1]]];
    var cards = pair.concat(dealt);
    return { pair: pair, cards: cards, hand: evaluateFive(cards), indices: indices.slice() };
  }

  var PokerEval = {
    HAND_NAMES: HAND_NAMES,
    HAND_POINTS: HAND_POINTS,
    PERFECT_BONUS: PERFECT_BONUS,
    RANK_CHARS: RANK_CHARS,
    SUIT_CHARS: SUIT_CHARS,
    SUIT_COLORS: SUIT_COLORS,
    makeCard: makeCard,
    parseCard: parseCard,
    parseCards: parseCards,
    cardLabel: cardLabel,
    buildDeck: buildDeck,
    shuffle: shuffle,
    evaluateFive: evaluateFive,
    compareHands: compareHands,
    handsEqual: handsEqual,
    findBestCombo: findBestCombo,
    evaluatePlayer: evaluatePlayer
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PokerEval;
  }
  root.PokerEval = PokerEval;
})(typeof globalThis !== "undefined" ? globalThis : this);
