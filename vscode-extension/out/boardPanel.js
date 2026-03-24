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
exports.BoardPanel = void 0;
const vscode = __importStar(require("vscode"));
class BoardPanel {
    watcher;
    static instance;
    panel;
    disposables = [];
    static show(watcher) {
        if (BoardPanel.instance) {
            BoardPanel.instance.panel.reveal(vscode.ViewColumn.One);
            BoardPanel.instance.render(watcher);
            return;
        }
        new BoardPanel(watcher);
    }
    constructor(watcher) {
        this.watcher = watcher;
        this.panel = vscode.window.createWebviewPanel('babelgitBoard', 'babelgit Board', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        BoardPanel.instance = this;
        this.panel.onDidDispose(() => {
            BoardPanel.instance = undefined;
            this.disposables.forEach(d => d.dispose());
        });
        this.disposables.push(watcher.onDidChange(() => this.render(watcher)));
        this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg), undefined, this.disposables);
        this.render(watcher);
    }
    render(watcher) {
        const state = watcher.state;
        const groups = watcher.allCheckpointGroups;
        const verdicts = watcher.verdicts;
        const workItems = Object.values(state?.work_items ?? {});
        const currentId = state?.current_work_item_id ?? undefined;
        this.panel.webview.html = buildHtml(workItems, groups, verdicts, currentId);
    }
    handleMessage(msg) {
        if (msg.type === 'command' && msg.command) {
            vscode.commands.executeCommand(msg.command, ...(msg.args ?? []));
        }
    }
}
exports.BoardPanel = BoardPanel;
function buildColumns(workItems, verdicts) {
    const shipLabel = capitalize(verdicts.ship);
    const COLS = [
        { stage: 'todo', label: 'Todo', color: '#1e3a5f', borderColor: '#2196f3' },
        { stage: 'in_progress', label: 'In Progress', color: '#1e3d2a', borderColor: '#4caf50' },
        { stage: 'ship_ready', label: 'Ready to Merge', color: '#1a3a1a', borderColor: '#66bb6a' },
        { stage: 'run_session_open', label: 'Review Open', color: '#3d2e00', borderColor: '#ff9800' },
        { stage: 'paused', label: 'Paused', color: '#3d2a00', borderColor: '#ff9800' },
        { stage: 'pr_open', label: 'PR Open', color: '#2e1f4a', borderColor: '#9c27b0' },
        { stage: 'shipped', label: shipLabel, color: '#1a2e35', borderColor: '#00bcd4' },
        { stage: 'stopped', label: 'Stopped', color: '#2e1e1e', borderColor: '#f44336' },
    ];
    const byStage = {};
    for (const wi of workItems) {
        const key = (wi.stage === 'in_progress' && wi.ship_ready) ? 'ship_ready' : wi.stage;
        if (!byStage[key])
            byStage[key] = [];
        byStage[key].push(wi);
    }
    return COLS
        .map(col => ({
        ...col,
        items: (byStage[col.stage] ?? []).sort((a, b) => b.id.localeCompare(a.id)),
    }))
        .filter(col => col.items.length > 0 || col.stage === 'todo');
}
// ─── HTML ──────────────────────────────────────────────────────────────────
function esc(s) {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function formatAge(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1)
        return 'just now';
    if (mins < 60)
        return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)
        return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
