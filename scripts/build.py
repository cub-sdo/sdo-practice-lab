#!/usr/bin/env python3
"""Validate the question bank and bundle it for the website.

    python scripts/build.py                     # validate + write site/questions.js
    python scripts/build.py --check             # validate only (used on pull requests)
    python scripts/build.py --preview out.html  # also write a single-file preview page

Only the Python standard library is used, so it runs anywhere (and in CI) without installs.
"""
import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QDIR = ROOT / "questions"
SITE = ROOT / "site"

TYPES = {"single", "truefalse", "order", "input"}
COMMON = {"id", "type", "topic", "prompt", "code", "explanation", "source"}
ALLOWED = {
    "single": COMMON | {"options", "answer", "codeOptions"},
    "truefalse": COMMON | {"answer"},
    "order": COMMON | {"items", "codeItems"},
    "input": COMMON | {"accept", "prefix", "suffix", "placeholder"},
}
ID_RE = re.compile(r"^w(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$")
IN_CI = os.environ.get("GITHUB_ACTIONS") == "true"

errors = []


def err(path, msg):
    rel = path.relative_to(ROOT)
    errors.append(f"{rel}: {msg}")
    if IN_CI:
        print(f"::error file={rel}::{msg}")


def nonempty_str(v, limit=None):
    return isinstance(v, str) and v.strip() != "" and (limit is None or len(v) <= limit)


def check_question(path, week, q, topic_ids, seen):
    qid = q.get("id", "?")
    where = f"question '{qid}'"
    if not isinstance(q, dict):
        return err(path, f"{where} is not an object")
    m = ID_RE.match(str(q.get("id", "")))
    if not m:
        err(path, f"{where}: id must look like 'w{week}-short-name' (lowercase, digits, dashes)")
    elif int(m.group(1)) != week:
        err(path, f"{where}: id must start with 'w{week}-' because it is in week {week}")
    if qid in seen:
        err(path, f"{where}: duplicate id (also in {seen[qid]})")
    seen[qid] = path.name

    t = q.get("type")
    if t not in TYPES:
        return err(path, f"{where}: type must be one of {sorted(TYPES)}")
    unknown = set(q) - ALLOWED[t]
    if unknown:
        err(path, f"{where}: unknown field(s) {sorted(unknown)} for type '{t}'")
    if q.get("topic") not in topic_ids:
        err(path, f"{where}: topic must be one of {sorted(topic_ids)}")
    if not nonempty_str(q.get("prompt"), 400):
        err(path, f"{where}: prompt is required (max 400 characters)")
    if not nonempty_str(q.get("explanation"), 600):
        err(path, f"{where}: explanation is required (max 600 characters) - say WHY the answer is right")
    if not nonempty_str(q.get("source"), 200):
        err(path, f"{where}: source is required, e.g. \"Week 3 Lecture 1 · 'Undoing changes'\"")
    if "code" in q and not nonempty_str(q["code"], 600):
        err(path, f"{where}: code must be a non-empty string")

    if t == "single":
        opts = q.get("options")
        if not (isinstance(opts, list) and 2 <= len(opts) <= 6 and all(nonempty_str(o, 140) for o in opts)):
            err(path, f"{where}: options must be a list of 2-6 non-empty strings (max 140 characters each)")
        elif len(set(o.strip().lower() for o in opts)) != len(opts):
            err(path, f"{where}: options must all be different")
        a = q.get("answer")
        if not (isinstance(a, int) and not isinstance(a, bool) and isinstance(opts, list) and 0 <= a < len(opts)):
            err(path, f"{where}: answer must be the 0-based index of the correct option")
    elif t == "truefalse":
        if not isinstance(q.get("answer"), bool):
            err(path, f"{where}: answer must be true or false")
    elif t == "order":
        items = q.get("items")
        if not (isinstance(items, list) and 3 <= len(items) <= 8 and all(nonempty_str(i, 120) for i in items)):
            err(path, f"{where}: items must be a list of 3-8 strings, written in the CORRECT order")
        elif len(set(items)) != len(items):
            err(path, f"{where}: items must all be different")
    elif t == "input":
        acc = q.get("accept")
        if not (isinstance(acc, list) and acc and all(nonempty_str(a, 160) for a in acc)):
            err(path, f"{where}: accept must be a list with at least one accepted answer")
        for k in ("prefix", "suffix", "placeholder"):
            if k in q and not nonempty_str(q[k], 60):
                err(path, f"{where}: {k} must be a short non-empty string")
    for k in ("codeOptions", "codeItems"):
        if k in q and not isinstance(q[k], bool):
            err(path, f"{where}: {k} must be true or false")


def load():
    tpath = QDIR / "topics.json"
    try:
        topics = json.loads(tpath.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        err(tpath, f"cannot read topics: {e}")
        return None
    topic_ids = {t.get("id") for t in topics}
    weeks, seen = [], {}
    files = sorted(QDIR.glob("week-*.json"))
    if not files:
        err(QDIR, "no week-*.json files found")
    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(path, f"invalid JSON at line {e.lineno}, column {e.colno}: {e.msg}")
            continue
        m = re.match(r"week-(\d+)\.json$", path.name)
        week = int(m.group(1)) if m else None
        if data.get("week") != week:
            err(path, f"'week' must be {week} to match the file name")
        if not nonempty_str(data.get("title"), 80):
            err(path, "'title' is required (max 80 characters)")
        qs = data.get("questions")
        if not isinstance(qs, list) or not qs:
            err(path, "'questions' must be a non-empty list")
            continue
        for q in qs:
            check_question(path, week, q, topic_ids, seen)
        weeks.append({"week": week, "title": data.get("title"), "questions": qs})
    return {"topics": topics, "weeks": weeks}


def write_bundle(data):
    n = sum(len(w["questions"]) for w in data["weeks"])
    js = "/* Generated by scripts/build.py from questions/*.json - do not edit by hand. */\n"
    js += "window.SDO_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (SITE / "questions.js").write_text(js, encoding="utf-8")
    print(f"OK: {n} questions in {len(data['weeks'])} weeks -> site/questions.js")


def write_preview(out):
    """Single-file page for previews: inline CSS (fonts as data URIs) and JS, body content only."""
    html = (SITE / "index.html").read_text(encoding="utf-8")
    title = re.search(r"<title>.*?</title>", html, re.S).group(0)
    body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
    css = (SITE / "style.css").read_text(encoding="utf-8")

    def font_uri(m):
        b = (SITE / m.group(1)).read_bytes()
        return "url(data:font/woff2;base64," + base64.b64encode(b).decode() + ")"

    css = re.sub(r'url\("?(fonts/[^")]+\.woff2)"?\)', font_uri, css)

    def inline_script(m):
        return "<script>\n" + (SITE / m.group(1)).read_text(encoding="utf-8") + "\n</script>"

    body = re.sub(r'<script src="([^"]+)"></script>', inline_script, body)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(f"{title}\n<style>\n{css}\n</style>\n{body.strip()}\n", encoding="utf-8")
    print(f"OK: preview -> {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate only, write nothing")
    ap.add_argument("--preview", metavar="FILE", help="also write a single-file preview page")
    args = ap.parse_args()

    data = load()
    if errors:
        print(f"\n{len(errors)} problem(s) found:", file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        sys.exit(1)
    if args.check:
        n = sum(len(w["questions"]) for w in data["weeks"])
        print(f"OK: {n} questions are valid")
        return
    write_bundle(data)
    if args.preview:
        write_preview(args.preview)


if __name__ == "__main__":
    main()
