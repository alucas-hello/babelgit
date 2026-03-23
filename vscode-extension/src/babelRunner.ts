import * as vscode from 'vscode'
import { spawn } from 'child_process'

export class BabelRunner {
  private outputChannel: vscode.OutputChannel

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel
  }

  async run(args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const workspacePath = cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspacePath) {
        reject(new Error('No workspace folder open'))
        return
      }

      this.outputChannel.show(true)
      this.outputChannel.appendLine(`\n$ babel ${args.join(' ')}`)
      this.outputChannel.appendLine('─'.repeat(50))

      const proc = spawn('babel', args, {
        cwd: workspacePath,
        env: { ...process.env, BABEL_ACTIVE: '1' },
        shell: false,
      })

      proc.stdout.on('data', (data: Buffer) => {
        this.outputChannel.append(data.toString())
      })

      proc.stderr.on('data', (data: Buffer) => {
        this.outputChannel.append(data.toString())
      })

      proc.on('close', (code) => {
        this.outputChannel.appendLine('─'.repeat(50))
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`babel ${args[0]} exited with code ${code}`))
        }
      })

      proc.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          this.outputChannel.appendLine(
            'Error: babel command not found. Run: npm install -g babelgit'
          )
        } else {
          this.outputChannel.appendLine(`Error: ${err.message}`)
        }
        reject(err)
      })
    })
  }
}
