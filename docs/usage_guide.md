# init-ai Usage Guide

This guide is for beginners who want to go from an `init-ai` plan export to a working codebase with modern agentic AI tools.

## What You Get From Export

When you export a project, the app produces a ZIP bundle with planning artifacts that are designed to be useful both for humans and for coding agents.

Typical contents include:

- `README.md` — overview of the planned project
- `PRD.md` — product requirements document
- `task.md` — implementation checklist
- `prompt_context.txt` — compact bootstrap context for AI tools
- `docs/architecture.md`
- `docs/api_spec.md`
- `docs/database_schema.md`
- `docs/workflow.md`
- `docs/diagrams.md`
- `docs/effort_estimate.md`
- `.cursorrules`
- `.agent/rules.md`
- `.github/copilot-instructions.md`
- `.init-ai/project.json`
- `.gitignore`

The ZIP is not just documentation. It is a handoff package for implementation.

## Recommended Workflow

1. Create or clarify the project in the app.
2. Generate the full plan.
3. Review the sections and edit anything that is obviously wrong or incomplete.
4. Export the ZIP.
5. Unzip it into a new implementation repository or into an empty working folder.
6. Open that folder in your coding tool.
7. Ask the tool to implement the project incrementally from `task.md`, while keeping `PRD.md`, `prompt_context.txt`, and the `docs/` folder as active context.

The best results usually come from treating the export as the source of truth for the first implementation pass.

## Using the ZIP With Agentic AI Tools

The exported ZIP works well with tools that can read repository files, maintain working memory, and make code changes over multiple steps.

Examples include:

- VS Code with GitHub Copilot
- AntiGravity
- OpenCode
- Cursor-style local coding agents
- Other OpenAI-compatible or Anthropic-compatible coding agents

The tool name matters less than the workflow. What matters is that the tool can:

- read the exported files
- follow repository instructions
- create and edit source files
- run tests or commands
- keep context across multiple actions

## VS Code + Copilot Workflow

Suggested flow:

1. Extract the ZIP into a fresh workspace.
2. Open the folder in VS Code.
3. Start with `README.md`, `PRD.md`, and `task.md` open.
4. Ask Copilot to scaffold the project from the plan.
5. Then move task-by-task through `task.md`.

Useful prompts:

- `Read PRD.md, prompt_context.txt, and docs/architecture.md. Scaffold the project structure.`
- `Implement the first unchecked task from task.md and update the checklist when done.`
- `Use docs/api_spec.md and docs/database_schema.md to create backend routes and schema files.`
- `Follow .github/copilot-instructions.md and .cursorrules while making changes.`

Why this works:

- `prompt_context.txt` gives the agent a concise bootstrap summary
- `task.md` provides execution order
- the `docs/` folder supplies detailed design constraints
- rule files help keep implementation behavior aligned with the plan

## AntiGravity, OpenCode, and Similar Tools

These tools usually perform best when you give them a small number of high-signal files instead of a broad request.

Recommended order of importance:

1. `prompt_context.txt`
2. `task.md`
3. `PRD.md`
4. `docs/architecture.md`
5. `docs/api_spec.md`
6. `docs/database_schema.md`

Suggested prompt pattern:

1. `Read prompt_context.txt and summarize the intended system before coding.`
2. `Read task.md and implement only the first milestone.`
3. `Use docs/architecture.md and docs/database_schema.md as hard constraints.`
4. `If anything is ambiguous, propose the smallest viable interpretation and continue.`

This keeps the agent grounded and reduces drift.

## Extending the Generated Project

The export is a starting point, not a frozen spec. Agentic tools can improve it in useful ways.

Common extensions:

- adding testing strategy and test scaffolding
- improving the task breakdown in `task.md`
- turning diagrams into implementation-ready components
- creating CI/CD setup from `docs/workflow.md`
- adding repository-specific instructions or agent skills
- generating architecture decision records or onboarding docs

Examples of good follow-up tasks:

- `Turn task.md into milestone-based GitHub issues.`
- `Expand docs/api_spec.md into concrete route handlers and validation schemas.`
- `Translate docs/database_schema.md into migrations and ORM models.`
- `Create a /skills or .agent workflow that teaches the coding agent this project’s conventions.`

## Adding Skills and Agent Structure

If your coding environment supports skills, instruction files, or agent-specific configuration, the export gives you a clean place to start.

Examples:

- Copy project rules into agent instruction files.
- Turn repeated implementation patterns into reusable skills.
- Add repository-level guidance for testing, deployment, and code review.
- Extend `.agent/rules.md` or `.github/copilot-instructions.md` with repo-specific constraints.

Practical pattern:

1. Keep the generated plan as your baseline.
2. Let the coding agent propose improvements.
3. Save stable patterns into instruction files.
4. Reuse those instructions on future iterations.

This is how a one-time export becomes a durable implementation workflow.

## Real-World Workflow Example

One realistic pattern looks like this:

1. Product owner or solo developer uses `init-ai` to clarify the idea.
2. The app generates the plan and exports the ZIP.
3. The ZIP is extracted into a new repo.
4. A coding agent scaffolds the app from the docs and tasks.
5. During implementation, the agent pushes commits and context back into `init-ai` through the API.
6. The developer uses the app as a planning and progress dashboard while the coding tool handles execution.

This keeps planning and implementation connected instead of treating the plan as a dead document.

## How External Agents Can Talk Back to init-ai

The app exposes simple APIs that external tools can use to record progress and feed implementation context back into the planning workspace.

### Create a project

`POST /api/projects`

Example body:

```json
{
  "name": "Task Management App",
  "description": "Implementation workspace for exported init-ai plan"
}
```

### Export a project ZIP

`GET /api/projects/:id/export`

Use this when an external workflow wants to fetch the latest plan bundle automatically.

### Record a commit or revision

`POST /api/projects/:id/commit`

Required fields:

- `version`
- `message`
- `author`

Optional fields:

- `diff`
- `snapshot`
- `parentId`

Example body:

```json
{
  "version": "v0.2.0",
  "message": "Implemented authentication routes and session storage",
  "author": "agentic-tool",
  "diff": "@@ -1,0 +1,12 @@ ..."
}
```

This is useful when your coding agent completes a milestone and you want that revision history visible in the app.

### Push implementation context

`POST /api/projects/:id/context`

Required fields:

- `source`
- `type`
- `content`

Optional field:

- `metadata`

Example body:

```json
{
  "source": "opencode",
  "type": "milestone",
  "content": "Authentication is complete. Next step is task CRUD with optimistic UI.",
  "metadata": {
    "branch": "feature/auth",
    "status": "done"
  }
}
```

This helps the app stay useful after planning by showing what implementation tools have done.

## Best Practices For Agentic Workflows

- Keep the exported files in the repository root so the agent finds them immediately.
- Ask the coding tool to read the rules files before generating code.
- Implement one milestone at a time instead of asking for the whole product at once.
- Push commits and context updates back into the app if you want planning visibility during implementation.
- Treat `task.md` as a living checklist and update it when reality changes.

## When To Re-Export

Re-export when:

- requirements changed significantly
- architecture changed materially
- the task plan was reorganized
- you want refreshed instruction files for agents

Do not re-export for every small code change. Use the app as the planning layer and use commits/context updates to track implementation progress between major plan revisions.