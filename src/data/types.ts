export interface TerrainRect {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  angle?: number;
}

export interface TerrainCircle {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
  color: number;
}

export interface TerrainPoly {
  type: 'poly';
  x: number;
  y: number;
  vertices: { x: number; y: number }[];
  color: number;
}

export type TerrainPiece = TerrainRect | TerrainCircle | TerrainPoly;

export interface GooBallPlacement {
  x: number;
  y: number;
  type: string;
  structural: boolean;
}

export interface SignData {
  x: number;
  y: number;
  text: string;
}

export interface LevelData {
  id: string;
  name: string;
  subtitle: string;
  chapter: number;
  requiredGoo: number;
  cameraBounds: { x: number; y: number; width: number; height: number };
  background: { topColor: number; bottomColor: number };
  pipe: { x: number; y: number };
  terrain: TerrainPiece[];
  gooBalls: GooBallPlacement[];
  connections: [number, number][];
  signs?: SignData[];
}

export interface GooBall {
  id: number;
  body: MatterJS.BodyType;
  typeId: string;
  state: 'free' | 'structural' | 'dragging' | 'sucked';
  connections: GooBall[];
  constraints: MatterJS.ConstraintType[];
  crawlTarget: GooBall | null;
  crawlFrom: GooBall | null;
  eyeAngle: number;
  /** Timer for wiggle animation on free goo balls */
  wigglePhase: number;
}

export interface Connection {
  a: GooBall;
  b: GooBall;
  constraint: MatterJS.ConstraintType;
}
