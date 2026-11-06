# Work for Hawkes Net for Babylon

You are fixing a problem Hawkes Studio's automated playtest found in Hawkes Net for Babylon (@hawkesgen/net-babylon, a library: games install it by GitHub tag tarball (npm once published), and Studio's Hawkes Net plugin offers it. Studio's package build (npm run build) makes dist/: a demo site (the example scene on the pinned @hawkesgen/net) plus the tarball. It is published as the beta site and playtested there; beta pages play on beta Hawkes Net's free test rooms (project netdemo). Branches dev -> beta -> main; maintained from the hawkes-net channel.).


## What J asked for

Camera and controls feel

Smooth follow camera, acceleration, and a mobile touch joystick.

Demos should feel like a game.

Work out what that means in this project (read the story doc and AGENTS.md), make it well, and keep it consistent with
the product's tone and style. If it's too big for one change, do a solid first part and say what's left in the summary.

## GPU budget: none

Nothing here was approved for GPU generation (images, video, music, 3D on the fleet). Do everything that needs no GPU
(design, data, specs, Claude-only steps, voice and sound effects are fine: cents each), price the GPU part with
`hawkesgen_estimate`, and end with that estimate in your summary so J can approve it. Never start a GPU server.

## Acceptance criteria (how this is judged)

The change is ready once your checks pass and its pull request is open; after it is merged into beta, beta's playtest
judges these, and the work is done only when every one of them passes there:
1. Camera follows with easing
2. Movement accelerates and decelerates
3. Touch joystick appears on touch devices

Where the game implements the playtest contract (`window.hawkesPlaytest`: see this project's AGENTS.md, and the spec
at `hawkesstudio/docs/playtest.md` next to this repository), add or extend a scenario that plays to what the criteria
describe (through real input, no teleporting; named setup shortcuts are fine) and logs events or checks that show each
one, so the review can judge them from the footage and the timeline. Write that scenario's name (one line, e.g.
`checkout`) in `.hawkes/scenario.txt`: beta's playtest plays it (and this change's, when J asks for one). To play specific content
(a new stage, level or enemy), add a second line with the scenario's options as JSON, e.g. `{"stage":"neon-pit"}`. Without a contract, make
sure each criterion can be seen when the page is played.





## Studio's tools, and Talk

You have Studio's own tools, the same ones Talk has (the `hawkesstudio` MCP server): the backlog, reports, playtests,
previews, the roadmap, the other projects, deploy plans. Read whatever helps. `studio_task` starts work in another
project (up to 3; work you start can't start more). Going live, rollbacks and Approve cards stay the owner's.
To tell the owner something while you work (a result, a question you can carry on without), use `studio_tell`: it goes
to Talk, which passes it on. A question you can't go on without still goes in `.hawkes/question.md` (see above).
GitHub: `studio_github_api` makes REST calls to any of this Studio's repos with Studio's own token (issues, pull
requests, Actions runs and logs, search, branches of your own). There is no GitHub token in your shell, so use it
instead of `gh` or `curl`. Merging and approving stay with Studio's gates.

## Files from Hawkes Gen

To put a file from Hawkes Gen into this repo (an image, a sound, a model), call `studio_gen_import` with its asset id
(`a_...`) and the path in the repo; give `width`/`height`/`format`/`quality` to resize or convert an image (Gen does it,
free). It writes the file for you: no download, key or converter needed. Then commit it.
It takes files from this Studio's own Gen library and from its owners' own hawkesgen.ai libraries.

## The Studio's other repositories (read-only)

Shallow clones of the other projects' repositories, to read (not to change: a change there is that project's own task):
- `jgriffith3433/YoobaLandGame`: `../c_434e49847f4a.repos/YoobaLandGame`
- `jgriffith3433/imaginelivetvwebsite`: `../c_434e49847f4a.repos/imaginelivetvwebsite`
- `jgriffith3433/hawkesbiomedical`: `../c_434e49847f4a.repos/hawkesbiomedical`
- `jgriffith3433/theplacedepartmentwebsite`: `../c_434e49847f4a.repos/theplacedepartmentwebsite`
- `jgriffith3433/hawkesgen`: `../c_434e49847f4a.repos/hawkesgen`
- `jgriffith3433/icanbeaiwebsite`: `../c_434e49847f4a.repos/icanbeaiwebsite`
- `jgriffith3433/hawkesgenwebsite`: `../c_434e49847f4a.repos/hawkesgenwebsite`
- `jgriffith3433/hawkes-analytics`: `../c_434e49847f4a.repos/hawkes-analytics`
- `jgriffith3433/phoriginswebsite`: `../c_434e49847f4a.repos/phoriginswebsite`
- `jgriffith3433/YoobaLand`: `../c_434e49847f4a.repos/YoobaLand`
- `jgriffith3433/hawkesstudio`: `../c_434e49847f4a.repos/hawkesstudio`
- `jgriffith3433/breakingthrough`: `../c_434e49847f4a.repos/breakingthrough`
- `jgriffith3433/sickofitgamewebsite`: `../c_434e49847f4a.repos/sickofitgamewebsite`
- `jgriffith3433/hawkesnet-js`: `../c_434e49847f4a.repos/hawkesnet-js`
- `jgriffith3433/hawkesnet`: `../c_434e49847f4a.repos/hawkesnet`
- `jgriffith3433/hawkesnet-unity`: `../c_434e49847f4a.repos/hawkesnet-unity`
- `jgriffith3433/doseofdestructionwebsite`: `../c_434e49847f4a.repos/doseofdestructionwebsite`
- `jgriffith3433/sickofitgame-unity`: `../c_434e49847f4a.repos/sickofitgame-unity`

## What the studio already knows (shared memory)

