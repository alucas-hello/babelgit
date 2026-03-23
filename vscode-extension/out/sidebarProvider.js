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
exports.ActionsProvider = exports.PausedWorkProvider = exports.CheckpointsProvider = exports.ActiveWorkProvider = void 0;
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
        return [
            labelNode('ID', wi.id),
            labelNode('Status', formatStage(wi)),
            labelNode('Branch', wi.branch),
            labelNode('Started', formatDate(wi.created_at)),
            labelNode('Description', wi.description),
        ];
    }
}
exports.ActiveWorkProvider = ActiveWorkProvider;
// ─── Checkpoints ─────────────────────────────────────────────────────────────
class CheckpointsProvider {
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
        const checkpoints = this.watcher.checkpoints;
        if (checkpoints.length === 0) {
            return [new TreeNode('No checkpoints yet', 'hint', vscode.TreeItemCollapsibleState.None)];
        }
        const verdictIcons = {
            keep: '✓',
            ship: '✓',
            refine: '~',
            reject: '✗',
        };
        return checkpoints
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
    }
}
exports.CheckpointsProvider = CheckpointsProvider;
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