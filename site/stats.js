/* SDO Practice Lab - TA dashboard for the anonymous class statistics.
   Signs in with a Supabase Auth account that is listed in public.admins,
   then calls public.class_stats() (see supabase/schema.sql). */
(function () {
  "use strict";

  var CFG = window.SDO_CONFIG || {};
  var DATA = window.SDO_DATA;
  var root = document.getElementById("stats");
  if (!root) return;

  var BASE = String(CFG.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = CFG.supabaseKey || "";
  var SESSION_KEY = "sdo-practice-lab/ta-session";
  var STORE_KEY = "sdo-practice-lab/v1";
  var MIN_ANSWERS = 3;          // a question needs this many answers before it is ranked
  var REVIEW_BELOW = 60;        // topics/questions under this % correct are flagged
  var RANGES = [{ id: "all", label: "All time" }, { id: "30", label: "Last 30 days" }, { id: "7", label: "Last 7 days" }];

  /* ---------- question bank lookup ---------- */
  var byId = {}, topicName = {}, order = {};
  if (DATA) {
    DATA.topics.forEach(function (t) { topicName[t.id] = t.name; });
    var n = 0;
    DATA.weeks.forEach(function (w) {
      w.questions.forEach(function (q) { q.week = w.week; byId[q.id] = q; order[q.id] = n++; });
    });
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function inline(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function fmt(n) { return Number(n).toLocaleString("en-GB"); }
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    var step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return step * p;
  }
  function dayLabel(iso, long) {
    var d = new Date(iso + "T12:00:00");
    return long
      ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
      : String(d.getDate());
  }
  function timeLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function decode(q, r) {
    if (r === null || r === undefined) return "";
    if (!q) return r;
    try {
      if (q.type === "single") return q.options[Number(r)];
      if (q.type === "truefalse") return r === "true" ? "True" : "False";
      if (q.type === "order") return r.split(",").map(function (i) { return q.items[Number(i)]; }).join(" → ");
    } catch (e) { /* fall through */ }
    return r;
  }
  function isCode(q) { return q && ((q.type === "single" && q.codeOptions) || (q.type === "order" && q.codeItems) || q.type === "input"); }

  /* ---------- session (this tab only) ---------- */
  function loadSession() {
    try {
      var s = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return s && s.exp > Date.now() + 30000 ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(s) {
    try {
      if (s) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* memory only */ }
  }

  var state = { session: loadSession(), range: "all", data: null, loading: false, error: "", notice: "" };

  /* ---------- API ---------- */
  function request(path, body, auth) {
    var headers = { "Content-Type": "application/json", apikey: KEY };
    if (auth) headers.Authorization = "Bearer " + auth;
    return window.fetch(BASE + path, { method: "POST", headers: headers, body: JSON.stringify(body), credentials: "omit" })
      .then(function (res) {
        return res.text().then(function (t) {
          var json = null;
          try { json = t ? JSON.parse(t) : null; } catch (e) { json = null; }
          if (!res.ok) { var err = new Error("HTTP " + res.status); err.status = res.status; err.body = json || {}; throw err; }
          return json;
        });
      });
  }

  function signIn(email, password) {
    state.loading = true; state.error = ""; render();
    request("/auth/v1/token?grant_type=password", { email: email, password: password })
      .then(function (r) {
        state.session = { token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000, email: (r.user && r.user.email) || email };
        saveSession(state.session);
        load();
      })
      .catch(function (e) {
        state.loading = false;
        state.error = e.status === 400 || e.status === 401
          ? "Email or password is wrong."
          : e.status ? "Sign-in failed (" + e.status + "). Try again in a minute."
          : "Could not reach Supabase. Check your connection and the project URL in config.js.";
        render();
      });
  }

  function signOut(notice) {
    state.session = null; state.data = null; state.loading = false; state.error = ""; state.notice = notice || "";
    saveSession(null);
    render();
  }

  function load() {
    if (!state.session) return render();
    if (state.session.exp <= Date.now() + 30000) return signOut("Your session expired. Sign in again.");
    state.loading = true; state.error = ""; render();
    var since = state.range === "all" ? null : new Date(Date.now() - Number(state.range) * 86400000).toISOString();
    request("/rest/v1/rpc/class_stats", { since: since }, state.session.token)
      .then(function (d) { state.data = d; state.loading = false; render(); })
      .catch(function (e) {
        state.loading = false;
        var code = e.body && e.body.code;
        if (code === "42501") state.error = "This account is not a TA account yet. Add it to public.admins with the SQL in the README, then refresh.";
        else if (e.status === 401 || code === "PGRST301" || code === "PGRST303") return signOut("Your session expired. Sign in again.");
        else if (code === "PGRST202") state.error = "The database function class_stats is missing. Run supabase/schema.sql in the Supabase SQL Editor.";
        else state.error = e.status ? "Loading failed (" + e.status + (e.body && e.body.message ? ": " + e.body.message : "") + ")." : "Could not reach Supabase. Check your connection.";
        render();
      });
  }

  /* ---------- rendering ---------- */
  function render() {
    if (!BASE || !KEY) {
      root.innerHTML = '<section class="stats-empty"><h1>Class statistics are not set up yet</h1>' +
        "<p>Create a Supabase project, run <code>supabase/schema.sql</code> and put the project URL and publishable key into <code>site/config.js</code>. The README has the step-by-step guide.</p></section>";
      return;
    }
    if (!state.session) { root.innerHTML = loginHtml(); return; }
    root.innerHTML = dashboardHtml();
  }

  function loginHtml() {
    return '<section class="login"><div class="panel-head"><p class="eyebrow">TA access</p><h1>Sign in to see class statistics</h1>' +
      '<p class="muted">Use the account you created in Supabase (Authentication → Users). Students cannot open this page.</p></div>' +
      (state.notice ? '<p class="note">' + esc(state.notice) + "</p>" : "") +
      '<form class="panel" id="login-form" novalidate>' +
      '<label class="field" for="login-email"><span>Email</span><input id="login-email" type="email" autocomplete="username" required></label>' +
      '<label class="field" for="login-password"><span>Password</span><input id="login-password" type="password" autocomplete="current-password" required></label>' +
      (state.error ? '<p class="form-error" role="alert">' + esc(state.error) + "</p>" : "") +
      '<div class="row end"><button type="submit" class="btn"' + (state.loading ? " disabled" : "") + ">" + (state.loading ? "Signing in…" : "Sign in") + "</button></div>" +
      "</form></section>";
  }

  function tilesHtml(t) {
    var tiles = [
      { label: "Answers recorded", value: fmt(t.answers) },
      { label: "Runs", value: fmt(t.runs), sub: "practice and exam sessions" },
      { label: "Exam simulations", value: fmt(t.exam_runs) },
      { label: "Answered correctly", value: pct(t.correct, t.answers) + "%", sub: fmt(t.correct) + " of " + fmt(t.answers) }
    ];
    return '<div class="tiles">' + tiles.map(function (x) {
      return '<div class="tile"><p class="tile-label">' + x.label + '</p><p class="tile-value">' + x.value + "</p>" +
        (x.sub ? '<p class="tile-sub">' + x.sub + "</p>" : "") + "</div>";
    }).join("") + "</div>";
  }

  function activityHtml(days) {
    var max = niceMax(Math.max.apply(null, days.map(function (d) { return d.answers; }).concat([1])));
    var ticks = [0, max / 2, max];
    var cols = days.map(function (d, i) {
      var h = (d.answers / max) * 100;
      var label = dayLabel(d.day, true) + ": " + fmt(d.answers) + " answers, " + fmt(d.runs) + " runs";
      return '<div class="col" tabindex="0" data-tip="' + esc(label) + '" aria-label="' + esc(label) + '">' +
        (d.answers ? '<span class="bar" style="height:' + h.toFixed(2) + '%"></span>' : "") +
        '<span class="x' + (i % 2 ? " x-odd" : "") + '" aria-hidden="true">' + dayLabel(d.day) + "</span></div>";
    }).join("");
    var grid = ticks.map(function (v) {
      return '<span class="gridline" style="bottom:' + (v / max) * 100 + '%"><span class="y">' + fmt(v) + "</span></span>";
    }).join("");
    var table = "<table><thead><tr><th>Day</th><th>Answers</th><th>Runs</th></tr></thead><tbody>" +
      days.map(function (d) { return "<tr><td>" + dayLabel(d.day, true) + "</td><td>" + fmt(d.answers) + "</td><td>" + fmt(d.runs) + "</td></tr>"; }).join("") +
      "</tbody></table>";
    return '<section class="panel" aria-labelledby="act-h"><div class="panel-head"><h2 id="act-h">Answers per day</h2>' +
      '<p class="muted">Last 14 days (Bremen time), whatever range is selected above.</p></div>' +
      '<div class="chart"><div class="plot">' + grid + '<div class="cols">' + cols + '</div><div class="tip" id="chart-tip" hidden></div></div></div>' +
      '<details class="as-table"><summary>Show as table</summary><div class="table-wrap">' + table + "</div></details></section>";
  }

  function reviewPill() { return '<span class="status-pill no"><span aria-hidden="true">!</span> Needs review</span>'; }

  function topicsHtml(topics) {
    if (!topics.length) return "";
    var rows = topics.slice().sort(function (a, b) { return pct(a.correct, a.answers) - pct(b.correct, b.answers); }).map(function (t) {
      var p = pct(t.correct, t.answers);
      var flag = t.answers >= 10 && p < REVIEW_BELOW;
      return "<tr><th scope=\"row\">" + esc(topicName[t.topic] || t.topic) + "</th><td class=\"num\">" + fmt(t.answers) + "</td>" +
        '<td><div class="meter-cell"><div class="meter soft" aria-hidden="true"><span style="width:' + p + '%"></span></div><span class="num">' + p + "%</span></div></td>" +
        "<td>" + (flag ? reviewPill() : "") + "</td></tr>";
    }).join("");
    return '<section class="panel" aria-labelledby="top-h"><div class="panel-head"><h2 id="top-h">By topic</h2>' +
      '<p class="muted">Weakest topic first. Topics under ' + REVIEW_BELOW + "% correct (with at least 10 answers) are flagged.</p></div>" +
      '<div class="table-wrap"><table><thead><tr><th>Topic</th><th class="num">Answers</th><th>Correct</th><th><span class="sr">Status</span></th></tr></thead><tbody>' +
      rows + "</tbody></table></div></section>";
  }

  function questionCell(qid) {
    var q = byId[qid];
    if (!q) return '<span class="mono">' + esc(qid) + '</span> <span class="muted">(no longer in the question bank)</span>';
    return '<span class="q-text">' + inline(q.prompt) + '</span><span class="q-sub">Week ' + q.week + " · " + esc(topicName[q.topic] || q.topic) + "</span>";
  }
  function wrongCell(row) {
    if (!row.top_wrong) return '<span class="muted">–</span>';
    var q = byId[row.question_id], txt = decode(q, row.top_wrong);
    return (isCode(q) ? "<code>" + esc(txt) + "</code>" : esc(txt)) + ' <span class="muted">(' + row.top_wrong_n + "×)</span>";
  }

  function hardestHtml(questions) {
    var ranked = questions.filter(function (r) { return r.answers >= MIN_ANSWERS; })
      .sort(function (a, b) { return pct(a.correct, a.answers) - pct(b.correct, b.answers) || b.answers - a.answers; })
      .slice(0, 15);
    var body = ranked.length
      ? '<div class="table-wrap"><table class="q-table"><thead><tr><th>Question</th><th class="num">Answers</th><th class="num">Correct</th><th>Most common wrong answer</th></tr></thead><tbody>' +
        ranked.map(function (r) {
          return "<tr><td>" + questionCell(r.question_id) + '</td><td class="num">' + fmt(r.answers) + '</td><td class="num">' + pct(r.correct, r.answers) + "%</td><td>" + wrongCell(r) + "</td></tr>";
        }).join("") + "</tbody></table></div>"
      : '<p class="muted">No question has ' + MIN_ANSWERS + " or more answers yet.</p>";
    return '<section class="panel" aria-labelledby="hard-h"><div class="panel-head"><h2 id="hard-h">Hardest questions</h2>' +
      "<p class=\"muted\">The 15 questions with the lowest share of correct answers (at least " + MIN_ANSWERS + " answers each). The most common wrong answer shows the misconception to address in the tutorial.</p></div>" +
      body + "</section>";
  }

  function allQuestionsHtml(questions) {
    var rows = questions.slice().sort(function (a, b) {
      var oa = order[a.question_id], ob = order[b.question_id];
      return (oa === undefined ? 1e9 : oa) - (ob === undefined ? 1e9 : ob);
    });
    return '<details class="panel as-table"><summary><h2 class="inline-h">All answered questions (' + rows.length + ")</h2></summary>" +
      '<div class="table-wrap"><table class="q-table"><thead><tr><th>Question</th><th class="num">Answers</th><th class="num">Correct</th><th>Most common wrong answer</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr><td>" + questionCell(r.question_id) + '</td><td class="num">' + fmt(r.answers) + '</td><td class="num">' + pct(r.correct, r.answers) + "%</td><td>" + wrongCell(r) + "</td></tr>";
      }).join("") + "</tbody></table></div></details>";
  }

  function dashboardHtml() {
    var d = state.data;
    var ranges = RANGES.map(function (r) {
      return '<button type="button" class="chip" data-range="' + r.id + '" aria-pressed="' + (state.range === r.id) + '">' + r.label + "</button>";
    }).join("");
    var head = '<div class="dash-head"><div class="panel-head"><p class="eyebrow">Anonymous class statistics</p><h1>How the class is doing</h1>' +
      '<p class="muted">Signed in as ' + esc(state.session.email) + (d ? " · updated " + timeLabel(d.generated_at) : "") + "</p></div>" +
      '<div class="row"><button type="button" class="ghost" id="refresh"' + (state.loading ? " disabled" : "") + ">" + (state.loading ? "Loading…" : "Refresh") + "</button>" +
      '<button type="button" class="ghost" id="sign-out">Sign out</button></div></div>' +
      '<div class="seg" role="group" aria-label="Time range">' + ranges + "</div>";
    if (state.error) return head + '<p class="form-error" role="alert">' + esc(state.error) + "</p>";
    if (!d) return head + '<p class="muted">Loading the statistics…</p>';
    if (!d.totals.answers) {
      return head + tilesHtml(d.totals) + activityHtml(d.days) +
        '<p class="note">No answers in this range yet. Share the practice site with your students; their answers appear here a few seconds after they check them.</p>';
    }
    return head + tilesHtml(d.totals) + activityHtml(d.days) + topicsHtml(d.topics) + hardestHtml(d.questions) + allQuestionsHtml(d.questions);
  }

  /* ---------- events ---------- */
  root.addEventListener("submit", function (e) {
    if (e.target.id !== "login-form") return;
    e.preventDefault();
    var email = document.getElementById("login-email").value.trim();
    var pw = document.getElementById("login-password").value;
    if (!email || !pw) { state.error = "Enter your email and password."; render(); return; }
    signIn(email, pw);
  });
  root.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.id === "refresh") load();
    else if (t.id === "sign-out") signOut();
    else if (t.hasAttribute("data-range")) { state.range = t.getAttribute("data-range"); load(); }
  });

  // chart tooltip (hover and keyboard focus)
  function showTip(col) {
    var tip = document.getElementById("chart-tip");
    if (!tip || !col) return;
    tip.textContent = col.getAttribute("data-tip");
    tip.hidden = false;
    var plot = col.closest(".plot"), pr = plot.getBoundingClientRect(), cr = col.getBoundingClientRect();
    var x = cr.left - pr.left + cr.width / 2;
    x = Math.max(tip.offsetWidth / 2, Math.min(pr.width - tip.offsetWidth / 2, x));
    tip.style.left = x + "px";
  }
  function hideTip() { var tip = document.getElementById("chart-tip"); if (tip) tip.hidden = true; }
  root.addEventListener("mouseover", function (e) { var c = e.target.closest(".col"); if (c) showTip(c); });
  root.addEventListener("mouseout", function (e) { if (e.target.closest(".col") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".col"))) hideTip(); });
  root.addEventListener("focusin", function (e) { var c = e.target.closest(".col"); if (c) showTip(c); });
  root.addEventListener("focusout", function (e) { if (e.target.closest(".col")) hideTip(); });

  /* ---------- theme (shared with the practice site) ---------- */
  var theme = "auto";
  try { theme = (JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}").theme) || "auto"; } catch (e) { /* default */ }
  function applyTheme(initial) {
    var r = document.documentElement;
    if (theme === "auto") { if (!initial) r.removeAttribute("data-theme"); } else r.setAttribute("data-theme", theme);
    var b = document.getElementById("theme-toggle");
    if (b) b.textContent = "Theme: " + theme.charAt(0).toUpperCase() + theme.slice(1);
  }
  var tb = document.getElementById("theme-toggle");
  if (tb) tb.addEventListener("click", function () {
    theme = { auto: "light", light: "dark", dark: "auto" }[theme] || "auto";
    try {
      var s = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
      s.theme = theme;
      window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) { /* ignore */ }
    applyTheme(false);
  });

  applyTheme(true);
  if (state.session) load(); else render();
})();
