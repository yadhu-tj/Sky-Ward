export interface HoleSlot {
  slotIndex: number;
  startX: number;
  endX: number;
  isPortal: boolean;
}

export interface ChunkRow {
  id: string;
  worldY: number; // Altitude in world coordinates (altitude increases upward, 50px = 1m)
  height: number;
  slots: HoleSlot[];
  isSafeZone?: boolean;
  isGateway?: boolean;
  gatewaySectorIndex?: number;
  gatewayLevelNumber?: number;
  gatewayName?: string;
  gatewayAltitudeMeters?: number;
}

export interface SectorDefinition {
  index: number; // 0, 1, 2, 3, 4
  levelNumber: number; // 1, 2, 3, 4, 5
  name: string;
  sectorCode: string;
  minAltitudeMeters: number;
  maxAltitudeMeters: number;
  minWorldY: number;
  maxWorldY: number;
  holeProbability: number;
  portalProbability: number;
  chunkSpacing: number;
  maxConsecutiveHoles: number;
  minSafeSlots: number;
  floorBaseSpeed: number; // px/s
}

export const SECTOR_DEFINITIONS: SectorDefinition[] = [
  {
    index: 0,
    levelNumber: 1,
    name: 'GROUND ELEVATION',
    sectorCode: 'SEC 01',
    minAltitudeMeters: 0,
    maxAltitudeMeters: 30,
    minWorldY: 0,
    maxWorldY: 1500,
    holeProbability: 0.18,
    portalProbability: 0, // Ground tutorial phase: focus on fundamental tilt balance
    chunkSpacing: 175,
    maxConsecutiveHoles: 1,
    minSafeSlots: 3,
    floorBaseSpeed: 42,
  },
  {
    index: 1,
    levelNumber: 2,
    name: 'LOWER STRATA',
    sectorCode: 'SEC 02',
    minAltitudeMeters: 30,
    maxAltitudeMeters: 75,
    minWorldY: 1500,
    maxWorldY: 3750,
    holeProbability: 0.24,
    portalProbability: 0.06, // Warps introduced
    chunkSpacing: 165,
    maxConsecutiveHoles: 2,
    minSafeSlots: 2,
    floorBaseSpeed: 54,
  },
  {
    index: 2,
    levelNumber: 3,
    name: 'HIGH TROPOSPHERE',
    sectorCode: 'SEC 03',
    minAltitudeMeters: 75,
    maxAltitudeMeters: 135,
    minWorldY: 3750,
    maxWorldY: 6750,
    holeProbability: 0.28,
    portalProbability: 0.08,
    chunkSpacing: 155,
    maxConsecutiveHoles: 2,
    minSafeSlots: 2,
    floorBaseSpeed: 68,
  },
  {
    index: 3,
    levelNumber: 4,
    name: 'MESOSPHERE EXPANSE',
    sectorCode: 'SEC 04',
    minAltitudeMeters: 135,
    maxAltitudeMeters: 210,
    minWorldY: 6750,
    maxWorldY: 10500,
    holeProbability: 0.32,
    portalProbability: 0.10,
    chunkSpacing: 145,
    maxConsecutiveHoles: 2,
    minSafeSlots: 2,
    floorBaseSpeed: 82,
  },
  {
    index: 4,
    levelNumber: 5,
    name: 'ORBITAL APEX',
    sectorCode: 'SEC 05',
    minAltitudeMeters: 210,
    maxAltitudeMeters: Infinity,
    minWorldY: 10500,
    maxWorldY: Infinity,
    holeProbability: 0.35,
    portalProbability: 0.10,
    chunkSpacing: 140,
    maxConsecutiveHoles: 2,
    minSafeSlots: 2,
    floorBaseSpeed: 95,
  },
];

export function getSectorForWorldY(worldY: number): SectorDefinition {
  for (let i = SECTOR_DEFINITIONS.length - 1; i >= 0; i--) {
    if (worldY >= SECTOR_DEFINITIONS[i].minWorldY) {
      return SECTOR_DEFINITIONS[i];
    }
  }
  return SECTOR_DEFINITIONS[0];
}

export function getSectorForAltitude(altitudeMeters: number): SectorDefinition {
  for (let i = SECTOR_DEFINITIONS.length - 1; i >= 0; i--) {
    if (altitudeMeters >= SECTOR_DEFINITIONS[i].minAltitudeMeters) {
      return SECTOR_DEFINITIONS[i];
    }
  }
  return SECTOR_DEFINITIONS[0];
}

