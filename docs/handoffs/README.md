# Handoffs

Files in this folder are how context moves between agents and sessions (`docs/plan.md`, "How the work is done"):

- **`m<N>-<task>.md`**: the brief the orchestrator gives a subagent for one piece of a milestone: the goal, the
  §-sections of `docs/design.md` to read, the files it owns, the tests it must make pass, and what it must not touch.
  Subagents never commit, push, or touch secrets or CI.
- **`next-session.md`**: written before a session's context grows large: the milestone's state, what is green, what is
  open, the exact next step. The next session starts from it. It is overwritten each time.

Nothing here names the company this work sample was written for.
