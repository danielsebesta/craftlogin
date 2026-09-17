import type { ServerClient } from 'minecraft-protocol';

import {
  getChunkConstructor,
  getFieldType,
  getMinecraftData,
  getPacketFields,
  hasPacket,
  type ChunkLike,
  type MinecraftData,
  type PacketField,
} from './minecraft-data.js';

// Spectator was added in 1.8 (protocol 47); older clients fall back to creative.
const SPECTATOR_GAME_MODE = 3;
const CREATIVE_GAME_MODE = 1;
const SPECTATOR_MIN_PROTOCOL = 47;
// The loading screen only dismisses once the client holds the full view-distance square, so the
// streamed radius covers viewDistance instead of lagging one behind it (5x5 for view 2).
const VOID_CHUNK_RADIUS = 2;
const VOID_SPAWN = { x: 0.5, y: 64, z: 0.5 } as const;
const VOID_DIMENSION = 'minecraft:the_end';
const END_MIN_Y = 0;
const END_WORLD_HEIGHT = 256;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
// 1.21.5+ serializes heightmaps as {type, data} entries. MOTION_BLOCKING is type 4 and an empty
// void needs 37 zeroed longs for a 384-block-tall dimension.
const MOTION_BLOCKING_HEIGHTMAP_ID = 4;
const EMPTY_HEIGHTMAP: readonly (readonly [number, number])[] = Array.from(
  { length: 37 },
  (): readonly [number, number] => [0, 0],
);
// The End spans light sections -1..16 (blocks 0..256 plus both edges), so an empty chunk marks all
// 18 sections as empty. The value is one i64 in protodef [high, low] form.
const EMPTY_LIGHT_MASK: readonly [number, number] = [0, 0x3ffff];
const ZERO_LIGHT_MASK: readonly [number, number] = [0, 0];

const NUMBER_FIELD_TYPES = new Set([
  'i8',
  'u8',
  'i16',
  'u16',
  'i32',
  'u32',
  'i64',
  'u64',
  'varint',
  'varlong',
  'f32',
  'f64',
]);

export interface JoinGameOptions {
  readonly entityId: number;
  readonly maxPlayers: number;
}

export interface VoidWorldOptions extends JoinGameOptions {
  readonly sendChunks: boolean;
}

export type MinecraftColor =
  | 'aqua'
  | 'gold'
  | 'gray'
  | 'green'
  | 'light_purple'
  | 'red'
  | 'white'
  | 'yellow'
  // 1.16+ (protocol 735) also accepts "#RRGGBB" in the component "color" field.
  | `#${string}`;

export interface MinecraftTextComponent {
  readonly text: string;
  readonly color?: MinecraftColor;
  readonly bold?: boolean;
  readonly extra?: readonly MinecraftTextComponent[];
}

export interface VoidChatPacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

export interface ViewPacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

export type LevelLoadStartPacket = ViewPacket;
export type FrozenAbilitiesPacket = ViewPacket;

export interface TitlePacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

export interface ViewOptions {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly viewDistance: number;
  readonly simulationDistance: number;
}

export function presentVoidWorld(client: ServerClient, options: VoidWorldOptions): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  client.write('login', createJoinGamePacket(mcData, options));

  // 1.21.9+ keeps the terrain screen in a "waiting for server" state until this event arrives.
  // Chunk and teleport acknowledgements alone do not advance that state, so its timeout never even
  // starts. Older protocols do not define the mapped reason and therefore receive no packet.
  const levelLoadStart = createLevelLoadStartPacket(mcData);
  if (levelLoadStart !== null) {
    client.write(levelLoadStart.name, levelLoadStart.params);
  }

  const abilities = createFrozenAbilitiesPacket(mcData);
  if (abilities !== null) {
    client.write(abilities.name, abilities.params);
  }

  for (const packet of createViewPackets(mcData, {
    chunkX: 0,
    chunkZ: 0,
    viewDistance: VOID_CHUNK_RADIUS,
    simulationDistance: VOID_CHUNK_RADIUS,
  })) {
    client.write(packet.name, packet.params);
  }

  // Position must precede the initial chunks. Vanilla starts tracking which section can dismiss
  // "Loading terrain" when it applies this teleport; chunks sent earlier are accepted and
  // acknowledged but do not satisfy that newly established loading target. This matches the
  // ordering used by a full minecraft-protocol server (Flying Squid).
  client.write('position', createPositionPacket(mcData));

  if (options.sendChunks) {
    const chunkConstructor = getChunkConstructor(mcData);
    if (chunkConstructor !== null) {
      const chunk = new chunkConstructor({ minY: END_MIN_Y, worldHeight: END_WORLD_HEIGHT });
      writeChunks(client, mcData, chunk);
    }
  }
}

