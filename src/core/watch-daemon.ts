/**
 * Watch daemon entry point — spawned as a detached background process by `babel watch start`.
 * Receives repo path as first CLI argument.
 */
process.env.BABEL_ACTIVE = '1'

import { runDaemon } from './watch.js'

const repoPath = process.argv[2]
if (!repoPath) {
  process.stderr.write('watch-daemon: missing repoPath argument\n')
  process.exit(1)
}

runDaemon(repoPath).catch((err) => {
  process.stderr.write(`watch-daemon error: ${err.message}\n`)
  process.exit(1)
})
