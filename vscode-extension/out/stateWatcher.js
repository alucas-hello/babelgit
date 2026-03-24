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
const child_process_1 = require("child_process");
class StateWatcher {
    _onDidChange = new vscode.EventEmitter();
    onDidChange = this._onDidChange.event;
    watcher;
    _currentState = null;
    _checkpoints = [];
    _allCheckpointGroups = [];
    _gitStats = null;
    _remoteBranches = [];
    _verdicts = null;
    _remoteRefreshTimer;
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
        this._verdicts = this.loadVerdicts();
        this.refreshRemoteBranches();
        // Poll remote branches every 60 seconds
        this._remoteRefreshTimer = setInterval(() => {
            this.refreshRemoteBranches();
            this._onDidChange.fire();
        }, 60_000);
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
        this._allCheckpointGroups = this.loadAllCheckpoints();
        const currentId = this._currentState?.current_work_item_id;
        this._checkpoints = currentId
            ? (this._allCheckpointGroups.find(g => g.workItemId === currentId)?.checkpoints ?? [])
            : [];
        this._gitStats = this.loadGitStats();
    }
    loadGitStats() {
        if (!this.workspaceRoot)
            return null;
        try {
            const opts = { cwd: this.workspaceRoot };
            // Uncommitted changes
            const shortstat = (0, child_process_1.execSync)('git diff --shortstat HEAD 2>/dev/null || echo ""', opts).toString().trim();
            let filesChanged = 0, insertions = 0, deletions = 0;
            if (shortstat) {
                filesChanged = parseInt(shortstat.match(/(\d+) file/)?.[1] ?? '0');
                insertions = parseInt(shortstat.match(/(\d+) insertion/)?.[1] ?? '0');
                deletions = parseInt(shortstat.match(/(\d+) deletion/)?.[1] ?? '0');
            }
            // Commits since last checkpoint
            const lastCheckpoint = this._checkpoints[this._checkpoints.length - 1];
            let commitsSinceCheckpoint = 0;
            let minutesSinceCheckpoint = null;
            if (lastCheckpoint) {
                const count = (0, child_process_1.execSync)(`git rev-list ${lastCheckpoint.git_commit}..HEAD --count 2>/dev/null || echo "0"`, opts).toString().trim();
                commitsSinceCheckpoint = parseInt(count) || 0;
                minutesSinceCheckpoint = Math.floor((Date.now() - new Date(lastCheckpoint.called_at).getTime()) / 60000);
            }
            return { filesChanged, insertions, deletions, commitsSinceCheckpoint, minutesSinceCheckpoint };
        }
        catch {
            return null;
        }
    }
    loadAllCheckpoints() {
        if (!this.workspaceRoot)
            return [];
        const checkpointsDir = path.join(this.workspaceRoot, '.babel', 'checkpoints');
        if (!fs.existsSync(checkpointsDir))
            return [];
        try {
            const files = fs.readdirSync(checkpointsDir).filter(f => f.endsWith('.json'));
            return files
                .map(f => {
                try {
                    const workItemId = f.replace(/\.json$/, '');
                    const raw = fs.readFileSync(path.join(checkpointsDir, f), 'utf8');
                    const checkpoints = JSON.parse(raw)
                        .sort((a, b) => a.called_at.localeCompare(b.called_at));
                    const description = this._currentState?.work_items[workItemId]?.description ?? '';
                    return { workItemId, description, checkpoints };
                }
                catch {
                    return null;
                }
            })
                .filter((g) => g !== null)
                .sort((a, b) => b.workItemId.localeCompare(a.workItemId)); // newest first
        }
        catch {
            return [];
        }
    }
    get isInitialized() {
        if (!this.workspaceRoot)
            return false;
        return fs.existsSync(path.join(this.workspaceRoot, '.babel', 'state.json'));
    }
    get currentWorkItem() {
        if (!this._currentState?.current_work_item_id)
            return null;
        return this._currentState.work_items[this._currentState.current_work_item_id] ?? null;
    }
    get checkpoints() {
        return this._checkpoints;
    }
    get allCheckpointGroups() {
        return this._allCheckpointGroups;
    }
    get gitStats() {
        return this._gitStats;
    }
    get workNotes() {
        if (!this.workspaceRoot)
            return null;
        const p = this.workNotesPath;
        try {
            return p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null;
        }
        catch {
            return null;
        }
    }
    get workNotesPath() {
        const id = this._currentState?.current_work_item_id;
        if (!id || !this.workspaceRoot)
            return null;
        return path.join(this.workspaceRoot, '.babel', 'notes', `${id}.md`);
    }
    get watchStatus() {
        if (!this.workspaceRoot)
            return null;
        try {
            const pidFile = path.join(this.workspaceRoot, '.babel', 'watch.pid');
            const statusFile = path.join(this.workspaceRoot, '.babel', 'watch-status.json');
            const running = fs.existsSync(pidFile);
            if (!running)
                return { running: false };
            const status = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : {};
            return { running: true, pid: status.pid, startedAt: status.started_at, lastCheck: status.last_check, alerts: status.alerts ?? [] };
        }
        catch {
            return null;
        }
    }
    get watchEvents() {
        if (!this.workspaceRoot)
            return [];
        try {
            const eventsFile = path.join(this.workspaceRoot, '.babel', 'watch-events.json');
            if (!fs.existsSync(eventsFile))
                return [];
            return JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
        }
        catch {
            return [];
        }
    }
    get state() {
        return this._currentState;
    }
    get workspacePath() {
        return this.workspaceRoot;
    }
    get verdicts() {
        return this._verdicts ?? { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' };
    }
    get remoteBranches() {
        return this._remoteBranches;
    }
    loadVerdicts() {
        if (!this.workspaceRoot)
            return null;
        try {
            const configPath = path.join(this.workspaceRoot, 'babel.config.yml');
            if (!fs.existsSync(configPath))
                return null;
            const raw = fs.readFileSync(configPath, 'utf8');
            const match = raw.match(/verdicts:\s*\n(?:[ \t]+\w+:[ \t]*\S+\n?)+/);
            if (!match)
                return null;
            const keep = raw.match(/keep:\s*(\S+)/)?.[1] ?? 'keep';
            const refine = raw.match(/refine:\s*(\S+)/)?.[1] ?? 'refine';
            const reject = raw.match(/reject:\s*(\S+)/)?.[1] ?? 'reject';
            const ship = raw.match(/ship:\s*(\S+)/)?.[1] ?? 'ship';
            return { keep, refine, reject, ship };
        }
        catch {
            return null;
        }
    }
    refreshRemoteBranches() {
        if (!this.workspaceRoot)
            return;
        try {
            const raw = (0, child_process_1.execSync)('git branch -r --format "%(refname:short)" 2>/dev/null', {
                cwd: this.workspaceRoot, encoding: 'utf8', timeout: 5000,
            }).trim();
            if (!raw) {
                this._remoteBranches = [];
                return;
            }
            const localIds = new Set(Object.keys(this._currentState?.work_items ?? {}));
            const branches = [];
            for (const ref of raw.split('\n').map(s => s.trim()).filter(Boolean)) {
                // Strip "origin/" prefix
                const branchName = ref.replace(/^origin\//, '');
                // Match feature/WI-XXX-* pattern
                const m = branchName.match(/^(?:feature|fix)\/([A-Z]+-\d+)-(.+)$/);
                if (!m)
                    continue;
                const [, workItemId, slug] = m;
                const description = slug.replace(/-/g, ' ');
                const isLocal = localIds.has(workItemId);
                branches.push({ name: branchName, workItemId, description, isLocal });
            }
            this._remoteBranches = branches;
        }
        catch {
            this._remoteBranches = [];
        }
    }
    dispose() {
        if (this._remoteRefreshTimer)
            clearInterval(this._remoteRefreshTimer);
        this.watcher?.dispose();
        this._onDidChange.dispose();
    }
}
exports.StateWatcher = StateWatcher;
//# sourceMappingURL=stateWatcher.js.map