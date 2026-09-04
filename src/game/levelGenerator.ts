export interface HoleSlot {
  slotIndex: number;
  startX: number;
  endX: number;
  isPortal: boolean;
}

export interface ChunkRow {
  id: string;
  worldY: number; // Altitude in world coordinates (smaller or more negative is higher up, or altitude increases upward)
  height: number;
  slots: HoleSlot[];
}

export interface GeneratorConfig {
  barWidth: number;
  slotCount: number;
  chunkSpacing: number; // Vertical distance between obstacle rows (e.g. 140px)
  holeProbability: number; // 0.20 to 0.30
  portalProbability: number; // 0.10
  maxConsecutiveHoles: number; // max 2 consecutive slots with holes
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  barWidth: 600,
  slotCount: 8,
  chunkSpacing: 160,
  holeProbability: 0.25,
  portalProbability: 0.10,
  maxConsecutiveHoles: 2,
};

export class LevelGenerator {
  private config: GeneratorConfig;
  private nextRowIndex: number = 0;
  private highestWorldY: number = 0;

  constructor(config: Partial<GeneratorConfig> = {}) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
  }

  public reset(startingWorldY: number = 0): void {
    this.nextRowIndex = 0;
    this.highestWorldY = startingWorldY;
  }

  /**
   * Generates a single chunk row with hole placements satisfying the guaranteed-path rule.
   */
  public generateRow(worldY: number): ChunkRow {
    const { barWidth, slotCount, holeProbability, portalProbability, maxConsecutiveHoles } = this.config;
    const slotWidth = barWidth / slotCount;
    const slots: HoleSlot[] = [];

    // Decide which slots have holes while guaranteeing a path
    let consecutiveHoles = 0;
    const hasHole: boolean[] = Array.from({ length: slotCount }, () => false);

    for (let i = 0; i < slotCount; i++) {
      // Never allow all slots or more than maxConsecutiveHoles
      if (consecutiveHoles >= maxConsecutiveHoles) {
        hasHole[i] = false;
        consecutiveHoles = 0;
        continue;
      }

      // Roll for hole
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
      // Force at least 2 slots to be safe
      hasHole[Math.floor(slotCount / 2)] = false;
      hasHole[0] = false;
    }

    // Build HoleSlot objects
    for (let i = 0; i < slotCount; i++) {
      if (hasHole[i]) {
        const isPortal = Math.random() < portalProbability;
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
    
    // In our coordinate system, ascending means worldY decreases (towards negative infinity),
    // or worldY represents altitude (increasing upwards).
    // Let worldAltitude increase: targetAltitude > highestWorldY
    while (this.highestWorldY < targetWorldY) {
      this.highestWorldY += this.config.chunkSpacing;
      newRows.push(this.generateRow(this.highestWorldY));
    }

    return newRows;
  }
}
