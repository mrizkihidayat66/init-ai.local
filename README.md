# init-ai.local

AI-assisted project planning workspace that turns requirements conversations into an editable, exportable implementation plan.

## What It Does

- Guided clarification chat with requirement coverage tracking (Requirements Radar)
- Generates a full multi-section engineering plan from collected requirements
- Renders markdown and Mermaid diagrams directly in the plan view
- Supports section-by-section editing, plan snapshots, and restore history
- Exports project artifacts as a ZIP bundle for downstream coding tools
- Works with cloud and local model providers

## Quick Start

### Prerequisites

- Node.js 20+
- npm (or bun)
- SQLite (used via Prisma)

### Install and Run

```bash
npm install
npm run setup:env
npm run setup:doctor
npm run db:migrate
npm run dev
```

Open http://localhost:3000 in your browser.

## Configure AI Provider

Use the in-app Settings dialog to choose provider, model, API key, base URL, and temperature.

Supported options include:

- Cloud: Anthropic, AgentRouter, OpenAI-compatible endpoints
- Local: Ollama, LM Studio

For full provider setup instructions, see [docs/setup_guide.md](docs/setup_guide.md).

## Latest Demo

The current demo artifacts live in the repository under `demos/`.

- Main recording: [demos/test-pipeline-autopilot.webm](demos/test-pipeline-autopilot.webm)
- Demo report: [demos/report.html](demos/report.html)
- Example screenshots:
	- [demos/01-dashboard.png](demos/01-dashboard.png)
	- [demos/proj-chat-complete.png](demos/proj-chat-complete.png)
	- [demos/proj-commits-tab.png](demos/proj-commits-tab.png)
	- [demos/proj-context-tab.png](demos/proj-context-tab.png)
	- [demos/plan-1-product-requirements.png](demos/plan-1-product-requirements.png)
	- [demos/plan-10-effort-estimate.png](demos/plan-10-effort-estimate.png)

## How It Works

1. Create a project from the dashboard.
2. Complete the clarification conversation until requirements are locked.
3. Generate the plan (section-by-section AI generation).
4. Review, edit, render diagrams, and export as ZIP.

## Beginner Usage

- Start with the in-app clarification flow until the app says the requirements are complete.
- Generate the plan and review the plan sections before exporting.
- Export the ZIP bundle and open it in your AI coding tool of choice.
- Use the generated prompts, rules, docs, and task list as the starting point for implementation.

If you are new to agentic coding workflows, see [docs/usage_guide.md](docs/usage_guide.md).

## Project Structure

- `src/app/` - Next.js app routes, pages, and API endpoints
- `src/components/` - reusable UI components and Mermaid renderer
- `src/lib/ai/` - provider wiring, prompts, and schema helpers
- `src/lib/export/` - ZIP export builder
- `prisma/` - schema and migrations
- `docs/` - setup and usage documentation

## Development Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:clean
npm run db:reset
npm run db:studio
npm run setup:env
npm run setup:api-key -- OPENAI_API_KEY <your-key>
npm run setup:doctor
npm run setup
```

## Setup Scripts (Commit-Ready)

- `npm run setup:env` creates `.env` from `.env.example` when missing.
- `npm run setup:api-key -- <KEY_NAME> <VALUE>` updates provider keys in `.env`.
- `npm run setup:doctor` validates `DATABASE_URL` and checks whether at least one provider key is present.
- `npm run setup` runs environment setup + validation + Prisma client generation.
- `npm run db:clean` removes the SQLite DB file from `DATABASE_URL`.
- `npm run db:reset` performs a clean DB rebuild (`db:clean` + `db:push` + `db:generate`).

## Notes

- Plan generation stores results in SQLite through Prisma.
- Mermaid blocks are normalized and validated before rendering.
- Export includes docs and rules files for AI coding assistants.
