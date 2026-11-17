# Questions page for Claude Code

English | [Русский](README.ru.md)

When Claude has several things for you to decide (open points of a feature, implementation choices, clarifications), it usually writes them as a numbered list. You then answer "1 — yes, 3 — later" and lose track of which answer goes with which question, and of what Claude said back.

This mod moves those questions onto a page in your browser, hosted by the [webhub](https://github.com/jabenb/claude-webhub) hub. Claude posts them there, you answer each one in its own field or with a ready option, and the page sends all answers back to the session as one message, each under its question. Claude then replies to every answer, and its reply shows under that question, marked as resolved or still open.

## Install

The page lives in the webhub hub, so the mod needs the `webhub` mod. Install it first, then this one:

```
/plugin install webhub --marketplace jabenb/claude-webhub
/plugin install questions --marketplace jabenb/claude-questions-pane
```

Answer `y` to add the marketplace, then pick a scope (see below).

From a shell:

```bash
claude plugin install webhub --marketplace jabenb/claude-webhub
claude plugin install questions --marketplace jabenb/claude-questions-pane
```

In the Claude desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `jabenb/claude-webhub` and add **webhub**, then the same with `jabenb/claude-questions-pane` and **questions**.

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

Install `webhub` in the same scope or a wider one: the mod runs only where the hub runs too.

If you already load the mod from a folder (`--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`), remove that first: otherwise it loads twice.

## Language

The page follows the language and theme chosen in the hub (English, Russian or Ukrainian; light or dark). The answers message the page sends to Claude is in English by default: the install asks for the `language` option (`en` or `ru`); change it later in `/config` or under `/plugin`.

## Use

- Ask Claude for its questions, e.g. "look at this feature and prepare your questions". Claude calls the mod's `ask` tool instead of writing a list; its result names the page's address.
- `/questions` prints the address of this session's page. The hub's home page lists it under the session too. When the session runs on another machine, forward the hub's port (see the webhub README).
- Batches are on the left with their progress, the questions in the middle, and **Ready to send** on the right shows exactly what Claude will receive. Filter by status (to answer, ready, with Claude, resolved) or search.
- Each question has its own field; ready options are buttons (press again to clear). Drafts are saved as you type.
- **Send** sends one batch, **Send all answers** sends every answered question. Each answer is quoted under its question with an id like `[2.1]`.
- Claude answers each id with the `reply` tool: resolved, or open again when it asks you something back. A follow-up brings its own ready options in place of the old ones. **Resolve** and **Reopen** change that by hand.
- **Copy** puts a batch on the clipboard: every question with its exchange, the options still offered and unsent drafts.
- **Hide** removes a batch from the page, **Clear resolved** removes batches where everything is resolved. Neither touches the chat.
- Keys: `J` / `K` to move between questions, `1`–`9` to pick an option, `Enter` to type, `Esc` to leave the field, `/` to search, `Ctrl+Enter` to send the batch.

## Interview skills

Skills like `/grill-me` and `/grill-with-docs` from [mattpocock/skills](https://github.com/mattpocock/skills) (and the `grilling` skill Claude calls by itself) interview you one question at a time until every decision of a plan is made. With this mod they keep that method but ask in rounds on the page:

- A round holds only questions that do not depend on each other; the next round is built from your answers, so you are never asked about a branch you already ruled out.
- Every round goes to the page, even one with a single question, so the whole interview stays in one place.
- Claude looks in the code first and does not ask what it answers.
- Each question carries Claude's recommended answer as its first option, marked "(recommended)": press `1` to accept it.
- Batches are titled `<topic> — round N`, so the left column shows how far the interview has got.
- When no decision is left open, Claude writes the final brief, every decision with its reason, where your project's instructions keep such documents (in chat when they say nothing), and starts the work only once you confirm it.

Install the skills next to this mod, in the same project:

```bash
claude plugin install mattpocock-skills@claude-plugins-official --scope local
```

then start a new session and run e.g. `/grill-with-docs add a CSV export of orders`.

## How it keeps the questions

Each session has its own file, `~/.claude/mods-data/questions/<session id>.jsonl` (under `$CLAUDE_CONFIG_DIR` when that is set): one line per change, so a restart or `--resume` brings the page back as you left it, drafts, hidden batches and statuses set by hand included. A file that grows long is rewritten as one snapshot.

- **Fork.** Every row the mod leaves in the chat (Claude's `ask` and `reply` results, the answers message) ends with a short marker like `‹q:1a2b3c4d#7›`: whose file, and how far it had got. A fork finds the last marker in the history it copied and starts from the parent's file at that point, so it does not pick up what the parent did after the fork.
- **Older sessions.** A session with no file yet (from before this version, or whose file is gone) is rebuilt from the chat history on its next start and gets its file then. Drafts, hidden batches and statuses set by hand were never written down for those, so they are not brought back.
- **Clean-up.** Once a day the mod deletes the files of sessions whose chat Claude Code has already removed (it keeps chats for `cleanupPeriodDays`, 30 days by default) and that were not touched for 30 days.

## Uninstall

```
/plugin uninstall questions
```

## License

MIT
