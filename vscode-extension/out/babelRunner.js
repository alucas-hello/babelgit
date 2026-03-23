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
exports.BabelRunner = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
class BabelRunner {
    outputChannel;
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    async run(args, cwd) {
        return new Promise((resolve, reject) => {
            const workspacePath = cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                reject(new Error('No workspace folder open'));
                return;
            }
            this.outputChannel.show(true);
            this.outputChannel.appendLine(`\n$ babel ${args.join(' ')}`);
            this.outputChannel.appendLine('─'.repeat(50));
            const proc = (0, child_process_1.spawn)('babel', args, {
                cwd: workspacePath,
                env: { ...process.env, BABEL_ACTIVE: '1' },
                shell: false,
            });
            proc.stdout.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });
            proc.stderr.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });
            proc.on('close', (code) => {
                this.outputChannel.appendLine('─'.repeat(50));
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(`babel ${args[0]} exited with code ${code}`));
                }
            });
            proc.on('error', (err) => {
                if (err.code === 'ENOENT') {
                    this.outputChannel.appendLine('Error: babel command not found. Run: npm install -g babelgit');
                }
                else {
                    this.outputChannel.appendLine(`Error: ${err.message}`);
                }
                reject(err);
            });
        });
    }
}
exports.BabelRunner = BabelRunner;
//# sourceMappingURL=babelRunner.js.map