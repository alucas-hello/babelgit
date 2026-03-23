# The Workflow State Machine
## babelgit's Core Mental Model

> *"Whatever 'In Testing' means to a team is up to them. What happens to the files when you 'babel testing' and the rules that execute when you do so — that's the babelgit core value proposition."*
> — Project owner, Session 03

---

## The Insight

Teams already have working agreements. They already have shared vocabulary. They already have a model for communicating the state of work. It lives on their agile board, in their columns.

**The columns are the states. The transitions between columns are the commands. babelgit makes those transitions executable.**

Every team already knows what "In Testing" means. It means specific people, specific gates, specific next actions, specific risks. The column name *is* the working agreement, compressed into words the whole team already uses and understands.

babelgit doesn't replace that vocabulary. It executes it.

```bash
babel testing
```

Doesn't mean "run git push with these flags." It means: *transition this work to the Testing state according to our team's definition of what that means* — which the team has defined in their babel config, and which babelgit executes correctly, completely, and consistently every time.

---

## Why This Solves the Vocabulary Wall

The vocabulary wall problem in git is real: terminology that leaks implementation details, words that mean different things in different contexts, no shared language between what the team thinks about and what the tool requires.

The previous approach to solving this was to design a better universal vocabulary. That's the wrong goal. **Teams don't share vocabulary — they share structure.**

Every team has columns. Every team has transitions. The structure is universal. The words are team-specific.

babelgit ships with a small set of structural primitives — the operations every team needs regardless of workflow:

```bash
babel save      # checkpoint work in progress locally
babel sync      # get current with the team's shared state  
babel status    # where am I, what state is my work in
babel undo      # reverse the last operation
babel history   # what happened, what can I recover
```

And a workflow surface that teams define themselves:

```bash
babel review    # team A's word for "ready for peer review"
babel testing   # team B's word for "handed to QA"
babel ready     # team C's word for "approved and ready to ship"
babel ship      # any team's word for "merge and deploy"
```

Same git operations underneath. Team vocabulary on top. The vocabulary wall disappears not because we found better universal words, but because every team uses words they already chose.

---

## Why This Solves the Invisible State Problem

If babelgit knows what workflow state a piece of work is in, it can show the user that — in their own vocabulary — instead of raw git status.

**Instead of:**
```
On branch feature/auth-fix
Your branch is ahead of 'origin/feature/auth-fix' by 2 commits.
nothing to commit, working tree clean
```

**babelgit shows:**
```
● auth-fix  [In Progress]
  2 checkpoints saved, not yet shared with the team
  Ready to move to: Review
  Last synced with team: 14 minutes ago
```

The state is expressed in team vocabulary. The user always knows where their work is in the workflow they already think in. The invisible state problem is solved not by better git status output, but by connecting git state to workflow state.

---

## The Architecture This Implies

babelgit is a **workflow engine with git as its persistence layer.**

```
Team's agile board     →    babel config    →    git operations
(conceptual workflow)       (executable)         (persistence)
```

The transition `babel testing` might execute:

```yaml
# What babelgit does when you run 'babel testing':
on_enter:
  - sync from dev branch
  - run: npm test                        # team-defined gate
  - push branch to origin
  - open PR against: staging
  - require_passing: [lint, tests]
  - notify: [qa-team-channel]
  - tag_commit_with: ticket_number       # from branch name
  
protected:
  - cannot transition back to In Progress without explicit command
  - cannot transition to Ship without QA approval flag
```

All of that is git operations under the hood. From the user's perspective, they typed two words that mean what they already mean.

---

## The Default Config Problem

A workflow engine is only adoptable if teams don't have to design their workflow from scratch. This is what JIRA understood: ship with defaults that represent best practices, let teams tweak from there.

**babelgit must ship with opinionated default workflow configurations** that represent genuinely good practices for AI-augmented development teams. These defaults are not just convenient starting points — they are babelgit's product opinion about how modern teams should work.

### What Good Defaults Require

The defaults must be:

