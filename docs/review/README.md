# Telugu review kit

Every Telugu text a parent sees in the demo, with the clip that reads it, for a native Telugu speaker to check. Nobody has reviewed these texts yet: the answer columns are empty until a reviewer fills them.

## What is here

- `telugu-review.csv`: one row per Telugu text. Columns: `id`, `source` (the file it comes from), `where` (its place in that file), `text`, `clip` (the audio file that reads it, empty when there is none), `heard_with` (for a phrase's Telugu meaning or spelling, the local-language phrase the clip says), then the reviewer's columns `natural`, `correct`, `fix` and `notes`.
- `index.html`: the same rows as a page that plays each clip, with a yes / no / not sure choice for "natural?" and "correct?", a box for the fix and a box for notes.

The texts come from the demo weeks (`data/demo/weeks/*.json`: cards, route steps, phrase meanings and Telugu spellings, names for people and feelings), the synthetic diary (`data/persona/diary.json`) and the app's Telugu words (`apps/web/messages/te.json`). All of it is synthetic: fictional households, no real family data.

## For the reviewer

1. Open `index.html` in a browser from inside a copy of the repository (the clips are read from `apps/web/public/audio/`). Or open `telugu-review.csv` in a spreadsheet and play the clips from that folder.
2. For each row, read the text and play the clip if there is one.
   - **Natural?** Would a Telugu-speaking parent say it this way, and does the voice sound like a person speaking it?
   - **Correct?** Is the spelling, grammar and meaning right? Is the clip saying the same words as the text?
   - **Fix:** what it should say instead, in Telugu. Leave it empty if it is fine.
   - **Notes:** anything else, in any language (a word the voice says wrongly, a phrase that is too formal).
3. In the page, press **Download my answers**. It saves `telugu-review-answers.csv`. In a spreadsheet, save as CSV (UTF-8).
4. Send the file back to the project owner.

You don't need to answer every row. A partial answer is useful.

## How fixes come back

1. Put the returned file at `docs/review/answers/<reviewer>-<date>.csv` (never edit `telugu-review.csv` by hand: it is regenerated).
2. For each row with a fix, change the text at `source` / `where`. UI strings go in `apps/web/messages/te.json`. Card texts in the demo weeks come from the card writer, so a pattern that recurs (a wrong word, a too-formal ending) also goes into the card writer's rubric or training notes, not only into one card.
3. A changed text gets a new clip key, so the next speech run re-voices it: run the Speech workflow (Actions, Speech, `lang=te`) and copy its artifact in as described in `docs/speech-results.md`.
4. Regenerate this kit: `cd speech && uv run python -m speech.review`.
5. Record what changed, and how many rows were reviewed, in `docs/decisions.md`. Report the reviewer's answers as they are; don't summarize them as better than they were.
