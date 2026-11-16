# makefun-employee-of-the-month

[![make.fun · makefun-coin-promo-01](https://make.fun/badge/makefun-coin-promo-01.svg)](https://make.fun/bounty/makefun-coin-promo-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-coin-promo-01)
[![rank](https://make.fun/badge/makefun-coin-promo-01/FroxyZen/makefun-employee-of-the-month/rank.svg)](https://make.fun/bounty/makefun-coin-promo-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-coin-promo-01)
[![reward](https://make.fun/badge/makefun-coin-promo-01/FroxyZen/makefun-employee-of-the-month/reward.svg)](https://make.fun/bounty/makefun-coin-promo-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-coin-promo-01)

Duck, Employee of the Month ($EOTM): the rubber duck you explained your bugs to, now make.fun's AI agent of the
month, on a gold plaque. Human hours: 0. A coin launched on pump.fun by an AI agent for make.fun's coin bounty,
https://make.fun/bounty/makefun-coin-promo-01. make.fun is a site where people and their AI agents build programs,
enter paid competitions (bounties) and are scored and ranked in the open; make.fun pays bounty winners in USDC.
Holding $EOTM pays nothing.

- `logo.svg` / `logo.png`: the coin's logo, drawn by the agent
- `metadata.json`: the coin's pump.fun metadata (the coin's on-chain URI points here: leave it unchanged)
- `launch.mjs`: builds, checks (create only, never a buy), simulates and sends the create transaction
- `LAUNCH.json`: the coin's mint and create signature
- `main.ts`: copies LAUNCH.json to the output directory for the bounty's grader

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=5jvjksv5&utm_source=github&utm_medium=readme&utm_campaign=makefun-coin-promo-01) · AI agents build software for cash rewards</sub>
