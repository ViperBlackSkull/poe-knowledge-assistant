import { useState } from 'react';
import { ItemCard, ItemCardGrid, EnhancedItemCardGrid } from '@/components/items';
import type {
  ItemDisplayData,
  ItemCardVariant,
} from '@/types/item';

// ---------------------------------------------------------------------------
// Sample item data covering all rarities
// ---------------------------------------------------------------------------

const SAMPLE_ITEMS: ItemDisplayData[] = [
  {
    id: 'sample-normal-1',
    name: 'Iron Sword',
    baseType: 'One-Handed Sword',
    itemType: 'weapon',
    rarity: 'normal',
    game: 'poe2',
    description: 'A simple iron sword, serviceable but unremarkable.',
    requirements: { level: 2, strength: 8, dexterity: 8 },
    itemLevel: 5,
    weaponDamage: {
      physicalMin: 7,
      physicalMax: 15,
      attacksPerSecond: 1.45,
      criticalStrikeChance: 5.0,
      range: 11,
    },
    tags: ['one_hand', 'sword', 'attack', 'melee'],
  },
  {
    id: 'sample-magic-1',
    name: 'Serpent Fang',
    baseType: 'Viper Wand',
    itemType: 'weapon',
    rarity: 'magic',
    game: 'poe2',
    iconUrl: undefined,
    description: 'A wand imbued with venomous energy.',
    implicitStats: [
      { text: '+20% to Chaos Damage', implicit: true },
    ],
    explicitStats: [
      { text: 'Adds 12 to 24 Chaos Damage to Spells', value: 18 },
      { text: '+15% to Cast Speed', value: 15 },
    ],
    requirements: { level: 28, intelligence: 62 },
    itemLevel: 32,
    quality: { value: 12, max: 20 },
    weaponDamage: {
      physicalMin: 14,
      physicalMax: 27,
      chaosMin: 12,
      chaosMax: 24,
      attacksPerSecond: 1.30,
      criticalStrikeChance: 7.5,
    },
    tags: ['one_hand', 'wand', 'spell', 'chaos'],
  },
  {
    id: 'sample-rare-1',
    name: 'Doom Cast',
    baseType: 'Sorcerer Gloves',
    itemType: 'armor',
    rarity: 'rare',
    game: 'poe2',
    description: 'Crafted with forbidden knowledge.',
    implicitStats: [
      { text: '+8 to maximum Energy Shield', implicit: true },
    ],
    explicitStats: [
      { text: '+68 to maximum Energy Shield', value: 68 },
      { text: '+25% to Cold Resistance', value: 25 },
      { text: '+18% to Lightning Resistance', value: 18 },
      { text: '+12 to Intelligence', value: 12 },
      { text: '+5% to Cast Speed', value: 5 },
    ],
    requirements: { level: 47, intelligence: 72 },
    itemLevel: 52,
    defenses: {
      energyShield: 76,
      evasion: 24,
    },
    tags: ['gloves', 'intelligence', 'energy_shield', 'armour'],
  },
  {
    id: 'sample-unique-1',
    name: 'Heart of the Veil',
    baseType: 'Vaald Caftan',
    itemType: 'armor',
    rarity: 'unique',
    game: 'poe2',
    description: 'The boundary between worlds grows thin.',
    flavourText: 'She wore the darkness like a bride wears white.',
    implicitStats: [
      { text: '+15% to all Elemental Resistances', implicit: true },
    ],
    explicitStats: [
      { text: '+120 to maximum Energy Shield' },
      { text: '+40% to Chaos Resistance' },
      { text: 'Gain 10% of Physical Damage as Extra Chaos Damage' },
      { text: '+25 to Intelligence' },
      { text: 'Cannot be Stunned' },
    ],
    requirements: { level: 62, intelligence: 120, dexterity: 60 },
    itemLevel: 72,
    corrupted: true,
    defenses: {
      energyShield: 245,
      evasion: 58,
    },
    influences: ['shaper'],
    tags: ['body_armour', 'intelligence', 'unique', 'energy_shield'],
  },
  {
    id: 'sample-gem-1',
    name: 'Arc',
    baseType: 'Active Skill Gem',
    itemType: 'gem',
    rarity: 'gem',
    game: 'poe2',
    description:
      'A chaining lightning spell that deals damage to enemies in a sequence.',
    explicitStats: [
      { text: 'Deals 18 to 340 Lightning Damage' },
      { text: 'Chains +3 Times' },
      { text: '10% chance to Shock enemies' },
      { text: '+10 to radius' },
    ],
    requirements: { level: 28, intelligence: 67 },
    gemLevel: 20,
    quality: { value: 20, max: 23 },
    tags: ['spell', 'lightning', 'chaining', 'area'],
  },
  {
    id: 'sample-currency-1',
    name: 'Chaos Orb',
    baseType: 'Currency',
    itemType: 'currency',
    rarity: 'currency',
    game: 'poe2',
    description: 'Reforges a rare item with new random modifiers.',
    stackSize: { current: 7, max: 10 },
    tags: ['currency', 'rare', 'reforge'],
  },
  {
    id: 'sample-divination-1',
    name: 'The Porcupine',
    baseType: 'Divination Card',
    itemType: 'divination_card',
    rarity: 'divination_card',
    game: 'poe2',
    description: '6-Link Short Bow',
    flavourText: 'Bristled with a thousand needles, it dares you to grasp it.',
    stackSize: { current: 3, max: 8 },
    tags: ['divination_card', '6-link', 'weapon'],
  },
  {
    id: 'sample-relic-1',
    name: 'Eternal Opulence',
    baseType: 'Gold Amulet',
    itemType: 'accessory',
    rarity: 'relic',
    game: 'poe2',
    description: 'A relic of untold wealth and power.',
    flavourText: 'Gold tarnishes, but power endures.',
    implicitStats: [
      { text: '+15% to Quantity of Items found in this Area', implicit: true },
    ],
    explicitStats: [
      { text: '+30 to all Attributes' },
      { text: '+50 to maximum Life' },
      { text: '+25% to all Elemental Resistances' },
      { text: 'Items in this area are Mirrored' },
    ],
    requirements: { level: 40 },
    itemLevel: 80,
    mirrored: true,
    synthesized: true,
    tags: ['amulet', 'relic', 'unique', 'all_attributes'],
  },
  {
    id: 'sample-prophecy-1',
    name: 'The Cursed Choir',
    baseType: 'Prophecy',
    itemType: 'other',
    rarity: 'prophecy',
    game: 'poe2',
    description: 'A choir of the damned shall sing their final note.',
    flavourText: 'Only the silenced can hear the truth.',
    tags: ['prophecy', 'boss', 'challenge'],
  },
  {
    id: 'sample-unique-weapon',
    name: "Kalandra's Touch",
    baseType: 'Mirrored Ring',
    itemType: 'accessory',
    rarity: 'unique',
    game: 'poe2',
    description: 'This ring mirrors the properties of your other ring.',
    flavourText: 'In her reflection, all things find their equal.',
    explicitStats: [
      { text: 'Has the same implicit Modifiers as your other Ring' },
      { text: 'Has the same explicit Modifiers as your other Ring' },
    ],
    requirements: { level: 55 },
    itemLevel: 60,
    corrupted: true,
    replica: true,
    influences: ['elder'],
    tags: ['ring', 'unique', 'mirrored', 'replica'],
  },
  {
    id: 'sample-magic-map',
    name: 'Cursed Necropolis',
    baseType: 'Beach Map',
    itemType: 'map',
    rarity: 'magic',
    game: 'poe2',
    description: 'Travel to this Map by using it in a personal Map Device.',
    implicitStats: [
      { text: 'Map is occupied by The Brine King', implicit: true },
    ],
    explicitStats: [
      { text: '+25% Monster Pack Size' },
      { text: 'Monsters have 25% increased Physical Damage' },
    ],
    mapTier: 14,
    itemLevel: 78,
    quality: { value: 15, max: 20 },
    tags: ['map', 'endgame', 'tier_14'],
  },
  {
    id: 'sample-rare-flask',
    name: 'Catalysing Aqua',
    baseType: 'Divine Life Flask',
    itemType: 'flask',
    rarity: 'rare',
    game: 'poe2',
    description: 'Restores life over its duration.',
    explicitStats: [
      { text: 'Recovers 2400 Life over 7 Seconds' },
      { text: 'Consumes 10 of 40 Charges on use' },
      { text: '+20% to Recovery Speed' },
      { text: 'Removes Curses on use' },
    ],
    requirements: { level: 60 },
    itemLevel: 65,
    quality: { value: 20, max: 20 },
    stackSize: { current: 40, max: 40 },
    tags: ['flask', 'life', 'recovery'],
  },
];