1. **Immediately recognizable** — A team looking at the default config should say "yes, this is basically how we work" or "this is clearly a reasonable way to work"
2. **Genuinely safe** — The defaults should prevent the most common disasters without requiring teams to configure safety themselves
3. **AI-aware** — Unlike traditional agile tooling defaults, babelgit's defaults should be designed for the reality that contributors include AI agents
4. **Progressively complex** — Simple teams should find the simple default. Complex teams should find a more sophisticated default that matches their reality

### Proposed Default Configurations (to be fully designed)

**Default 1: Solo / Small Team**
For individuals or very small teams, possibly with AI agents.
```
Columns: In Progress → Review → Done
```
Simple PR-based workflow. Protected main. AI agents work on feature branches only.

**Default 2: Standard Agile Team** *(the JIRA default equivalent)*
For teams with dedicated QA and review processes.
```
Columns: In Progress → In Review → In Testing → Done
```
PRs required for review. QA gate before merge. Branch protection on main and staging.

**Default 3: Continuous Delivery Team**
For teams with automated testing and frequent deploys.
```
Columns: In Progress → Ready → Deployed
```
Automated gates replace manual review. Trunk-based development. Short-lived branches.

**Default 4: Enterprise / Regulated**
For teams with compliance requirements, audit trails, multiple approval stages.
```
Columns: In Progress → Peer Review → Tech Lead Review → QA → Staging → Production
```
Multiple required approvals. Signed commits. Full audit trail. Restricted merge permissions.

The exact column names, git operations, gates, and rules for each of these defaults is a design exercise. The point is that teams choose a starting point that matches their reality and tune from there — exactly like choosing a JIRA project template.

---

## The MCP Implication

This reframes what babelgit's MCP server looks like.

The MCP tool isn't `babel_push` or `babel_commit`. It's:

```
babel_transition(state: "testing", work_item: "auth-fix")
```

Agents participate in the team workflow, not just the git operations. An agent that calls `babel_transition(state: "review")` is doing exactly what a human contributor does when they move a card on the board — it triggers all the same gates, the same checks, the same notifications. The agent is a team member operating within the team's working agreements.

This also means the agent can't accidentally skip states. It can't jump from "In Progress" directly to "Ship" if the team config requires Review and Testing in between. The workflow is enforced for agents exactly as it is for humans.

---

## What This Changes About the Product

Before this insight, babelgit was a better git interface with governance bolted on.

After this insight, babelgit is a **workflow execution engine** that:

1. Connects agile board concepts to git operations
2. Makes working agreements executable rather than documented
3. Bridges the gap between "what state is this work in" (the board) and "what state is the code in" (the repo) — a gap teams have always managed manually
4. Speaks the team's existing vocabulary, not git vocabulary or a new babelgit vocabulary
5. Enforces the workflow for humans and agents identically

The git UX problem is still solved. But it's solved as a consequence of the larger thing, not as the primary goal.

---

## Open Design Questions

1. **What are the full default configurations?** — Columns, transitions, gates, git operations, and rules for each default template
2. **How does the config define a transition?** — What can a transition do? What gates can it enforce? What external integrations can it call?
3. **How are workflow state and git branch related?** — Is each piece of work a branch? What happens when a work item has multiple branches?
4. **How does babelgit know what "work item" it's operating on?** — Branch naming convention? Explicit declaration? Integration with Jira/Linear?
5. **What are the structural primitives?** — The built-in commands every team has regardless of workflow config
6. **How does the status display work?** — What does `babel status` show? How does it connect git state to workflow state in the team's vocabulary?
7. **What happens at the edges of the workflow?** — How does work get created (first branch)? How does it get closed (merged and done)? What happens to the branch after Done?
8. **How are external integrations handled?** — Jira/Linear ticket transitions, Slack notifications, CI/CD triggers — are these built-in or plugin?

---

*This document captures the foundational insight from Session 03. It supersedes earlier thinking about universal vocabulary design. The vocabulary is the team's. The structure is babelgit's. The execution is git's.*
