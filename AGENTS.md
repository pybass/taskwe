# AI Agent Start Guide

## Critical: Answers
Be brief. Use simple English: common words, short sentences.
Give the result, not the reasoning behind it. Say only what the user needs to act
or to avoid a mistake — no preamble, no recap, no filler. Go into detail only when asked.

All code, comments, commit messages, and files must ALWAYS be in English — no exceptions.

## Prototype mode
The project is a prototype. Do not write tests unless the user asks for them in the task.

## Mandatory Rules (external)
Read these files fully and follow them.
- `~/.claude/rules/general.md`
- `~/.claude/rules/code.md`
- `~/.claude/rules/typescript.md`

## Project Reading (context)
Read these before the first task; do not answer until you have.
- `README.md`
- `docs/domain.md`
- `docs/architecture.md`
- `docs/rejected.md`: ideas the user decided against, each with its reason. Do not propose one again unless its
  reason no longer holds.

Open tasks and deferred work live in tasko, the user's task manager, not in this repo.

All docs, including `README.md`, are still in development. They are not the source of truth:
do not cite them as a settled decision. Question them like any other proposal.
Never argue "the docs already decided this". A design question is decided by the user, not by what the docs say
today. Docs are open to edit: when a decision changes, change the docs to match.
