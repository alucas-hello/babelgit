# sandbox/

This directory is for manual testing, scratch scripts, and exploratory work.
It is gitignored from the main project. Make a mess here.

## Contents

- `test-repos/` — temporary git repos created during manual testing (blown away freely)
- `scripts/` — manual test scripts and utilities

## Quick lifecycle test

```bash
node scripts/lifecycle-test.js
```

Creates a fresh repo, runs the full babel lifecycle, prints what happened.
