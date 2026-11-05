# Questions pane for Claude Code

English | [Русский](README.ru.md)

When Claude has several things for you to decide (open points of a feature, implementation choices, clarifications), it usually writes them as a numbered list. You then answer "1 — yes, 3 — later" and lose track of which answer goes with which question, and of what Claude said back.

This mod moves those questions into a side pane. Claude posts them there, you answer each one in its own field or with a ready option, and the pane sends all answers back as one message, each under its question. Claude then replies to every answer, and its reply shows under that question, marked as resolved or still open.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install questions --marketplace jabenb/claude-questions-pane
```

Answer `y` to add the marketplace, then pick a scope (see below).

From a shell:

```bash
claude plugin install questions --marketplace jabenb/claude-questions-pane
```

In the Claude desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `jabenb/claude-questions-pane`, then **Add plugin**.

### Globally or for one project

The scope decides where the mod runs:

| Scope | Runs in | Written to |
|---|---|---|
| `user` (default) | every project | `~/.claude/settings.json` |
| `project` | this repository, for everyone who clones it | `<project>/.claude/settings.json`, committed |
| `local` | this repository, only for you | `<project>/.claude/settings.local.json`, not committed |

Globally:

```bash
claude plugin install questions --marketplace jabenb/claude-questions-pane --scope user
```

For one project (run it in the project's folder):

```bash
claude plugin install questions --marketplace jabenb/claude-questions-pane --scope project
```

If you already load the mod from a folder (`--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`), remove that first: otherwise it loads twice.

## Language

The pane and the answers message are in English by default. The install asks for the `language` option (`en` or `ru`); change it later in `/config` or under `/plugin`.

## Use

- Ask Claude for its questions, e.g. "look at this feature and prepare your questions". Claude calls the pane's `ask` tool instead of writing a list, and the pane opens.
- Open the pane any time with `/questions` or the ❓ button in the footer.
- Each question has its own field; ready options are buttons (press again to clear). What you type is saved when you leave the field.
- **Send** sends one batch, **Send all answers** sends every answered question. Each answer is quoted under its question with an id like `[2.1]`.
- Claude answers each id with the `reply` tool: ✓ resolved, or open again when it asks you something back. A follow-up brings its own ready options, in place of the question's old buttons. **↺ reopen** and **✓ resolved** let you change that by hand.
- **⧉** next to a batch copies the whole batch, next to a question copies that question: its text, the whole exchange under it, the options still offered and an unsent draft.
- **Hide** removes a batch from the pane, **Clear resolved** removes batches where everything is resolved. Neither touches the chat.

## How it keeps the questions

Each session has its own file, `~/.claude/mods-data/questions/<session id>.jsonl` (under `$CLAUDE_CONFIG_DIR` when that is set): one line per change, so a restart or `--resume` brings the pane back as you left it, drafts, folded and hidden batches and statuses set by hand included. A file that grows long is rewritten as one snapshot.

- **Fork.** Every row the pane leaves in the chat (Claude's `ask` and `reply` results, the answers message) ends with a short marker like `‹q:1a2b3c4d#7›`: whose file, and how far it had got. A fork finds the last marker in the history it copied and starts from the parent's file at that point, so it does not pick up what the parent did after the fork.
- **Older sessions.** A session with no file yet (from before this version, or whose file is gone) is rebuilt from the chat history on its next start and gets its file then. Drafts, folds, hidden batches and statuses set by hand were never written down for those, so they are not brought back.
- **Clean-up.** Once a day the mod deletes the files of sessions whose chat Claude Code has already removed (it keeps chats for `cleanupPeriodDays`, 30 days by default) and that were not touched for 30 days.

## Uninstall

```
/plugin uninstall questions
```

## License

MIT
