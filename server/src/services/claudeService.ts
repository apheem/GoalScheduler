import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ParseResult, WorkingHours } from '../../../shared/types';

const client = new Anthropic();

// ─── Zod schema for validating Claude's tool-use response ──────────────────

const ParsedTaskSchema = z.object({
  title: z.string(),
  estimatedMinutes: z.number().int().min(5).max(120),
  dependsOnIndex: z.number().int().nullable(),
  notes: z.string().nullable(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});

const ParsedProjectSchema = z.object({
  title: z.string(),
  tasks: z.array(ParsedTaskSchema),
});

const ParseResultSchema = z.object({
  projects: z.array(ParsedProjectSchema),
});

// ─── Tool definition ────────────────────────────────────────────────────────

const CREATE_PLAN_TOOL: Anthropic.Tool = {
  name: 'create_project_plan',
  description:
    'Parse the user\'s free-form goals and tasks into a structured project plan with actionable steps.',
  input_schema: {
    type: 'object' as const,
    properties: {
      projects: {
        type: 'array',
        description: 'List of projects/goals extracted from the input',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short, clear project title (5-10 words)',
            },
            tasks: {
              type: 'array',
              description: 'Ordered list of tasks to complete this project',
              items: {
                type: 'object',
                properties: {
                  priority: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description: 'Task urgency: high = deadline-driven or blocking, medium = normal, low = nice-to-have',
                  },
                  title: {
                    type: 'string',
                    description: 'Specific, actionable task title',
                  },
                  estimatedMinutes: {
                    type: 'number',
                    description:
                      'Realistic time estimate in minutes (5–120). Break anything longer into subtasks.',
                  },
                  dependsOnIndex: {
                    type: ['number', 'null'],
                    description:
                      'Index (0-based) of the task in this project that must be completed first, or null if no dependency.',
                  },
                  notes: {
                    type: ['string', 'null'],
                    description: 'Any additional context or clarification about the task.',
                  },
                },
                required: ['title', 'estimatedMinutes', 'dependsOnIndex', 'notes'],
              },
            },
          },
          required: ['title', 'tasks'],
        },
      },
    },
    required: ['projects'],
  },
};

// ─── Main parse function ────────────────────────────────────────────────────

export async function parseGoals(
  rawInput: string,
  workingHours: WorkingHours
): Promise<ParseResult> {
  const systemPrompt = `You are a productivity assistant that converts messy goal and task descriptions into structured project plans.

Rules:
- Group related items into projects. A project can have 1–8 tasks.
- Each task must be specific and actionable (not "work on X" but "write outline for X").
- Keep tasks under 2 hours (120 minutes). Split anything larger.
- Use realistic time estimates. Default to 30 min for unknown tasks.
- Preserve the user's intent — don't invent goals they didn't mention.
- Working hours are ${workingHours.startHour}:00–${workingHours.endHour}:00.
- You MUST call the create_project_plan tool with your result.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: rawInput,
    },
  ];

  async function attempt(msgs: Anthropic.MessageParam[]): Promise<ParseResult> {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: [CREATE_PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'create_project_plan' },
      messages: msgs,
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Claude did not call the create_project_plan tool');
    }

    const parsed = ParseResultSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(`Invalid tool response: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  try {
    return await attempt(messages);
  } catch (err) {
    // Retry once with the error appended
    const errorMsg = err instanceof Error ? err.message : String(err);
    const retryMessages: Anthropic.MessageParam[] = [
      ...messages,
      {
        role: 'user',
        content: `There was an error with your previous response: ${errorMsg}. Please try again and make sure to call create_project_plan with valid data.`,
      },
    ];
    return await attempt(retryMessages);
  }
}
