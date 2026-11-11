# Changelog

## Unreleased

- **Nameplates are real billboards:** new `billboards(scene, BABYLON, { textPx })` copies the camera's rotation onto every mesh with `metadata.hnBillboard` (no `LookAt`, no negative scale, steady on-screen text size); `multiplayer()` and `defaultAvatar` use it.
- **`emoteArm` option:** `false` lets a rigged avatar play its own wave clip on `onPresence` instead of the box arm.
- **Demo:** the robot blends Idle / Walking / Running by speed with the playback rate set per stride phase so the planted foot stays put, waves as an upper-body layer that blends back, a 56 px Wave button on touch, and an `avatars` playtest scenario (planted-foot speed, wave on both tabs, 360-degree nameplate orbit, phone wave button and text size).
- **Away players:** faded to 40%, new `onAway(node, away, peer)` option, `away`/`back` presence events, `peer.extra` passed to `avatar`.
- **Demo:** Reconnecting banner and a frozen character while the connection is down, name and colour kept in sessionStorage, `hawkesPlaytest.dropFor(ms)` and a `reconnect` scenario.

## 0.2.0

Everything that landed on beta since 0.1.2. The module's API is unchanged; this release is mostly the demo and the docs.

- **Join, leave and emote moments:** joining players pop in with a spawn effect, leaving players fade out, and waves are seen both ways.
- **Camera and controls:** eased WASD movement, an eased follow camera and a touch joystick (setup option `touch`).
- **World bounds:** players stay on the platform and no longer walk off and hover over the water.
- **Audio:** ambience, a join chime and footsteps while walking, with a mute button (M). Footsteps work again after a regression.
- **Styled demo scene:** lit, with a textured floor, sky, shadows and nameplates.
- **Docs:** a README quickstart and API notes, linked from the demo.
- **Demo and playtest:** the demo site shows the package version in its info panel, and Studio's playtest bot (`smoke`, `two-players`, `phone`, `feel`) checks it.

## 0.1.2

First published releases (0.1.0 to 0.1.2).
