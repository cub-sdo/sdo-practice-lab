# Adding or fixing questions

Questions live in `questions/week-XX.json`, one file per course week. Every change goes
through a pull request: the CI check validates the file, and the TA reviews the content
before it is merged and deployed.

## Steps

1. Fork the repository (or create a branch if you have access): `git checkout -b question/w3-git-tags`
2. Add your question to the right `questions/week-XX.json` file.
3. Check it locally: `python3 scripts/build.py --check`
4. Commit, push and open a pull request. Fill in the checklist in the template.

## Rules for a good question

- It must come from the course materials (a lecture, tutorial or group presentation).
  Put the exact place in `source`, e.g. `"Week 3 Lecture 1 · 'Undoing changes'"`.
- The `explanation` says **why** the answer is right, in one or two sentences.
- Wrong options should be plausible mistakes, not jokes.
- English, short and unambiguous. Use backticks for commands: `` `git stash` ``.
- `id` = `w<week>-<a-few-words>`, lowercase with dashes, unique.
- `topic` is one of the ids in `questions/topics.json`.

## Formats

Fields every question has: `id`, `type`, `topic`, `prompt`, `explanation`, `source`.
Optional for all types: `code` (shown as a code block under the prompt).

### `single` – choose one

```json
{
  "id": "w3-undo-shared-commit",
  "type": "single",
  "topic": "git",
  "prompt": "Safely undo a commit on a shared branch without rewriting history:",
  "options": ["git reset --hard", "git revert", "git push --force", "git stash"],
  "answer": 1,
  "codeOptions": true,
  "explanation": "revert adds a new commit that undoes the old one; reset rewrites history.",
  "source": "Week 3 Lecture 1 · 'Undoing changes'"
}
```

`answer` is the 0-based index of the correct option (here: `git revert`). The app shuffles the
options, so the position does not matter. `codeOptions: true` shows the options in a code font.

### `truefalse`

```json
{ "id": "w4-layers-talk-directly", "type": "truefalse", "topic": "architecture",
  "prompt": "In a layered architecture any layer may talk directly to any other layer.",
  "answer": false, "explanation": "...", "source": "..." }
```

### `order` – put in order

Write `items` in the **correct** order. The app shuffles them for the student.

```json
{ "id": "w6-dockerfile-order", "type": "order", "topic": "containers",
  "prompt": "Put the Task 1 Dockerfile in order.",
  "items": ["FROM gcc:latest", "WORKDIR /app", "COPY hello.c .", "RUN gcc -o hello hello.c", "CMD [\"./hello\"]"],
  "codeItems": true, "explanation": "...", "source": "..." }
```

### `input` – type the answer

`accept` lists every answer that should count as correct. Comparison ignores case, extra
spaces, a leading `$` and a trailing `;`.

```json
{ "id": "w6-run-interactive", "type": "input", "topic": "containers",
  "prompt": "Run the `converter` image so that you can type into it.",
  "accept": ["docker run -it converter", "docker run -ti converter"],
  "prefix": "$", "explanation": "...", "source": "..." }
```

Optional: `prefix` / `suffix` (text shown before/after the field), `placeholder`.
