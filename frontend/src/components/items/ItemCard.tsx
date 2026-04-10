import { useMemo } from 'react';
import type {
  ItemCardProps,
  ItemRarity,
  ItemInfluence,
  ItemStat,
} from '@/types/item';

// ---------------------------------------------------------------------------
// Rarity color mapping
// ---------------------------------------------------------------------------

const RARITY_COLORS: Record<ItemRarity, { text: string; border: string; bg: string; glow: string }> = {
  normal: {
    text: 'text-poe-rarity-normal',
    border: 'border-poe-rarity-normal/30',
    bg: 'bg-poe-bg-card',
    glow: '',
  },
  magic: {
    text: 'text-poe-rarity-magic',
    border: 'border-poe-rarity-magic/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_8px_rgba(136,136,255,0.15)]',
  },
  rare: {
    text: 'text-poe-rarity-rare',
    border: 'border-poe-rarity-rare/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_8px_rgba(255,255,119,0.15)]',
  },
  unique: {
    text: 'text-poe-rarity-unique',
    border: 'border-poe-rarity-unique/50',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_12px_rgba(175,96,37,0.2)]',
  },
  gem: {
    text: 'text-poe-rarity-gem',
    border: 'border-poe-rarity-gem/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_8px_rgba(27,162,155,0.15)]',
  },
  currency: {
    text: 'text-poe-rarity-currency',
    border: 'border-poe-rarity-currency/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_8px_rgba(170,158,130,0.15)]',
  },
  divination_card: {
    text: 'text-poe-rarity-currency',
    border: 'border-poe-rarity-currency/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_8px_rgba(170,158,130,0.15)]',
  },
  prophecy: {
    text: 'text-[#588650]',
    border: 'border-[#588650]/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_8px_rgba(88,134,80,0.15)]',
  },
  relic: {
    text: 'text-[#FF6E2A]',
    border: 'border-[#FF6E2A]/40',
    bg: 'bg-poe-bg-card',
    glow: 'shadow-[0_0_12px_rgba(255,110,42,0.2)]',
  },
};

const INFLUENCE_COLORS: Record<ItemInfluence, string> = {
  shaper: '#7D5AAF',
  elder: '#2E86C1',
  crusader: '#C7A038',
  hunter: '#2EAD4F',
  redeemer: '#CC5555',
  warlord: '#D14A1A',
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getRarityLabel(rarity: ItemRarity): string {
  const labels: Record<ItemRarity, string> = {
    normal: 'Normal',
    magic: 'Magic',
    rare: 'Rare',
    unique: 'Unique',
    gem: 'Gem',
    currency: 'Currency',
    divination_card: 'Divination Card',
    prophecy: 'Prophecy',
    relic: 'Relic',
  };
  return labels[rarity];
}

function getInfluenceGradient(influences: ItemInfluence[]): string | null {
  if (influences.length === 0) return null;
  if (influences.length === 1) {
    const color = INFLUENCE_COLORS[influences[0]];
    return `linear-gradient(to right, ${color}40, transparent)`;
  }
  const colors = influences.map((inf) => INFLUENCE_COLORS[inf]);
  return `linear-gradient(to right, ${colors.map((c) => `${c}40`).join(', ')}, transparent)`;
}

function getStatPrefix(stat: ItemStat): string {
  if (stat.fractured) return '{fractured}';
  if (stat.crafted) return '{crafted}';
  if (stat.corrupted) return '{corrupted}';
  return '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatLine({ stat }: { stat: ItemStat }) {
  const prefix = getStatPrefix(stat);
  const prefixColor = stat.fractured
    ? 'text-[#A29162]'
    : stat.crafted
      ? 'text-[#B8B8FF]'
      : stat.corrupted
        ? 'text-[#D02090]'
        : '';

  return (
    <li className="flex items-start gap-1 text-xs leading-relaxed">
      {prefix && (
        <span className={`shrink-0 text-[10px] ${prefixColor}`}>
          {prefix}
        </span>
      )}
      <span
        className={
          stat.implicit
            ? 'text-poe-text-muted'
            : 'text-poe-text-primary'
        }
      >
        {stat.text}
      </span>
    </li>
  );
}

function RequirementsDisplay({
  requirements,
}: {
  requirements: NonNullable<ItemCardProps['item']['requirements']>;
}) {
  const parts: string[] = [];
  if (requirements.level) parts.push(`Level: ${requirements.level}`);
  if (requirements.strength) parts.push(`Str: ${requirements.strength}`);
  if (requirements.dexterity) parts.push(`Dex: ${requirements.dexterity}`);
  if (requirements.intelligence) parts.push(`Int: ${requirements.intelligence}`);
  if (requirements.classRestriction)
    parts.push(`Class: ${requirements.classRestriction}`);

  if (parts.length === 0) return null;

  return (
    <div className="text-[11px] text-poe-text-muted mt-1">
      <span className="text-poe-text-secondary font-medium">Requires </span>
      {parts.join(', ')}
    </div>
  );
}

function QualityBadge({ quality }: { quality: { value: number; max?: number } }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-poe-gold/10 text-poe-gold-light border border-poe-gold/20">
      Q: {quality.value}{quality.max ? `/${quality.max}` : ''}
    </span>
  );
}

