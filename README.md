# beeBlocks

A Claude Code mod: a live agent dashboard plus this Mac's vitals, in Dracula colours.

- **Agent dashboard**, forked from [Flightdeck](https://github.com/scasella/claude-flightdeck) 0.5.1 (MIT, Stephen Casella): model vitals, context and cost, the architect timeline, every permission check, subagent cards and swimlanes, a turn receipt and a session log.
- **System panel**, sampled every 5 s: CPU % and load, CPU temperature, RAM used and memory pressure, swap, free disk, network down/up, battery, Docker containers, and whether `localhost:3000` / `:3001` answer.
- **Alerts**: the value turns red and a toast fires when free disk drops under 10 GB, memory pressure is high, or the CPU passes 90 °C. Each fires once per crossing.
- **Quote**: the hour's quote (from the idle-launch mod) as a still panel at the bottom of the pane. Every panel is always shown, with a "none yet" line while it is empty; nothing is drawn above the prompt.

## Setup

CPU temperature needs [macmon](https://github.com/vladkens/macmon) (Apple Silicon, no sudo):

```sh
brew install macmon
```

Without it the panel shows the install hint in place of the temperature; everything else still reads.

Install it, at the prompt of a terminal session:

```
/plugin install beeblocks --marketplace akshat99812/beeBlocks
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```sh
claude plugin install beeblocks --marketplace akshat99812/beeBlocks
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `akshat99812/beeBlocks`, then Add plugin.

To work on it from a local clone, add the clone as a marketplace (`claude plugin marketplace add <folder>`); it is then read in place, so an edit plus `/reload-plugins` picks it up.

## Use

`/beeBlocks` opens the pane; `/beeBlocks close`, `/beeBlocks reset`, `/beeBlocks layout auto|compact|wide|mini`.
`/config` has the options: `palette` (`dracula` by default, `theme`, `pastel`), `panels` (drop `system` to hide it), and Flightdeck's own.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
