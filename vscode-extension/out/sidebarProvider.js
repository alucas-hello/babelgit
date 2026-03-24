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
exports.WatcherProvider = exports.ActionsProvider = exports.HistoryProvider = exports.ActiveWorkProvider = void 0;
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
function formatAge(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60)
        return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)
        return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
class TreeNode extends vscode.TreeItem {
    children;
    constructor(label, contextValue, collapsibleState, description) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        if (description)
            this.description = description;
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
            // Show warning if there are uncommitted changes with no active WI
            const stats = this.watcher.gitStats;
            if (stats && stats.filesChanged > 0) {
                const warning = new TreeNode(`⚠ ${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed — no active work item`, 'warning', vscode.TreeItemCollapsibleState.None);
                warning.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
                const start = new TreeNode('Start a work item', 'action', vscode.TreeItemCollapsibleState.None);
                start.iconPath = new vscode.ThemeIcon('plus');
                start.command = { command: 'babelgit.start', title: 'Start' };
                return [warning, start];
            }
            const hint = new TreeNode('No active work item', 'hint', vscode.TreeItemCollapsibleState.None);
            hint.iconPath = new vscode.ThemeIcon('info');
            const start = new TreeNode('Start a work item', 'action', vscode.TreeItemCollapsibleState.None);
            start.iconPath = new vscode.ThemeIcon('plus');
            start.command = { command: 'babelgit.start', title: 'Start' };
            return [hint, start];
        }
        const nodes = [
            labelNode('ID', wi.id),
            labelNode('Status', formatStage(wi)),
            labelNode('Branch', wi.branch),
            labelNode('Started', formatDate(wi.created_at)),
            labelNode('Description', wi.description),
        ];
        // Pause button inline
        const pauseNode = new TreeNode('Pause work', 'action', vscode.TreeItemCollapsibleState.None);
        pauseNode.iconPath = new vscode.ThemeIcon('debug-pause');
        pauseNode.command = { command: 'babelgit.pause', title: 'Pause' };
        nodes.push(pauseNode);
        const stats = this.watcher.gitStats;
        if (stats)
            nodes.push(progressNode(stats));
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
// Stage metadata: icon, color token, default collapsed state
const STAGE_META = {
    in_progress: { icon: 'circle-filled', color: 'charts.blue', collapsed: false },
    run_session_open: { icon: 'circle-filled', color: 'charts.yellow', collapsed: false },
    paused: { icon: 'debug-pause', color: 'charts.orange', collapsed: true },
    shipped: { icon: 'pass', color: 'charts.green', collapsed: true },
    stopped: { icon: 'circle-slash', color: 'charts.red', collapsed: true },
};
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
        const state = this.watcher.state;
        const groups = this.watcher.allCheckpointGroups;
        if (!state && groups.length === 0) {
            const hint = new TreeNode('No history yet', 'hint', vscode.TreeItemCollapsibleState.None);
            hint.iconPath = new vscode.ThemeIcon('info');
            return [hint];
        }
        const currentId = this.watcher.currentWorkItem?.id;
        const verdictIcons = { keep: '✓', ship: '✓', refine: '~', reject: '✗' };
        // Build set of all known WI IDs from both state and checkpoint groups
        const allIds = new Set([
            ...Object.keys(state?.work_items ?? {}),
            ...groups.map(g => g.workItemId),
        ]);
        // Sort: active first, then by ID descending
        const sortedIds = [...allIds].sort((a, b) => {
            if (a === currentId)
                return -1;
            if (b === currentId)
                return 1;
            return b.localeCompare(a);
        });
        return sortedIds.map(wiId => {
            const wi = state?.work_items[wiId];
            const group = groups.find(g => g.workItemId === wiId);
            const stage = wi?.stage ?? 'shipped';
            const isPaused = stage === 'paused';
            const isActive = wiId === currentId;
            const meta = STAGE_META[stage] ?? { icon: 'circle-outline', color: 'foreground', collapsed: true };
            const collapsibleState = isActive || isPaused
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
            const label = isActive ? `${wiId} (active)` : isPaused ? `${wiId} (paused)` : wiId;
            const groupNode = new TreeNode(label, 'historyGroup', collapsibleState, wi?.description ?? group?.description);
            groupNode.iconPath = new vscode.ThemeIcon(meta.icon, new vscode.ThemeColor(meta.color));
            const children = [];
            // Paused items get a Continue button at the top
            if (isPaused) {
                const continueNode = new TreeNode('Continue this work', 'action', vscode.TreeItemCollapsibleState.None);
                continueNode.iconPath = new vscode.ThemeIcon('debug-continue', new vscode.ThemeColor('charts.green'));
                continueNode.command = { command: 'babelgit.continueItem', title: 'Continue', arguments: [wiId] };
                children.push(continueNode);
                if (wi?.paused_notes) {
                    const notesNode = new TreeNode(`"${wi.paused_notes}"`, 'label', vscode.TreeItemCollapsibleState.None);
                    notesNode.iconPath = new vscode.ThemeIcon('comment');
                    children.push(notesNode);
                }
            }
            // Checkpoints
            if (group && group.checkpoints.length > 0) {
                group.checkpoints.slice().reverse().forEach((cp) => {
                    const icon = verdictIcons[cp.verdict] ?? '?';
                    const anchor = cp.is_recovery_anchor ? ' ⚓' : '';
                    const cpNode = new TreeNode(`${icon} ${cp.verdict.toUpperCase()}${anchor}`, 'checkpoint', vscode.TreeItemCollapsibleState.None, `"${cp.notes}"`);
                    cpNode.tooltip = `Commit: ${cp.git_commit.slice(0, 7)}\n${formatDate(cp.called_at)}`;
                    cpNode.description = `"${cp.notes}"  ${formatAge(cp.called_at)}`;
                    children.push(cpNode);
                });
            }
            else {
                const none = new TreeNode('No checkpoints', 'hint', vscode.TreeItemCollapsibleState.None);
                none.iconPath = new vscode.ThemeIcon('dash');
                children.push(none);
            }
            groupNode.children = children;
            return groupNode;
        });
    }
}
exports.HistoryProvider = HistoryProvider;
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
        if (!this.watcher.isInitialized) {
            const node = new TreeNode('Initialize babel in this folder', 'action', vscode.TreeItemCollapsibleState.None);
            node.iconPath = new vscode.ThemeIcon('getting-started-setup');
            node.command = { command: 'babelgit.init', title: 'Initialize babel' };
            return [node];
        }
        const wi = this.watcher.currentWorkItem;
        const hasActive = !!wi;
        const isRunSession = wi?.stage === 'run_session_open';
        const isShipReady = wi?.ship_ready;
        const actions = [
            { label: 'Start new work item', command: 'babelgit.start', icon: 'plus', when: !hasActive },
            { label: 'Save checkpoint', command: 'babelgit.save', icon: 'save', when: hasActive && !isRunSession },
            { label: 'Sync with base', command: 'babelgit.sync', icon: 'sync', when: hasActive && !isRunSession },
            { label: 'Open run session', command: 'babelgit.run', icon: 'play-circle', when: hasActive && !isRunSession && !isShipReady },
            { label: 'Keep', command: 'babelgit.keep', icon: 'pass', when: !!isRunSession },
            { label: 'Refine', command: 'babelgit.refine', icon: 'edit', when: !!isRunSession },
            { label: 'Reject', command: 'babelgit.reject', icon: 'discard', when: !!isRunSession },
            { label: 'Ship (verdict)', command: 'babelgit.ship', icon: 'rocket', when: !!isRunSession },
            { label: 'Ship — deliver now', command: 'babelgit.ship', icon: 'rocket', when: !!isShipReady && !isRunSession },
            { label: 'View history', command: 'babelgit.history', icon: 'history', when: hasActive },
        ];
        return actions.filter(a => a.when).map(a => {
            const node = new TreeNode(a.label, 'action', vscode.TreeItemCollapsibleState.None);
            node.iconPath = new vscode.ThemeIcon(a.icon);
            node.command = { command: a.command, title: a.label };
            return node;
        });
    }
}
exports.ActionsProvider = ActionsProvider;
// ─── Watcher ──────────────────────────────────────────────────────────────────
class WatcherProvider {
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
        const status = this.watcher.watchStatus;
        if (!status || !status.running) {
            const stoppedNode = new TreeNode('Watcher stopped', 'watcherStatus', vscode.TreeItemCollapsibleState.None);
            stoppedNode.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
            const startNode = new TreeNode('Start watcher', 'action', vscode.TreeItemCollapsibleState.None);
            startNode.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'));
            startNode.command = { command: 'babelgit.watchStart', title: 'Start Watcher' };
            const infoNode = new TreeNode('File edits without a WI are not blocked', 'hint', vscode.TreeItemCollapsibleState.None);
            infoNode.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
            return [stoppedNode, startNode, infoNode];
        }
        const nodes = [];
        // Status header
        const runningNode = new TreeNode('Watcher running', 'watcherStatus', vscode.TreeItemCollapsibleState.None);
        runningNode.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
        if (status.startedAt)
            runningNode.description = `since ${formatAge(status.startedAt)}`;
        nodes.push(runningNode);
        // Last check
        if (status.lastCheck) {
            const secs = Math.round((Date.now() - new Date(status.lastCheck).getTime()) / 1000);
            const checkNode = new TreeNode(`Last check: ${secs}s ago`, 'label', vscode.TreeItemCollapsibleState.None);
            checkNode.iconPath = new vscode.ThemeIcon('clock');
            nodes.push(checkNode);
        }
        // Stop button
        const stopNode = new TreeNode('Stop watcher', 'action', vscode.TreeItemCollapsibleState.None);
        stopNode.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('charts.red'));
        stopNode.command = { command: 'babelgit.watchStop', title: 'Stop Watcher' };
        nodes.push(stopNode);
        // Recent alert events
        const events = this.watcher.watchEvents;
        const alerts = events
            .filter((e) => ['revert', 'ci_failure', 'external_commit', 'error'].includes(e.type))
            .slice(-5)
            .reverse();
        if (alerts.length > 0) {
            const alertsHeader = new TreeNode(`Recent events (${alerts.length})`, 'section', vscode.TreeItemCollapsibleState.Expanded);
            alertsHeader.iconPath = new vscode.ThemeIcon('bell');
            alertsHeader.children = alerts.map((ev) => {
                const icons = {
                    revert: 'warning',
                    ci_failure: 'error',
                    external_commit: 'arrow-down',
                    error: 'bug',
                };
                const colors = {
                    revert: 'list.warningForeground',
                    ci_failure: 'list.errorForeground',
                    external_commit: 'charts.blue',
                    error: 'list.errorForeground',
                };
                const node = new TreeNode(ev.message, 'watchEvent', vscode.TreeItemCollapsibleState.None);
                node.iconPath = new vscode.ThemeIcon(icons[ev.type] ?? 'info', new vscode.ThemeColor(colors[ev.type] ?? 'foreground'));
                node.description = formatAge(ev.timestamp);
                node.tooltip = `${ev.type} · ${formatDate(ev.timestamp)}`;
                return node;
            });
            nodes.push(alertsHeader);
        }
        return nodes;
    }
}
exports.WatcherProvider = WatcherProvider;
//# sourceMappingURL=sidebarProvider.js.map