export function createFrozenAbilitiesPacket(mcData: MinecraftData): FrozenAbilitiesPacket | null {
  if (!hasPacket(mcData, 'packet_abilities')) {
    return null;
  }
  return {
    name: 'abilities',
    // Keep flight enabled so the void cannot make the player fall, but zero both movement speeds.
    params: { flags: 0x06, flyingSpeed: 0, walkingSpeed: 0 },
  };
}

export function createTitlePackets(
  mcData: MinecraftData,
  title: string,
  subtitle: string,
): readonly TitlePacket[] {
  const packets: TitlePacket[] = [];
  // The title outlives the 40-second lobby. Durations are measured in 20 ticks per second.
  const duration = { fadeIn: 10, stay: 1200, fadeOut: 20 };
  const titleComponent = createLobbyTitleComponent(mcData, title);
  const subtitleComponent = createLobbySubtitleComponent(mcData, subtitle);

  if (hasPacket(mcData, 'packet_set_title_text')) {
    packets.push({ name: 'set_title_time', params: duration });
    const titleFields = getPacketFields(mcData, 'packet_set_title_text');
    const subtitleFields = getPacketFields(mcData, 'packet_set_title_subtitle');
    packets.push({
      name: 'set_title_subtitle',
      params: {
        text: createTextComponent(getFieldType(subtitleFields, 'text'), subtitleComponent),
      },
    });
    packets.push({
      name: 'set_title_text',
      params: {
        text: createTextComponent(getFieldType(titleFields, 'text'), titleComponent),
      },
    });
    return packets;
  }

  if (!hasPacket(mcData, 'packet_title')) {
    return packets;
  }
  const fields = getPacketFields(mcData, 'packet_title');
  const timingAction = getTitleTimingAction(fields);
  if (timingAction !== null) {
    packets.push({ name: 'title', params: { action: timingAction, ...duration } });
  }
  packets.push({
    name: 'title',
    params: { action: 1, text: JSON.stringify(subtitleComponent) },
  });
  packets.push({
    name: 'title',
    params: { action: 0, text: JSON.stringify(titleComponent) },
  });
  return packets;
}

// Exact sRGB conversions of the website tokens in src/api/ui/tokens.ts. Roles mirror the site:
// near-white for headings and neutral messages, gray for body text, lime for highlights and
// success, coral for errors.
export const WEB_TEXT_COLOR = '#E9ECE9';
export const WEB_MUTED_COLOR = '#A7ADA7';
export const WEB_ACCENT_COLOR = '#A2D060';
export const WEB_ACCENT_STRONG_COLOR = '#B6E86E';
export const WEB_DANGER_COLOR = '#F47B74';

type HexColor = `#${string}`;

// 1.16 (protocol 735) introduced "#RRGGBB" component colors; older clients render an unknown
// color string as plain white, so they receive the closest legacy name instead.
const HEX_COLOR_MIN_PROTOCOL = 735;

export function supportsHexColors(mcData: MinecraftData): boolean {
  return mcData.version.version >= HEX_COLOR_MIN_PROTOCOL;
}

export function pickWebColor(
  mcData: MinecraftData | null,
  hex: HexColor,
  legacy: MinecraftColor,
): MinecraftColor {
  return mcData !== null && supportsHexColors(mcData) ? hex : legacy;
}

const TITLE_GRADIENT_FROM: HexColor = WEB_ACCENT_STRONG_COLOR;
const TITLE_GRADIENT_TO: HexColor = WEB_ACCENT_COLOR;
const TITLE_LEGACY_COLOR: MinecraftColor = 'green';
const SUBTITLE_HEX_COLOR: HexColor = WEB_TEXT_COLOR;

