export interface GooTypeConfig {
  id: string;
  name: string;
  color: number;
  outlineColor: number;
  eyeColor: number;
  radius: number;
  density: number;
  friction: number;
  restitution: number;
  maxConnections: number;
  connectionDistance: number;
  springStiffness: number;
  springDamping: number;
  springLength: number;
  detachable: boolean;
  /** Positive = floats up, 0 = normal gravity */
  buoyancy: number;
  crawlSpeed: number;
}

export const GOO_TYPES: Record<string, GooTypeConfig> = {
  common: {
    id: 'common',
    name: 'Common Goo',
    color: 0x2a2a2a,
    outlineColor: 0x111111,
    eyeColor: 0xffffff,
    radius: 12,
    density: 0.002,
    friction: 0.6,
    restitution: 0.2,
    maxConnections: 4,
    connectionDistance: 75,
    springStiffness: 0.35,
    springDamping: 0.08,
    springLength: 60,
    detachable: false,
    buoyancy: 0,
    crawlSpeed: 1.2,
  },
  ivy: {
    id: 'ivy',
    name: 'Ivy Goo',
    color: 0x3a7a3a,
    outlineColor: 0x1a4a1a,
    eyeColor: 0xccffcc,
    radius: 11,
    density: 0.0018,
    friction: 0.7,
    restitution: 0.15,
    maxConnections: 4,
    connectionDistance: 70,
    springStiffness: 0.4,
    springDamping: 0.1,
    springLength: 55,
    detachable: true,
    buoyancy: 0,
    crawlSpeed: 1.4,
  },
  balloon: {
    id: 'balloon',
    name: 'Balloon Goo',
    color: 0xcc3344,
    outlineColor: 0x881122,
    eyeColor: 0xffcccc,
    radius: 14,
    density: 0.0005,
    friction: 0.3,
    restitution: 0.4,
    maxConnections: 1,
    connectionDistance: 80,
    springStiffness: 0.6,
    springDamping: 0.05,
    springLength: 70,
    detachable: false,
    buoyancy: 0.0025,
    crawlSpeed: 0.8,
  },
  bone: {
    id: 'bone',
    name: 'Bone Goo',
    color: 0xddddcc,
    outlineColor: 0x999988,
    eyeColor: 0xffffff,
    radius: 10,
    density: 0.003,
    friction: 0.9,
    restitution: 0.05,
    maxConnections: 2,
    connectionDistance: 90,
    springStiffness: 0.95,
    springDamping: 0.3,
    springLength: 80,
    detachable: false,
    buoyancy: 0,
    crawlSpeed: 1.0,
  },
  water: {
    id: 'water',
    name: 'Water Goo',
    color: 0x4488cc,
    outlineColor: 0x225588,
    eyeColor: 0xccddff,
    radius: 10,
    density: 0.001,
    friction: 0.1,
    restitution: 0.5,
    maxConnections: 0,
    connectionDistance: 0,
    springStiffness: 0,
    springDamping: 0,
    springLength: 0,
    detachable: false,
    buoyancy: 0,
    crawlSpeed: 2.0,
  },
};