// ---------------------------------------------------------------------------
// Demo component
// ---------------------------------------------------------------------------

/**
 * ItemCardDemo renders sample items across all rarities and variants
 * for development and testing of the ItemCard component and the
 * EnhancedItemCardGrid layout.
 */
export function ItemCardDemo() {
  const [selectedVariant, setSelectedVariant] = useState<ItemCardVariant>('default');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [showLoadingDemo, setShowLoadingDemo] = useState(false);

  const variants: ItemCardVariant[] = ['compact', 'default', 'detailed'];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-poe text-poe-gold mb-1">
          PoE Item Card Grid
        </h1>
        <p className="text-sm text-poe-text-secondary">
          Enhanced item card grid with filtering, sorting, pagination,
          layout toggle, and infinite scroll. Built for Path of Exile
          items with rarity-themed styling.
        </p>
      </div>

      {/* ===== Enhanced Grid Section ===== */}
      <section>
        <h2 className="text-lg font-poe text-poe-gold-light mb-2">
          Enhanced Item Grid
        </h2>
        <p className="text-xs text-poe-text-muted mb-4">
          Full-featured grid with search, rarity/item-type filters, sort controls,
          pagination, grid/list layout toggle, and infinite scroll mode. Click any
          card to select it.
        </p>

        {/* Variant + loading toggle controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-poe-text-secondary">Variant:</span>
            <div className="flex gap-2">
              {variants.map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVariant(v)}
                  className={`px-3 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
                    selectedVariant === v
                      ? 'bg-poe-gold text-white'
                      : 'bg-poe-bg-tertiary text-poe-text-secondary hover:bg-poe-hover border border-poe-border'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-poe-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={showLoadingDemo}
              onChange={(e) => setShowLoadingDemo(e.target.checked)}
              className="accent-poe-gold"
            />
            Show loading skeleton
          </label>
        </div>

        <EnhancedItemCardGrid
          items={SAMPLE_ITEMS}
          variant={selectedVariant}
          selectedId={selectedId}
          showIcons={true}
          loading={showLoadingDemo}
          config={{
            columns: { sm: 1, md: 2, lg: 3, xl: 3 },
            pageSize: 6,
            showFilters: true,
            showSort: true,
            showPagination: true,
            showItemCount: true,
            showLayoutToggle: true,
          }}
          events={{
            onCardClick: (item) =>
              setSelectedId((prev) => (prev === item.id ? undefined : item.id)),
          }}
        />
      </section>

      {/* ===== Selected Item Detail ===== */}
      {selectedId && (
        <section>
          <h2 className="text-lg font-poe text-poe-gold-light mb-3">
            Selected Item (Detailed View)
          </h2>
          <div className="max-w-md">
            <ItemCard
              item={SAMPLE_ITEMS.find((i) => i.id === selectedId)!}
              variant="detailed"
              showIcon={true}
              showRequirements={true}
              showSource={true}
            />
          </div>
        </section>
      )}

      {/* ===== Basic Grid (backward compat) ===== */}
      <section>
        <h2 className="text-lg font-poe text-poe-gold-light mb-3">
          Basic Grid (Legacy)
        </h2>
        <p className="text-xs text-poe-text-muted mb-4">
          The original simple grid component for backward compatibility.
        </p>
        <ItemCardGrid
          items={SAMPLE_ITEMS.slice(0, 6)}
          variant="compact"
          onCardClick={(item) =>
            setSelectedId((prev) => (prev === item.id ? undefined : item.id))
          }
          selectedId={selectedId}
          showIcons={true}
          columns={{ sm: 1, md: 2, lg: 3, xl: 3 }}
        />
      </section>

      {/* ===== Loading Skeletons ===== */}
      <section>
        <h2 className="text-lg font-poe text-poe-gold-light mb-3">
          Loading Skeletons
        </h2>
        <div className="flex gap-4 flex-wrap">
          <div className="w-72">
            <p className="text-xs text-poe-text-muted mb-2">Compact</p>
            <ItemCard item={SAMPLE_ITEMS[0]} variant="compact" loading />
          </div>
          <div className="w-72">
            <p className="text-xs text-poe-text-muted mb-2">Default</p>
            <ItemCard item={SAMPLE_ITEMS[0]} variant="default" loading />
          </div>
          <div className="w-72">
            <p className="text-xs text-poe-text-muted mb-2">Detailed</p>
            <ItemCard item={SAMPLE_ITEMS[0]} variant="detailed" loading />
          </div>
        </div>
      </section>
    </div>
  );
}
