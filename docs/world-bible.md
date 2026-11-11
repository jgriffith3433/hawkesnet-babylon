# Hawkes Net for Babylon: world bible

The demo arena that ships with `@hawkesgen/net-babylon`: a small multiplayer place on Hawkes Net’s free `netdemo` rooms, meant to show the package (shared room, avatars, eased move, touch stick, host-run shared state) rather than a full game.

## Areas

**Flagstone arena** — dusk open court, cool fog, warm torch light. About 36×36 units of flagstone floor with a painted green ring at the centre. Enter by opening the demo page (joins area `babylon-demo`); leave by closing the tab. On a phone the same place fills the screen with a one-line status and a bottom-left joystick. Six glowing orbs drift above the stone for visitors to collect.

## Landmarks

The **glowing ring** on the floor at the centre — visible from the edge pillars and the first thing a second player steers toward. Around it, **six cyan orbs** bob above soft glowing discs on the flagstones (placed by a downward ray so they sit a fixed height above the floor, never inside pillars or the crate); they are the collect targets of the shared match.

## Who lives here

**Visitors** (each tab is a named capsule, “Player NNN”). They walk the floor, wave (E), collect orbs for score, and leave with a fade. No NPCs; life is other people who open the page, plus the host-lit orbs that respawn when taken.

## What happens

- Walk with WASD or the touch joystick; footsteps while moving, silence when still.
- Wave (E, or the round 👋 button on a touch screen): the robot raises its arm and waves as a layer over whatever its legs are doing, on both tabs, then eases back to its base pose. A chime when someone joins, a short farewell when they leave.
- A shared crate at the ring spins when you host it.
- Walk into a glowing orb: a collect ping, your score rises on everyone’s HUD (top-right), and the host respawns that orb elsewhere on the court. Scores are keyed by stable peer id and survive host migration.
- Ambient: dusk sky, torch flicker on the stone, soft fog, bobbing orb glow.
- Phone: Sound sits bottom-right, clear of the stick; the info line expands on tap; the score HUD stays top-right.

## Avatars and nameplates

Every player is the same small robot, tinted by their colour. It blends Idle, Walking and Running by the speed it is really moving at, and the walk's playback rate follows the ground, so the foot that is down stays put (the playtest measures it: under 5 cm/s). The name above it is a billboard: it copies the camera's rotation, so it reads the right way round from every side, and it keeps about 22 px of text on screen at any distance, phone included.

## Story beats

1. You appear on the ring as a capsule with your name; six orbs already glow on the court (or appear as the host seeds them).
2. Another visitor’s capsule pops in with a chime; you see each other move.
3. One of you walks into an orb — a ping, a flash on the stone, both scoreboards tick, the orb leaps to a new spot.
4. A wave passes both ways; when they leave, their avatar fades out.

## Orb Hunt rounds

The host runs 60-second rounds in shared state. A timer sits top centre (it pulses red in the last 10 s). At 0 every screen shows the same result card — the winner, a sorted scoreboard and confetti — for 3 s, then scores reset and the next round starts. A visitor alone for 3 s gets two bots (Bot Ada, Bot Kit): they walk to the nearest orb, steer round the crate and pillars, and leave when a real player joins. `?round=15` makes rounds short.


## When the line drops

A visitor keeps their name and colour for the tab (sessionStorage), so coming back on a fresh ticket is the same player. When your connection drops, your character stands still and a "Reconnecting…" banner hangs top centre; when the room has you again it says "Back in the room" for 2 s. A player who drops from your view turns about 40% see-through with "· away" in amber on their nameplate; if they return they go solid, and if they are still gone after the server's 15 s grace they leave with the usual fade.

## Dropped and back, on a bad line

When player B's line drops for 5 s, A sees B turn see-through with "· away"; when the line returns B is a normal player again within 2 s, still the same name, colour and score on both screens. On a 250 ms, 5%-loss line B's avatar glides rather than jumps: the playtest reports the largest jump in one frame and fails over 0.5 m. The playtest's player B is a 390×844 touch page walking onto an orb with the on-screen stick.