export interface GeneratorConfig {
  barWidth: number;
  slotCount: number;
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  barWidth: 700,
  slotCount: 10,
};

export class LevelGenerator {
  private config: GeneratorConfig;
  private nextRowIndex: number = 0;
  private highestWorldY: number = 0;
  private safeZones: Array<{ minY: number; maxY: number }> = [];
  private lastPortalWorldY: number = -9999;
  private generatedGateways: Set<number> = new Set();

  constructor(config: Partial<GeneratorConfig> = {}) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
  }

  public reset(startingWorldY: number = 0): void {
    this.nextRowIndex = 0;
    this.highestWorldY = startingWorldY;
    this.safeZones = [];
    this.lastPortalWorldY = -9999;
    this.generatedGateways.clear();
  }

  /**
   * Adds a vertical safe zone where no holes or hazards can spawn (e.g. portal landing zone or gateway corridor).
   */
  public addSafeZone(worldY: number, halfWidth: number = 90): void {
    this.safeZones.push({
      minY: worldY - halfWidth,
      maxY: worldY + halfWidth,
    });
  }

  /**
   * Generates a single chunk row with hole placements conforming to active Sector parameters.
   */
  public generateRow(worldY: number): ChunkRow {
    const { barWidth, slotCount } = this.config;
    const sector = getSectorForWorldY(worldY);
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
      if (consecutiveHoles >= sector.maxConsecutiveHoles) {
        hasHole[i] = false;
        consecutiveHoles = 0;
        continue;
      }

      const shouldHaveHole = Math.random() < sector.holeProbability;
      if (shouldHaveHole) {
        hasHole[i] = true;
        consecutiveHoles++;
      } else {
        hasHole[i] = false;
        consecutiveHoles = 0;
      }
    }

    // Guaranteed path check based on sector minimum safe slots
    const safeSlotsCount = hasHole.filter((h) => !h).length;
    if (safeSlotsCount < sector.minSafeSlots) {
      hasHole[Math.floor(slotCount / 2)] = false;
      hasHole[0] = false;
      if (sector.minSafeSlots >= 3) {
        hasHole[slotCount - 1] = false;
      }
    }

    // Build HoleSlot objects
    let portalPlacedInRow = false;
    for (let i = 0; i < slotCount; i++) {
      if (hasHole[i]) {
        // Portal can only appear if unlocked for this sector and cooldown distance (750px) has passed
        const canSpawnPortal =
          sector.portalProbability > 0 &&
          !portalPlacedInRow &&
          worldY - this.lastPortalWorldY >= 750;
        const isPortal = canSpawnPortal && Math.random() < sector.portalProbability;

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
   * Pre-populates or generates chunks ahead of current camera/bar altitude,
   * injecting physical Milestone Gateways and safe transition corridors.
   */
  public generateUpTo(targetWorldY: number, existingRows: ChunkRow[]): ChunkRow[] {
    // Zero-allocation early return when world buffer is already populated
    if (this.highestWorldY >= targetWorldY) {
      return existingRows;
    }

    const newRows: ChunkRow[] = [...existingRows];

    while (this.highestWorldY < targetWorldY) {
      const currentSector = getSectorForWorldY(this.highestWorldY);
      const nextY = this.highestWorldY + currentSector.chunkSpacing;

      // Check if this step crosses any Sector Gateway boundary
      for (const sector of SECTOR_DEFINITIONS) {
        if (
          sector.minWorldY > 0 &&
          !this.generatedGateways.has(sector.index) &&
          this.highestWorldY < sector.minWorldY &&
          nextY >= sector.minWorldY
        ) {
          // Inject Sector Milestone Gateway row
          this.generatedGateways.add(sector.index);
          const gatewayRow: ChunkRow = {
            id: `gateway-row-${sector.index}`,
            worldY: sector.minWorldY,
            height: 40,
            slots: [],
            isSafeZone: true,
            isGateway: true,
            gatewaySectorIndex: sector.index,
            gatewayLevelNumber: sector.levelNumber,
            gatewayName: sector.name,
            gatewayAltitudeMeters: sector.minAltitudeMeters,
          };
          newRows.push(gatewayRow);

          // Inject post-gateway safe breathing corridor (+180px / 3.6m)
          this.addSafeZone(sector.minWorldY + 90, 90);

          this.highestWorldY = sector.minWorldY;
          break;
        }
      }

      this.highestWorldY += currentSector.chunkSpacing;
      newRows.push(this.generateRow(this.highestWorldY));
    }

    return newRows;
  }
}
