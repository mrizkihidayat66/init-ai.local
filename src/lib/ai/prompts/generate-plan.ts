/**
 * Section-by-section plan generation prompts.
 * Each section gets its own focused call so small local models can handle it
 * while large cloud models produce excellent output with the same code path.
 */

export const PLAN_SECTIONS = [
  'prd',
  'architecture',
  'taskList',
  'apiSpec',
  'dbSchema',
  'rules',
  'workflow',
  'diagrams',
  'promptContext',
  'effortEstimate',
] as const;

export type PlanSectionKey = (typeof PLAN_SECTIONS)[number];

const SECTION_PROMPTS: Record<PlanSectionKey, { title: string; instruction: string }> = {
  prd: {
    title: 'Product Requirements Document',
    instruction: `Write a comprehensive Product Requirements Document (PRD) covering:
- Problem statement and goals
- Target audience and personas
- User stories with acceptance criteria
- Feature list (MVP vs. future)
- Non-functional requirements (performance, security, accessibility)
- Success metrics / KPIs`,
  },
  architecture: {
    title: 'Architecture',
    instruction: `Write a thorough Architecture document covering:
- High-level system overview
- Technology stack with justification
- Component diagram description
- Data flow description
- Deployment topology
- Security considerations`,
  },
  taskList: {
    title: 'Implementation Tasks',
    instruction: `Write a detailed Implementation Task List organized as Epics > Stories > Sub-tasks.
- Each task should have a clear, actionable description
- Use markdown checkboxes: "- [ ] Task description"
- Include estimated complexity (S/M/L)
- Order tasks by dependency`,
  },
  apiSpec: {
    title: 'API Specification',
    instruction: `Write an API Specification covering:
- REST endpoints with method, path, request body, response
- Authentication requirements per endpoint
- Error responses
- Rate limiting considerations`,
  },
  dbSchema: {
    title: 'Database Schema',
    instruction: `Write a Database Schema document covering:
- Entity descriptions with fields and types
- Relationships (1:1, 1:N, M:N)
- Indexes and constraints
- Include a Mermaid ERD diagram

═══ ERD SYNTAX RULES — FOLLOW EXACTLY ═══

The ERD MUST use this exact structure (copy the pattern, adapt the content):
\`\`\`mermaid
erDiagram
    User {
        int id
        string name
        string email
    }
    Order {
        int id
        int userId
        string status
    }
    OrderItem {
        int id
        int orderId
        int productId
        int quantity
    }
    User ||--o{ Order : "places"
    Order ||--o{ OrderItem : "contains"
\`\`\`

Rules (any violation causes a render failure):
- First line inside the fence MUST be exactly: \`erDiagram\`
- Entity names MUST be PascalCase, NO spaces (UserAccount ✓, User Account ✗)
- Attribute format: \`type fieldName\` — one per line inside braces
- Every relationship line MUST have a quoted label with double quotes
- Relationship cardinality markers: \`||\` (exactly one), \`o|\` (zero or one), \`}o\` (zero or many), \`}|\` (one or many)
- Include at least 3 entities with real relationships`,
  },
  rules: {
    title: 'Agent Rules',
    instruction: `Write Agent Rules / coding directives covering:
- Coding standards and conventions
- File naming and structure conventions
- Git commit message format
- Testing requirements
- Code review checklist
- Technology-specific best practices`,
  },
  workflow: {
    title: 'Development Workflow',
    instruction: `Write a Development Workflow document covering:
- Development phases
- Branching strategy
- CI/CD pipeline description
- QA checklist
- Release process`,
  },
  diagrams: {
    title: 'Diagrams',
    instruction: `Write a Diagrams section with exactly four Mermaid diagrams relevant to the project:

1. **System Architecture** — use \`flowchart TD\`
2. **Entity Relationship** — use \`erDiagram\`
3. **User Flow** — use \`flowchart TD\` or \`graph LR\`
4. **Key Sequence** — use \`sequenceDiagram\`

For each diagram write a short heading and one sentence of description, then the fenced code block.

═══ STRICT SYNTAX RULES — FOLLOW EXACTLY ═══

Every diagram MUST be wrapped in a fenced block and NOTHING must appear before the type keyword:
\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]
\`\`\`

flowchart / graph rules:
- Node IDs: alphanumeric + underscore only (A, nodeA, user_auth) — NO spaces in IDs
- Edge labels go between pipe characters: -->|label text| or -- label text -->
- Node shapes: [rect] (round) ((circle)) {diamond} ([stadium])
- Never use nested brackets inside a node label

erDiagram rules:
- Entity names: PascalCase no spaces (User, OrderItem, not "Order Item")
- Every relationship MUST have a quoted label: \`User ||--o{ Order : "places"\`
- Attribute types on separate lines inside braces: \`string name\`, \`int id\`

sequenceDiagram rules:
- Participants declared first: \`participant A as Alice\`
- Messages: \`A->>B: message text\`
- Activation: \`activate A\` / \`deactivate A\`

Common mistakes to AVOID:
- Putting text or comments before the diagram type keyword
- Spaces inside node IDs: A[Hello World] is OK but \`Hello World[label]\` is WRONG
- Edge arrows without proper syntax: -> instead of -->
- Unquoted multi-word ERD relationship labels`,
  },
  promptContext: {
    title: 'Prompt Context',
    instruction: `Write a concise "Prompt Context" paragraph that an AI coding tool can use to bootstrap its understanding of the project. Include: what the project is, the stack, key patterns, and where to find more info. Keep it to 1-2 paragraphs.`,
  },
  effortEstimate: {
    title: 'Effort Estimate',
    instruction: `Write an Effort Estimate section covering:
- Overall project complexity rating (Simple / Moderate / Complex / Enterprise)
- Estimated development timeline (in weeks) with phase breakdown
- Recommended team size and roles
- Story point estimate per epic/feature area (use Fibonacci scale: 1, 2, 3, 5, 8, 13, 21)
- Key risks and assumptions that could affect the estimate
- MVP timeline vs. full product timeline

Present the estimates in a clear markdown table where possible. Be realistic and data-driven.`,
  },
};

/**
 * Build a focused system prompt for generating a single plan section.
 */
export function getSectionSystemPrompt(section: PlanSectionKey): string {
  const s = SECTION_PROMPTS[section];
  return `You are an expert software architect. You will be given the conversation history between a user and a project-planning assistant.

Your job: Write ONLY the "${s.title}" section of the project plan.

${s.instruction}

## Rules
- Output well-formatted Markdown ONLY. Do NOT wrap your output in JSON or code fences.
- Be thorough and professional. This will be used by AI tools to implement the project.
- Use proper headings, lists, and code blocks where appropriate.
- Do NOT include sections other than "${s.title}".`;
}

/**
 * @deprecated Legacy monolithic prompt — kept only as a reference.
 */
export const GENERATE_PLAN_SYSTEM_PROMPT = `You are an expert software architect. Generate a project plan as markdown.`;
