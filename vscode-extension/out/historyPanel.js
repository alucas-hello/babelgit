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
exports.HistoryPanel = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class HistoryPanel {
    static panel;
    static show(watcher) {
        const workspacePath = watcher.workspacePath;
        if (!workspacePath) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        if (HistoryPanel.panel) {
            HistoryPanel.panel.reveal();
            HistoryPanel.render(HistoryPanel.panel, watcher, workspacePath);
            return;
        }
        const panel = vscode.window.createWebviewPanel('babelgitHistory', 'babelgit History', vscode.ViewColumn.One, { enableScripts: false });
        HistoryPanel.panel = panel;
        panel.onDidDispose(() => {
            HistoryPanel.panel = undefined;
        });
        HistoryPanel.render(panel, watcher, workspacePath);
        watcher.onDidChange(() => {
            if (HistoryPanel.panel) {
                HistoryPanel.render(HistoryPanel.panel, watcher, workspacePath);
            }
        });
    }
    static render(panel, watcher, workspacePath) {
        const wi = watcher.currentWorkItem;
        const checkpoints = watcher.checkpoints;
        const commits = getGitLog(workspacePath);
        const checkpointsByCommit = indexCheckpoints(checkpoints);
        panel.title = wi ? `babelgit History — ${wi.id}` : 'babelgit History';
        panel.webview.html = buildHtml(wi, commits, checkpointsByCommit, checkpoints);
    }
}
exports.HistoryPanel = HistoryPanel;
function getGitLog(cwd) {
    try {
        const out = (0, child_process_1.execSync)('git log --format="%H|%h|%s|%an|%ai" -40', { cwd, encoding: 'utf8' });
        return out
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => {
            const parts = line.split('|');
            return {
                sha: parts[0] ?? '',
                shortSha: parts[1] ?? '',
                message: parts[2] ?? '',
                author: parts[3] ?? '',
                date: parts[4] ? new Date(parts[4]).toLocaleString() : '',
            };
        });
    }
    catch {
        return [];
    }
}
function getAllCheckpoints(workspacePath, workItemId) {
    const dir = path.join(workspacePath, '.babel', 'checkpoints', workItemId);
    if (!fs.existsSync(dir))
        return [];
    try {
        return fs
            .readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
            try {
                return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            }
            catch {
                return null;
            }
        })
            .filter((c) => c !== null);
    }
    catch {
        return [];
    }
}
function indexCheckpoints(checkpoints) {
    const map = new Map();
    for (const cp of checkpoints) {
        map.set(cp.git_commit, cp);
    }
    return map;
}
function buildHtml(wi, commits, checkpointsByCommit, checkpoints) {
    const verdictColor = {
        keep: '#4caf50',
        ship: '#00bcd4',
        refine: '#ff9800',
        reject: '#f44336',
    };
    const commitRows = commits
        .map(c => {
        const cp = checkpointsByCommit.get(c.sha);
        const badge = cp
            ? `<span class="badge" style="background:${verdictColor[cp.verdict] ?? '#888'}">${cp.verdict.toUpperCase()}${cp.is_recovery_anchor ? ' ⚓' : ''}</span>`
            : '';
        const notes = cp ? `<div class="cp-notes">"${escHtml(cp.notes)}"</div>` : '';
        return `
      <tr class="${cp ? 'has-checkpoint' : ''}">
        <td class="sha"><code>${escHtml(c.shortSha)}</code></td>
        <td class="msg">${escHtml(c.message)}${notes}</td>
        <td class="badge-cell">${badge}</td>
        <td class="meta">${escHtml(c.author)}</td>
        <td class="meta">${escHtml(c.date)}</td>
      </tr>`;
    })
        .join('');
    const header = wi
        ? `<div class="header"><strong>${escHtml(wi.id)}</strong> — ${escHtml(wi.description)}<br><small>Branch: ${escHtml(wi.branch)} · ${checkpoints.length} checkpoint(s)</small></div>`
        : '<div class="header">No active work item</div>';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>babelgit History</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  .header { margin-bottom: 16px; padding: 12px; background: var(--vscode-sideBar-background); border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-weight: normal; }
  td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
  tr.has-checkpoint { background: var(--vscode-list-hoverBackground); }
  .sha code { font-size: 11px; color: var(--vscode-textLink-foreground); }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; color: #fff; }
  .badge-cell { white-space: nowrap; }
  .cp-notes { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; font-style: italic; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 11px; }
</style>
</head>
<body>
${header}
<table>
  <thead>
    <tr>
      <th>Commit</th>
      <th>Message</th>
      <th>Checkpoint</th>
      <th>Author</th>
      <th>Date</th>
    </tr>
  </thead>
  <tbody>
    ${commitRows || '<tr><td colspan="5" style="text-align:center;padding:20px">No commits found</td></tr>'}
  </tbody>
</table>
</body>
</html>`;
}
function escHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
//# sourceMappingURL=historyPanel.js.map