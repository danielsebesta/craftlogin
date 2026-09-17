import type { ServerClient } from 'minecraft-protocol';

import { getMinecraftData, hasConfigurationPacket, type MinecraftData } from './minecraft-data.js';

type ClientWrite = (packetName: string, params: unknown) => void;

// Vanilla validates data-driven registries against tags while configuration finishes and drops the
// connection with a network protocol error when a referenced tag was never bound. The groups below
// are the exact set a 26.1 client demands for the registries we ship; entries stay empty because
// nothing is enchanted, damaged, opened, or spawned before the kick. Re-derive from a vanilla
// client log ("Missing tag" / "Unbound tags" lines) or the vanilla tag files (see Misode's mcmeta
// `data/minecraft/tags` for the release) whenever shipped registry data changes.
const TAG_BINDINGS: Readonly<Record<string, readonly string[]>> = {
  'minecraft:item': [
    'minecraft:enchantable/armor',
    'minecraft:enchantable/bow',
    'minecraft:enchantable/chest_armor',
    'minecraft:enchantable/crossbow',
    'minecraft:enchantable/durability',
    'minecraft:enchantable/equippable',
    'minecraft:enchantable/fire_aspect',
    'minecraft:enchantable/fishing',
    'minecraft:enchantable/foot_armor',
    'minecraft:enchantable/head_armor',
    'minecraft:enchantable/leg_armor',
    'minecraft:enchantable/lunge',
    'minecraft:enchantable/mace',
    'minecraft:enchantable/melee_weapon',
    'minecraft:enchantable/mining',
    'minecraft:enchantable/mining_loot',
    'minecraft:enchantable/sharp_weapon',
    'minecraft:enchantable/sweeping',
    'minecraft:enchantable/trident',
    'minecraft:enchantable/vanishing',
    'minecraft:enchantable/weapon',
  ],
  'minecraft:block': [
    'minecraft:soul_speed_blocks',
    'minecraft:lightning_rods',
    'minecraft:blocks_wind_charge_explosions',
  ],
  'minecraft:entity_type': [
    'minecraft:sensitive_to_bane_of_arthropods',
    'minecraft:sensitive_to_smite',
    'minecraft:sensitive_to_impaling',
    'minecraft:arrows',
  ],
  'minecraft:dialog': ['minecraft:pause_screen_additions', 'minecraft:quick_actions'],
  'minecraft:enchantment': [
    'minecraft:exclusive_set/armor',
    'minecraft:exclusive_set/boots',
    'minecraft:exclusive_set/bow',
    'minecraft:exclusive_set/crossbow',
    'minecraft:exclusive_set/damage',
    'minecraft:exclusive_set/mining',
    'minecraft:exclusive_set/riptide',
  ],
  'minecraft:timeline': [
    'minecraft:in_end',
    'minecraft:in_nether',
    'minecraft:in_overworld',
    'minecraft:universal',
  ],
  'minecraft:damage_type': [
    'minecraft:always_hurts_ender_dragons',
    'minecraft:always_kills_armor_stands',
    'minecraft:always_most_significant_fall',
    'minecraft:always_triggers_silverfish',
    'minecraft:avoids_guardian_thorns',
    'minecraft:burn_from_stepping',
    'minecraft:burns_armor_stands',
    'minecraft:bypasses_armor',
    'minecraft:bypasses_effects',
    'minecraft:bypasses_enchantments',
    'minecraft:bypasses_invulnerability',
    'minecraft:bypasses_resistance',
    'minecraft:bypasses_shield',
    'minecraft:bypasses_wolf_armor',
    'minecraft:can_break_armor_stand',
    'minecraft:damages_helmet',
    'minecraft:ignites_armor_stands',
    'minecraft:is_drowning',
    'minecraft:is_explosion',
    'minecraft:is_fall',
    'minecraft:is_fire',
    'minecraft:is_freezing',
    'minecraft:is_lightning',
    'minecraft:is_player_attack',
    'minecraft:is_projectile',
    'minecraft:mace_smash',
    'minecraft:no_anger',
    'minecraft:no_impact',
    'minecraft:no_knockback',
    'minecraft:panic_causes',
    'minecraft:panic_environmental_causes',
    'minecraft:witch_resistant_to',
    'minecraft:wither_immune_to',
  ],
  'minecraft:dimension_type': [
    'minecraft:in_end',
    'minecraft:in_nether',
    'minecraft:in_overworld',
    'minecraft:infiniburn_end',
    'minecraft:infiniburn_nether',
    'minecraft:infiniburn_overworld',
  ],
  // Vanilla builds item components (banners, goat horns) while configuration finishes and throws
  // on the same missing-tag basis; these tags are read by vanilla code rather than registry data.
  'minecraft:banner_pattern': [
    'minecraft:no_item_required',
    'minecraft:pattern_item/bordure_indented',
    'minecraft:pattern_item/creeper',
    'minecraft:pattern_item/field_masoned',
    'minecraft:pattern_item/flow',
    'minecraft:pattern_item/flower',
    'minecraft:pattern_item/globe',
    'minecraft:pattern_item/guster',
    'minecraft:pattern_item/mojang',
    'minecraft:pattern_item/piglin',
    'minecraft:pattern_item/skull',
  ],
  'minecraft:instrument': [
    'minecraft:goat_horns',
    'minecraft:regular_goat_horns',
    'minecraft:screaming_goat_horns',
  ],
};

