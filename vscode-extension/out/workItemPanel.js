"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkItemPanel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class WorkItemPanel {
    static panels = new Map();
    panel;
    static open(context, wi, checkpoints, workspacePath) {
        const existing = WorkItemPanel.panels.get(wi.id);
        if (existing) {
            existing.panel.reveal();
            existing.update(wi, checkpoints, workspacePath);
            return;
        }
        new WorkItemPanel(context, wi, checkpoints, workspacePath);
    }
    constructor(context, wi, checkpoints, workspacePath) {
        this.panel = vscode.window.createWebviewPanel('babelgitWorkItem', `${wi.id}`, vscode.ViewColumn.One, { enableScripts: false, retainContextWhenHidden: true });
        WorkItemPanel.panels.set(wi.id, this);
        this.panel.onDidDispose(() => WorkItemPanel.panels.delete(wi.id));
        this.update(wi, checkpoints, workspacePath);
    }
    update(wi, checkpoints, workspacePath) {
        const notes = readNotes(workspacePath, wi.id);
        this.panel.webview.html = buildHtml(wi, checkpoints, notes);
    }
}
exports.WorkItemPanel = WorkItemPanel;
function readNotes(workspacePath, id) {
    try {
        const p = path.join(workspacePath, '.babel', 'notes', `${id}.md`);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
    }
    catch {
        return '';
    }
}
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const STAGE_COLORS = {
    in_progress: '#4caf50',
    run_session_open: '#ff9800',
    paused: '#ff9800',
    shipped: '#00bcd4',
    stopped: '#f44336',
    todo: '#2196f3',
};
const VERDICT_ICONS = { keep: '✓', ship: '✓', refine: '~', reject: '✗' };
function buildHtml(wi, checkpoints, notes) {
    const stageColor = STAGE_COLORS[wi.stage] ?? 'var(--vscode-foreground)';
    const stageLabel = wi.ship_ready
        ? 'Ship Ready'
        : wi.stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const cpRows = checkpoints.slice().reverse().map(cp => {
        const icon = VERDICT_ICONS[cp.verdict] ?? '?';
        const anchor = cp.is_recovery_anchor ? ' ⚓' : '';
        const date = new Date(cp.called_at).toLocaleString();
        return `<tr>
      <td>${icon} <strong>${esc(cp.verdict.toUpperCase())}${anchor}</strong></td>
      <td>${esc(cp.notes)}</td>
      <td style="color:var(--vscode-descriptionForeground);white-space:nowrap">${esc(date)}</td>
      <td style="color:var(--vscode-descriptionForeground);font-family:monospace">${esc(cp.git_commit.slice(0, 7))}</td>
    </tr>`;
    }).join('');
    const notesHtml = notes
        ? `<section><h2>Spec</h2><pre class="spec">${esc(notes)}</pre></section>`
        : '';
    const cpHtml = checkpoints.length > 0
        ? `<section><h2>Checkpoint history</h2><table>${cpRows}</table></section>`
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; max-width: 800px; }
  h1 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .meta code { color: var(--vscode-textLink-foreground); background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
  .badge { padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; color: #fff; background: ${stageColor}; }
  section { margin-bottom: 24px; }
  section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
  pre.spec { background: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 12px; white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
</style>
</head>
<body>
<section>
  <h1>${esc(wi.id)} — ${esc(wi.description)}</h1>
  <div class="meta">
    <span class="badge">${esc(stageLabel)}</span>
    ${wi.branch ? `<span>Branch: <code>${esc(wi.branch)}</code></span>` : ''}
    ${wi.paused_notes ? `<span>Paused: "${esc(wi.paused_notes)}"</span>` : ''}
  </div>
</section>
${notesHtml}
${cpHtml}
</body>
</html>`;
}
//# sourceMappingURL=workItemPanel.js.map