function createLobbyTitleComponent(mcData: MinecraftData, title: string): MinecraftTextComponent {
  if (!supportsHexColors(mcData)) {
    return { text: title, color: TITLE_LEGACY_COLOR, bold: true };
  }
  const letters = Array.from(title);
  if (letters.length <= 1) {
    return { text: title, color: TITLE_GRADIENT_TO, bold: true };
  }
  return {
    text: '',
    bold: true,
    extra: letters.map((letter, index): MinecraftTextComponent => ({
      text: letter,
      color: blendHexColor(
        TITLE_GRADIENT_FROM,
        TITLE_GRADIENT_TO,
        letters.length === 1 ? 0 : index / (letters.length - 1),
      ),
      bold: true,
    })),
  };
}

function createLobbySubtitleComponent(
  mcData: MinecraftData,
  subtitle: string,
): MinecraftTextComponent {
  return supportsHexColors(mcData)
    ? { text: subtitle, color: SUBTITLE_HEX_COLOR }
    : { text: subtitle, color: 'white' };
}

function blendHexColor(from: HexColor, to: HexColor, ratio: number): HexColor {
  const clamped = Math.min(1, Math.max(0, ratio));
  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  const mixed = fromRgb.map((channel, index): number =>
    Math.round(channel + ((toRgb[index] ?? channel) - channel) * clamped),
  );
  return `#${mixed
    .map((channel): string => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function parseHexColor(hex: string): readonly [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function createLevelLoadStartPacket(mcData: MinecraftData): LevelLoadStartPacket | null {
  const fields = getPacketFields(mcData, 'packet_game_state_change');
  const reasonType = getFieldType(fields, 'reason');
  if (!hasMapperValue(reasonType, 'level_chunks_load_start')) {
    return null;
  }
  return {
    name: 'game_state_change',
    params: { reason: 'level_chunks_load_start', gameMode: 0 },
  };
}

// Vanilla only loads chunks around a known center and honors a known radius; a real server sends
// these right after Join Game, and without them the client waits on its loading screen forever.
// Packets that do not exist on a version are skipped, so old clients keep their Join Game behavior.
export function createViewPackets(mcData: MinecraftData, view: ViewOptions): readonly ViewPacket[] {
  const packets: ViewPacket[] = [];
  if (hasPacket(mcData, 'packet_update_view_position')) {
    packets.push({
      name: 'update_view_position',
      params: { chunkX: view.chunkX, chunkZ: view.chunkZ },
    });
  }
  if (hasPacket(mcData, 'packet_update_view_distance')) {
    packets.push({
      name: 'update_view_distance',
      params: { viewDistance: view.viewDistance },
    });
  }
  if (hasPacket(mcData, 'packet_simulation_distance')) {
    packets.push({
      name: 'simulation_distance',
      params: { distance: view.simulationDistance },
    });
  }
  return packets;
}

export function sendVoidMessage(client: ServerClient, message: string): void {
  sendVoidComponent(client, { text: message, color: 'white' });
}

export function sendVoidComponent(
  client: ServerClient,
  component: MinecraftTextComponent,
  actionBar = false,
): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  const packet = createVoidChatComponentPacket(mcData, component, actionBar);
  client.write(packet.name, packet.params);
}

export function sendVoidTitle(client: ServerClient, title: string, subtitle: string): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  for (const packet of createTitlePackets(mcData, title, subtitle)) {
    client.write(packet.name, packet.params);
  }
}

export interface EntityEffectPacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

// The limbo chamber: heavy limbs, a black vignette, and Deep-Dark-style distance fog. Effect IDs
// come from the per-version registry (classic numeric IDs up to 1.20.1, data-driven from 1.20.2),
// so they can never drift from what the client's version expects.
const LIMBO_EFFECTS: readonly (readonly [effect: string, amplifier: number])[] = [
  ['Slowness', 2],
  ['Blindness', 0],
  ['Darkness', 0],
];
// ~27 minutes at 20 ticks per second, far beyond the 40-second lobby, while still fitting the
// i16 duration field that the oldest supported versions use.
const LIMBO_DURATION_TICKS = 32767;

export function createLimboPackets(
  mcData: MinecraftData,
  entityId: number,
): readonly EntityEffectPacket[] {
  const packets: EntityEffectPacket[] = [];
  for (const [effect, amplifier] of LIMBO_EFFECTS) {
    const packet = createEffectPacket(mcData, entityId, effect, amplifier);
    if (packet !== null) {
      packets.push(packet);
    }
  }
  return packets;
}

function createEffectPacket(
  mcData: MinecraftData,
  entityId: number,
  effect: string,
  amplifier: number,
): EntityEffectPacket | null {
  if (!hasPacket(mcData, 'packet_entity_effect')) {
    return null;
  }
  // Effects unknown to a version resolve to undefined and are skipped (e.g. Darkness pre-1.19).
  const effectId = mcData.effectsByName?.[effect]?.id;
  if (effectId === undefined) {
    return null;
  }
  const fields = getPacketFields(mcData, 'packet_entity_effect');
  if (
    getFieldType(fields, 'entityId') === undefined ||
    getFieldType(fields, 'effectId') === undefined
  ) {
    return null;
  }
  const params: Record<string, unknown> = {
    entityId,
    effectId,
    amplifier,
    duration: LIMBO_DURATION_TICKS,
  };
  // Limbo stays clean: no particles, no HUD icon. 1.8.8 models this as a bool, 1.9–1.20.x as a
  // byte-boolean, 1.21+ as a flags bitmask (ambient/particles/icon) where zero hides everything.
  // 1.7 has no such field and always shows particles, which is acceptable for a 40-second lobby.
  const hideParticlesType = getFieldType(fields, 'hideParticles');
  if (hideParticlesType === 'bool') {
    params['hideParticles'] = true;
  } else if (hideParticlesType !== undefined) {
    params['hideParticles'] = 1;
  }
  // The 1.19–1.20.x factorCodec is optional and stays absent.
  if (getFieldType(fields, 'flags') !== undefined) {
    params['flags'] = 0;
  }
  return { name: 'entity_effect', params };
}

export function sendLimboEffects(client: ServerClient, entityId: number): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  for (const packet of createLimboPackets(mcData, entityId)) {
    client.write(packet.name, packet.params);
  }
}

export function createJoinGamePacket(
  mcData: MinecraftData,
  options: JoinGameOptions,
): Record<string, unknown> {
  const fields = getPacketFields(mcData, 'packet_login');
  const packet: Record<string, unknown> = { ...mcData.loginPacket };
  fillPrimitiveDefaults(packet, fields);

  packet['entityId'] = options.entityId;
  if (getFieldType(fields, 'gameMode') !== undefined) {
    packet['gameMode'] =
      mcData.version.version >= SPECTATOR_MIN_PROTOCOL ? SPECTATOR_GAME_MODE : CREATIVE_GAME_MODE;
  }
  packet['isHardcore'] = false;
  packet['isDebug'] = false;
  packet['isFlat'] = true;
  packet['reducedDebugInfo'] = false;
  packet['enableRespawnScreen'] = true;
  // The minecraft-data template carries enforcesSecureChat: false, but the ghost server runs
  // with enforceSecureProfile and validates chat signatures, so the packet must say so.
  // Otherwise the client shows a "Chat messages can't be verified" warning and may stop
  // signing outbound chat, which the server-side validation would then reject.
  if (getFieldType(fields, 'enforcesSecureChat') !== undefined) {
    packet['enforcesSecureChat'] = true;
  }
  packet['viewDistance'] = VOID_CHUNK_RADIUS;
  packet['simulationDistance'] = VOID_CHUNK_RADIUS;
  packet['maxPlayers'] = options.maxPlayers;
  packet['difficulty'] = 0;
  packet['levelType'] = 'flat';
  packet['hashedSeed'] = [0, 0];
  packet['portalCooldown'] = 0;

  if (getFieldType(fields, 'worldState') !== undefined) {
    const worldState = packet['worldState'];
    if (!isRecord(worldState)) {
      throw new Error('The Minecraft Join Game template has no world state');
    }
    const dimension = findSegmentedDimensionIndex(mcData, VOID_DIMENSION);
    if (dimension === null) {
      throw new Error('The Minecraft End dimension registry entry is unavailable');
    }
    packet['worldState'] = {
      ...worldState,
      dimension,
      name: VOID_DIMENSION,
      gamemode: 'spectator',
      previousGamemode: 255,
      hashedSeed: [0, 0],
      isDebug: false,
      isFlat: true,
      portalCooldown: 0,
      seaLevel: 0,
    };
  }

  const previousGameModeType = getFieldType(fields, 'previousGameMode');
  if (previousGameModeType === 'u8') {
    packet['previousGameMode'] = 255;
  } else if (previousGameModeType !== undefined) {
    packet['previousGameMode'] = -1;
  }

  if (getFieldType(fields, 'worldName') !== undefined) {
    packet['worldName'] = VOID_DIMENSION;
  }
  if (getFieldType(fields, 'worldNames') !== undefined) {
    packet['worldNames'] = [VOID_DIMENSION];
  }
  if (getFieldType(fields, 'worldType') !== undefined) {
    packet['worldType'] = VOID_DIMENSION;
  }

  const dimensionType = getFieldType(fields, 'dimension');
  if (dimensionType === 'i8' || dimensionType === 'i32') {
    packet['dimension'] = 1;
  } else if (dimensionType !== undefined) {
    const endDimension = findLegacyEndDimension(mcData);
    if (endDimension === undefined) {
      throw new Error('The Minecraft End dimension data is unavailable');
    }
    packet['dimension'] = endDimension;
  }

  return packet;
}

export function createPositionPacket(mcData: MinecraftData): Record<string, unknown> {
  const fields = getPacketFields(mcData, 'packet_position');
  const packet: Record<string, unknown> = { yaw: 0, pitch: 0 };

  if (getFieldType(fields, 'x') !== undefined) {
    packet['x'] = VOID_SPAWN.x;
    packet['y'] = VOID_SPAWN.y;
    packet['z'] = VOID_SPAWN.z;
  }
  if (getFieldType(fields, 'dx') !== undefined) {
    packet['dx'] = 0;
    packet['dy'] = 0;
    packet['dz'] = 0;
  }
  if (getFieldType(fields, 'flags') !== undefined) {
    packet['flags'] = 0;
  }
  if (getFieldType(fields, 'teleportId') !== undefined) {
    packet['teleportId'] = 1;
  }
  if (getFieldType(fields, 'dismountVehicle') !== undefined) {
    packet['dismountVehicle'] = false;
  }

  return packet;
}

export function createChunkPacket(
  mcData: MinecraftData,
  chunk: ChunkLike,
  chunkX: number,
  chunkZ: number,
): Record<string, unknown> {
  const fields = getPacketFields(mcData, 'packet_map_chunk');
  const packet: Record<string, unknown> = { x: chunkX, z: chunkZ };

  if (getFieldType(fields, 'groundUp') !== undefined) {
    packet['groundUp'] = true;
  }
  if (getFieldType(fields, 'bitMap') !== undefined) {
    packet['bitMap'] = chunk.getMask();
  }
  const heightmapType = getFieldType(fields, 'heightmaps');
  if (heightmapType === 'anonymousNbt') {
    packet['heightmaps'] = { type: 'compound', value: {} };
  } else if (heightmapType === 'nbt') {
    packet['heightmaps'] = { type: 'compound', name: '', value: {} };
  } else if (Array.isArray(heightmapType) && heightmapType[0] === 'array') {
    packet['heightmaps'] = [{ type: MOTION_BLOCKING_HEIGHTMAP_ID, data: EMPTY_HEIGHTMAP }];
  }
  if (getFieldType(fields, 'biomes') !== undefined) {
    packet['biomes'] = chunk.dumpBiomes?.() ?? [];
  }
  packet['chunkData'] = chunk.dump();
  if (getFieldType(fields, 'blockEntities') !== undefined) {
    packet['blockEntities'] = [];
  }
  if (getFieldType(fields, 'trustEdges') !== undefined) {
    packet['trustEdges'] = true;
  }

  // prismarine-chunk reports uninitialized light (zeroed masks with no data and no empty marks),
  // which vanilla rejects: every section must sit in either a data mask or an empty mask. Void
  // chunks are empty by construction, so synthesize valid empty light instead of trusting the dump.
  if (getFieldType(fields, 'skyLightMask') !== undefined) {
    packet['skyLightMask'] = [ZERO_LIGHT_MASK];
    packet['blockLightMask'] = [ZERO_LIGHT_MASK];
    packet['emptySkyLightMask'] = [EMPTY_LIGHT_MASK];
    packet['emptyBlockLightMask'] = [EMPTY_LIGHT_MASK];
    packet['skyLight'] = [];
    packet['blockLight'] = [];
  }

  return packet;
}

export function createVoidChatPacket(
  mcData: MinecraftData,
  message: string,
  actionBar = false,
): VoidChatPacket {
  return createVoidChatComponentPacket(mcData, { text: message }, actionBar);
}

export function createVoidChatComponentPacket(
  mcData: MinecraftData,
  component: MinecraftTextComponent,
  actionBar = false,
): VoidChatPacket {
  const systemChatFields = getPacketFields(mcData, 'packet_system_chat');
  if (systemChatFields.length > 0) {
    const content = createTextComponent(getFieldType(systemChatFields, 'content'), component);
    return { name: 'system_chat', params: { content, isActionBar: actionBar } };
  }

  const chatFields = getPacketFields(mcData, 'packet_chat');
  const params: Record<string, unknown> = {
    message: JSON.stringify(component),
    position: actionBar ? 2 : 1,
  };
  if (getFieldType(chatFields, 'sender') !== undefined) {
    params['sender'] = NIL_UUID;
  }
  return { name: 'chat', params };
}

function writeChunks(client: ServerClient, mcData: MinecraftData, chunk: ChunkLike): void {
  // Chunk Batch Start deliberately has no fields. Packet existence must therefore be checked
  // independently from its field list or modern clients receive an unmatched batch finish.
  if (hasPacket(mcData, 'packet_chunk_batch_start')) {
    client.write('chunk_batch_start', {});
  }

  let batchSize = 0;
  for (let chunkX = -VOID_CHUNK_RADIUS; chunkX <= VOID_CHUNK_RADIUS; chunkX += 1) {
    for (let chunkZ = -VOID_CHUNK_RADIUS; chunkZ <= VOID_CHUNK_RADIUS; chunkZ += 1) {
      client.write('map_chunk', createChunkPacket(mcData, chunk, chunkX, chunkZ));
      batchSize += 1;
    }
  }

  if (hasPacket(mcData, 'packet_chunk_batch_finished')) {
    client.write('chunk_batch_finished', { batchSize });
  }
}

function createTextComponent(type: unknown, input: string | MinecraftTextComponent): unknown {
  const component = typeof input === 'string' ? { text: input } : input;
  return type === 'anonymousNbt'
    ? { type: 'compound', value: createNbtTextComponentValue(component) }
    : JSON.stringify(component);
}

/**
 * Builds a colored kick/disconnect reason in the encoding the client expects: JSON chat for the
 * login phase and for play-state string fields, NBT for play-state component fields (1.20.5+).
 */
export function createKickReason(
  mcData: MinecraftData,
  message: string,
  color: MinecraftColor,
  loginState: boolean,
): unknown {
  const component = createKickComponent(mcData, message, color);
  if (loginState) {
    return JSON.stringify(component);
  }
  const fields = getPacketFields(mcData, 'packet_kick_disconnect');
  return createTextComponent(getFieldType(fields, 'reason'), component);
}

// A kick renders as a heading plus an optional detail: the first line is bold in the tone color,
// every following line in muted gray. Messages without a line break stay a single bold line.
function createKickComponent(
  mcData: MinecraftData,
  message: string,
  color: MinecraftColor,
): MinecraftTextComponent {
  const [heading, ...rest] = message.split('\n');
  if (rest.length === 0 || heading === undefined || heading.length === 0) {
    return { text: message, color, bold: true };
  }
  const bodyColor = pickWebColor(mcData, WEB_MUTED_COLOR, 'gray');
  return {
    text: '',
    extra: [
      { text: heading, color, bold: true },
      ...rest.map((line): MinecraftTextComponent => ({ text: `\n${line}`, color: bodyColor })),
    ],
  };
}

function createNbtTextComponentValue(
  component: MinecraftTextComponent,
): Readonly<Record<string, unknown>> {
  return {
    text: { type: 'string', value: component.text },
    ...(component.color === undefined ? {} : { color: { type: 'string', value: component.color } }),
    ...(component.bold === undefined
      ? {}
      : { bold: { type: 'byte', value: component.bold ? 1 : 0 } }),
    ...(component.extra === undefined || component.extra.length === 0
      ? {}
      : {
          extra: {
            type: 'list',
            value: {
              type: 'compound',
              value: component.extra.map(createNbtTextComponentValue),
            },
          },
        }),
  };
}

function getTitleTimingAction(fields: readonly PacketField[]): number | null {
  const type = getFieldType(fields, 'fadeIn');
  if (!Array.isArray(type) || type[0] !== 'switch' || !isRecord(type[1])) {
    return null;
  }
  const variants = type[1]['fields'];
  if (!isRecord(variants)) {
    return null;
  }
  const action = Object.keys(variants)[0];
  if (action === undefined) {
    return null;
  }
  const parsed = Number(action);
  return Number.isInteger(parsed) ? parsed : null;
}

function findSegmentedDimensionIndex(mcData: MinecraftData, dimensionName: string): number | null {
  const codec = mcData.loginPacket?.['dimensionCodec'];
  if (!isRecord(codec)) {
    return null;
  }
  const registry = codec['minecraft:dimension_type'];
  if (!isRecord(registry) || !Array.isArray(registry['entries'])) {
    return null;
  }
  const index = registry['entries'].findIndex(
    (entry): boolean => isRecord(entry) && entry['key'] === dimensionName,
  );
  return index === -1 ? null : index;
}

function findLegacyEndDimension(mcData: MinecraftData): unknown {
  const codec = mcData.loginPacket?.['dimensionCodec'];
  if (!isRecord(codec) || codec['type'] !== 'compound' || !isRecord(codec['value'])) {
    return undefined;
  }
  const registry = codec['value']['minecraft:dimension_type'];
  if (!isRecord(registry) || !isRecord(registry['value'])) {
    return undefined;
  }
  const list = registry['value']['value'];
  if (!isRecord(list) || list['type'] !== 'list' || !isRecord(list['value'])) {
    return undefined;
  }
  const entries = list['value']['value'];
  if (!Array.isArray(entries)) {
    return undefined;
  }
  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry['name']) || entry['name']['value'] !== VOID_DIMENSION) {
      continue;
    }
    const element = entry['element'];
    if (!isRecord(element) || element['type'] !== 'compound') {
      return undefined;
    }
    // The Join Game field uses named NBT in these protocol versions, while registry list elements
    // are anonymous compounds. Restore the empty root name used by minecraft-data's template.
    return { ...element, name: '' };
  }
  return undefined;
}

function hasMapperValue(type: unknown, expected: string): boolean {
  if (!Array.isArray(type) || type[0] !== 'mapper' || !isRecord(type[1])) {
    return false;
  }
  const mappings = type[1]['mappings'];
  return isRecord(mappings) && Object.values(mappings).includes(expected);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fillPrimitiveDefaults(
  packet: Record<string, unknown>,
  fields: readonly PacketField[],
): void {
  for (const field of fields) {
    if (field.name in packet) {
      continue;
    }
    if (field.type === 'bool') {
      packet[field.name] = false;
    } else if (field.type === 'string') {
      packet[field.name] = '';
    } else if (typeof field.type === 'string' && NUMBER_FIELD_TYPES.has(field.type)) {
      packet[field.name] = 0;
    } else if (Array.isArray(field.type) && field.type[0] === 'array') {
      packet[field.name] = [];
    }
  }
}