Earlier agents, J and Talk learned these; follow decisions and preferences, respect canon, and use the lessons
(unconfirmed ones are an earlier agent's notes: check them). More: memory_search, if you have the tool.
- [decision] No polling: use server push or on-demand fetches: In every product (Studio, Gen, sites, games): never add setInterval/setTimeout loops that fetch. Use a server push stream (SSE: Studio's /api/stream, Gen's /v1/events) or fetch on page open, user action or event. An idle page makes zero requests. Polling through the Cloudflare edge workers burned 100k requests on 2026-11-01. A poll that truly can't be avoided needs a written reason in the PR. (m_4f6d1382b804)
- [decision] Agents must do quality work: design spec first, un-cheatable criteria, vertical slices, forbidden shortcuts, playtest of the experience: After the Place Department campaign came out as the wave game with a text intro, J approved the whole quality plan: (1) a design-spec step (docs/*.md, player fantasy, structure, new vs reused, distinct layouts) before any big build; (2) acceptance criteria a reskin can't pass (observable: different map, no wave timer, explore/talk/pickup before combat); (3) vertical slices (one playable slice, re… (m_7a31fee7272a)
- [preference] Roadmap planning: go deep, aim AAA, don't ask first: For roadmap and milestone planning J wants depth and AAA ambition on story and polish, and no confirmation questions first. Plan and add; report afterwards. 2026-11-06: 19 milestones and 95 items added (5 per project) from backlog findings, memory and project descriptions. (m_7f0b957f00bf)
- [convention] Playtest bots play through real input: A scenario presses the keys, clicks and touches a player would, into the game's own input layer. No teleporting or state edits; a named setup shortcut is fine. (m_d2966eae5697)
- [convention] Every game keeps a working smoke scenario: The smoke scenario loads the game, plays a little and checks nothing errors. Keep it passing when changing the game. (m_2965f554a3ce)
- [convention] Agent changes go to beta first: An agent works on its own branch and opens a pull request into the game's beta branch. Nothing reaches the live game until the owner goes live. (m_988b8d55f022)
- [state] Build shift log Nov 1 10am PT (project-files map/log unavailable this run): product-map.md and shift-log.md weren't mounted this shift, so this is the log entry. Seen: J took all 15 products live at 17:35-17:37 UTC. Wave of auto-fix agents failed 17:58-18:02 UTC on clone/worktree (Studio restarting; "could not read Username" on sick-of-it-unity promisor fetch). Did: re-queued PH Origins HUD-over-hero fix (c_0c8e8aa36490, f_0e62ade30023). Marked Place Department f_62155e6… (m_9e4a2851f0ce)
- [state] Build shift Nov 3 10am PT: 7 fixes on beta since last night; agent spend at daily cap: Project-files map/log not mounted again; logging here. On beta since 05:09 UTC: hawkes-net P2P ICE fix c_f7399dcd2ae8, hawkes-net-unity magenta shaders c_e5a215c95aac, dose-of-destruction roster portraits c_f7bcfd536cd3, hawkes-gen AI editor clipping c_18a6124a289b, yoobaland world visual upgrade c_b502f424e35a, hawkes-games community file 404s c_607b55c8c05e, hawkes-studio 1000 starts/day defaul… (m_ce3392b4c304)

## How to work

1. Read `AGENTS.md` (and any docs it points to) before changing anything. Follow its rules.
2. Look at the screenshots to see the problem. Find the cause in the code or data; prefer the smallest correct fix.
3. Keep to this finding. Don't refactor unrelated code, don't touch generated output or build folders, don't change
   secrets, CI, or deploy scripts.
4. Run the project's checks:
- `npm install --include=dev --no-audit --no-fund && npm test` (in the repo root)
   If .hawkes/beta-build.md is in your worktree, beta's build was red when Studio last looked: read it first, keep your change from adding to those errors, and say in the PR what you saw.
   Before the pull request, also run the project's build or compile check where you can, and say in the PR description which you ran and which you could not (and why).
   Build `package`: run `npm ci && npm run build` if it can run here.
5. Commit your change with a clear message (`Fix: ...`). Don't push; Studio does. Studio stops a pass after
   60 minutes: commit as you go (after each working piece or finished batch), so a stop loses nothing.
   A third-party error from a Gen job (ElevenLabs payment_issue, a 401 or 402) is not yours to retry: test ONE line
   first for voice work, and on that error stop at once, write `.hawkes/stuck.md` naming the service, and end.
6. Write `.hawkes/summary.md`: what was wrong, what you changed (files), how you checked it, and anything J should
   look at. If you couldn't fix it, explain why there instead, and don't commit.
   Two approaches, then stop: when two different approaches haven't worked (the checks still fail, or you can't find
   the cause), don't keep iterating. Write `.hawkes/stuck.md` (what you tried, what happened, where you think the cause
   is) and commit nothing that doesn't work: Studio gives the next attempt a bigger model, with your notes.
7. Write `.hawkes/try.md`: how J tries it on the beta site, in two to five short steps a player would follow (where to
   go, what to press, what he should see).
8. If you can't go on without a decision that the request, the criteria and the thread don't settle (a real direction
   choice, not a detail you can decide well yourself), write ONE clear question to `.hawkes/question.md` (the options
   you see and the one you'd pick), commit nothing, and stop. Studio gets you the answer and you continue in this same
   session.
9. Before you finish, write `.hawkes/learned.md`: what the next agent working on this project should know that
   isn't obvious from the code (at most 5 lines, only real knowledge: a trap you hit and how you got past it, how a part of
   the codebase really works, a check that matters). One per line, in this form:
   - lesson: <short title> — <what broke or misled you, and the fix>
   - convention: <short title> — <how this codebase does it>
   Write nothing there if you learned nothing new. Studio keeps these in the shared memory for the next agent.

## The product's story (for tone and intent)


