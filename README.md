# Roundtrip

Weekdays out, safely home.

Roundtrip is an entry for the Hacktoberfest 2026 DEV Challenge.

Roundtrip plans a few outings each week for parents visiting their grown child abroad: real places and real people, in their own language, on trips they can manage alone and come home from safely. It was designed with a fictional Telugu-speaking household, Sarala and Venkat in Fremont, California, so every result built on them is labeled synthetic.

## What's inside

- **Parents' app** (`/parents`): an installable, offline web app with the day's ticket, directions that say when to press stop, a card to show the driver, phrases to practice, "I'm lost", a private diary and a memory book.
- **Dashboard** (`/plan`): the adult child's week board with ranked suggestions, reasons, route previews, approvals, safety and privacy settings.
- **Open models**: Gemma 4 plans and judges, TabPFN ranks, a Tinker-tuned Qwen writes Telugu cards, open speech models give every card a voice, and Temporal keeps safety timers durable.

## Set up

1. Open the repo in a GitHub Codespace (Code, Codespaces, New codespace). The devcontainer installs Node, pnpm, Python with uv, the Temporal CLI and Claude Code.
2. Add your keys as Codespaces secrets, or in a local `.env`. `.env.example` lists every name.
3. Install and check:
   ```bash
   pnpm install && pnpm test
   ```
4. Load the demo households into MongoDB Atlas: `pnpm seed`.
5. Run the web app: `pnpm dev`, then open http://localhost:3000.
6. Python tests: `uv run pytest` inside `ranker/`, `speech/` and `finetune/`.

Plan and design: [docs/plan.md](docs/plan.md), [docs/brand.md](docs/brand.md), [docs/build-plan.md](docs/build-plan.md). Where data goes: [docs/privacy-table.md](docs/privacy-table.md).

## License

MIT. See [LICENSE](LICENSE).

Any commits made after the submission deadline will be listed here.
