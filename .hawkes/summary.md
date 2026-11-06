Demo now feels like a game (example/index.html only; the library itself is unchanged):
- Movement accelerates (18 u/s²) up to 5 u/s and brakes (14 u/s²) when you let go, instead of moving at a fixed speed. Arrow keys work too, and the avatar turns smoothly to face where it's going.
- The follow camera eases after the player every frame (frame-rate independent), so it trails while you run and settles when you stop. Before, it only moved while a key was held.
- A touch joystick (bottom left, with a dead zone and a knob that follows the finger) appears on touch devices (or with `?touch=1`). Keys and stick feed the same input.
- Playtest: the `smoke` scenario has three new checks (read from the page's real controls, driven by real key and pointer events): movement accelerates and decelerates, the camera follows with easing, and the joystick shows on touch devices and moves the player. The joystick check forces the stick visible first (a named setup shortcut) because the bot's browser isn't a touch device.
- Checked: `npm test` passes (needs HAWKESNET pointing at a hawkesnet checkout; I used the read-only clone), `npm run build` passes, and the page script parses. I did not run the page in a browser, so the new checks haven't run live and their timing thresholds are untested. Please watch the first beta smoke run.
- Left for later: a camera that looks ahead or drags/pinches on touch, and a jump/action button on the stick.
- GPU: none needed, so no estimate.
