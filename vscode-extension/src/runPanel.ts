import * as vscode from 'vscode'
import { execSync } from 'child_process'
import { StateWatcher } from './stateWatcher'
import { BabelRunner } from './babelRunner'

export class RunPanel {
  private static panel: vscode.WebviewPanel | undefined

  static show(watcher: StateWatcher, runner: BabelRunner): void {
    const workspacePath = watcher.workspacePath
    if (!workspacePath) {
      vscode.window.showErrorMessage('No workspace folder open')
      return
    }

    const wi = watcher.currentWorkItem
    if (!wi) {
      vscode.window.showErrorMessage('No active work item')
      return
    }

    if (RunPanel.panel) {
      RunPanel.panel.reveal()
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'babelgitRun',
      `Review: ${wi.id}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )

    RunPanel.panel = panel
    panel.onDidDispose(() => { RunPanel.panel = undefined })

    // Get diff stat and locked commit
    const lockedCommit = getLockedCommit(workspacePath)
    const diffStat = getDiffStat(workspacePath)

    panel.webview.html = buildHtml(wi, lockedCommit, diffStat)

    // Handle verdict messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'verdict') return

      const { verdict, notes } = msg as { type: string; verdict: string; notes: string }
      const args = notes.trim() ? [verdict, notes.trim()] : [verdict]

      panel.webview.postMessage({ type: 'output', text: `\n$ babel ${args.join(' ')}\n` })

      try {
        await runner.runStreaming(args, (chunk) => {
          panel.webview.postMessage({ type: 'output', text: chunk })
        }, workspacePath)
        panel.webview.postMessage({ type: 'done', success: true, verdict })
        watcher.refresh()
        // Close panel after brief delay on success
        setTimeout(() => { RunPanel.panel?.dispose() }, 2000)
      } catch {
        panel.webview.postMessage({ type: 'done', success: false, verdict })
        watcher.refresh()
      }
    })
  }
}

function getLockedCommit(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim()
  } catch { return 'unknown' }
}

function getDiffStat(cwd: string): string {
  try {
    // Show diff between last two commits (run creates a snapshot commit)
    const stat = execSync('git diff --stat HEAD~1..HEAD 2>/dev/null || git diff --stat HEAD', {
      cwd, encoding: 'utf8', shell: '/bin/sh'
    }).trim()
    return stat || 'No changes detected'
  } catch { return 'Could not read diff' }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHtml(
  wi: { id: string; description: string; branch: string },
  lockedCommit: string,
  diffStat: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>babel run — ${esc(wi.id)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px;
    max-width: 800px;
  }
  h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 20px; }
  .meta code { color: var(--vscode-textLink-foreground); background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }

  section { margin-bottom: 24px; }
  section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }

  .diff { background: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 12px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; white-space: pre; overflow-x: auto; }

  .verdicts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .verdict-card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .verdict-card:hover { background: var(--vscode-list-hoverBackground); }
  .verdict-card.selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
  .verdict-card .name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .verdict-card .when { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; font-style: italic; }
  .verdict-card[data-verdict="keep"] .name    { color: #4caf50; }
  .verdict-card[data-verdict="refine"] .name  { color: #ff9800; }
  .verdict-card[data-verdict="reject"] .name  { color: #f44336; }
  .verdict-card[data-verdict="ship"] .name    { color: #00bcd4; }

  textarea {
    width: 100%;
    height: 72px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 8px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    resize: vertical;
  }
  textarea:focus { outline: none; border-color: var(--vscode-focusBorder); }

  .call-verdict {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 4px;
    border: none;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .call-verdict:disabled { opacity: 0.5; cursor: not-allowed; }
  .call-verdict:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }

  #output-section { display: none; }
  #output {
    background: var(--vscode-terminal-background, var(--vscode-editor-background));
    color: var(--vscode-terminal-foreground, var(--vscode-foreground));
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    padding: 12px;
    border-radius: 4px;
    white-space: pre-wrap;
    min-height: 80px;
    max-height: 300px;
    overflow-y: auto;
  }
  .done-msg { margin-top: 10px; font-size: 13px; }
  .done-msg.success { color: #4caf50; }
  .done-msg.error   { color: #f44336; }
</style>
</head>
<body>

<section>
  <h1>${esc(wi.id)} — ${esc(wi.description)}</h1>
  <div class="meta">Branch: <code>${esc(wi.branch)}</code> · Locked at: <code>${esc(lockedCommit)}</code></div>
</section>

<section>
  <h2>What changed</h2>
  <div class="diff">${esc(diffStat)}</div>
</section>

<section>
  <h2>Choose a verdict</h2>
  <div class="verdicts">
    <div class="verdict-card" data-verdict="keep" onclick="selectVerdict('keep')">
      <div class="name">KEEP</div>
      <div>Solid recovery point. Roll back here if anything breaks.</div>
      <div class="when">Use when: tests pass, logic is sound, you'd hand this off.</div>
    </div>
    <div class="verdict-card" data-verdict="refine" onclick="selectVerdict('refine')">
      <div class="name">REFINE</div>
      <div>Right direction, needs specific changes. Work continues.</div>
      <div class="when">Use when: almost there, one thing still needs fixing.</div>
    </div>
    <div class="verdict-card" data-verdict="reject" onclick="selectVerdict('reject')">
      <div class="name">REJECT</div>
      <div>Wrong direction. Reverts to last KEEP checkpoint.</div>
      <div class="when">Use when: approach was mistaken, start over from clean state.</div>
    </div>
    <div class="verdict-card" data-verdict="ship" onclick="selectVerdict('ship')">
      <div class="name">SHIP</div>
      <div>Production-ready. Marks this work for delivery.</div>
      <div class="when">Use when: verified, ready to merge to base branch.</div>
    </div>
  </div>
</section>

<section>
  <h2>Notes <span style="color:var(--vscode-descriptionForeground);font-weight:normal;text-transform:none">— what did you verify? what should the next person know?</span></h2>
  <textarea id="notes" placeholder="Tests pass on mobile. Auth flow reviewed. No edge cases outstanding."></textarea>
</section>

<section>
  <button class="call-verdict" id="submit-btn" disabled onclick="submitVerdict()">Select a verdict above</button>
</section>

<section id="output-section">
  <h2>Output</h2>
  <div id="output"></div>
  <div id="done-msg" class="done-msg"></div>
</section>

<script>
  const vscode = acquireVsCodeApi()
  let selectedVerdict = null

  function selectVerdict(v) {
    selectedVerdict = v
    document.querySelectorAll('.verdict-card').forEach(c => c.classList.remove('selected'))
    document.querySelector('[data-verdict="' + v + '"]').classList.add('selected')
    const btn = document.getElementById('submit-btn')
    btn.disabled = false
    btn.textContent = 'Call ' + v.toUpperCase()
  }

  function submitVerdict() {
    if (!selectedVerdict) return
    const notes = document.getElementById('notes').value
    document.getElementById('submit-btn').disabled = true
    document.getElementById('output-section').style.display = 'block'
    vscode.postMessage({ type: 'verdict', verdict: selectedVerdict, notes })
  }

  window.addEventListener('message', e => {
    const msg = e.data
    if (msg.type === 'output') {
      const el = document.getElementById('output')
      el.textContent += msg.text
      el.scrollTop = el.scrollHeight
    } else if (msg.type === 'done') {
      const el = document.getElementById('done-msg')
      if (msg.success) {
        el.textContent = '✓ ' + msg.verdict.toUpperCase() + ' complete. Closing…'
        el.className = 'done-msg success'
      } else {
        el.textContent = '✗ Command failed. Check the output above.'
        el.className = 'done-msg error'
        document.getElementById('submit-btn').disabled = false
      }
    }
  })
</script>
</body>
</html>`
}
