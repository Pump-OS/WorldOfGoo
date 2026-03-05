/**
 * Level validation tests — run with: npx tsx tests/validate-levels.ts
 *
 * Checks every level for:
 *  1. Data integrity (valid goo types, connection indices, terrain)
 *  2. Basic feasibility (enough balls for requiredGoo)
 *  3. Geometric reachability (structure can reach pipe with available balls)
 *  4. Camera coverage (pipe is visible within camera bounds)
 */

import { LEVELS } from '../src/data/levels';
import { GOO_TYPES, GooTypeConfig } from '../src/data/GooTypes';

const PIPE_SUCTION_RADIUS = 90;
const EFFECTIVE_HEIGHT_PER_BALL = 0.82; // conservative multiplier vs spring length

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, levelId: string, message: string) {
  totalTests++;
  if (condition) {
    passed++;
  } else {
    failed++;
    const msg = `  FAIL [${levelId}]: ${message}`;
    failures.push(msg);
    console.log(msg);
  }
}

console.log('=== World of Goo — Level Validation ===\n');

for (const level of LEVELS) {
  console.log(`--- ${level.name} (${level.id}) ---`);

  // ─── 1. Data integrity ────────────────────────────────────

  // All goo types exist
  for (const ball of level.gooBalls) {
    assert(
      ball.type in GOO_TYPES,
      level.id,
      `Goo type "${ball.type}" not found in GOO_TYPES`,
    );
  }

  // Connection indices in range
  for (const [a, b] of level.connections) {
    assert(
      a >= 0 && a < level.gooBalls.length,
      level.id,
      `Connection index ${a} out of range (${level.gooBalls.length} balls)`,
    );
    assert(
      b >= 0 && b < level.gooBalls.length,
      level.id,
      `Connection index ${b} out of range (${level.gooBalls.length} balls)`,
    );
  }

  // Connections only reference structural balls
  for (const [a, b] of level.connections) {
    assert(
      level.gooBalls[a]?.structural === true,
      level.id,
      `Connection refers to non-structural ball index ${a}`,
    );
    assert(
      level.gooBalls[b]?.structural === true,
      level.id,
      `Connection refers to non-structural ball index ${b}`,
    );
  }

  // At least one terrain piece
  assert(level.terrain.length > 0, level.id, 'Level has no terrain');

  // Terrain rects have positive dimensions
  for (const t of level.terrain) {
    if (t.type === 'rect') {
      assert(t.width > 0 && t.height > 0, level.id, `Terrain rect has invalid size: ${t.width}x${t.height}`);
    }
  }

  // ─── 2. Ball count feasibility ────────────────────────────

  const structural = level.gooBalls.filter(b => b.structural);
  const free = level.gooBalls.filter(b => !b.structural);
  const total = level.gooBalls.length;

  assert(structural.length >= 2, level.id, `Need ≥2 structural balls, got ${structural.length}`);
  assert(level.connections.length >= 1, level.id, 'Need ≥1 initial connection');
  assert(
    free.length >= level.requiredGoo,
    level.id,
    `Not enough free balls (${free.length}) to meet requiredGoo (${level.requiredGoo})`,
  );

  const buildBudget = free.length - level.requiredGoo;
  assert(
    buildBudget >= 2,
    level.id,
    `Build budget too tight: ${free.length} free - ${level.requiredGoo} required = ${buildBudget} (need ≥2)`,
  );

  // ─── 3. Geometric reachability ────────────────────────────

  // Find the highest structural ball (lowest y = closest to pipe for tower)
  // and compute distance to pipe
  const structuralPositions = structural.map(b => ({ x: b.x, y: b.y }));
  const px = level.pipe.x;
  const py = level.pipe.y;

  let minDistToPipe = Infinity;
  for (const s of structuralPositions) {
    const d = Math.sqrt((s.x - px) ** 2 + (s.y - py) ** 2);
    if (d < minDistToPipe) minDistToPipe = d;
  }

  // Compute average spring length for available goo types
  const freeTypes = free.map(b => GOO_TYPES[b.type]).filter(Boolean) as GooTypeConfig[];
  const connectableTypes = freeTypes.filter(t => t.maxConnections > 0);
  const avgSpring = connectableTypes.length > 0
    ? connectableTypes.reduce((s, t) => s + t.springLength, 0) / connectableTypes.length
    : 60;

  const effectiveReachPerBall = avgSpring * EFFECTIVE_HEIGHT_PER_BALL;
  const maxReach = buildBudget * effectiveReachPerBall;
  const distanceToSuction = Math.max(0, minDistToPipe - PIPE_SUCTION_RADIUS);

  assert(
    maxReach >= distanceToSuction,
    level.id,
    `Structure can't reach pipe: need ${distanceToSuction.toFixed(0)}px, ` +
    `max reach ${maxReach.toFixed(0)}px (${buildBudget} balls × ${effectiveReachPerBall.toFixed(0)}px). ` +
    `Pipe at (${px},${py}), nearest structural at ${minDistToPipe.toFixed(0)}px`,
  );

  // Extra check: generous estimate (use all free balls for building)
  const maxReachAll = free.length * effectiveReachPerBall;
  const absolutelyPossible = maxReachAll >= distanceToSuction;
  assert(
    absolutelyPossible,
    level.id,
    `Even using ALL free balls for building can't reach pipe: ` +
    `need ${distanceToSuction.toFixed(0)}px, max ${maxReachAll.toFixed(0)}px`,
  );

  // ─── 4. Camera coverage ───────────────────────────────────

  const cam = level.cameraBounds;
  assert(
    px >= cam.x && px <= cam.x + cam.width,
    level.id,
    `Pipe x=${px} outside camera bounds [${cam.x}, ${cam.x + cam.width}]`,
  );
  assert(
    py >= cam.y && py <= cam.y + cam.height,
    level.id,
    `Pipe y=${py} outside camera bounds [${cam.y}, ${cam.y + cam.height}]`,
  );

  // Structural balls should be in camera
  for (const s of structuralPositions) {
    assert(
      s.x >= cam.x && s.x <= cam.x + cam.width &&
      s.y >= cam.y && s.y <= cam.y + cam.height,
      level.id,
      `Structural ball at (${s.x},${s.y}) outside camera bounds`,
    );
  }

  // ─── 5. Level-specific checks ─────────────────────────────

  // Water goo can't connect — verify levels with water goo have enough
  // non-water free balls to build AND enough sucked balls
  const waterFree = free.filter(b => b.type === 'water');
  const nonWaterFree = free.filter(b => b.type !== 'water');
  if (waterFree.length > 0) {
    const connectableFree = nonWaterFree.filter(b => {
      const t = GOO_TYPES[b.type];
      return t && t.maxConnections > 0;
    });
    assert(
      connectableFree.length >= 2,
      level.id,
      `Level has water goo but only ${connectableFree.length} connectable free balls for building`,
    );
  }

  // Balloon goo check — at least some non-balloon balls for structure
  const balloonFree = free.filter(b => b.type === 'balloon');
  if (balloonFree.length > 0 && balloonFree.length === free.length) {
    assert(false, level.id, 'All free balls are balloons — can\'t build proper structure (maxConnections=1)');
  }

  // Print summary for this level
  console.log(`  Balls: ${total} total (${structural.length} structural, ${free.length} free)`);
  console.log(`  Build budget: ${buildBudget} | Max reach: ${maxReach.toFixed(0)}px`);
  console.log(`  Pipe distance: ${minDistToPipe.toFixed(0)}px | Suction gap: ${distanceToSuction.toFixed(0)}px`);
  console.log(`  Reach margin: +${(maxReach - distanceToSuction).toFixed(0)}px`);
  console.log();
}

// ─── Final summary ────────────────────────────────────────────

console.log('==========================================');
console.log(`Total: ${totalTests} tests | ${passed} passed | ${failed} failed`);

if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log(f);
  process.exit(1);
} else {
  console.log('\nAll levels are valid and completable!');
  process.exit(0);
}
