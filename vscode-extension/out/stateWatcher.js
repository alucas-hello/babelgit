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
exports.StateWatcher = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class StateWatcher {
    _onDidChange = new vscode.EventEmitter();
    onDidChange = this._onDidChange.event;
    watcher;
    _currentState = null;
    _checkpoints = [];
    workspaceRoot;
    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            this.start();
        }
    }
    start() {
        const pattern = new vscode.RelativePattern(this.workspaceRoot, '.babel/**');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const refresh = () => {
            this.refresh();
            this._onDidChange.fire();
        };
        this.watcher.onDidChange(refresh);
        this.watcher.onDidCreate(refresh);
        this.watcher.onDidDelete(refresh);
        this.refresh();
    }
    refresh() {
        if (!this.workspaceRoot)
            return;
        const statePath = path.join(this.workspaceRoot, '.babel', 'state.json');
        try {
            if (fs.existsSync(statePath)) {
                const raw = fs.readFileSync(statePath, 'utf8');
                this._currentState = JSON.parse(raw);
            }
            else {
                this._currentState = null;
            }
        }
        catch {
            this._currentState = null;
        }
        this._checkpoints = this.loadCheckpoints();
    }
    loadCheckpoints() {
        if (!this.workspaceRoot || !this._currentState?.current_work_item_id)
            return [];
        const checkpointsDir = path.join(this.workspaceRoot, '.babel', 'checkpoints', this._currentState.current_work_item_id);
        if (!fs.existsSync(checkpointsDir))
            return [];
        try {
            const files = fs.readdirSync(checkpointsDir).filter(f => f.endsWith('.json'));
            return files
                .map(f => {
                try {
                    const raw = fs.readFileSync(path.join(checkpointsDir, f), 'utf8');
                    return JSON.parse(raw);
                }
                catch {
                    return null;
                }
            })
                .filter((c) => c !== null)
                .sort((a, b) => a.called_at.localeCompare(b.called_at));
        }
        catch {
            return [];
        }
    }
    get currentWorkItem() {
        if (!this._currentState?.current_work_item_id)
            return null;
        return this._currentState.work_items[this._currentState.current_work_item_id] ?? null;
    }
    get checkpoints() {
        return this._checkpoints;
    }
    get state() {
        return this._currentState;
    }
    get workspacePath() {
        return this.workspaceRoot;
    }
    dispose() {
        this.watcher?.dispose();
        this._onDidChange.dispose();
    }
}
exports.StateWatcher = StateWatcher;
//# sourceMappingURL=stateWatcher.js.map