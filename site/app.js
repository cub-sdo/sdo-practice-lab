/* SDO Practice Lab - static practice app. No dependencies.
   Personal progress is kept in this browser only (localStorage).
   If config.js names a Supabase project, each answer is also sent ANONYMOUSLY
   (question, right/wrong, chosen answer, random run id) for the TA's class statistics. */
(function () {
  "use strict";

  var DATA = window.SDO_DATA;
  var app = document.getElementById("app");
  if (!app) return;
  if (!DATA) {
    app.innerHTML = '<p class="note">The question data is missing. Run <code>python3 scripts/build.py</code> to create <code>site/questions.js</code>, then reload.</p>';
    return;
  }

  var STORE_KEY = "sdo-practice-lab/v1";
  var PASS_MARK = 45; // Constructor University: 45% is the minimum to pass a module component
  var EXAM_SIZES = [10, 20, 30];
  var TYPE_LABEL = { single: "Choose one", truefalse: "True or false", order: "Put in order", input: "Type the answer" };

  /* ---------- data ---------- */
  var TOPICS = DATA.topics;
  var topicById = {};
  TOPICS.forEach(function (t) { topicById[t.id] = t; });
  var WEEKS = DATA.weeks;
  var ALL = [];
  WEEKS.forEach(function (w) {
    w.questions.forEach(function (q) { q.week = w.week; ALL.push(q); });
  });
  var byId = {};
  ALL.forEach(function (q) { byId[q.id] = q; });

  /* ---------- storage (best effort) ---------- */
  function loadStore() {
    try {
      var s = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
      return { stats: s.stats || {}, theme: s.theme || "auto", share: s.share !== false };
    } catch (e) {
      return { stats: {}, theme: "auto", share: true };
    }
  }
  var store = loadStore();
  function saveStore() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode etc. */ }
  }
  function record(id, ok) {
    var s = store.stats[id] || { n: 0, ok: 0 };
    s.n += 1;
    if (ok) s.ok += 1;
    s.last = ok;
    store.stats[id] = s;
  }
  function failedIds() {
    return ALL.filter(function (q) { var s = store.stats[q.id]; return s && s.last === false; }).map(function (q) { return q.id; });
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function inline(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function norm(s) {
    return String(s).trim().replace(/^\$\s*/, "").replace(/\s+/g, " ").replace(/;$/, "").toLowerCase();
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function fmtTime(sec) {
    sec = Math.max(0, sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  /* ---------- grading ---------- */
  function isComplete(q, resp) {
    if (q.type === "single" || q.type === "truefalse") return resp !== null && resp !== undefined;
    if (q.type === "order") return Array.isArray(resp) && resp.length === q.items.length;
    if (q.type === "input") return typeof resp === "string" && resp.trim() !== "";
    return false;
  }
  function grade(q, resp) {
    if (!isComplete(q, resp)) return false;
    if (q.type === "single" || q.type === "truefalse") return resp === q.answer;
    if (q.type === "order") return resp.every(function (v, i) { return v === i; });
    if (q.type === "input") return q.accept.some(function (a) { return norm(a) === norm(resp); });
    return false;
  }
  function isCodeAnswer(q) {
    return (q.type === "single" && q.codeOptions) || (q.type === "order" && q.codeItems) || q.type === "input";
  }
  function answerHtml(q, resp) {
    if (!isComplete(q, resp) && !(q.type === "order" && resp && resp.length)) return '<span class="muted">No answer</span>';
    var code = isCodeAnswer(q);
    var wrap = function (t) { return code ? "<code>" + esc(t) + "</code>" : esc(t); };
    if (q.type === "single") return wrap(q.options[resp]);
    if (q.type === "truefalse") return resp ? "True" : "False";
    if (q.type === "order") return resp.map(function (i) { return wrap(q.items[i]); }).join(" → ");
    return wrap(resp.trim());
  }
  function correctHtml(q) {
    var code = isCodeAnswer(q);
    var wrap = function (t) { return code ? "<code>" + esc(t) + "</code>" : esc(t); };
    if (q.type === "single") return wrap(q.options[q.answer]);
    if (q.type === "truefalse") return q.answer ? "True" : "False";
    if (q.type === "order") return q.items.map(wrap).join(" → ");
    var more = q.accept.length > 1 ? ' <span class="muted">(also accepted: ' + q.accept.slice(1).map(wrap).join(", ") + ")</span>" : "";
    return wrap(q.accept[0]) + more;
  }

  /* ---------- anonymous class statistics (optional) ---------- */
  var CFG = window.SDO_CONFIG || {};
  var STATS_URL = CFG.supabaseUrl && CFG.supabaseKey ? String(CFG.supabaseUrl).replace(/\/+$/, "") + "/rest/v1/attempts" : "";
  function sharing() { return !!STATS_URL && store.share !== false; }
  function newRunId() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) { /* fall through */ }
    var h = "";
    for (var i = 0; i < 32; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-a" + h.slice(17, 20) + "-" + h.slice(20);
  }
  function serialize(q, resp) {
    if (!isComplete(q, resp)) return null;
    if (q.type === "single") return String(resp);
    if (q.type === "truefalse") return resp ? "true" : "false";
    if (q.type === "order") return resp.join(",");
    return norm(resp).slice(0, 60);
  }
  function rowFor(it) {
    return { run_id: run.id, mode: run.mode, question_id: it.q.id, topic: it.q.topic, week: it.q.week, correct: !!it.ok, response: serialize(it.q, it.resp) };
  }
  function sendAttempts(rows) {
    if (!sharing() || !rows.length) return;
    var headers = { "Content-Type": "application/json", apikey: CFG.supabaseKey, Prefer: "return=minimal" };
    if (/^eyJ/.test(CFG.supabaseKey)) headers.Authorization = "Bearer " + CFG.supabaseKey; // legacy anon key
    try {
      window.fetch(STATS_URL, { method: "POST", headers: headers, body: JSON.stringify(rows), keepalive: true, credentials: "omit" })
        .catch(function () { /* statistics are best effort; practice works offline */ });
    } catch (e) { /* ignore */ }
  }
  function renderShareNote() {
    var el = document.getElementById("stats-note");
    if (!el) return;
    if (!STATS_URL) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = (store.share !== false
      ? "<strong>Anonymous class statistics are on.</strong> For each answer the site sends the question, whether it was right, the answer you chose and the time. No name, student ID or device identifier. The TA uses this to see which topics need more practice. "
      : "<strong>Anonymous class statistics are off</strong> for this browser. Your answers are not sent anywhere. ") +
      '<button type="button" class="linklike" data-action="share-toggle">' + (store.share !== false ? "Turn off" : "Turn on") + "</button>";
  }

  /* ---------- state ---------- */
  var ui = { screen: "home", tab: "weeks", scope: null, examSize: 20, confirmReset: false };
  var run = null;
  var timerId = null;

  function firstOpenWeek() {
    for (var i = 0; i < WEEKS.length; i++) {
      var open = WEEKS[i].questions.some(function (q) { return !store.stats[q.id]; });
      if (open) return WEEKS[i].week;
    }
    return WEEKS[0].week;
  }
  ui.scope = { kind: "week", value: firstOpenWeek() };

  function makeItem(q) {
    var view = {};
    if (q.type === "single") view.optOrder = shuffle(range(q.options.length));
    if (q.type === "order") {
      var p;
      do { p = shuffle(range(q.items.length)); } while (p.every(function (v, i) { return v === i; }));
      view.pool = p;
    }
    return { q: q, view: view, resp: q.type === "order" ? [] : null, checked: false, ok: false };
  }

  function startRun(mode, label, questions) {
    if (!questions.length) return;
    stopTimer();
    run = {
      id: newRunId(), mode: mode, label: label, i: 0, finished: false, timeUp: false, confirm: null,
      items: questions.map(makeItem)
    };
    if (mode === "exam") {
      run.deadline = Date.now() + questions.length * 60 * 1000;
      timerId = window.setInterval(tick, 1000);
    }
    ui.screen = "run";
    render(true);
  }
  function stopTimer() { if (timerId) { window.clearInterval(timerId); timerId = null; } }
  function remaining() { return Math.round((run.deadline - Date.now()) / 1000); }
  function tick() {
    if (!run || run.mode !== "exam" || run.finished) return stopTimer();
    var left = remaining();
    var el = document.getElementById("timer");
    if (el) {
      el.textContent = fmtTime(left);
      el.classList.toggle("low", left <= 60);
    }
    if (left <= 0) { run.timeUp = true; finishRun(); }
  }

  function pickScope(scope) {
    if (scope.kind === "week") {
      var w = WEEKS.filter(function (x) { return x.week === scope.value; })[0];
      return { label: "Practice · Week " + w.week, questions: w.questions.slice() };
    }
    var t = topicById[scope.value];
    return { label: "Practice · " + t.name, questions: shuffle(ALL.filter(function (q) { return q.topic === t.id; })) };
  }
  function pickExam(n) {
    var groups = shuffle(TOPICS.map(function (t) {
      return shuffle(ALL.filter(function (q) { return q.topic === t.id; }));
    }).filter(function (g) { return g.length; }));
    var out = [], k = 0;
    while (out.length < n && groups.some(function (g) { return g.length; })) {
      var g = groups[k % groups.length];
      if (g.length) out.push(g.pop());
      k++;
    }
    return shuffle(out);
  }

  function finishRun() {
    stopTimer();
    if (run.mode === "exam" && !run.finished) {
      run.items.forEach(function (it) {
        it.ok = grade(it.q, it.resp);
        it.checked = true;
        record(it.q.id, it.ok);
      });
      // unanswered questions (e.g. time ran out) say nothing about difficulty, so they are not sent
      sendAttempts(run.items.filter(function (it) { return isComplete(it.q, it.resp); }).map(rowFor));
    }
    if (run.mode !== "exam") {
      run.items = run.items.filter(function (it) { return it.checked; });
    }
    saveStore();
    run.finished = true;
    run.confirm = null;
    ui.screen = run.items.length ? "results" : "home";
    render(true);
  }

  /* ---------- rendering ---------- */
  function render(moveFocus) {
    // remember which control had focus so keyboard users keep their place after a re-render
    var ae = document.activeElement, key = null;
    if (!moveFocus && ae && ae !== app && app.contains(ae)) {
      key = { a: ae.getAttribute("data-action"), v: ae.getAttribute("data-value"), id: ae.id };
    }
    if (ui.screen === "home") app.innerHTML = homeHtml();
    else if (ui.screen === "run") app.innerHTML = runHtml();
    else app.innerHTML = resultsHtml();
    if (key) restoreFocus(key);
    afterRender(moveFocus);
  }

  function restoreFocus(key) {
    var el = null;
    if (key.id) el = document.getElementById(key.id);
    if (!el && key.a) {
      var sel = '[data-action="' + key.a + '"]' + (key.v !== null ? '[data-value="' + key.v + '"]' : "");
      el = app.querySelector(sel);
      if (!el && (key.a === "place" || key.a === "unplace")) {
        el = app.querySelector('[data-action="place"]') || app.querySelector('[data-action="check"]') || app.querySelector('[data-action="next"]');
      }
    }
    if (el && !el.disabled) el.focus({ preventScroll: true });
    else app.focus({ preventScroll: true });
  }

  function afterRender(moveFocus) {
    var pipe = app.querySelector(".pipeline");
    var cur = app.querySelector(".stage.current");
    if (pipe && cur) pipe.scrollLeft = cur.offsetLeft - pipe.clientWidth / 2;
    if (!moveFocus) return;
    if (ui.screen === "run") {
      var it = run.items[run.i];
      var field = app.querySelector("#answer-input");
      var next = app.querySelector("[data-focus-after-check]");
      if (it.checked && next) next.focus();
      else if (field && finePointer) field.focus();
      else app.focus({ preventScroll: true });
    } else {
      app.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0 });
  }

  function homeHtml() {
    var answered = ALL.filter(function (q) { return store.stats[q.id]; });
    var correctNow = answered.filter(function (q) { return store.stats[q.id].last; }).length;
    var failed = failedIds().length;

    var summary = answered.length
      ? '<p class="summary-line"><span><strong>' + answered.length + "</strong> of " + ALL.length + " questions answered</span>" +
        "<span><strong>" + pct(correctNow, answered.length) + "%</strong> correct on the last try</span>" +
        "<span><strong>" + failed + "</strong> to re-run</span></p>"
      : '<p class="summary-line"><span>No answers yet. ' + ALL.length + " questions are waiting. Start with Week 1 or pick a topic.</span></p>";

    var chips;
    if (ui.tab === "weeks") {
      chips = WEEKS.map(function (w) {
        var done = w.questions.filter(function (q) { return store.stats[q.id]; }).length;
        var on = ui.scope.kind === "week" && ui.scope.value === w.week;
        return '<button type="button" class="chip" data-action="scope" data-kind="week" data-value="' + w.week + '" aria-pressed="' + on + '">' +
          '<span class="chip-title">Week ' + w.week + "</span>" +
          '<span class="chip-sub">' + esc(w.title) + "</span>" +
          '<span class="chip-sub">' + w.questions.length + " questions · " + done + " done</span></button>";
      }).join("");
    } else {
      chips = TOPICS.map(function (t) {
        var qs = ALL.filter(function (q) { return q.topic === t.id; });
        var done = qs.filter(function (q) { return store.stats[q.id]; }).length;
        var on = ui.scope.kind === "topic" && ui.scope.value === t.id;
        return '<button type="button" class="chip" data-action="scope" data-kind="topic" data-value="' + t.id + '" aria-pressed="' + on + '">' +
          '<span class="chip-title">' + esc(t.name) + "</span>" +
          '<span class="chip-sub">' + qs.length + " questions · " + done + " done</span></button>";
      }).join("");
    }
    var sel = pickScope(ui.scope);

    var coverage = TOPICS.map(function (t) {
      var qs = ALL.filter(function (q) { return q.topic === t.id; });
      var ans = qs.filter(function (q) { return store.stats[q.id]; });
      var ok = ans.filter(function (q) { return store.stats[q.id].last; }).length;
      var stat = ans.length ? ans.length + "/" + qs.length + " answered · " + pct(ok, ans.length) + "% correct" : "0/" + qs.length + " answered";
      return '<div class="cov-row"><div class="cov-name"><strong>' + esc(t.name) + "</strong><span>" + esc(t.about) + "</span></div>" +
        '<div class="cov-stat"><span>' + stat + '</span><div class="meter" aria-hidden="true"><span style="width:' + pct(ans.length, qs.length) + '%"></span></div></div>' +
        '<button type="button" class="ghost" data-action="practice-topic" data-value="' + t.id + '">Practice</button></div>';
    }).join("");

    var sizes = EXAM_SIZES.map(function (n) {
      return '<button type="button" class="chip" data-action="exam-size" data-value="' + n + '" aria-pressed="' + (ui.examSize === n) + '">' + n + "</button>";
    }).join("");

    var reset = ui.confirmReset
      ? '<div class="confirm" role="alert"><p>Delete all your answers and statistics from this browser? This cannot be undone.</p>' +
        '<div class="row"><button type="button" class="btn" data-action="reset-yes">Delete my progress</button>' +
        '<button type="button" class="ghost" data-action="reset-no">Keep it</button></div></div>'
      : (answered.length ? '<div class="row"><button type="button" class="ghost" data-action="reset">Reset my progress</button></div>' : "");

    return '<section class="home">' +
      '<div class="intro"><p class="eyebrow">Exam practice · weeks 1–' + WEEKS[WEEKS.length - 1].week + "</p>" +
      "<h1>Practice questions from the lectures, tutorials and group presentations</h1>" +
      "<p>Every question is one stage in your pipeline. It turns green when you pass it and red when you should re-run it. Each answer comes with an explanation and the slide it comes from.</p></div>" +
      '<div class="summary">' + summary + '<div class="meter" aria-hidden="true"><span style="width:' + pct(answered.length, ALL.length) + '%"></span></div></div>' +

      '<section class="panel" aria-labelledby="practice-h"><div class="panel-head"><h2 id="practice-h">Practice</h2>' +
      '<p class="muted">You see the right answer and an explanation after every question.</p></div>' +
      '<div class="tabs" role="tablist" aria-label="Choose questions by">' +
      '<button type="button" role="tab" data-action="tab" data-value="weeks" aria-selected="' + (ui.tab === "weeks") + '">By week</button>' +
      '<button type="button" role="tab" data-action="tab" data-value="topics" aria-selected="' + (ui.tab === "topics") + '">By topic</button></div>' +
      '<div class="chips">' + chips + "</div>" +
      '<div class="row end"><button type="button" class="btn" data-action="start-practice">Start practice · ' + plural(sel.questions.length, "question") + "</button></div></section>" +

      '<div class="split">' +
      '<section class="panel" aria-labelledby="exam-h"><div class="panel-head"><h2 id="exam-h">Exam simulation</h2>' +
      '<p class="muted">Mixed questions from every topic, one minute each. You see the results at the end.</p></div>' +
      '<div class="seg" role="group" aria-label="Number of questions"><span class="seg-label">Questions</span>' + sizes + "</div>" +
      '<div class="row"><button type="button" class="btn" data-action="start-exam">Start exam · ' + ui.examSize + " min</button></div></section>" +
      '<section class="panel" aria-labelledby="rerun-h"><div class="panel-head"><h2 id="rerun-h">Re-run failed</h2>' +
      '<p class="muted">' + (failed ? plural(failed, "question") + " you got wrong on your last try." : "Questions you get wrong will collect here.") + "</p></div>" +
      '<div class="row"><button type="button" class="btn" data-action="start-rerun"' + (failed ? "" : " disabled") + ">" +
      (failed ? "Re-run " + plural(failed, "question") : "Nothing to re-run") + "</button></div></section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="cov-h"><div class="panel-head"><h2 id="cov-h">Coverage by topic</h2>' +
      '<p class="muted">How much of each topic you have answered, and how much of that was right on your last try.</p></div>' +
      '<div class="coverage">' + coverage + "</div></section>" +
      reset +
      "</section>";
  }

  function stagesHtml() {
    return run.items.map(function (it, i) {
      var cls = "stage", label = "Question " + (i + 1), glyph = "";
      if (run.mode === "exam") {
        if (isComplete(it.q, it.resp)) { cls += " done"; label += ", answered"; }
      } else if (it.checked) {
        cls += it.ok ? " pass" : " fail";
        label += it.ok ? ", passed" : ", failed";
        glyph = it.ok ? "✓" : "×";
      }
      if (i === run.i) { cls += " current"; label += ", current"; }
      var stateCls = run.mode === "exam" ? (isComplete(it.q, it.resp) ? "done" : "") : (it.checked ? (it.ok ? "pass" : "fail") : "");
      var inner = run.mode === "exam"
        ? '<button type="button" class="' + cls + '" data-action="goto" data-value="' + i + '" aria-label="' + label + '">' + glyph + "</button>"
        : '<span class="' + cls + '" role="img" aria-label="' + label + '">' + glyph + "</span>";
      return '<li class="' + stateCls + '">' + inner + "</li>";
    }).join("");
  }

  function answerAreaHtml(it) {
    var q = it.q, locked = it.checked && run.mode !== "exam";
    if (q.type === "single") {
      return '<div class="options" role="group" aria-label="Answer options">' + it.view.optOrder.map(function (oi, pos) {
        var cls = "opt" + (q.codeOptions ? " code" : "");
        if (locked) {
          if (oi === q.answer) cls += " is-correct";
          else if (oi === it.resp) cls += " is-wrong";
        }
        return '<button type="button" class="' + cls + '" data-action="pick" data-value="' + oi + '" aria-pressed="' + (it.resp === oi) + '"' + (locked ? " disabled" : "") + ">" +
          '<span class="key" aria-hidden="true">' + (pos + 1) + '</span><span class="txt">' + esc(q.options[oi]) + "</span></button>";
      }).join("") + "</div>";
    }
    if (q.type === "truefalse") {
      return '<div class="options tf" role="group" aria-label="Answer options">' + [true, false].map(function (v, pos) {
        var cls = "opt";
        if (locked) {
          if (v === q.answer) cls += " is-correct";
          else if (v === it.resp) cls += " is-wrong";
        }
        return '<button type="button" class="' + cls + '" data-action="pick-tf" data-value="' + v + '" aria-pressed="' + (it.resp === v) + '"' + (locked ? " disabled" : "") + ">" +
          '<span class="key" aria-hidden="true">' + (pos + 1) + '</span><span class="txt">' + (v ? "True" : "False") + "</span></button>";
      }).join("") + "</div>";
    }
    if (q.type === "order") {
      var code = q.codeItems ? " code" : "";
      var slots = range(q.items.length).map(function (pos) {
        var ii = it.resp[pos];
        if (ii === undefined) return '<li><span class="slot-empty" aria-label="Empty step"></span></li>';
        var cls = "item placed" + code;
        if (locked) cls = "item" + code + (ii === pos ? " is-correct" : " is-wrong");
        return '<li><button type="button" class="' + cls + '" data-action="unplace" data-value="' + pos + '"' + (locked ? " disabled" : "") +
          ' aria-label="Step ' + (pos + 1) + ": " + esc(q.items[ii]) + (locked ? "" : ". Select to remove") + '">' + esc(q.items[ii]) + "</button></li>";
      }).join("");
      var pool = it.view.pool.filter(function (ii) { return it.resp.indexOf(ii) === -1; });
      var poolHtml = pool.length
        ? '<p class="order-label">Pick the next step:</p><div class="pool">' + pool.map(function (ii, n) {
            return '<button type="button" class="item' + code + '" data-action="place" data-value="' + ii + '"><span class="muted mono" aria-hidden="true">' + (n + 1) + "</span> " + esc(q.items[ii]) + "</button>";
          }).join("") + "</div>"
        : (locked ? "" : '<p class="order-label">All steps placed. Select a step to take it back.</p>');
      return '<div class="order"><p class="order-label">Your order:</p><ol class="slots">' + slots + "</ol>" + poolHtml + "</div>";
    }
    // input
    var state = locked ? (it.ok ? " is-correct" : " is-wrong") : "";
    return '<label class="term" for="answer-input">' +
      (q.prefix ? '<span class="pre">' + esc(q.prefix) + "</span>" : "") +
      '<input id="answer-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" class="' + state.trim() + '"' +
      ' placeholder="' + esc(q.placeholder || "type here") + '" value="' + esc(it.resp || "") + '"' + (locked ? " readonly" : "") + ' aria-label="Your answer">' +
      (q.suffix ? '<span class="post">' + esc(q.suffix) + "</span>" : "") + "</label>";
  }

  function feedbackHtml(it) {
    var q = it.q;
    var right = it.ok
      ? ""
      : "<p>Right answer: " + correctHtml(q) + "</p>";
    return '<div class="feedback ' + (it.ok ? "ok" : "no") + '">' +
      '<p class="verdict">' + (it.ok ? "Passed" : "Failed") + "</p>" + right +
      '<p class="expl">' + inline(q.explanation) + "</p>" +
      '<p class="source">From: ' + esc(q.source) + "</p></div>";
  }

  function runHtml() {
    var it = run.items[run.i], q = it.q, n = run.items.length, last = run.i === n - 1;
    var exam = run.mode === "exam";
    var complete = isComplete(q, it.resp);
    var buttons;
    if (exam) {
      buttons = (run.i > 0 ? '<button type="button" class="ghost" data-action="prev">Previous</button>' : "") +
        (last ? '<button type="button" class="btn" data-action="finish">Finish exam</button>'
              : '<button type="button" class="btn" data-action="next">Next</button>');
    } else if (!it.checked) {
      buttons = '<button type="button" class="btn" data-action="check"' + (complete ? "" : " disabled") + ">Check</button>";
    } else {
      buttons = last
        ? '<button type="button" class="btn" data-action="finish" data-focus-after-check>See results</button>'
        : '<button type="button" class="btn" data-action="next" data-focus-after-check>Next question</button>';
    }
    var unanswered = run.items.filter(function (x) { return !isComplete(x.q, x.resp); }).length;
    var confirm = "";
    if (run.confirm === "finish") {
      confirm = '<div class="confirm" role="alert"><p>' + plural(unanswered, "question") + " still " + (unanswered === 1 ? "has" : "have") + " no answer and will count as wrong. Finish anyway?</p>" +
        '<div class="row"><button type="button" class="btn" data-action="finish-yes">Finish exam</button><button type="button" class="ghost" data-action="confirm-no">Keep going</button></div></div>';
    } else if (run.confirm === "leave") {
      confirm = '<div class="confirm" role="alert"><p>Leave the exam? Your answers in this exam will not be saved.</p>' +
        '<div class="row"><button type="button" class="btn" data-action="leave-yes">Leave exam</button><button type="button" class="ghost" data-action="confirm-no">Stay</button></div></div>';
    }
    var hint = q.type === "single" ? "Keys: 1–" + q.options.length + " to choose, Enter to " + (exam ? "continue" : "check")
      : q.type === "truefalse" ? "Keys: 1 = True, 2 = False, Enter to " + (exam ? "continue" : "check")
      : q.type === "order" ? "Keys: press the number of a step to place it next"
      : "Press Enter to " + (exam ? "continue" : "check");

    return '<section class="run" aria-label="' + esc(run.label) + '">' +
      '<div class="run-bar"><div class="run-meta">' +
      '<div class="run-label"><span class="eyebrow">' + esc(run.label) + '</span><span class="run-count">Question ' + (run.i + 1) + " of " + n + "</span></div>" +
      '<div class="row">' + (exam ? '<span class="timer' + (remaining() <= 60 ? " low" : "") + '" id="timer" role="timer" aria-label="Time left">' + fmtTime(remaining()) + "</span>" +
        '<button type="button" class="ghost" data-action="finish">Finish</button>' : "") +
      '<button type="button" class="ghost" data-action="exit">' + (exam ? "Leave" : "End run") + "</button></div></div>" +
      '<div class="pipeline"><ol aria-label="Progress">' + stagesHtml() + "</ol></div></div>" +
      confirm +
      '<article class="card" aria-labelledby="q-prompt">' +
      '<div class="q-meta"><span class="eyebrow">' + esc(topicById[q.topic].name) + '</span><span class="eyebrow">' + TYPE_LABEL[q.type] + '</span><span class="eyebrow">Week ' + q.week + "</span></div>" +
      '<p class="q-prompt" id="q-prompt">' + inline(q.prompt) + "</p>" +
      (q.code ? '<pre class="code"><code>' + esc(q.code) + "</code></pre>" : "") +
      answerAreaHtml(it) +
      '<div aria-live="polite">' + (it.checked && !exam ? feedbackHtml(it) : "") + "</div>" +
      '<div class="row end">' + buttons + "</div>" +
      "</article>" +
      (finePointer ? '<p class="muted source">' + hint + "</p>" : "") +
      "</section>";
  }

  function resultsHtml() {
    var items = run.items, n = items.length;
    var ok = items.filter(function (it) { return it.ok; }).length;
    var p = pct(ok, n);
    var exam = run.mode === "exam";
    var failedHere = items.filter(function (it) { return !it.ok; });

    var byTopic = TOPICS.map(function (t) {
      var ts = items.filter(function (it) { return it.q.topic === t.id; });
      if (!ts.length) return "";
      var tok = ts.filter(function (it) { return it.ok; }).length;
      return '<div class="cov-row"><div class="cov-name"><strong>' + esc(t.name) + "</strong></div>" +
        '<div class="cov-stat"><span>' + tok + "/" + ts.length + " · " + pct(tok, ts.length) + '%</span><div class="meter" aria-hidden="true"><span style="width:' + pct(tok, ts.length) + '%"></span></div></div>' +
        '<button type="button" class="ghost" data-action="practice-topic" data-value="' + t.id + '">Practice</button></div>';
    }).join("");

    var review = items.map(function (it, i) {
      var q = it.q;
      return "<details" + (it.ok ? "" : " open") + "><summary>" +
        '<span class="' + (it.ok ? "mark-ok" : "mark-no") + '" aria-label="' + (it.ok ? "Passed" : "Failed") + '">' + (it.ok ? "✓" : "×") + "</span>" +
        "<span>" + (i + 1) + ". " + inline(q.prompt) + "</span></summary>" +
        '<div class="body">' + (q.code ? '<pre class="code"><code>' + esc(q.code) + "</code></pre>" : "") +
        "<dl><dt>Your answer</dt><dd>" + answerHtml(q, it.resp) + "</dd>" +
        (it.ok ? "" : "<dt>Right answer</dt><dd>" + correctHtml(q) + "</dd>") + "</dl>" +
        '<p class="expl">' + inline(q.explanation) + '</p><p class="source">From: ' + esc(q.source) + "</p></div></details>";
    }).join("");

    var above = p >= PASS_MARK;
    return '<section class="results">' +
      '<div class="score"><p class="eyebrow">' + esc(run.label) + (run.timeUp ? " · time is up" : " · finished") + "</p>" +
      "<h1>" + ok + " of " + plural(n, "check") + " passed</h1>" +
      '<p class="score-num">' + p + "%</p>" +
      '<div class="passbar' + (above ? "" : " below") + '" role="img" aria-label="' + p + "% correct, pass mark " + PASS_MARK + '%">' +
      '<span style="width:' + p + '%"></span><i class="mark" style="left:' + PASS_MARK + '%"></i></div>' +
      '<div class="passbar-legend"><span>0%</span><span>Pass mark ' + PASS_MARK + "%</span><span>100%</span></div>" +
      (exam ? '<p><span class="status-pill ' + (above ? "ok" : "no") + '">' + (above ? "Above the pass mark" : "Below the pass mark") + "</span></p>" : "") +
      "</div>" +
      '<section class="panel" aria-labelledby="bt-h"><div class="panel-head"><h2 id="bt-h">By topic</h2></div><div class="coverage">' + byTopic + "</div></section>" +
      '<section class="review" aria-labelledby="rv-h"><h2 id="rv-h">Review</h2>' + review + "</section>" +
      '<div class="row">' + (failedHere.length ? '<button type="button" class="btn" data-action="rerun-these">Re-run the ' + plural(failedHere.length, "failed question") + "</button>" : "") +
      '<button type="button" class="ghost" data-action="home">Back to start</button></div>' +
      "</section>";
  }

  /* ---------- actions ---------- */
  function currentItem() { return run && ui.screen === "run" ? run.items[run.i] : null; }

  function check() {
    var it = currentItem();
    if (!it || run.mode === "exam" || it.checked || !isComplete(it.q, it.resp)) return;
    it.checked = true;
    it.ok = grade(it.q, it.resp);
    record(it.q.id, it.ok);
    saveStore();
    sendAttempts([rowFor(it)]);
    render(true);
  }
  function next() {
    if (run.i < run.items.length - 1) { run.i += 1; run.confirm = null; render(true); }
  }
  function primary() {
    var it = currentItem();
    if (!it) return;
    if (run.mode === "exam") {
      if (run.i === run.items.length - 1) requestFinish(); else next();
    } else if (!it.checked) check();
    else if (run.i === run.items.length - 1) finishRun();
    else next();
  }
  function requestFinish() {
    if (run.mode === "exam") {
      var unanswered = run.items.filter(function (x) { return !isComplete(x.q, x.resp); }).length;
      if (unanswered) { run.confirm = "finish"; render(false); return; }
    }
    finishRun();
  }
  function goHome() {
    stopTimer();
    run = null;
    ui.screen = "home";
    ui.confirmReset = false;
    render(true);
  }
  function exitRun() {
    if (!run || ui.screen !== "run") return goHome();
    if (run.mode === "exam") { run.confirm = "leave"; render(false); return; }
    finishRun(); // practice: show results for the checked questions (or go home if none)
  }

  function applyTheme(initial) {
    var root = document.documentElement;
    // "auto" on first load leaves any theme the host page already set untouched
    if (store.theme === "auto") { if (!initial) root.removeAttribute("data-theme"); }
    else root.setAttribute("data-theme", store.theme);
    var b = document.getElementById("theme-toggle");
    if (b) b.textContent = "Theme: " + store.theme.charAt(0).toUpperCase() + store.theme.slice(1);
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var a = el.getAttribute("data-action"), v = el.getAttribute("data-value");
    var it = currentItem();
    switch (a) {
      case "home": e.preventDefault(); if (ui.screen === "run") exitRun(); else goHome(); break;
      case "theme":
        store.theme = { auto: "light", light: "dark", dark: "auto" }[store.theme] || "auto";
        saveStore(); applyTheme(); break;
      case "tab":
        ui.tab = v;
        ui.scope = v === "weeks" ? { kind: "week", value: firstOpenWeek() } : { kind: "topic", value: TOPICS[0].id };
        render(false); break;
      case "scope": ui.scope = { kind: el.getAttribute("data-kind"), value: el.getAttribute("data-kind") === "week" ? Number(v) : v }; render(false); break;
      case "start-practice": var s = pickScope(ui.scope); startRun("practice", s.label, s.questions); break;
      case "practice-topic": var st = pickScope({ kind: "topic", value: v }); startRun("practice", st.label, st.questions); break;
      case "exam-size": ui.examSize = Number(v); render(false); break;
      case "start-exam": startRun("exam", "Exam simulation", pickExam(ui.examSize)); break;
      case "start-rerun": startRun("rerun", "Re-run failed", shuffle(failedIds().map(function (id) { return byId[id]; }))); break;
      case "rerun-these":
        startRun("rerun", "Re-run failed", shuffle(run.items.filter(function (x) { return !x.ok; }).map(function (x) { return x.q; }))); break;
      case "reset": ui.confirmReset = true; render(false); break;
      case "reset-no": ui.confirmReset = false; render(false); break;
      case "reset-yes": store.stats = {}; saveStore(); ui.confirmReset = false; ui.scope = { kind: "week", value: firstOpenWeek() }; ui.tab = "weeks"; render(true); break;
      case "pick": if (it && !(it.checked && run.mode !== "exam")) { it.resp = Number(v); render(false); } break;
      case "pick-tf": if (it && !(it.checked && run.mode !== "exam")) { it.resp = v === "true"; render(false); } break;
      case "place": if (it && !it.checked) { it.resp.push(Number(v)); render(false); } break;
      case "unplace": if (it && !(it.checked && run.mode !== "exam")) { it.resp.splice(Number(v), 1); render(false); } break;
      case "check": check(); break;
      case "next": next(); break;
      case "prev": if (run.i > 0) { run.i -= 1; run.confirm = null; render(true); } break;
      case "goto": run.i = Number(v); run.confirm = null; render(true); break;
      case "finish": requestFinish(); break;
      case "finish-yes": finishRun(); break;
      case "confirm-no": run.confirm = null; render(false); break;
      case "exit": exitRun(); break;
      case "share-toggle": store.share = store.share === false; saveStore(); renderShareNote(); break;
      case "leave-yes": goHome(); break;
    }
  });

  app.addEventListener("input", function (e) {
    if (e.target.id !== "answer-input") return;
    var it = currentItem();
    if (!it || (it.checked && run.mode !== "exam")) return;
    it.resp = e.target.value;
    var btn = app.querySelector('[data-action="check"]');
    if (btn) btn.disabled = !isComplete(it.q, it.resp);
    if (run.mode === "exam") {
      var stages = app.querySelectorAll(".stage");
      if (stages[run.i]) stages[run.i].classList.toggle("done", isComplete(it.q, it.resp));
    }
  });

  document.addEventListener("keydown", function (e) {
    if (ui.screen !== "run" || e.altKey || e.ctrlKey || e.metaKey) return;
    var it = currentItem();
    if (!it) return;
    var inField = e.target && e.target.id === "answer-input";
    if (e.key === "Enter") {
      var btn = !inField && e.target.closest ? e.target.closest("button") : null;
      var answerBtn = btn && /^(pick|pick-tf|place|unplace)$/.test(btn.getAttribute("data-action") || "");
      if (btn && !answerBtn) return; // let the focused button act; on an answer option, Enter checks
      e.preventDefault();
      primary();
      return;
    }
    if (inField || run.confirm) return;
    var locked = it.checked && run.mode !== "exam";
    var d = parseInt(e.key, 10);
    if (isNaN(d) || d < 1 || locked) return;
    var q = it.q;
    if (q.type === "single" && d <= q.options.length) { it.resp = it.view.optOrder[d - 1]; render(false); }
    else if (q.type === "truefalse" && d <= 2) { it.resp = d === 1; render(false); }
    else if (q.type === "order") {
      var pool = it.view.pool.filter(function (ii) { return it.resp.indexOf(ii) === -1; });
      if (d <= pool.length) { it.resp.push(pool[d - 1]); render(false); }
    }
  });

  applyTheme(true);
  renderShareNote();
  render(false);
})();
