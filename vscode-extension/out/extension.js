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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const stateWatcher_1 = require("./stateWatcher");
const babelRunner_1 = require("./babelRunner");
const statusBar_1 = require("./statusBar");
const sidebarProvider_1 = require("./sidebarProvider");
const historyPanel_1 = require("./historyPanel");
const runPanel_1 = require("./runPanel");
const workItemPanel_1 = require("./workItemPanel");
const boardPanel_1 = require("./boardPanel");
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('babelgit');
    const watcher = new stateWatcher_1.StateWatcher();
    const runner = new babelRunner_1.BabelRunner(outputChannel);
    const statusBar = new statusBar_1.StatusBarManager(watcher);
    const activeProvider = new sidebarProvider_1.ActiveWorkProvider(watcher);
    const historyProvider = new sidebarProvider_1.HistoryProvider(watcher);
    const actionsProvider = new sidebarProvider_1.ActionsProvider(watcher);
    const watcherProvider = new sidebarProvider_1.WatcherProvider(watcher);
    vscode.window.createTreeView('babelgitActive', { treeDataProvider: activeProvider });
    vscode.window.createTreeView('babelgitHistory', { treeDataProvider: historyProvider });
    vscode.window.createTreeView('babelgitActions', { treeDataProvider: actionsProvider });
    vscode.window.createTreeView('babelgitWatcher', { treeDataProvider: watcherProvider });
    const refreshAll = () => { watcher.refresh(); };
    const cmd = (id, fn) => vscode.commands.registerCommand(id, async (...args) => {
        try {
            await fn(...args);
        }
        catch { /* shown in output channel */ }
    });
    // VS Code passes the TreeItem when a command fires from view/item/context inline buttons.
    // This extracts the string ID whether called directly (string) or from a context menu (TreeItem).
    const wiIdFromArg = (arg) => {
        if (typeof arg === 'string')
            return arg || undefined;
        if (arg && typeof arg.label === 'string') {
            return arg.label || undefined;
        }
        return undefined;
    };
    context.subscriptions.push(outputChannel, watcher, statusBar, cmd('babelgit.init', async () => {
        await runner.run(['init']);
        refreshAll();
    }), cmd('babelgit.start', async () => {
        const desc = await vscode.window.showInputBox({
            prompt: 'What are you working on?',
            placeHolder: 'fix login timeout on mobile',
        });
        if (!desc)
            return;
        await runner.run(['start', desc]);
        refreshAll();
    }), cmd('babelgit.save', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Notes for this save',
            placeHolder: 'auth flow working',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['save', notes] : ['save'];
        await runner.run(args);
        refreshAll();
    }), cmd('babelgit.run', async () => {
        await runner.run(['run']);
        refreshAll();
        runPanel_1.RunPanel.show(watcher, runner);
    }), cmd('babelgit.keep', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Keep — what did you verify?',
            placeHolder: 'tested on mobile, looks good',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['keep', notes] : ['keep'];
        await runner.run(args);
        refreshAll();
    }), cmd('babelgit.refine', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Refine — what needs to change?',
            placeHolder: 'button alignment off on small screens',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['refine', notes] : ['refine'];
        await runner.run(args);
        refreshAll();
    }), cmd('babelgit.reject', async () => {
        const reason = await vscode.window.showInputBox({
            prompt: 'Reject — why is this the wrong direction?',
            placeHolder: 'wrong approach entirely',
        });
        if (reason === undefined)
            return;
        const args = reason ? ['reject', reason] : ['reject'];
        await runner.run(args);
        refreshAll();
    }), cmd('babelgit.ship', async () => {
        const wi = watcher.currentWorkItem;
        if (wi?.ship_ready) {
            await runner.run(['ship']);
        }
        else {
            const notes = await vscode.window.showInputBox({
                prompt: 'Ship — what makes this production-ready?',
                placeHolder: 'all tests pass, reviewed',
            });
            if (notes === undefined)
                return;
            const args = notes ? ['ship', notes] : ['ship'];
            await runner.run(args);
        }
        refreshAll();
    }), cmd('babelgit.sync', async () => {
        await runner.run(['sync']);
        refreshAll();
    }), cmd('babelgit.pause', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Pause — notes for the next person',
            placeHolder: 'left off on the auth middleware',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['pause', notes] : ['pause'];
        await runner.run(args);
        refreshAll();
    }), cmd('babelgit.deleteItem', async (...args) => {
        const id = wiIdFromArg(args[0]);
        if (!id)
            return;
        const wi = watcher.state?.work_items[id];
        const confirm = await vscode.window.showWarningMessage(`Trash "${wi?.description ?? id}"?`, { modal: true }, 'Trash it');
        if (confirm !== 'Trash it')
            return;
        // Write state directly — babel stop has an interactive y/N prompt we can't answer
        const fs = require('fs');
        const path = require('path');
        const root = watcher.workspacePath;
        if (root) {
            const statePath = path.join(root, '.babel', 'state.json');
            try {
                const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                if (state.work_items[id]) {
                    state.work_items[id].stage = 'stopped';
                    state.work_items[id].ship_ready = false;
                }
                if (state.current_work_item_id === id)
                    delete state.current_work_item_id;
                fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
            }
            catch { /* ignore */ }
        }
        refreshAll();
    }), cmd('babelgit.continueItem', async (...args) => {
        const id = wiIdFromArg(args[0]);
        if (!id)
            return;
        await runner.run(['continue', id]);
        refreshAll();
    }), cmd('babelgit.startItem', async (...args) => {
        const id = wiIdFromArg(args[0]);
        if (!id)
            return;
        await runner.run(['start', id]);
        refreshAll();
        // Write agent inbox so the next Claude Code message picks this up
        const root = watcher.workspacePath;
        if (root) {
            const fs = require('fs');
            const path = require('path');
            const wi = watcher.state?.work_items[id];
            const inbox = {
                work_item_id: id,
                description: wi?.description ?? '',
                branch: wi?.branch ?? '',
                started_at: new Date().toISOString(),
                source: 'extension',
            };
            fs.writeFileSync(path.join(root, '.babel', 'agent-inbox.json'), JSON.stringify(inbox, null, 2));
        }
        // Spawn or focus a claude terminal and trigger the UserPromptSubmit hook automatically
        const TERMINAL_NAME = 'Claude';
        const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME && t.exitStatus === undefined);
        if (existing) {
            existing.show();
            // Small delay to ensure terminal is focused, then send newline to fire hook
            setTimeout(() => existing.sendText('\n'), 500);
        }
        else {
            const t = vscode.window.createTerminal({
                name: TERMINAL_NAME,
                shellPath: 'claude',
                cwd: watcher.workspacePath ?? undefined,
            });
            t.show();
            // Longer delay for claude to start up before sending trigger
            setTimeout(() => t.sendText('\n'), 3000);
        }
    }), cmd('babelgit.todoPush', async (...args) => {
        const id = args[0];
        if (!id)
            return;
        await runner.run(['todo', 'push', id]);
        refreshAll();
    }), cmd('babelgit.state', () => {
        refreshAll();
        return Promise.resolve();
    }), cmd('babelgit.history', async () => {
        historyPanel_1.HistoryPanel.show(watcher);
    }), cmd('babelgit.board', async () => {
        boardPanel_1.BoardPanel.show(watcher);
    }), cmd('babelgit.openWorkItem', async (...args) => {
        const id = args[0];
        if (!id)
            return;
        const wi = watcher.state?.work_items[id];
        if (!wi)
            return;
        const root = watcher.workspacePath;
        if (!root)
            return;
        if (wi.stage === 'run_session_open' && watcher.currentWorkItem?.id === id) {
            runPanel_1.RunPanel.show(watcher, runner);
        }
        else {
            const group = watcher.allCheckpointGroups.find(g => g.workItemId === id);
            const checkpoints = group?.checkpoints ?? [];
            workItemPanel_1.WorkItemPanel.open(context, wi, checkpoints, root);
        }
    }), cmd('babelgit.openNotes', async (...args) => {
        const filePath = args[0];
        if (!filePath)
            return;
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }), cmd('babelgit.watchStart', async () => {
        await runner.run(['watch', 'start']);
        refreshAll();
    }), cmd('babelgit.watchStop', async () => {
        await runner.run(['watch', 'stop']);
        refreshAll();
    }));
}
function deactivate() {
    // nothing — disposables handle cleanup
}
//# sourceMappingURL=extension.js.map