function cardActions(wi, currentId) {
    const stage = (wi.stage === 'in_progress' && wi.ship_ready) ? 'ship_ready' : wi.stage;
    const isCurrent = wi.id === currentId;
    const id = esc(wi.id);
    const btn = (label, command, args, cls = '') => `<button class="action-btn ${cls}" onclick="cmd('${command}', ${args})">${label}</button>`;
    switch (stage) {
        case 'todo':
            return btn('▶ Start Work', 'babelgit.startItem', `['${id}']`, 'primary') +
                btn('🗑 Trash', 'babelgit.deleteItem', `['${id}']`, 'danger');
        case 'in_progress':
            return (isCurrent
                ? btn('⏸ Pause', 'babelgit.pause', '[]') +
                    btn('💾 Save', 'babelgit.save', '[]') +
                    btn('▷ Run', 'babelgit.run', '[]', 'primary')
                : btn('▶ Continue', 'babelgit.continueItem', `['${id}']`, 'primary'));
        case 'ship_ready':
            return btn('→ Merge to main', 'babelgit.ship', '[]', 'primary');
        case 'run_session_open':
            return (isCurrent
                ? btn('✓ Keep', 'babelgit.keep', '[]', 'primary') +
                    btn('~ Refine', 'babelgit.refine', '[]') +
                    btn('✕ Reject', 'babelgit.reject', '[]', 'danger') +
                    btn('🚀 Ship', 'babelgit.ship', '[]', 'primary')
                : btn('🗑 Trash', 'babelgit.deleteItem', `['${id}']`, 'danger'));
        case 'paused':
            return btn('▶ Continue', 'babelgit.continueItem', `['${id}']`, 'primary');
        case 'pr_open':
            return wi.pr_url
                ? btn('↗ View PR', 'vscode.open', `[${JSON.stringify(wi.pr_url)}]`, 'primary')
                : '';
        default:
            return '';
    }
}
function buildCard(wi, checkpoints, currentId) {
    const isCurrent = wi.id === currentId;
    const lastCp = checkpoints[checkpoints.length - 1];
    const cpHtml = lastCp
        ? `<div class="card-cp">${esc(lastCp.verdict.toUpperCase())} · "${esc(lastCp.notes)}" · ${formatAge(lastCp.called_at)}</div>`
        : '';
    const pausedHtml = wi.paused_notes
        ? `<div class="card-paused">"${esc(wi.paused_notes)}"</div>`
        : '';
    const prHtml = wi.pr_url
        ? `<div class="card-meta">PR #${wi.pr_number ?? ''}</div>`
        : '';
    const actions = cardActions(wi, currentId);
    return `<div class="card${isCurrent ? ' card-active' : ''}">
  <div class="card-header">
    <span class="card-id">${esc(wi.id)}</span>
    ${wi.branch ? `<span class="card-branch">${esc(wi.branch.replace(/^feature\//, ''))}</span>` : ''}
  </div>
  <div class="card-desc">${esc(wi.description)}</div>
  ${pausedHtml}
  ${prHtml}
  ${cpHtml}
  ${actions ? `<div class="card-actions">${actions}</div>` : ''}
</div>`;
}
function buildColumn(col, groups, currentId) {
    const cardsHtml = col.items.map(wi => {
        const checkpoints = groups.find(g => g.workItemId === wi.id)?.checkpoints ?? [];
        return buildCard(wi, checkpoints, currentId);
    }).join('');
    const addWorkHtml = col.stage === 'todo'
        ? `<button class="add-work-btn" onclick="cmd('babelgit.start', [])">+ Add work item</button>`
        : '';
    return `<div class="column" style="--col-border: ${col.borderColor}; --col-bg: ${col.color}">
  <div class="col-header">
    <span class="col-title">${esc(col.label)}</span>
    <span class="col-count">${col.items.length}</span>
  </div>
  ${addWorkHtml}
  <div class="col-cards">${cardsHtml}</div>
</div>`;
}
function buildHtml(workItems, groups, verdicts, currentId) {
    const columns = buildColumns(workItems, verdicts);
    const columnsHtml = columns.map(col => buildColumn(col, groups, currentId)).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .board-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .board-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .board-scroll {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .column {
    flex: 0 0 240px;
    background: var(--col-bg, var(--vscode-sideBar-background));
    border-top: 3px solid var(--col-border, #444);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 80px);
    overflow: hidden;
  }

  .col-header {
    padding: 10px 12px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .col-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--col-border);
  }

  .col-count {
    font-size: 11px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 1px 7px;
    font-weight: 600;
  }

  .col-cards {
    overflow-y: auto;
    padding: 0 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .add-work-btn {
    margin: 0 8px 8px;
    padding: 7px 10px;
    background: transparent;
    border: 1px dashed var(--vscode-panel-border);
    border-radius: 5px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    width: calc(100% - 16px);
    transition: border-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .add-work-btn:hover {
    border-color: #2196f3;
    color: #2196f3;
  }

  .card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px;
    padding: 10px 11px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card-active {
    border-color: var(--col-border, #4caf50);
    box-shadow: 0 0 0 1px var(--col-border, #4caf50);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .card-id {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-textLink-foreground);
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .card-branch {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-desc {
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-foreground);
  }

  .card-paused {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .card-meta {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
  }

  .card-cp {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 5px;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .action-btn {
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    cursor: pointer;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    transition: background 0.1s;
  }

  .action-btn:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .action-btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }

  .action-btn.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .action-btn.danger {
    color: var(--vscode-errorForeground, #f44336);
  }

  .action-btn.danger:hover {
    background: rgba(244, 67, 54, 0.1);
    border-color: var(--vscode-errorForeground, #f44336);
  }
</style>
</head>
<body>
<div class="board-header">
  <span class="board-title">babelgit Board</span>
</div>
<div class="board-scroll">
  ${columnsHtml}
</div>
<script>
  const vscode = acquireVsCodeApi()
  function cmd(command, args) {
    vscode.postMessage({ type: 'command', command, args })
  }
</script>
</body>
</html>`;
}
//# sourceMappingURL=boardPanel.js.map