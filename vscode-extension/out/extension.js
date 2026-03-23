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
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('babelgit');
    const watcher = new stateWatcher_1.StateWatcher();
    const runner = new babelRunner_1.BabelRunner(outputChannel);
    const statusBar = new statusBar_1.StatusBarManager(watcher);
    const sidebar = new sidebarProvider_1.SidebarProvider(watcher);
    vscode.window.createTreeView('babelgitWorkItem', {
        treeDataProvider: sidebar,
        showCollapseAll: true,
    });
    const cmd = (id, fn) => vscode.commands.registerCommand(id, async () => {
        try {
            await fn();
        }
        catch (err) {
            // Error already shown in output channel
        }
    });
    context.subscriptions.push(outputChannel, watcher, statusBar, cmd('babelgit.start', async () => {
        const desc = await vscode.window.showInputBox({
            prompt: 'What are you working on?',
            placeHolder: 'fix login timeout on mobile',
        });
        if (!desc)
            return;
        await runner.run(['start', desc]);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.save', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Notes for this save',
            placeHolder: 'auth flow working',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['save', notes] : ['save'];
        await runner.run(args);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.run', async () => {
        await runner.run(['run']);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.keep', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Keep — what did you verify?',
            placeHolder: 'tested on mobile, looks good',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['keep', notes] : ['keep'];
        await runner.run(args);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.refine', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Refine — what needs to change?',
            placeHolder: 'button alignment off on small screens',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['refine', notes] : ['refine'];
        await runner.run(args);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.reject', async () => {
        const reason = await vscode.window.showInputBox({
            prompt: 'Reject — why is this the wrong direction?',
            placeHolder: 'wrong approach entirely',
        });
        if (reason === undefined)
            return;
        const args = reason ? ['reject', reason] : ['reject'];
        await runner.run(args);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.ship', async () => {
        const wi = watcher.currentWorkItem;
        if (wi?.ship_ready) {
            // Delivery — no notes needed
            await runner.run(['ship']);
        }
        else {
            // Verdict — notes optional
            const notes = await vscode.window.showInputBox({
                prompt: 'Ship — what makes this production-ready?',
                placeHolder: 'all tests pass, reviewed',
            });
            if (notes === undefined)
                return;
            const args = notes ? ['ship', notes] : ['ship'];
            await runner.run(args);
        }
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.sync', async () => {
        await runner.run(['sync']);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.pause', async () => {
        const notes = await vscode.window.showInputBox({
            prompt: 'Pause — notes for the next person',
            placeHolder: 'left off on the auth middleware',
        });
        if (notes === undefined)
            return;
        const args = notes ? ['pause', notes] : ['pause'];
        await runner.run(args);
        watcher.refresh();
        sidebar.refresh();
    }), cmd('babelgit.state', () => {
        watcher.refresh();
        sidebar.refresh();
        return Promise.resolve();
    }), cmd('babelgit.history', async () => {
        historyPanel_1.HistoryPanel.show(watcher);
    }));
}
function deactivate() {
    // nothing — disposables handle cleanup
}
//# sourceMappingURL=extension.js.map