// Registries every vanilla version carries, so their tags are always safe to bind. Data-driven
// registries (dialog, enchantment, timeline) are bound only when the shipped codec actually syncs
// them; tags for an unsynced registry would be meaningless on older versions.
const CORE_TAG_REGISTRIES: ReadonlySet<string> = new Set([
  'minecraft:item',
  'minecraft:block',
  'minecraft:entity_type',
]);

export interface TagsPacket {
  readonly name: string;
  readonly params: { readonly tags: readonly RegistryTags[] };
}

export interface RegistryTags {
  readonly tagType: string;
  readonly tags: readonly TagDefinition[];
}

export interface TagDefinition {
  readonly tagName: string;
  readonly entries: readonly number[];
}

export function getTagBindings(): Readonly<Record<string, readonly string[]>> {
  return TAG_BINDINGS;
}

export function createTagsPacket(mcData: MinecraftData): TagsPacket | null {
  if (!hasConfigurationPacket(mcData, 'packet_tags')) {
    return null;
  }

  const syncedRegistries = getRegistryIds(mcData);
  const groups: RegistryTags[] = [];
  for (const [registry, names] of Object.entries(TAG_BINDINGS)) {
    if (!CORE_TAG_REGISTRIES.has(registry) && !syncedRegistries.has(registry)) {
      continue;
    }
    groups.push({
      tagType: registry,
      tags: names.map((tagName): TagDefinition => ({
        tagName,
        entries: [],
      })),
    });
  }
  return { name: 'tags', params: { tags: groups } };
}

/**
 * Flushes the bound tags after the registry stream and before the configuration finish, which is
 * the point where vanilla consumes both. Installed outside-in after the versioned registry codec
 * so registry writes still flow through that wrapper untouched.
 */
export function installConfigurationTags(client: ServerClient): void {
  const writePacket: ClientWrite = client.write.bind(client);
  let tagsSent = false;

  client.write = (packetName: string, params: unknown): void => {
    if (packetName === 'finish_configuration' && !tagsSent) {
      tagsSent = true;
      const mcData = getMinecraftData(client.version);
      if (mcData !== null) {
        const packet = createTagsPacket(mcData);
        if (packet !== null) {
          writePacket(packet.name, packet.params);
        }
      }
    }
    writePacket(packetName, params);
  };
}

function getRegistryIds(mcData: MinecraftData): ReadonlySet<string> {
  const codec = mcData.loginPacket?.['dimensionCodec'];
  if (!isRecord(codec)) {
    return new Set();
  }
  return new Set(Object.keys(codec));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
