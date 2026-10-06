# Skipped

What was skipped or cut, and why. Nothing here ships as a placeholder.

- **The setting to use the diary for planning.** The plan has it off by default, changed only by the parent. The off state needs no code (the planner never reads the diary), and the on state would mean passing something drawn from a diary to the planner, which this demo doesn't do with synthetic entries either. Left out rather than shown as a switch that does nothing.
- **Indic Parler-TTS and IndicConformer for Telugu (M5 speech).** Both AI4Bharat repositories are gated, and the builder's Hugging Face account isn't on their access lists (403 on 6 October 2026). Telugu uses the plan's alternatives, MMS-TTS Telugu for speaking and MMS speech recognition (facebook/mms-1b-all) for listening. speech/ tries the AI4Bharat models first and switches to them by itself once access works, re-voicing the Telugu clips; Indic Parler-TTS also needs the parler-tts package in an environment of its own (it pins transformers 4.46.1; docs/research/speech.md). The fix is in docs/blocked.md.
- **Day moves made on the dashboard don't reach weekPlan.** "Set up the week" sends the approvals and swaps; an outing moved to another day keeps its planned day in the workflow, so its safety timer and reminder use that day. The phones show the moved day. It would mean carrying the new day into the proposal's times.
