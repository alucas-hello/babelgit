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
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
class SidebarProvider {
    watcher;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(watcher) {
        this.watcher = watcher;
        watcher.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return element.children ?? [];
        }
        const wi = this.watcher.currentWorkItem;
        if (!wi) {
            return [new TreeNode('No active work item', 'hint', vscode.TreeItemCollapsibleState.None)];
        }
        const checkpoints = this.watcher.checkpoints;
        const stageLabel = wi.ship_ready ? 'Ship Ready' : formatStage(wi.stage);
        const workItemNode = new TreeNode(wi.id, 'workItem', vscode.TreeItemCollapsibleState.Expanded, wi.description);
        workItemNode.children = [
            labelNode('Status', stageLabel),
            labelNode('Branch', wi.branch),
            labelNode('Started', formatDate(wi.created_at)),
            ...checkpointSection(checkpoints),
        ];
        return [workItemNode];
    }
}
exports.SidebarProvider = SidebarProvider;
function labelNode(key, value) {
    const node = new TreeNode(`${key}: ${value}`, 'label', vscode.TreeItemCollapsibleState.None);
    return node;
}
function checkpointSection(checkpoints) {
    if (checkpoints.length === 0) {
        return [labelNode('Checkpoints', 'none')];
    }
    const sectionNode = new TreeNode(`Checkpoints (${checkpoints.length})`, 'section', vscode.TreeItemCollapsibleState.Collapsed);
    sectionNode.children = checkpoints
        .slice()
        .reverse()
        .map(cp => {
        const verdictIcons = {
            keep: '✓',
            ship: '✓',
            refine: '~',
            reject: '✗',
        };
        const icon = verdictIcons[cp.verdict] ?? '?';
        const anchor = cp.is_recovery_anchor ? ' ← anchor' : '';
        const label = `${icon} ${cp.verdict.toUpperCase()}${anchor} — "${cp.notes}"`;
        const node = new TreeNode(label, 'checkpoint', vscode.TreeItemCollapsibleState.None);
        node.description = formatDate(cp.called_at);
        node.tooltip = `Commit: ${cp.git_commit.slice(0, 7)}\n${formatDate(cp.called_at)}`;
        return node;
    });
    return [sectionNode];
}
function formatStage(stage) {
    const labels = {
        in_progress: 'In Progress',
        run_session_open: 'Run Session Open',
        paused: 'Paused',
        shipped: 'Shipped',
        stopped: 'Stopped',
    };
    return labels[stage] ?? stage;
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
        if (description) {
            this.description = description;
        }
        if (contextValue === 'workItem') {
            this.iconPath = new vscode.ThemeIcon('circle-filled');
        }
        else if (contextValue === 'hint') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
        else if (contextValue === 'section') {
            this.iconPath = new vscode.ThemeIcon('history');
        }
    }
}
//# sourceMappingURL=sidebarProvider.js.map