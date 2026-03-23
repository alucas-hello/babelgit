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
exports.ActionsProvider = exports.PausedWorkProvider = exports.HistoryProvider = exports.ActiveWorkProvider = void 0;
const vscode = __importStar(require("vscode"));
// ─── shared helpers ──────────────────────────────────────────────────────────
function labelNode(key, value) {
    return new TreeNode(`${key}: ${value}`, 'label', vscode.TreeItemCollapsibleState.None);
}
function formatStage(wi) {
    if (wi.ship_ready)
        return 'Ship Ready';
    const labels = {
        in_progress: 'In Progress',
        run_session_open: 'Run Session Open',
        paused: 'Paused',
        shipped: 'Shipped',
        stopped: 'Stopped',
    };
    return labels[wi.stage] ?? wi.stage;
}
function formatDate(iso) {
    try {
        return new Date(iso).toLocaleString();
    }
    catch {
        return iso;
    }
}
class TreeNode extends vscode.TreeItem {
    children;
    constructor(label, contextValue, collapsibleState, description) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        if (description)
            this.description = description;
        if (contextValue === 'workItem') {
            this.iconPath = new vscode.ThemeIcon('circle-filled');
        }
        else if (contextValue === 'hint') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
        else if (contextValue === 'section') {
            this.iconPath = new vscode.ThemeIcon('history');
        }
        else if (contextValue === 'action') {
            this.iconPath = new vscode.ThemeIcon('chevron-right');
        }
        else if (contextValue === 'pausedItem') {
            this.iconPath = new vscode.ThemeIcon('debug-pause');
        }
    }
}
function stripWorkItemPrefix(text) {
    return text.replace(/^WI-\d+\s*[:\-–]?\s*/i, '').trim();
}
function splitIntoLines(text, lineCount) {
    const words = text.split(/\s+/);
    const targetLen = Math.ceil(text.length / lineCount);
    const lines = [];
    let line = '';
    for (const word of words) {
        if (line.length > 0 && line.length >= targetLen && lines.length < lineCount - 1) {
            lines.push(line);
            line = word;
        }
        else {
            line = line ? line + ' ' + word : word;
        }
    }
    if (line)
        lines.push(line);
    return lines;
}
function notesNodes(text, lineCount, notesPath) {
    const cleaned = stripWorkItemPrefix(text);
    return splitIntoLines(cleaned, lineCount).map(l => {
        const node = new TreeNode(l, 'notesText', vscode.TreeItemCollapsibleState.None);
        node.tooltip = cleaned;
        node.command = { command: 'babelgit.openNotes', title: 'Open notes', arguments: [notesPath] };
        return node;
    });
}
function progressNode(stats) {
    const parts = [];
    if (stats.filesChanged > 0) {
        parts.push(`${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} (+${stats.insertions}/-${stats.deletions})`);
    }
    if (stats.commitsSinceCheckpoint > 0) {
        parts.push(`${stats.commitsSinceCheckpoint} commit${stats.commitsSinceCheckpoint !== 1 ? 's' : ''} since checkpoint`);
    }
    if (stats.minutesSinceCheckpoint !== null) {
        const mins = stats.minutesSinceCheckpoint;
        const ago = mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
        parts.push(`last checkpoint ${ago}`);
    }
    const summary = parts.length > 0 ? parts.join(' · ') : 'no uncommitted changes';
    const node = new TreeNode(`Progress: ${summary}`, 'progress', vscode.TreeItemCollapsibleState.None);
    node.iconPath = new vscode.ThemeIcon(stats.filesChanged > 0 || stats.commitsSinceCheckpoint > 0 ? 'pulse' : 'check');
    return node;
}
// ─── Active Work ─────────────────────────────────────────────────────────────
class ActiveWorkProvider {
    watcher;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(watcher) {
        this.watcher = watcher;
        watcher.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    refresh() { this._onDidChangeTreeData.fire(); }
    getTreeItem(el) { return el; }
    getChildren(element) {
        if (element)
            return element.children ?? [];
        const wi = this.watcher.currentWorkItem;
        if (!wi) {
            return [new TreeNode('No active work item', 'hint', vscode.TreeItemCollapsibleState.None)];
        }
        const nodes = [
            labelNode('ID', wi.id),
            labelNode('Status', formatStage(wi)),
            labelNode('Branch', wi.branch),
            labelNode('Started', formatDate(wi.created_at)),
            labelNode('Description', wi.description),
        ];
        const stats = this.watcher.gitStats;
        if (stats) {
            nodes.push(progressNode(stats));
        }
        const notes = this.watcher.workNotes;
        const notesPath = this.watcher.workNotesPath;
        if (notes && notesPath) {
            const [summary, lastChange] = notes.split(/\n---\n/);
            if (summary?.trim()) {
                const n = new TreeNode('Summary', 'notes', vscode.TreeItemCollapsibleState.Expanded);
                n.iconPath = new vscode.ThemeIcon('book');
                n.children = notesNodes(summary.trim(), 3, notesPath);
                nodes.push(n);
            }
            if (lastChange?.trim()) {
                const n = new TreeNode('Last change', 'notes', vscode.TreeItemCollapsibleState.Expanded);
                n.iconPath = new vscode.ThemeIcon('edit');
                n.children = notesNodes(lastChange.trim(), 2, notesPath);
                nodes.push(n);
            }
        }
        return nodes;
    }
}
exports.ActiveWorkProvider = ActiveWorkProvider;
// ─── History ─────────────────────────────────────────────────────────────────
class HistoryProvider {
    watcher;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(watcher) {
        this.watcher = watcher;
        watcher.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    refresh() { this._onDidChangeTreeData.fire(); }
    getTreeItem(el) { return el; }
    getChildren(element) {
        if (element)
            return element.children ?? [];
        const groups = this.watcher.allCheckpointGroups;
        if (groups.length === 0) {
            return [new TreeNode('No checkpoints yet', 'hint', vscode.TreeItemCollapsibleState.None)];
        }
        const currentId = this.watcher.currentWorkItem?.id;
        const verdictIcons = { keep: '✓', ship: '✓', refine: '~', reject: '✗' };
        return groups.map((group) => {
            const isActive = group.workItemId === currentId;
            const label = isActive ? `${group.workItemId} (active)` : group.workItemId;
            const groupNode = new TreeNode(label, 'checkpointGroup', vscode.TreeItemCollapsibleState.Expanded, group.description);
            groupNode.iconPath = new vscode.ThemeIcon(isActive ? 'circle-filled' : 'circle-outline');
            groupNode.children = group.checkpoints
                .slice()
                .reverse()
                .map((cp) => {
                const icon = verdictIcons[cp.verdict] ?? '?';
                const anchor = cp.is_recovery_anchor ? ' ← anchor' : '';
                const label = `${icon} ${cp.verdict.toUpperCase()}${anchor}`;
                const node = new TreeNode(label, 'checkpoint', vscode.TreeItemCollapsibleState.None, `"${cp.notes}"`);
                node.tooltip = `Commit: ${cp.git_commit.slice(0, 7)}\n${formatDate(cp.called_at)}`;
                return node;
            });
            return groupNode;
        });
    }
}
exports.HistoryProvider = HistoryProvider;
// ─── Paused Work ─────────────────────────────────────────────────────────────
class PausedWorkProvider {
    watcher;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(watcher) {
        this.watcher = watcher;
        watcher.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    refresh() { this._onDidChangeTreeData.fire(); }
    getTreeItem(el) { return el; }
    getChildren(element) {
        if (element)
            return element.children ?? [];
        const state = this.watcher.state;
        if (!state) {
            return [new TreeNode('No workspace state', 'hint', vscode.TreeItemCollapsibleState.None)];
        }
        const paused = Object.values(state.work_items).filter(wi => wi.stage === 'paused');
        if (paused.length === 0) {
            return [new TreeNode('No paused work items', 'hint', vscode.TreeItemCollapsibleState.None)];
        }
        return paused.map(wi => {
            const node = new TreeNode(wi.id, 'pausedItem', vscode.TreeItemCollapsibleState.None, wi.description);
            node.tooltip = `babel continue ${wi.id}`;
            node.command = {
                command: 'babelgit.continueItem',
                title: 'Continue',
                arguments: [wi.id],
            };
            return node;
        });
    }
}
exports.PausedWorkProvider = PausedWorkProvider;
// ─── Quick Actions ────────────────────────────────────────────────────────────
class ActionsProvider {
    watcher;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(watcher) {
        this.watcher = watcher;
        watcher.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    refresh() { this._onDidChangeTreeData.fire(); }
    getTreeItem(el) { return el; }
    getChildren(element) {
        if (element)
            return element.children ?? [];
        const wi = this.watcher.currentWorkItem;
        const hasActive = !!wi;
        const isRunSession = wi?.stage === 'run_session_open';
        const isShipReady = wi?.ship_ready;
        const actions = [
            { label: 'Start new work item', command: 'babelgit.start', when: !hasActive },
            { label: 'Save checkpoint', command: 'babelgit.save', when: hasActive && !isRunSession },
            { label: 'Sync with base', command: 'babelgit.sync', when: hasActive && !isRunSession },
            { label: 'Open run session', command: 'babelgit.run', when: hasActive && !isRunSession && !isShipReady },
            { label: 'Keep (verdict)', command: 'babelgit.keep', when: !!isRunSession },
            { label: 'Refine (verdict)', command: 'babelgit.refine', when: !!isRunSession },
            { label: 'Reject (verdict)', command: 'babelgit.reject', when: !!isRunSession },
            { label: 'Ship (verdict)', command: 'babelgit.ship', when: !!isRunSession },
            { label: 'Ship — deliver now', command: 'babelgit.ship', when: !!isShipReady && !isRunSession },
            { label: 'Pause work', command: 'babelgit.pause', when: hasActive && !isRunSession },
            { label: 'View history', command: 'babelgit.history', when: hasActive },
        ];
        return actions
            .filter(a => a.when)
            .map(a => {
            const node = new TreeNode(a.label, 'action', vscode.TreeItemCollapsibleState.None);
            node.command = { command: a.command, title: a.label };
            return node;
        });
    }
}
exports.ActionsProvider = ActionsProvider;
//# sourceMappingURL=sidebarProvider.js.map