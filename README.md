# brandon-mods

Three Claude Code mods, packaged as one plugin marketplace.

| Mod | What it does |
|---|---|
| `client-status-line` | Status line showing the session's client and brand folder. Warns when Claude opens a file from another client's folder. `/client <name>` pins a client, `/client clear` resets. |
| `model-router` | Routes each turn to Haiku, Sonnet or Opus by rules, and sticks with the current model on weak signals. Asks before using Fable. `/route <model>` pins a model, `/route auto` releases the pin, and a `!opus` prefix forces one prompt. |
| `usage-view` | A status line with the signed-in profile, a context meter, and 5-hour and weekly plan usage. `/usage-view` opens the full pane. |

## Install on another machine

```bash
claude plugin marketplace add guerrilla2799/brandon-mods
claude plugin install client-status-line@brandon-mods --scope user
claude plugin install model-router@brandon-mods --scope user
claude plugin install usage-view@brandon-mods --scope user
```

Then start a new session (or run `/reload-plugins`). To pull later changes, run `claude plugin marketplace update brandon-mods`.

The mods need a Claude Code build with mods (function hooks) enabled. Version 2.1.314 or later works.

## Notes

- `client-status-line` reads client names from `01-Clients/<Client>/` paths. Copy `client-status-line/clients.example.json` to `client-status-line/clients.json` and list your own clients and brand folders (the real file is gitignored). Without it the mod toasts that `clients.json` is missing.
- Tests: `claude plugin test <mod folder>`.

## License

MIT. See `LICENSE`.
