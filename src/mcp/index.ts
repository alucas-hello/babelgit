// Mark all git operations from this process as babel-initiated.
// Git hooks installed by `babel enforce` check for this variable.
process.env.BABEL_ACTIVE = '1'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { runStart } from '../cli/commands/start.js'
import { runSave } from '../cli/commands/save.js'
import { runSync } from '../cli/commands/sync.js'
import { runPause } from '../cli/commands/pause.js'
import { runContinue } from '../cli/commands/continue.js'
import { runStop } from '../cli/commands/stop.js'
import { runRun } from '../cli/commands/run.js'
import { runVerdict } from '../cli/commands/verdict.js'
import { runShip } from '../cli/commands/ship.js'
import { runState } from '../cli/commands/state.js'
import { runHistory } from '../cli/commands/history.js'
import type { Verdict } from '../types.js'

// Set agent context so governance knows this is an agent
process.env.BABELGIT_AGENT = 'true'

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'babelgit', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: 'babel_state',
        description: 'Get the current state of the active work item. Call this before every other operation.',
        inputSchema: {
          type: 'object',
          properties: {
            work_item_id: { type: 'string', description: 'Specific work item ID to query (optional)' },
          },
        },
      },
      {
        name: 'babel_start',
        description: 'Begin a new work item. Creates a feature branch and sets up the work item record.',
        inputSchema: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'What you are working on' },
            id: { type: 'string', description: 'Optional work item ID (e.g., PROJ-123)' },
          },
          required: ['description'],
        },
      },
      {
        name: 'babel_save',
        description: 'Checkpoint progress locally with a commit.',
        inputSchema: {
          type: 'object',
          properties: {
            notes: { type: 'string', description: 'Notes about what was done' },
          },
        },
      },
      {
        name: 'babel_sync',
        description: 'Get current with the base branch via rebase or merge.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'babel_pause',
        description: 'Leave work in handoff-ready state by pushing the branch.',
        inputSchema: {
          type: 'object',
          properties: {
            notes: { type: 'string', description: 'Notes about what is left to do' },
          },
        },
      },
      {
        name: 'babel_continue',
        description: 'Resume paused work.',
        inputSchema: {
          type: 'object',
          properties: {
            work_item_id: { type: 'string', description: 'Work item ID to continue' },
          },
        },
      },
      {
        name: 'babel_stop',
        description: 'Abandon work entirely.',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Why this work is being abandoned' },
          },
          required: ['reason'],
        },
      },
      {
        name: 'babel_run',
        description: 'Open a review session. Locks the current snapshot. Call babel_attest after reviewing.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'babel_attest',
        description: 'Call a verdict after a run session. Creates a verified checkpoint.',
        inputSchema: {
          type: 'object',
          properties: {
            verdict: {
              type: 'string',
              enum: ['keep', 'refine', 'reject', 'ship'],
              description: 'The verdict',
            },
            notes: { type: 'string', description: 'What you verified or why you made this call' },
          },
          required: ['verdict', 'notes'],
        },
      },
      {
        name: 'babel_ship',
        description: 'Deliver work to the base branch. Merges, pushes, and cleans up.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'babel_history',
        description: 'Show checkpoint history for a work item.',
        inputSchema: {
          type: 'object',
          properties: {
            work_item_id: { type: 'string', description: 'Work item ID' },
          },
        },
      },
      {
        name: 'babel_config',
        description: 'Get the effective babelgit configuration, including permitted operations and integration status.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'babel_create_work_item',
        description: 'Create a new work item with a specific ID (for use when ID is already known, e.g. from an external tracker).',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Work item ID (e.g., ENG-042)' },
            description: { type: 'string', description: 'Description of the work' },
          },
          required: ['id', 'description'],
        },
      },
    ]
    return { tools }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const a = args as Record<string, unknown>

    // Capture stdout for MCP response
    const output = await captureOutput(async () => {
      switch (name) {
        case 'babel_state':
          await runState(a.work_item_id as string | undefined, { json: true })
          break
        case 'babel_start':
          await runStart(
            a.id ? `${a.id}` : (a.description as string)
          )
          break
        case 'babel_save':
          await runSave(a.notes as string | undefined)
          break
        case 'babel_sync':
          await runSync()
          break
        case 'babel_pause':
          await runPause(a.notes as string | undefined)
          break
        case 'babel_continue':
          await runContinue(a.work_item_id as string | undefined)
          break
        case 'babel_stop':
          await runStop(a.reason as string)
          break
        case 'babel_run':
          await runRun()
          break
        case 'babel_attest':
          await runVerdict(a.verdict as Verdict, a.notes as string)
          break
        case 'babel_ship':
          await runShip()
          break
        case 'babel_history':
          await runHistory(a.work_item_id as string | undefined, { json: true })
          break
        case 'babel_config': {
          const { loadConfig } = await import('../core/config.js')
          const cfg = await loadConfig()
          console.log(JSON.stringify(cfg, null, 2))
          break
        }
        case 'babel_create_work_item':
          // babel_start with an explicit ID: pass "ID description" so start parses both
          await runStart(a.id as string)
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function captureOutput(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const originalLog = console.log
  const originalError = console.error

  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '))
  }
  console.error = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '))
  }

  try {
    await fn()
  } catch (err) {
    chunks.push(`Error: ${(err as Error).message}`)
  } finally {
    console.log = originalLog
    console.error = originalError
  }

  return chunks.join('\n')
}
