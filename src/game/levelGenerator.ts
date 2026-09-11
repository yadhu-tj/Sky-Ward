export interface HoleSlot {
  slotIndex: number;
  startX: number;
  endX: number;
  isPortal: boolean;
}

export interface ChunkRow {
  id: string;
  worldY: number; // Altitude in world coordinates (altitude increases upward)
  height: number;
  slots: HoleSlot[];
  isSafeZone?: boolean;
}

export interface GeneratorConfig {
  barWidth: number;
  slotCount: number;
  chunkSpacing: number; // Vertical distance between obstacle rows (px)
  holeProbability: number; // 0.20 to 0.30
  portalProbability: number; // 0.10
  maxConsecutiveHoles: number; // max consecutive slots with holes
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  barWidth: 600,
  slotCount: 8,
  chunkSpacing: 160,
  holeProbability: 0.25,
  portalProbability: 0.06, // balanced spawn rate
  maxConsecutiveHoles: 2,
};

export class LevelGenerator {
  private config: GeneratorConfig;
  private nextRowIndex: number = 0;
  private highestWorldY: number = 0;
  private safeZones: Array<{ minY: number; maxY: number }> = [];
  private lastPortalWorldY: number = -9999;

  constructor(config: Partial<GeneratorConfig> = {}) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
  }

  public reset(startingWorldY: number = 0): void {
    this.nextRowIndex = 0;
    this.highestWorldY = startingWorldY;
    this.safeZones = [];
    this.lastPortalWorldY = -9999;
  }

  /**
   * Adds a vertical safe zone where no holes or hazards can spawn (e.g. portal landing zone).
   */
  public addSafeZone(worldY: number, halfWidth: number = 90): void {
    this.safeZones.push({
      minY: worldY - halfWidth,
      maxY: worldY + halfWidth,
    });
  }

  /**
   * Generates a single chunk row with hole placements satisfying the guaranteed-path rule.
   */
  public generateRow(worldY: number): ChunkRow {
    const { barWidth, slotCount, holeProbability, portalProbability, maxConsecutiveHoles } =
      this.config;
    const slotWidth = barWidth / slotCount;
    const slots: HoleSlot[] = [];

    // Check if worldY is in a safe zone
    const isSafe = this.safeZones.some((z) => worldY >= z.minY && worldY <= z.maxY);
    if (isSafe) {
      return {
        id: `chunk-row-${this.nextRowIndex++}`,
        worldY,
        height: 36,
        slots: [],
        isSafeZone: true,
      };
    }

    // Decide which slots have holes while guaranteeing a path
    let consecutiveHoles = 0;
    const hasHole: boolean[] = Array.from({ length: slotCount }, () => false);

    for (let i = 0; i < slotCount; i++) {
      if (consecutiveHoles >= maxConsecutiveHoles) {
        hasHole[i] = false;
        consecutiveHoles = 0;
        continue;
      }

      const shouldHaveHole = Math.random() < holeProbability;
      if (shouldHaveHole) {
        hasHole[i] = true;
        consecutiveHoles++;
      } else {
        hasHole[i] = false;
        consecutiveHoles = 0;
      }
    }

    // Guaranteed path check: ensure at least 2 safe slots exist per row
    const safeSlotsCount = hasHole.filter((h) => !h).length;
    if (safeSlotsCount < 2) {
      hasHole[Math.floor(slotCount / 2)] = false;
      hasHole[0] = false;
    }

    // Build HoleSlot objects
    let portalPlacedInRow = false;
    for (let i = 0; i < slotCount; i++) {
      if (hasHole[i]) {
        // Portal can only appear if cooldown distance (750px) has passed and not yet placed in this row
        const canSpawnPortal =
          !portalPlacedInRow && worldY - this.lastPortalWorldY >= 750;
        const isPortal = canSpawnPortal && Math.random() < portalProbability;

        if (isPortal) {
          portalPlacedInRow = true;
          this.lastPortalWorldY = worldY;
        }

        slots.push({
          slotIndex: i,
          startX: i * slotWidth + slotWidth * 0.1,
          endX: (i + 1) * slotWidth - slotWidth * 0.1,
          isPortal,
        });
      }
    }

    const row: ChunkRow = {
      id: `chunk-row-${this.nextRowIndex++}`,
      worldY,
      height: 36,
      slots,
    };

    return row;
  }

  /**
   * Pre-populates or generates chunks ahead of current camera/bar altitude.
   */
  public generateUpTo(targetWorldY: number, existingRows: ChunkRow[]): ChunkRow[] {
    const newRows: ChunkRow[] = [...existingRows];

    while (this.highestWorldY < targetWorldY) {
      this.highestWorldY += this.config.chunkSpacing;
      newRows.push(this.generateRow(this.highestWorldY));
    }

    return newRows;
  }
}
