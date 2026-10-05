# Decisions

Each entry: the decision, then the reason in one line. Newest last.

## Setup

1. **The plan lives at docs/plan.md and the brand files at brand/.** CLAUDE.md, docs/brand.md and the playbook all point to those paths; the files arrived as docs/roundtrip-plan.md and "brand assets/".
2. **CLAUDE.md was created from playbook section 2.** It didn't exist yet. Changes from the playbook text: where development runs, the .env line the builder asked for, the outbound registry path, and a writing section.
3. **"pstack" means the gstack skill suite.** No skill with that name is installed; gstack is the installed engineering suite (plan reviews, code review, QA). Superpowers and Ponytail aren't installed either.
4. **TypeScript is pinned to 6.0.3.** TypeScript 7 is the new native compiler, and Next.js type checking and the test tooling still use the JavaScript compiler API.
5. **Code is written and tested in this checkout; speech models and the Temporal worker run in the Codespace.** This machine is Windows on ARM64, where the speech libraries and Temporal's native worker are unreliable or missing; the Codespace is Linux x64 with 16 GB.
6. **Shared code goes in packages/core.** The web app, the agent and the workflows all need the same schemas, country data, outbound registry and diary crypto, and plan section 14 has no shared package.
7. **Email is sent only when DEMO_ALERT_EMAIL is a valid address.** The current value doesn't pass a format check; the code checks it at runtime, sends nothing otherwise, and logs that it skipped.
8. **Commits carry no co-author trailer from here on.** The builder's goal asks for none.