function InfluenceBadge({ influence }: { influence: ItemInfluence }) {
  const color = INFLUENCE_COLORS[influence];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
      style={{
        backgroundColor: `${color}15`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {influence}
    </span>
  );
}

function StateIndicator({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium"
      style={{ color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / loading state
// ---------------------------------------------------------------------------

function ItemCardSkeleton({ variant }: { variant: 'compact' | 'default' | 'detailed' }) {
  if (variant === 'compact') {
    return (
      <div className="poe-card animate-pulse flex items-center gap-3 p-3">
        <div className="w-10 h-10 rounded bg-poe-bg-tertiary" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-poe-bg-tertiary" />
          <div className="h-2 w-1/2 rounded bg-poe-bg-tertiary" />
        </div>
      </div>
    );
  }

  return (
    <div className="poe-card animate-pulse p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded bg-poe-bg-tertiary" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-poe-bg-tertiary" />
          <div className="h-3 w-1/3 rounded bg-poe-bg-tertiary" />
        </div>
      </div>
      {variant === 'detailed' && (
        <>
          <div className="h-px bg-poe-border" />
          <div className="space-y-2">
            <div className="h-2.5 w-full rounded bg-poe-bg-tertiary" />
            <div className="h-2.5 w-5/6 rounded bg-poe-bg-tertiary" />
            <div className="h-2.5 w-4/6 rounded bg-poe-bg-tertiary" />
          </div>
          <div className="h-px bg-poe-border" />
          <div className="space-y-2">
            <div className="h-2.5 w-full rounded bg-poe-bg-tertiary" />
            <div className="h-2.5 w-3/4 rounded bg-poe-bg-tertiary" />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ItemCard component
// ---------------------------------------------------------------------------

/**
 * ItemCard displays a Path of Exile item with PoE-themed styling.
 *
 * Features:
 * - Rarity-based color coding (normal, magic, rare, unique, gem, currency, etc.)
 * - Influence indicators with gradient borders
 * - Item state badges (corrupted, mirrored, veiled, etc.)
 * - Weapon damage and armor defense displays
 * - Compact, default, and detailed display variants
 * - Loading skeleton state
 * - Click and hover callbacks
 */
export function ItemCard({
  item,
  variant = 'default',
  onClick,
  onHover,
  selected = false,
  loading = false,
  className = '',
  showIcon = true,
  showRequirements = true,
  showSource = false,
}: ItemCardProps) {
  const colors = useMemo(() => RARITY_COLORS[item.rarity], [item.rarity]);
  const influenceGradient = useMemo(
    () => getInfluenceGradient(item.influences ?? []),
    [item.influences],
  );

  // Loading state
  if (loading) {
    return <ItemCardSkeleton variant={variant} />;
  }

  const isClickable = !!onClick;
  const handleClick = isClickable
    ? () => onClick(item)
    : undefined;
  const handleMouseEnter = onHover ? () => onHover(item) : undefined;
  const handleMouseLeave = onHover ? () => onHover(null) : undefined;

  // ----- COMPACT variant -----
  if (variant === 'compact') {
    return (
      <div
        className={`
          poe-card flex items-center gap-3 p-3 cursor-default
          border ${colors.border} ${colors.glow}
          ${selected ? 'ring-2 ring-poe-gold/50' : ''}
          ${isClickable ? 'cursor-pointer hover:bg-poe-hover transition-colors' : ''}
          ${className}
        `}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        data-testid={`item-card-${item.id}`}
        data-rarity={item.rarity}
      >
        {/* Icon */}
        {showIcon && (
          <div className="shrink-0 w-10 h-10 rounded border border-poe-border flex items-center justify-center bg-poe-bg-primary overflow-hidden">
            {item.iconUrl ? (
              <img
                src={item.iconUrl}
                alt={item.name}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-poe-text-muted text-xs">?</span>
            )}
          </div>
        )}

        {/* Name + base type */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-poe truncate ${colors.text}`}>
            {item.name}
          </p>
          <p className="text-[11px] text-poe-text-muted truncate">
            {item.baseType ?? getRarityLabel(item.rarity)}
          </p>
        </div>

        {/* Item level or stack size */}
        <div className="shrink-0 text-[11px] text-poe-text-muted text-right">
          {item.itemLevel && <div>ilvl {item.itemLevel}</div>}
          {item.gemLevel != null && <div>Lv. {item.gemLevel}</div>}
          {item.mapTier != null && <div>T{item.mapTier}</div>}
        </div>
      </div>
    );
  }

  // ----- DEFAULT and DETAILED variants -----
  const showSeparator =
    variant === 'detailed' &&
    ((item.implicitStats && item.implicitStats.length > 0) ||
      (item.explicitStats && item.explicitStats.length > 0));

  return (
    <div
      className={`
        poe-card relative overflow-hidden
        border ${colors.border} ${colors.glow}
        ${selected ? 'ring-2 ring-poe-gold/50' : ''}
        ${isClickable ? 'cursor-pointer hover:bg-poe-hover transition-colors' : ''}
        ${className}
      `}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      data-testid={`item-card-${item.id}`}
      data-rarity={item.rarity}
    >
      {/* Influence gradient overlay */}
      {influenceGradient && (
        <div
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{ background: influenceGradient }}
        />
      )}

      <div className="relative">
        {/* Header: icon + name + badges */}
        <div className="flex items-start gap-3 p-4 pb-2">
          {/* Item icon */}
          {showIcon && (
            <div className="shrink-0 w-12 h-12 rounded border border-poe-border flex items-center justify-center bg-poe-bg-primary overflow-hidden">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <svg
                  className="w-6 h-6 text-poe-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25"
                  />
                </svg>
              )}
            </div>
          )}

          {/* Name, type, and top-level badges */}
          <div className="flex-1 min-w-0">
            <h3 className={`text-base font-poe leading-tight ${colors.text}`}>
              {item.name}
            </h3>
            {item.baseType && (
              <p className="text-xs text-poe-text-secondary mt-0.5">
                {item.baseType}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.text} border ${colors.border} bg-poe-bg-primary`}
              >
                {getRarityLabel(item.rarity)}
              </span>
              {item.quality != null && <QualityBadge quality={item.quality} />}
              {item.influences?.map((inf) => (
                <InfluenceBadge key={inf} influence={inf} />
              ))}
            </div>
          </div>

          {/* Item level / gem level / map tier in top right */}
          <div className="shrink-0 text-right space-y-0.5">
            {item.itemLevel != null && (
              <div className="text-[11px] text-poe-text-muted">
                <span className="text-poe-text-secondary">ilvl</span>{' '}
                <span className="text-poe-text-primary font-mono">{item.itemLevel}</span>
              </div>
            )}
            {item.gemLevel != null && (
              <div className="text-[11px] text-poe-text-muted">
                <span className="text-poe-text-secondary">Lv.</span>{' '}
                <span className="text-poe-rarity-gem font-mono">{item.gemLevel}</span>
              </div>
            )}
            {item.mapTier != null && (
              <div className="text-[11px] text-poe-text-muted">
                <span className="text-poe-text-secondary">Tier</span>{' '}
                <span className="text-poe-text-primary font-mono">{item.mapTier}</span>
              </div>
            )}
            {item.stackSize != null && (
              <div className="text-[11px] text-poe-text-muted">
                <span className="font-mono text-poe-text-primary">{item.stackSize.current}</span>
                <span className="text-poe-text-muted">/{item.stackSize.max}</span>
              </div>
            )}
          </div>
        </div>

        {/* State indicators row (corrupted, mirrored, etc.) */}
        {(item.corrupted || item.mirrored || item.veiled || item.fractured || item.synthesized || item.replica) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
            {item.corrupted && <StateIndicator label="Corrupted" color="#D02090" />}
            {item.mirrored && <StateIndicator label="Mirrored" color="#AA9E82" />}
            {item.veiled && <StateIndicator label="Veiled" color="#9F9F9F" />}
            {item.fractured && <StateIndicator label="Fractured" color="#A29162" />}
            {item.synthesized && <StateIndicator label="Synthesized" color="#7D5AAF" />}
            {item.replica && <StateIndicator label="Replica" color="#2E86C1" />}
          </div>
        )}

        {/* Separator */}
        <div className="mx-4 border-t border-poe-border" />

        {/* Description */}
        {item.description && (
          <p className="px-4 py-2 text-xs text-poe-text-secondary italic leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Weapon damage (detailed) */}
        {variant === 'detailed' && item.weaponDamage && (
          <div className="px-4 py-2 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-poe-text-secondary">Physical Damage</span>
              <span className="text-poe-text-primary font-mono">
                {item.weaponDamage.physicalMin}-{item.weaponDamage.physicalMax}
              </span>
            </div>
            {item.weaponDamage.elementalMin != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Elemental Damage</span>
                <span className="text-[#FF4500] font-mono">
                  {item.weaponDamage.elementalMin}-{item.weaponDamage.elementalMax}
                </span>
              </div>
            )}
            {item.weaponDamage.chaosMin != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Chaos Damage</span>
                <span className="text-[#D02090] font-mono">
                  {item.weaponDamage.chaosMin}-{item.weaponDamage.chaosMax}
                </span>
              </div>
            )}
            {item.weaponDamage.attacksPerSecond != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Attacks per Second</span>
                <span className="text-poe-text-primary font-mono">
                  {item.weaponDamage.attacksPerSecond.toFixed(2)}
                </span>
              </div>
            )}
            {item.weaponDamage.criticalStrikeChance != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Critical Strike Chance</span>
                <span className="text-poe-text-primary font-mono">
                  {item.weaponDamage.criticalStrikeChance.toFixed(2)}%
                </span>
              </div>
            )}
            {item.weaponDamage.range != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Range</span>
                <span className="text-poe-text-primary font-mono">
                  {item.weaponDamage.range}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Defenses (detailed) */}
        {variant === 'detailed' && item.defenses && (
          <div className="px-4 py-2 space-y-1">
            {item.defenses.armour != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Armour</span>
                <span className="text-poe-text-primary font-mono">{item.defenses.armour}</span>
              </div>
            )}
            {item.defenses.evasion != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Evasion Rating</span>
                <span className="text-poe-text-primary font-mono">{item.defenses.evasion}</span>
              </div>
            )}
            {item.defenses.energyShield != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Energy Shield</span>
                <span className="text-[#8888FF] font-mono">{item.defenses.energyShield}</span>
              </div>
            )}
            {item.defenses.ward != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Ward</span>
                <span className="text-poe-text-primary font-mono">{item.defenses.ward}</span>
              </div>
            )}
            {item.defenses.blockChance != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-poe-text-secondary">Block Chance</span>
                <span className="text-poe-text-primary font-mono">{item.defenses.blockChance}%</span>
              </div>
            )}
          </div>
        )}

        {/* Separator before stats (if stats exist) */}
        {showSeparator && (
          <div className="mx-4 border-t border-poe-border" />
        )}

        {/* Implicit stats */}
        {item.implicitStats && item.implicitStats.length > 0 && (
          <div className={variant === 'detailed' ? 'px-4 py-2' : 'px-4 py-1'}>
            <ul className="space-y-0.5">
              {item.implicitStats.map((stat, idx) => (
                <StatLine key={`implicit-${idx}`} stat={stat} />
              ))}
            </ul>
          </div>
        )}

        {/* Separator between implicit and explicit (detailed) */}
        {variant === 'detailed' &&
          item.implicitStats &&
          item.implicitStats.length > 0 &&
          item.explicitStats &&
          item.explicitStats.length > 0 && (
            <div className="mx-4 border-t border-poe-border" />
          )}

        {/* Explicit stats */}
        {item.explicitStats && item.explicitStats.length > 0 && (
          <div className={variant === 'detailed' ? 'px-4 py-2' : 'px-4 py-1'}>
            <ul className="space-y-0.5">
              {item.explicitStats.map((stat, idx) => (
                <StatLine key={`explicit-${idx}`} stat={stat} />
              ))}
            </ul>
          </div>
        )}

        {/* Crafted stats */}
        {item.craftedStats && item.craftedStats.length > 0 && (
          <div className="px-4 py-1">
            <ul className="space-y-0.5">
              {item.craftedStats.map((stat, idx) => (
                <StatLine key={`crafted-${idx}`} stat={stat} />
              ))}
            </ul>
          </div>
        )}

        {/* Modifier count (detailed) */}
        {variant === 'detailed' && item.modifierCount && (
          <div className="px-4 py-1 text-[11px] text-poe-text-muted">
            Modifiers: {item.modifierCount.current}/{item.modifierCount.max}
          </div>
        )}

        {/* Requirements */}
        {showRequirements && item.requirements && (
          <>
            <div className="mx-4 border-t border-poe-border" />
            <div className="px-4 py-2">
              <RequirementsDisplay requirements={item.requirements} />
            </div>
          </>
        )}

        {/* Flavour text */}
        {variant === 'detailed' && item.flavourText && (
          <>
            <div className="mx-4 border-t border-poe-border" />
            <p className="px-4 py-2 text-xs text-[#AF6025] italic leading-relaxed">
              &ldquo;{item.flavourText}&rdquo;
            </p>
          </>
        )}

        {/* Tags */}
        {variant === 'detailed' && item.tags && item.tags.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 8).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-poe-text-muted bg-poe-bg-primary border border-poe-border"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: source link */}
        {showSource && item.sourceUrl && (
          <div className="px-4 py-2 border-t border-poe-border">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-poe-gold hover:text-poe-gold-light transition-colors underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              View on poedb.tw
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
