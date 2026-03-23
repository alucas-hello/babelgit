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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    watcher;
    item;
    constructor(watcher) {
        this.watcher = watcher;
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.command = 'babelgit.state';
        this.update();
        watcher.onDidChange(() => this.update());
    }
    update() {
        const wi = this.watcher.currentWorkItem;
        if (!wi) {
            this.item.hide();
            return;
        }
        const stageIcons = {
            in_progress: '$(circle-filled)',
            run_session_open: '$(eye)',
            paused: '$(debug-pause)',
            shipped: '$(check)',
            stopped: '$(stop)',
        };
        const icon = stageIcons[wi.stage] ?? '$(question)';
        const label = wi.ship_ready ? 'Ship Ready' : this.stageLabel(wi.stage);
        const shortId = wi.id.length > 12 ? wi.id.slice(0, 12) : wi.id;
        this.item.text = `${icon} ${shortId}  ${label}`;
        this.item.tooltip = `${wi.id}: ${wi.description}\nBranch: ${wi.branch}\nClick to refresh state`;
        if (wi.ship_ready) {
            this.item.color = new vscode.ThemeColor('charts.purple');
        }
        else if (wi.stage === 'run_session_open') {
            this.item.color = new vscode.ThemeColor('charts.blue');
        }
        else if (wi.stage === 'in_progress') {
            this.item.color = new vscode.ThemeColor('charts.green');
        }
        else if (wi.stage === 'paused') {
            this.item.color = new vscode.ThemeColor('charts.yellow');
        }
        else {
            this.item.color = undefined;
        }
        this.item.show();
    }
    stageLabel(stage) {
        const labels = {
            in_progress: 'In Progress',
            run_session_open: 'Run Session Open',
            paused: 'Paused',
            shipped: 'Shipped',
            stopped: 'Stopped',
        };
        return labels[stage] ?? stage;
    }
    dispose() {
        this.item.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBar.js.map