# Builds themes/index.html (+ theme-1..3.html previews) from ../index.html + themes.css + dealer.svg.html
import sys
ASSETS = sys.argv[1] if len(sys.argv) > 1 else 'assets/'   # 'themes/assets/' when deployed at repo root
src='/workspace/memory-poker/index.html'
s=open(src).read()
css=open('/workspace/memory-poker/themes/themes.css').read()
if ASSETS == 'inline':
    import re, base64
    def _inline(m):
        data = open('/workspace/memory-poker/themes/assets/' + m.group(1), 'rb').read()
        return 'url("data:image/webp;base64,' + base64.b64encode(data).decode() + '")'
    css = re.sub(r'url\("\{\{ASSETS\}\}([\w.-]+)"\)', _inline, css)
else:
    css = css.replace('{{ASSETS}}', ASSETS)
svg=open('/workspace/memory-poker/themes/dealer.svg.html').read()
def rep(old,new):
    global s
    assert s.count(old)==1,old[:50]; s=s.replace(old,new)
rep('<head>\n','''<head>
  <script>
    /* ── THEME: change this one line to pick the default table ── */
    var DEFAULT_THEME = "dead-again"; // "classic" | "dead-again" | "neon" | "dealer-room"
    (function () {
      var ok = { "classic": 1, "dead-again": 1, "neon": 1, "dealer-room": 1 };
      var q = (location.search.match(/[?&]theme=([\\w-]+)/) || [])[1];
      var saved = null;
      try { saved = localStorage.getItem("sixteenPokerTheme"); } catch (e) {}
      var t = ok[q] ? q : ok[saved] ? saved : DEFAULT_THEME;
      document.documentElement.setAttribute("data-theme", t);
    })();
  </script>
''')
rep('  </style>\n</head>', css+'\n  </style>\n</head>')
rep('''    <div class="dealer-wrap">
      <div class="dealer-label">Dealer</div>''','''    <div class="dealer-wrap">
'''+svg+'''      <div class="dealer-label">Dealer</div>''')
rep('''    <div class="best-line" id="bestLine">Best: —</div>''','''    <div class="diff-label theme-label">Table</div>
    <div class="theme-row" id="themeRow"></div>
    <div class="best-line" id="bestLine">Best: —</div>''')
rep('''  el.timeSlider.addEventListener("input"''','''  var THEMES = [["classic", "Classic"], ["dead-again", "Dead Again"], ["neon", "Neon Mask"], ["dealer-room", "Dealer Room"]];
  function renderThemes() {
    var row = document.getElementById("themeRow");
    if (!row) return;
    var cur = document.documentElement.getAttribute("data-theme");
    row.innerHTML = "";
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-btn" + (t[0] === cur ? " selected" : "");
      b.textContent = t[1];
      b.addEventListener("click", function () {
        document.documentElement.setAttribute("data-theme", t[0]);
        try { localStorage.setItem("sixteenPokerTheme", t[0]); } catch (e) {}
        renderThemes();
      });
      row.appendChild(b);
    });
  }

  el.timeSlider.addEventListener("input"''')
rep('''      renderDealer(dealtCards, true);
      var minis = el.dealerRow.querySelectorAll(".mini-card");
      minis.forEach(function (m, i) {
        flipTimers.push(setTimeout(function () {
          m.classList.remove("face-down");
        }, 180 + i * 160));
      });
      flipTimers.push(setTimeout(function () {
        beginPicking();
      }, 180 + 2 * 160 + 400));''','''      renderDealer(dealtCards, true);
      var fig = document.getElementById("dealerFig");
      if (fig) {
        fig.classList.remove("dealing");
        void fig.offsetWidth;
        fig.classList.add("dealing");
        flipTimers.push(setTimeout(function () { fig.classList.remove("dealing"); }, 1500));
      }
      var minis = el.dealerRow.querySelectorAll(".mini-card");
      minis.forEach(function (m, i) {
        flipTimers.push(setTimeout(function () {
          m.classList.remove("face-down");
        }, 420 + i * 200));
      });
      flipTimers.push(setTimeout(function () {
        beginPicking();
      }, 420 + 2 * 200 + 450));''')
rep('''  loadTime();
  renderDiff();''','''  loadTime();
  renderThemes();
  renderDiff();''')
out = sys.argv[2] if len(sys.argv) > 2 else '/workspace/memory-poker/themes/'
open(out+'index.html','w').write(s)
for n,t in [(1,'dead-again'),(2,'neon'),(3,'dealer-room')]:
    open(out+'theme-%d.html'%n,'w').write(s.replace('var DEFAULT_THEME = "dead-again";','var DEFAULT_THEME = "%s";'%t))
print('built')
