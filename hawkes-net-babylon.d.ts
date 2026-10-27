import type { Lobby, LobbyOptions, Room, SendOptions, MessageMeta, Peer } from '@hawkesgen/net';
export { background, inBackground } from '@hawkesgen/net';

export declare const VERSION: string;

/** Anything Babylon can parent and move (a Mesh or a TransformNode). */
export type BabylonNode = any;

export interface RemotePlayer {
  id: string;
  name: string;
  /** Their game is in the background: the avatar is drawn faded. */
  away: boolean;
  /** Their avatar (made by `avatar`), once their first pose arrived. */
  node: BabylonNode | null;
}

export interface MultiplayerOptions extends Partial<LobbyOptions> {
  /** The BABYLON namespace (import * as BABYLON from '@babylonjs/core', or the global build). Default globalThis.BABYLON. */
  babylon?: any;
  /** Your Hawkes Net project (net.hawkesgen.com). */
  project: string;
  name?: string;
  /** The area's shared room (default 'lobby'). */
  area?: string;
  /** Your game's own site(s): there players share the live rooms; anywhere else the free test rooms. */
  liveHosts?: string[];
  /** The mesh or node whose place and heading are yours (sent about 20 times a second). */
  player?: BabylonNode;
  /** Or your pose yourself: position, yaw (radians) and any small extra values. */
  getPose?: () => { position: [number, number, number] | number[]; yaw?: number; extra?: Record<string, unknown> | null } | null;
  /** How others look: a node for a player (default: a capsule in their color with their name). */
  avatar?: (peer: { id: string; name: string }, BABYLON: any, scene: any) => BabylonNode;
}

export interface Shared {
  /** Simulate it from here (the player who grabbed it). False if someone holds it. */
  take(): boolean;
  release(): void;
  mine(): boolean;
}

export interface Multiplayer {
  readonly lobby: Lobby;
  readonly room: Room | null;
  readonly ready: boolean;
  readonly isHost: boolean;
  /** Everyone else, by id. */
  readonly peers: Map<string, RemotePlayer>;
  send(kind: string, data?: unknown, opt?: SendOptions): void;
  on<T = any>(kind: string, fn: (data: T, from: Peer | null, meta: MessageMeta) => void): () => void;
  when(event: string, fn: (e: any) => void): () => void;
  /** Move to another area's room. */
  join(area: string): void;
  /** A moving thing everyone sees. owner 'host' (default: the host simulates it; the next host takes over) or 'claim'. */
  share(node: BabylonNode, id: string, o?: { owner?: 'host' | 'claim' }): Shared;
  unshare(id: string): void;
  /** Leave, and remove every avatar and hook. */
  dispose(): void;
}

/** Multiplayer for a Babylon scene: a shared room per area, everyone else as avatars, shared moving things, away players. */
export declare function multiplayer(scene: any, o: MultiplayerOptions): Multiplayer;
/** The default avatar: a capsule in the player's color with their name over it. */
export declare function defaultAvatar(peer: { id: string; name: string }, BABYLON: any, scene: any): BabylonNode;

declare const _default: { multiplayer: typeof multiplayer; defaultAvatar: typeof defaultAvatar; VERSION: string };
export default _default;
