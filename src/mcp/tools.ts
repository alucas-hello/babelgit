import { z } from 'zod'

export const mcpToolSchemas = {
  babel_state: {
    description: 'Get the current state of the active work item. Call this before every other operation.',
    inputSchema: z.object({
      work_item_id: z.string().optional().describe('Specific work item ID to query (optional)'),
    }),
  },
  babel_start: {
    description: 'Begin a new work item. Creates a feature branch and sets up the work item record.',
    inputSchema: z.object({
      description: z.string().describe('What you are working on'),
      id: z.string().optional().describe('Optional work item ID (e.g., PROJ-123)'),
    }),
  },
  babel_save: {
    description: 'Checkpoint progress locally with a commit.',
    inputSchema: z.object({
      notes: z.string().optional().describe('Notes about what was done'),
    }),
  },
  babel_sync: {
    description: 'Get current with the base branch via rebase or merge.',
    inputSchema: z.object({}),
  },
  babel_pause: {
    description: 'Leave work in handoff-ready state by pushing the branch.',
    inputSchema: z.object({
      notes: z.string().optional().describe('Notes about what is left to do'),
    }),
  },
  babel_continue: {
    description: 'Resume paused work.',
    inputSchema: z.object({
      work_item_id: z.string().optional().describe('Work item ID to continue (optional, picks most recent if omitted)'),
    }),
  },
  babel_stop: {
    description: 'Abandon work entirely. Reason is required for agents.',
    inputSchema: z.object({
      reason: z.string().describe('Why this work is being abandoned'),
    }),
  },
  babel_run: {
    description: 'Open a review session. Locks the current snapshot. Call babel_attest after reviewing.',
    inputSchema: z.object({}),
  },
  babel_attest: {
    description: 'Call a verdict after a run session. Creates a verified checkpoint.',
    inputSchema: z.object({
      verdict: z.enum(['keep', 'refine', 'reject', 'ship']).describe('The verdict'),
      notes: z.string().describe('What you verified or why you made this call (required for agents)'),
    }),
  },
  babel_ship: {
    description: 'Deliver work to the base branch. Merges, pushes, and cleans up.',
    inputSchema: z.object({}),
  },
  babel_history: {
    description: 'Show checkpoint history for a work item.',
    inputSchema: z.object({
      work_item_id: z.string().optional().describe('Work item ID (optional, uses current if omitted)'),
    }),
  },
}
