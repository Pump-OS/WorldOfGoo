import Phaser from 'phaser';
import { LEVELS } from '../data/levels';
import { GOO_TYPES } from '../data/GooTypes';
import type { GooBall, Connection, LevelData } from '../data/types';
import { soundManager } from '../game/SoundManager';

const PIPE_RADIUS = 28;
const PIPE_SUCTION_RADIUS = 110;
const PIPE_ENTRY_RADIUS = 40;
const PIPE_SUCTION_FORCE = 0.008;
const GOO_PICK_RADIUS = 26;

// Collision filter categories
const CAT_TERRAIN = 0x0001;
const CAT_STRUCTURAL = 0x0002;
const CAT_FREE = 0x0004;
const EDGE_SCROLL_MARGIN = 60;
const EDGE_SCROLL_SPEED = 5;

// Phaser bundles Matter.js; resolve the raw module robustly.
/* eslint-disable @typescript-eslint/no-explicit-any */
const MatterMod: any =
  (Phaser.Physics.Matter as any).Matter ||
  (window as any).Matter ||
  (Phaser.Physics.Matter as any);
const MBody: {
  applyForce(b: MatterJS.BodyType, pos: MatterJS.Vector, f: MatterJS.Vector): void;
  setPosition(b: MatterJS.BodyType, pos: MatterJS.Vector): void;
  setVelocity(b: MatterJS.BodyType, v: MatterJS.Vector): void;
  setStatic(b: MatterJS.BodyType, s: boolean): void;
  setAngle(b: MatterJS.BodyType, a: number): void;
} = MatterMod.Body;
const MSleeping: { set(b: MatterJS.BodyType, isSleeping: boolean): void } | null =
  MatterMod.Sleeping ?? null;
/* eslint-enable @typescript-eslint/no-explicit-any */

function wakeBody(b: MatterJS.BodyType) {
  if (MSleeping) MSleeping.set(b, false);
}

export class GameScene extends Phaser.Scene {
  /* ── data ── */
  private levelData!: LevelData;
  private levelIndex = 0;

  /* ── entities ── */
  private gooBalls: GooBall[] = [];
  private connections: Connection[] = [];
  private terrainBodies: MatterJS.BodyType[] = [];

  /* ── graphics layers (back→front) ── */
  private bgLayer!: Phaser.GameObjects.Graphics;
  private terrainLayer!: Phaser.GameObjects.Graphics;
  private pipeLayer!: Phaser.GameObjects.Graphics;
  private linkLayer!: Phaser.GameObjects.Graphics;
  private gooLayer!: Phaser.GameObjects.Graphics;
  private previewLayer!: Phaser.GameObjects.Graphics;

  /* ── state ── */
  private draggedBall: GooBall | null = null;
  private hoveredBall: GooBall | null = null;
  private savedCount = 0;
  private moveCount = 0;
  private levelState: 'playing' | 'won' = 'playing';
  private nextBallId = 0;
  private elapsed = 0;

  /* ── camera drag ── */
  private camDragging = false;
  private camDragOrigin = { x: 0, y: 0 };
  private camScrollOrigin = { x: 0, y: 0 };
  private pointerWarmedUp = false;

  /* ── HUD ── */
  private hudSaved!: Phaser.GameObjects.Text;

  /* ── undo ── */
  private undoStack: { ballId: number; connectedTo: number[] }[] = [];
  private maxUndos = 10;

  /* ── ground anchors for initial structure base ── */
  private anchorBodies: MatterJS.BodyType[] = [];
  private anchorConstraints: MatterJS.ConstraintType[] = [];

  /* ── decorative particles ── */
  private bgParticles: { x: number; y: number; r: number; speed: number; alpha: number }[] = [];
  private suctionDots: { x: number; y: number; angle: number; dist: number; speed: number }[] = [];

  constructor() {
    super('GameScene');
  }

  /* ================================================================
     LIFECYCLE
     ================================================================ */

  init(data: { levelIndex: number }) {
    this.levelIndex = data.levelIndex ?? 0;
    this.levelData = LEVELS[this.levelIndex];
    this.gooBalls = [];
    this.connections = [];
    this.terrainBodies = [];
    this.draggedBall = null;
    this.hoveredBall = null;
    this.savedCount = 0;
    this.moveCount = 0;
    this.levelState = 'playing';
    this.nextBallId = 0;
    this.elapsed = 0;
    this.undoStack = [];
    this.bgParticles = [];
    this.suctionDots = [];
    this.pointerWarmedUp = false;
    this.anchorBodies = [];
    this.anchorConstraints = [];
  }

  create() {
    soundManager.init();
    soundManager.ensureResumed();
    const b = this.levelData.cameraBounds;
    this.matter.world.setBounds(b.x - 300, b.y - 300, b.width + 600, b.height + 600);

    this.bgLayer = this.add.graphics().setDepth(0);
    this.terrainLayer = this.add.graphics().setDepth(1);
    this.pipeLayer = this.add.graphics().setDepth(2);
    this.linkLayer = this.add.graphics().setDepth(3);
    this.gooLayer = this.add.graphics().setDepth(4);
    this.previewLayer = this.add.graphics().setDepth(5);

    this.renderBackground();
    this.buildTerrain();
    this.renderTerrain();
    this.renderPipeStatic();
    this.spawnGooBalls();
    this.wireInitialStructure();
    this.placeSigns();
    this.initBgParticles();
    this.initSuctionDots();
    this.wireInput();
    this.initCamera();
    this.buildHUD();

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    this.elapsed += delta;

    if (this.levelState === 'playing') {
      this.tickCrawling(delta);
      this.tickBuoyancy();
      this.tickSuction();
      this.tickWinCheck();
    }

    this.tickCameraEdge();
    this.tickDecoParticles(delta);
    this.updateCursor();
    this.renderDynamic();
    this.refreshHUD();
  }

  /* ================================================================
     TERRAIN
     ================================================================ */

  private buildTerrain() {
    for (const piece of this.levelData.terrain) {
      // Thin decorative rects are visual-only — skip physics body to avoid
      // overlapping collision surfaces that catapult goo balls.
      if (piece.type === 'rect' && piece.height <= 12) continue;
      if (piece.type === 'circle' && piece.radius <= 6) continue;

      const opts = {
        isStatic: true, friction: 0.8, restitution: 0.05, label: 'terrain',
        collisionFilter: { category: CAT_TERRAIN, mask: 0xFFFF, group: 0 },
      } as const;
      let body: MatterJS.BodyType;
      switch (piece.type) {
        case 'rect':
          body = this.matter.add.rectangle(piece.x, piece.y, piece.width, piece.height, opts);
          if (piece.angle) MBody.setAngle(body, piece.angle);
          break;
        case 'circle':
          body = this.matter.add.circle(piece.x, piece.y, piece.radius, opts);
          break;
        default:
          continue;
      }
      this.terrainBodies.push(body);
    }
  }

  /* ================================================================
     GOO BALLS
     ================================================================ */

  private spawnGooBalls() {
    for (const p of this.levelData.gooBalls) {
      this.gooBalls.push(this.makeGooBall(p.x, p.y, p.type, p.structural));
    }
  }

  private setGooCollisionFilter(body: MatterJS.BodyType, structural: boolean) {
    body.collisionFilter = {
      category: structural ? CAT_STRUCTURAL : CAT_FREE,
      mask: structural
        ? CAT_TERRAIN | CAT_STRUCTURAL  // structural collides with terrain + other structural
        : CAT_TERRAIN,                  // free only collides with terrain (passes through structure)
      group: 0,
    };
  }

  private makeGooBall(x: number, y: number, typeId: string, structural: boolean): GooBall {
    const t = GOO_TYPES[typeId];
    const body = this.matter.add.circle(x, y, t.radius, {
      density: t.density,
      friction: t.friction,
      restitution: t.restitution,
      frictionAir: 0.04,
      label: 'goo',
      sleepThreshold: 60,
      collisionFilter: {
        category: structural ? CAT_STRUCTURAL : CAT_FREE,
        mask: structural ? CAT_TERRAIN | CAT_STRUCTURAL : CAT_TERRAIN,
        group: 0,
      },
    });
    return {
      id: this.nextBallId++,
      body,
      typeId,
      state: structural ? 'structural' : 'free',
      connections: [],
      constraints: [],
      crawlTarget: null,
      crawlFrom: null,
      eyeAngle: 0,
      wigglePhase: Math.random() * Math.PI * 2,
    };
  }

  private wireInitialStructure() {
    for (const [ai, bi] of this.levelData.connections) {
      const a = this.gooBalls[ai];
      const b = this.gooBalls[bi];
      if (a && b) this.link(a, b);
    }
    this.anchorBaseStructure();
  }

  /**
   * Pin the lowest structural balls to their spawn positions so the
   * initial structure doesn't slide or fly off the ground.
   */
  private anchorBaseStructure() {
    const structural = this.gooBalls.filter(b => b.state === 'structural');
    if (structural.length === 0) return;

    // Sort by y descending — highest y = closest to ground
    const sorted = [...structural].sort((a, b) => b.body.position.y - a.body.position.y);
    const anchorCount = Math.min(2, sorted.length);

    for (let i = 0; i < anchorCount; i++) {
      const ball = sorted[i];
      const pos = ball.body.position;

      // Invisible static sensor as the fixed world-point
      const pin = this.matter.add.circle(pos.x, pos.y, 1, {
        isStatic: true,
        isSensor: true,
        label: 'anchor_pin',
      });

      // Soft constraint keeps the ball near its spawn without being rigid
      const c = this.matter.add.constraint(ball.body, pin, 0, 0.6, {
        damping: 0.15,
        label: 'ground_anchor',
      });

      this.anchorBodies.push(pin);
      this.anchorConstraints.push(c);
    }
  }

  private link(a: GooBall, b: GooBall) {
    const ta = GOO_TYPES[a.typeId];
    const tb = GOO_TYPES[b.typeId];
    const stiffness = (ta.springStiffness + tb.springStiffness) / 2;
    const damping = (ta.springDamping + tb.springDamping) / 2;
    const length = (ta.springLength + tb.springLength) / 2;

    const constraint = this.matter.add.constraint(a.body, b.body, length, stiffness, {
      damping,
      label: 'goo_link',
    });

    a.connections.push(b);
    b.connections.push(a);
    a.constraints.push(constraint);
    b.constraints.push(constraint);
    this.connections.push({ a, b, constraint });
  }

  private unlink(conn: Connection) {
    this.matter.world.removeConstraint(conn.constraint as any);
    conn.a.connections = conn.a.connections.filter(x => x !== conn.b);
    conn.b.connections = conn.b.connections.filter(x => x !== conn.a);
    conn.a.constraints = conn.a.constraints.filter(x => x !== conn.constraint);
    conn.b.constraints = conn.b.constraints.filter(x => x !== conn.constraint);
    this.connections = this.connections.filter(c => c !== conn);
  }

  private nearbyStructural(x: number, y: number, range: number): GooBall[] {
    const hits: { ball: GooBall; dist: number }[] = [];
    for (const ball of this.gooBalls) {
      if (ball.state !== 'structural') continue;
      const p = ball.body.position;
      const d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
      if (d <= range) hits.push({ ball, dist: d });
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits.map(h => h.ball);
  }

  /* ================================================================
     INPUT
     ================================================================ */

  private wireInput() {
    this.input.mouse?.disableContextMenu();

    this.input.on('pointermove', () => { this.pointerWarmedUp = true; });

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) {
        this.camDragging = true;
        this.camDragOrigin = { x: ptr.x, y: ptr.y };
        this.camScrollOrigin = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
        return;
      }
      if (this.levelState !== 'playing') return;

      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const ball = this.pickCandidate(wp.x, wp.y);
      if (!ball) return;

      if (ball.state === 'free') {
        this.grab(ball);
      } else if (ball.state === 'structural' && GOO_TYPES[ball.typeId].detachable) {
        this.detach(ball);
        this.grab(ball);
      }
    });

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (this.camDragging) {
        this.cameras.main.scrollX = this.camScrollOrigin.x - (ptr.x - this.camDragOrigin.x);
        this.cameras.main.scrollY = this.camScrollOrigin.y - (ptr.y - this.camDragOrigin.y);
        return;
      }
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      if (this.draggedBall) {
        MBody.setPosition(this.draggedBall.body, { x: wp.x, y: wp.y });
        MBody.setVelocity(this.draggedBall.body, { x: 0, y: 0 });
      } else {
        this.hoveredBall = this.pickFreeCandidate(wp.x, wp.y);
      }
    });

    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonReleased()) { this.camDragging = false; return; }
      if (this.draggedBall) this.release();
    });

    this.input.keyboard?.on('keydown-R', () => {
      this.scene.restart({ levelIndex: this.levelIndex });
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('LevelSelectScene');
    });
    this.input.keyboard?.on('keydown-Z', () => {
      this.performUndo();
    });
  }

  private pickCandidate(x: number, y: number): GooBall | null {
    let best: GooBall | null = null;
    let bestD = GOO_PICK_RADIUS;
    for (const b of this.gooBalls) {
      if (b.state === 'sucked' || b.state === 'dragging') continue;
      if (b.state === 'structural' && !GOO_TYPES[b.typeId].detachable) continue;
      const d = Phaser.Math.Distance.Between(x, y, b.body.position.x, b.body.position.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private pickFreeCandidate(x: number, y: number): GooBall | null {
    let best: GooBall | null = null;
    let bestD = GOO_PICK_RADIUS;
    for (const b of this.gooBalls) {
      if (b.state !== 'free' && !(b.state === 'structural' && GOO_TYPES[b.typeId].detachable)) continue;
      const d = Phaser.Math.Distance.Between(x, y, b.body.position.x, b.body.position.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private grab(ball: GooBall) {
    soundManager.ensureResumed();
    soundManager.playPickup();
    ball.state = 'dragging';
    this.draggedBall = ball;
    wakeBody(ball.body);
    MBody.setStatic(ball.body, true);
    ball.crawlTarget = null;
    ball.crawlFrom = null;
  }

  private release() {
    const ball = this.draggedBall!;
    this.draggedBall = null;
    const pos = ball.body.position;
    const type = GOO_TYPES[ball.typeId];

    const nearby = this.nearbyStructural(pos.x, pos.y, type.connectionDistance);

    // Count remaining free balls (excluding the one being dropped)
    const freeCount = this.gooBalls.filter(
      b => b !== ball && (b.state === 'free'),
    ).length;
    const stillNeeded = this.levelData.requiredGoo - this.savedCount;

    if (nearby.length >= 1 && type.maxConnections > 0) {
      // Block placement if it would leave too few free balls to win
      if (freeCount < stillNeeded) {
        this.showWarning(`Keep at least ${stillNeeded} free balls for the pipe!`);
        wakeBody(ball.body);
        MBody.setStatic(ball.body, false);
        ball.state = 'free';
        this.setGooCollisionFilter(ball.body, false);
        soundManager.playDrop();
        return;
      }

      wakeBody(ball.body);
      MBody.setStatic(ball.body, false);
      ball.state = 'structural';
      this.setGooCollisionFilter(ball.body, true);
      const cap = type.maxConnections;
      for (const target of nearby.slice(0, cap)) {
        if (!ball.connections.includes(target)) this.link(ball, target);
      }
      this.pushUndo(ball);
      this.moveCount++;
      soundManager.playPlace();
    } else {
      wakeBody(ball.body);
      MBody.setStatic(ball.body, false);
      ball.state = 'free';
      this.setGooCollisionFilter(ball.body, false);
      soundManager.playDrop();
    }
  }

  private warningText: Phaser.GameObjects.Text | null = null;

  private showWarning(msg: string) {
    if (this.warningText) this.warningText.destroy();
    this.warningText = this.add.text(this.scale.width / 2, 60, msg, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(150);
    this.tweens.add({
      targets: this.warningText,
      alpha: 0,
      duration: 2500,
      delay: 1500,
      onComplete: () => { this.warningText?.destroy(); this.warningText = null; },
    });
  }

  private detach(ball: GooBall) {
    const toRemove = this.connections.filter(c => c.a === ball || c.b === ball);
    for (const conn of toRemove) this.unlink(conn);
    ball.state = 'free';
    this.setGooCollisionFilter(ball.body, false);
    ball.connections = [];
    ball.constraints = [];
  }

  /* ================================================================
     GAME-TICK LOGIC
     ================================================================ */

  private tickCrawling(_delta: number) {
    const structural = this.gooBalls.filter(b => b.state === 'structural');
    if (structural.length === 0) return;

    const px = this.levelData.pipe.x;
    const py = this.levelData.pipe.y;

    for (const ball of this.gooBalls) {
      if (ball.state !== 'free') continue;
      const type = GOO_TYPES[ball.typeId];
      if (type.maxConnections === 0) continue;
      const pos = ball.body.position;
      const pipeDist = Phaser.Math.Distance.Between(pos.x, pos.y, px, py);

      // Phase 3: Close to pipe — walk directly to pipe (position-based, ignores gravity)
      if (pipeDist < PIPE_SUCTION_RADIUS) {
        this.walkBallTowardPipe(ball, type, pos, px, py, pipeDist);
        continue;
      }

      const nearest = this.closestStructural(pos.x, pos.y);
      if (!nearest) continue;
      const nearestDist = Phaser.Math.Distance.Between(
        pos.x, pos.y, nearest.body.position.x, nearest.body.position.y,
      );

      if (!ball.crawlTarget || ball.crawlTarget.state !== 'structural') {
        ball.crawlTarget = nearest;
        ball.crawlFrom = null;
      }
      if (ball.crawlTarget === ball.crawlFrom) {
        ball.crawlTarget = nearest;
        ball.crawlFrom = null;
      }

      const tp = ball.crawlTarget.body.position;
      const dx = tp.x - pos.x;
      const dy = tp.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 18) {
        const neighbors = ball.crawlTarget.connections.filter(
          n => n !== ball.crawlFrom && n.state === 'structural',
        );

        const currentDistToPipe = Phaser.Math.Distance.Between(
          ball.crawlTarget.body.position.x, ball.crawlTarget.body.position.y, px, py,
        );

        const closerNeighbor = neighbors.find(n => {
          const d = Phaser.Math.Distance.Between(n.body.position.x, n.body.position.y, px, py);
          return d < currentDistToPipe;
        });

        if (!closerNeighbor && currentDistToPipe < PIPE_SUCTION_RADIUS * 1.5) {
          // At the top of the structure AND close to pipe — walk directly
          this.walkBallTowardPipe(ball, type, pos, px, py, pipeDist);
          continue;
        }

        ball.crawlFrom = ball.crawlTarget;
        if (neighbors.length > 0) {
          neighbors.sort((a, b) => {
            const da = Phaser.Math.Distance.Between(a.body.position.x, a.body.position.y, px, py);
            const db = Phaser.Math.Distance.Between(b.body.position.x, b.body.position.y, px, py);
            return da - db;
          });
          ball.crawlTarget = Math.random() < 0.7
            ? neighbors[0]
            : neighbors[Math.floor(Math.random() * neighbors.length)];
        } else {
          // Dead end — go back the way we came
          const allStructNeighbors = ball.crawlTarget.connections.filter(n => n.state === 'structural');
          ball.crawlTarget = allStructNeighbors.length > 0
            ? allStructNeighbors[Math.floor(Math.random() * allStructNeighbors.length)]
            : null;
        }
      } else if (nearestDist < 80) {
        const speed = type.crawlSpeed;
        const nx = pos.x + (dx / dist) * speed;
        const ny = pos.y + (dy / dist) * speed;
        wakeBody(ball.body);
        MBody.setPosition(ball.body, { x: nx, y: ny });
        MBody.setVelocity(ball.body, { x: 0, y: 0 });
      } else {
        const spd = type.crawlSpeed * 0.003;
        wakeBody(ball.body);
        MBody.applyForce(ball.body, pos, { x: (dx / dist) * spd, y: (dy / dist) * spd });
      }

      ball.wigglePhase += _delta * 0.004;
    }
  }

  private walkBallTowardPipe(
    ball: GooBall, type: typeof GOO_TYPES[keyof typeof GOO_TYPES],
    pos: MatterJS.Vector, px: number, py: number, pipeDist: number,
  ) {
    if (pipeDist > 2) {
      const pdx = px - pos.x;
      const pdy = py - pos.y;
      const speed = type.crawlSpeed;
      wakeBody(ball.body);
      MBody.setPosition(ball.body, {
        x: pos.x + (pdx / pipeDist) * speed,
        y: pos.y + (pdy / pipeDist) * speed,
      });
      MBody.setVelocity(ball.body, { x: 0, y: 0 });
    }
    ball.crawlTarget = null;
    ball.crawlFrom = null;
  }

  private tickBuoyancy() {
    for (const ball of this.gooBalls) {
      if (ball.state === 'sucked') continue;
      const t = GOO_TYPES[ball.typeId];
      if (t.buoyancy > 0) {
        MBody.applyForce(ball.body, ball.body.position, { x: 0, y: -t.buoyancy });
      }
    }
  }

  private tickSuction() {
    const px = this.levelData.pipe.x;
    const py = this.levelData.pipe.y;
    const toSuck: GooBall[] = [];

    for (const ball of this.gooBalls) {
      if (ball.state !== 'free') continue;
      const pos = ball.body.position;
      const dist = Phaser.Math.Distance.Between(pos.x, pos.y, px, py);
      if (dist < PIPE_ENTRY_RADIUS) toSuck.push(ball);
    }

    for (const ball of toSuck) this.consumeBall(ball);
  }

  private consumeBall(ball: GooBall) {
    ball.state = 'sucked';
    this.savedCount++;
    soundManager.playSlurp();
    this.time.delayedCall(150, () => {
      this.matter.world.remove(ball.body);
      this.gooBalls = this.gooBalls.filter(b => b !== ball);
    });
  }

  private tickWinCheck() {
    if (this.savedCount >= this.levelData.requiredGoo) {
      this.levelState = 'won';
      soundManager.playWin();
      this.showVictory();
      this.persist();
    }
  }

  private closestStructural(x: number, y: number): GooBall | null {
    let best: GooBall | null = null;
    let bestD = Infinity;
    for (const b of this.gooBalls) {
      if (b.state !== 'structural') continue;
      const d = Phaser.Math.Distance.Between(x, y, b.body.position.x, b.body.position.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /* ================================================================
     CAMERA
     ================================================================ */

  private initCamera() {
    const b = this.levelData.cameraBounds;
    this.cameras.main.setBounds(b.x, b.y, b.width, b.height);

    const struct = this.gooBalls.filter(b => b.state === 'structural');
    if (struct.length) {
      const ax = struct.reduce((s, b) => s + b.body.position.x, 0) / struct.length;
      const ay = struct.reduce((s, b) => s + b.body.position.y, 0) / struct.length;
      this.cameras.main.centerOn(ax, ay + 40);
    }
  }

  private tickCameraEdge() {
    if (this.camDragging || this.draggedBall || !this.pointerWarmedUp) return;
    const ptr = this.input.activePointer;
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;

    // Only edge-scroll when pointer is actually inside the canvas region
    if (ptr.x <= 0 || ptr.y <= 0 || ptr.x >= w || ptr.y >= h) return;

    if (ptr.x < EDGE_SCROLL_MARGIN)
      cam.scrollX -= EDGE_SCROLL_SPEED * (1 - ptr.x / EDGE_SCROLL_MARGIN);
    else if (ptr.x > w - EDGE_SCROLL_MARGIN)
      cam.scrollX += EDGE_SCROLL_SPEED * (1 - (w - ptr.x) / EDGE_SCROLL_MARGIN);

    if (ptr.y < EDGE_SCROLL_MARGIN)
      cam.scrollY -= EDGE_SCROLL_SPEED * (1 - ptr.y / EDGE_SCROLL_MARGIN);
    else if (ptr.y > h - EDGE_SCROLL_MARGIN)
      cam.scrollY += EDGE_SCROLL_SPEED * (1 - (h - ptr.y) / EDGE_SCROLL_MARGIN);
  }

  /* ================================================================
     CURSOR
     ================================================================ */

  private updateCursor() {
    const canvas = this.game.canvas;
    if (this.draggedBall) {
      canvas.style.cursor = 'grabbing';
    } else if (this.hoveredBall) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  /* ================================================================
     DECORATIVE PARTICLES
     ================================================================ */

  private initBgParticles() {
    const b = this.levelData.cameraBounds;
    for (let i = 0; i < 40; i++) {
      this.bgParticles.push({
        x: b.x + Math.random() * b.width,
        y: b.y + Math.random() * b.height,
        r: 1 + Math.random() * 2.5,
        speed: 0.05 + Math.random() * 0.15,
        alpha: 0.1 + Math.random() * 0.25,
      });
    }
  }

  private initSuctionDots() {
    for (let i = 0; i < 8; i++) {
      this.suctionDots.push({
        x: 0, y: 0,
        angle: Math.random() * Math.PI * 2,
        dist: PIPE_SUCTION_RADIUS * 0.4 + Math.random() * PIPE_SUCTION_RADIUS * 0.6,
        speed: 20 + Math.random() * 40,
      });
    }
  }

  private tickDecoParticles(delta: number) {
    const b = this.levelData.cameraBounds;
    for (const p of this.bgParticles) {
      p.y -= p.speed * (delta / 16);
      if (p.y < b.y - 10) {
        p.y = b.y + b.height + 10;
        p.x = b.x + Math.random() * b.width;
      }
    }
    const px = this.levelData.pipe.x;
    const py = this.levelData.pipe.y;
    for (const d of this.suctionDots) {
      d.dist -= d.speed * (delta / 1000);
      if (d.dist <= 0) {
        d.dist = PIPE_SUCTION_RADIUS * 0.5 + Math.random() * PIPE_SUCTION_RADIUS * 0.5;
        d.angle = Math.random() * Math.PI * 2;
      }
      d.x = px + Math.cos(d.angle) * d.dist;
      d.y = py + Math.sin(d.angle) * d.dist;
    }
  }

  /* ================================================================
     UNDO
     ================================================================ */

  private pushUndo(ball: GooBall) {
    this.undoStack.push({
      ballId: ball.id,
      connectedTo: ball.connections.map(c => c.id),
    });
    if (this.undoStack.length > this.maxUndos) this.undoStack.shift();
  }

  private performUndo() {
    if (this.undoStack.length === 0 || this.levelState !== 'playing') return;
    const entry = this.undoStack.pop()!;
    const ball = this.gooBalls.find(b => b.id === entry.ballId);
    if (!ball || ball.state !== 'structural') return;

    const toRemove = this.connections.filter(c => c.a === ball || c.b === ball);
    for (const conn of toRemove) this.unlink(conn);
    ball.state = 'free';
    ball.connections = [];
    ball.constraints = [];
    this.moveCount = Math.max(0, this.moveCount - 1);
    soundManager.playDrop();
  }

  /* ================================================================
     RENDERING — STATIC (called once)
     ================================================================ */

  private renderBackground() {
    const g = this.bgLayer;
    const b = this.levelData.cameraBounds;
    const tc = Phaser.Display.Color.IntegerToColor(this.levelData.background.topColor);
    const bc = Phaser.Display.Color.IntegerToColor(this.levelData.background.bottomColor);
    const N = 50;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const color = Phaser.Display.Color.GetColor(
        Phaser.Math.Linear(tc.red, bc.red, t),
        Phaser.Math.Linear(tc.green, bc.green, t),
        Phaser.Math.Linear(tc.blue, bc.blue, t),
      );
      const sh = b.height / N;
      g.fillStyle(color, 1);
      g.fillRect(b.x - 300, b.y + sh * i, b.width + 600, sh + 2);
    }

    this.renderBackgroundHills(g, b);
  }

  private renderBackgroundHills(
    g: Phaser.GameObjects.Graphics,
    b: { x: number; y: number; width: number; height: number },
  ) {
    const seed = this.levelIndex * 137;
    const hillColor1 = Phaser.Display.Color.IntegerToColor(this.levelData.background.bottomColor);
    const layers = [
      { yBase: b.y + b.height * 0.65, amp: 60, freq: 0.003, alpha: 0.12, offset: seed },
      { yBase: b.y + b.height * 0.72, amp: 45, freq: 0.005, alpha: 0.15, offset: seed + 50 },
      { yBase: b.y + b.height * 0.80, amp: 30, freq: 0.008, alpha: 0.1, offset: seed + 100 },
    ];

    for (const layer of layers) {
      const darkened = Phaser.Display.Color.GetColor(
        Math.max(0, hillColor1.red - 10),
        Math.max(0, hillColor1.green - 10),
        Math.max(0, hillColor1.blue - 5),
      );
      g.fillStyle(darkened, layer.alpha);
      g.beginPath();
      g.moveTo(b.x - 300, b.y + b.height + 10);
      for (let x = b.x - 300; x <= b.x + b.width + 300; x += 8) {
        const y = layer.yBase + Math.sin((x + layer.offset) * layer.freq) * layer.amp
          + Math.sin((x + layer.offset * 1.7) * layer.freq * 2.3) * layer.amp * 0.4;
        g.lineTo(x, y);
      }
      g.lineTo(b.x + b.width + 300, b.y + b.height + 10);
      g.closePath();
      g.fillPath();
    }
  }

  private renderTerrain() {
    const g = this.terrainLayer;
    for (const piece of this.levelData.terrain) {
      if (piece.type === 'rect') {
        const lx = piece.x - piece.width / 2;
        const ly = piece.y - piece.height / 2;
        if (piece.angle) {
          this.drawRotatedRect(g, piece.x, piece.y, piece.width, piece.height, piece.angle, piece.color);
        } else {
          g.fillStyle(piece.color, 1);
          g.fillRect(lx, ly, piece.width, piece.height);

          const lighter = this.lightenColor(piece.color, 25);
          g.fillStyle(lighter, 0.4);
          g.fillRect(lx, ly, piece.width, Math.min(4, piece.height));

          const darker = this.darkenColor(piece.color, 20);
          g.fillStyle(darker, 0.3);
          g.fillRect(lx, ly + piece.height - Math.min(3, piece.height), piece.width, Math.min(3, piece.height));
        }
      } else if (piece.type === 'circle') {
        g.fillStyle(piece.color, 1);
        g.fillCircle(piece.x, piece.y, piece.radius);
        g.lineStyle(2, this.lightenColor(piece.color, 30), 0.4);
        g.strokeCircle(piece.x, piece.y, piece.radius);
      }
    }
  }

  private lightenColor(c: number, amt: number): number {
    const r = Math.min(255, ((c >> 16) & 0xff) + amt);
    const g = Math.min(255, ((c >> 8) & 0xff) + amt);
    const b = Math.min(255, (c & 0xff) + amt);
    return (r << 16) | (g << 8) | b;
  }

  private darkenColor(c: number, amt: number): number {
    const r = Math.max(0, ((c >> 16) & 0xff) - amt);
    const g = Math.max(0, ((c >> 8) & 0xff) - amt);
    const b = Math.max(0, (c & 0xff) - amt);
    return (r << 16) | (g << 8) | b;
  }

  private drawRotatedRect(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, angle: number, color: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w / 2;
    const hh = h / 2;
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh }, { x: -hw, y: hh },
    ].map(c => ({ x: cx + c.x * cos - c.y * sin, y: cy + c.x * sin + c.y * cos }));

    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(corners[i].x, corners[i].y);
    g.closePath();
    g.fillPath();
  }

  private renderPipeStatic() {
    const g = this.pipeLayer;
    const { x, y } = this.levelData.pipe;

    g.fillStyle(0x555555, 1);
    g.fillCircle(x, y, PIPE_RADIUS + 8);
    g.lineStyle(3, 0x777777, 1);
    g.strokeCircle(x, y, PIPE_RADIUS + 8);

    g.fillStyle(0x0a0a0a, 1);
    g.fillCircle(x, y, PIPE_RADIUS);
    g.lineStyle(2, 0x333333, 0.6);
    g.strokeCircle(x, y, PIPE_RADIUS - 5);

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const r1 = PIPE_RADIUS * 0.35;
      const r2 = PIPE_RADIUS * 0.85;
      g.lineStyle(1, 0x333333, 0.25);
      g.lineBetween(x + Math.cos(a) * r1, y + Math.sin(a) * r1, x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    }
  }

  /* ================================================================
     RENDERING — DYNAMIC (every frame)
     ================================================================ */

  private renderDynamic() {
    this.linkLayer.clear();
    this.gooLayer.clear();
    this.previewLayer.clear();

    this.renderBgParticles();
    this.renderLinks();
    this.renderGooBalls();
    this.renderPipeGlow();
    this.renderSuctionDots();

    if (this.draggedBall) this.renderPreview();
  }

  private renderBgParticles() {
    const g = this.linkLayer;
    for (const p of this.bgParticles) {
      g.fillStyle(0xffffff, p.alpha);
      g.fillCircle(p.x, p.y, p.r);
    }
  }

  private renderSuctionDots() {
    const g = this.gooLayer;
    const pulse = Math.sin(this.elapsed * 0.004) * 0.3 + 0.5;
    for (const d of this.suctionDots) {
      const normDist = d.dist / PIPE_SUCTION_RADIUS;
      const a = (1 - normDist) * 0.5 * pulse;
      g.fillStyle(0x88aaff, a);
      g.fillCircle(d.x, d.y, 1.5 + normDist * 1.5);
    }
  }

  private renderLinks() {
    const g = this.linkLayer;
    for (const conn of this.connections) {
      const ax = conn.a.body.position.x;
      const ay = conn.a.body.position.y;
      const bx = conn.b.body.position.x;
      const by = conn.b.body.position.y;
      const d = Phaser.Math.Distance.Between(ax, ay, bx, by);
      const avg = (GOO_TYPES[conn.a.typeId].springLength + GOO_TYPES[conn.b.typeId].springLength) / 2;
      const stretch = d / avg;

      const thick = Phaser.Math.Clamp(3.5 / stretch, 1.2, 5);
      const alpha = Phaser.Math.Clamp(1.25 - stretch * 0.35, 0.25, 1);
      const color = GOO_TYPES[conn.a.typeId].outlineColor;

      g.lineStyle(thick + 2, color, alpha * 0.25);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();

      g.lineStyle(thick, color, alpha);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();
    }
  }

  private renderGooBalls() {
    const g = this.gooLayer;
    const ptr = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);

    const sorted = [...this.gooBalls].sort((a, b) => {
      const ord: Record<string, number> = { sucked: -1, structural: 0, free: 1, dragging: 2 };
      return (ord[a.state] ?? 0) - (ord[b.state] ?? 0);
    });

    for (const ball of sorted) {
      if (ball.state === 'sucked') continue;
      let { x, y } = ball.body.position;
      const type = GOO_TYPES[ball.typeId];
      const r = type.radius;
      const hovered = ball === this.hoveredBall;
      const dragged = ball === this.draggedBall;
      const isFree = ball.state === 'free';

      if (isFree) {
        x += Math.sin(ball.wigglePhase) * 2.5;
        y += Math.cos(ball.wigglePhase * 1.3) * 2;
      }

      const hoverGrow = hovered ? 1.15 : 1;
      const freeGrow = isFree ? 1.08 : 1;
      const dr = r * hoverGrow * freeGrow;

      // Pulsing glow for free balls so player can see them
      if (isFree) {
        const pulse = Math.sin(this.elapsed * 0.005) * 0.3 + 0.5;
        g.fillStyle(0x88ccff, pulse * 0.25);
        g.fillCircle(x, y, dr + 6);
        g.lineStyle(2, 0x88ccff, pulse * 0.6);
        g.strokeCircle(x, y, dr + 3);
      }

      g.fillStyle(0x000000, 0.15);
      g.fillCircle(x + 2, y + 3, dr + 1);

      let col = type.color;
      if (dragged) {
        const rr = ((col >> 16) & 0xff) + 50;
        const gg = ((col >> 8) & 0xff) + 50;
        const bb = (col & 0xff) + 50;
        col = Phaser.Display.Color.GetColor(Math.min(rr, 255), Math.min(gg, 255), Math.min(bb, 255));
      }
      if (isFree) {
        const rr = Math.min(((col >> 16) & 0xff) + 30, 255);
        const gg = Math.min(((col >> 8) & 0xff) + 30, 255);
        const bb = Math.min((col & 0xff) + 30, 255);
        col = Phaser.Display.Color.GetColor(rr, gg, bb);
      }

      g.fillStyle(col, dragged ? 0.75 : 1);
      g.fillCircle(x, y, dr);

      g.lineStyle(hovered ? 2.5 : 1.5, hovered ? 0xffff88 : (isFree ? 0x6699cc : type.outlineColor), hovered ? 1 : 0.7);
      g.strokeCircle(x, y, dr);

      g.fillStyle(0xffffff, 0.12);
      g.fillCircle(x - dr * 0.22, y - dr * 0.28, dr * 0.38);

      g.fillStyle(0xffffff, 0.05);
      g.fillCircle(x + dr * 0.1, y + dr * 0.15, dr * 0.55);

      const eox = dr * 0.3;
      const ey = y - dr * 0.05;
      const er = dr * 0.24;
      const pr = dr * 0.13;
      const dx = wp.x - x;
      const dy = wp.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const lm = pr * 0.5;
      const lx = (dx / d) * lm;
      const ly = (dy / d) * lm;

      g.fillStyle(type.eyeColor, 1);
      g.fillCircle(x - eox, ey, er);
      g.fillStyle(0x111111, 1);
      g.fillCircle(x - eox + lx, ey + ly, pr);

      g.fillStyle(type.eyeColor, 1);
      g.fillCircle(x + eox, ey, er);
      g.fillStyle(0x111111, 1);
      g.fillCircle(x + eox + lx, ey + ly, pr);
    }
  }

  private renderPipeGlow() {
    const { x, y } = this.levelData.pipe;
    const g = this.gooLayer;
    const pulse = Math.sin(this.elapsed * 0.003) * 0.3 + 0.5;

    g.lineStyle(1.5, 0x6688cc, pulse * 0.35);
    g.strokeCircle(x, y, PIPE_SUCTION_RADIUS);

    g.fillStyle(0x2244aa, pulse * 0.12);
    g.fillCircle(x, y, PIPE_RADIUS);
  }

  private renderPreview() {
    if (!this.draggedBall) return;
    const g = this.previewLayer;
    const pos = this.draggedBall.body.position;
    const type = GOO_TYPES[this.draggedBall.typeId];
    const nearby = this.nearbyStructural(pos.x, pos.y, type.connectionDistance);
    const show = nearby.slice(0, type.maxConnections);
    const pulse = Math.sin(this.elapsed * 0.006) * 0.3 + 0.55;

    for (const tgt of show) {
      const tp = tgt.body.position;
      g.lineStyle(2, 0xffff88, pulse);
      g.beginPath();
      g.moveTo(pos.x, pos.y);
      g.lineTo(tp.x, tp.y);
      g.strokePath();
      g.fillStyle(0xffff88, pulse * 0.5);
      g.fillCircle(tp.x, tp.y, 4);
    }

    if (show.length === 0) {
      g.lineStyle(1, 0xff6644, 0.15);
      g.strokeCircle(pos.x, pos.y, type.connectionDistance);
    }
  }

  /* ================================================================
     SIGNS
     ================================================================ */

  private placeSigns() {
    for (const s of this.levelData.signs ?? []) {
      this.add.text(s.x, s.y, s.text, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#d4a24a',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        lineSpacing: 4,
      }).setOrigin(0.5).setDepth(1.5);
    }
  }

  /* ================================================================
     HUD
     ================================================================ */

  private buildHUD() {
    const w = this.scale.width;

    this.hudSaved = this.add.text(20, 18, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(100);

    this.add.text(w / 2, 18, this.levelData.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    this.makeHudBtn(w - 24, 18, 'MENU', () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('LevelSelectScene'));
    });

    this.makeHudBtn(w - 90, 18, 'RETRY', () => this.scene.restart({ levelIndex: this.levelIndex }));
    this.makeHudBtn(w - 160, 18, 'UNDO', () => this.performUndo());
  }

  private makeHudBtn(x: number, y: number, label: string, cb: () => void) {
    const btn = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#777777',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#777777'));
    btn.on('pointerdown', cb);
  }

  private refreshHUD() {
    const free = this.gooBalls.filter(b => b.state === 'free' || b.state === 'dragging').length;
    const need = this.levelData.requiredGoo - this.savedCount;
    const ok = free >= need || this.savedCount >= this.levelData.requiredGoo;
    const freeLabel = ok ? `Free: ${free}` : `Free: ${free} (need ${need}!) ⚠`;
    this.hudSaved.setText(
      `Collected: ${this.savedCount}/${this.levelData.requiredGoo}  |  ${freeLabel}  |  Moves: ${this.moveCount}`,
    );
    this.hudSaved.setColor(ok ? '#ffffff' : '#ff8888');
  }

  /* ================================================================
     VICTORY / PROGRESS
     ================================================================ */

  private showVictory() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    const ctn = this.add.container(0, 0).setDepth(200).setScrollFactor(0);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(0, 0, w, h);
    ctn.add(bg);

    const panel = this.add.graphics();
    panel.fillStyle(0x141428, 0.95);
    panel.fillRoundedRect(cx - 210, cy - 130, 420, 260, 14);
    panel.lineStyle(2, 0x666688, 1);
    panel.strokeRoundedRect(cx - 210, cy - 130, 420, 260, 14);
    ctn.add(panel);

    ctn.add(this.add.text(cx, cy - 90, 'Level Complete!', {
      fontFamily: 'Georgia, serif', fontSize: '34px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5));

    ctn.add(this.add.text(cx, cy - 25, `Goo saved: ${this.savedCount}\nMoves used: ${this.moveCount}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#cccccc',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5));

    const goBtn = this.add.text(cx, cy + 55, 'Continue >', {
      fontFamily: 'Arial, sans-serif', fontSize: '28px', color: '#88ff88',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    goBtn.on('pointerover', () => goBtn.setScale(1.08));
    goBtn.on('pointerout', () => goBtn.setScale(1));
    goBtn.on('pointerdown', () => {
      if (this.levelIndex < LEVELS.length - 1) {
        this.scene.start('GameScene', { levelIndex: this.levelIndex + 1 });
      } else {
        this.scene.start('LevelSelectScene');
      }
    });
    ctn.add(goBtn);

    const retry = this.add.text(cx, cy + 100, 'Retry', {
      fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#999999',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerover', () => retry.setColor('#ffffff'));
    retry.on('pointerout', () => retry.setColor('#999999'));
    retry.on('pointerdown', () => this.scene.restart({ levelIndex: this.levelIndex }));
    ctn.add(retry);
  }

  private persist() {
    try {
      const raw = localStorage.getItem('wog_progress');
      const p: Record<string, boolean> = raw ? JSON.parse(raw) : {};
      p[this.levelData.id] = true;
      localStorage.setItem('wog_progress', JSON.stringify(p));
    } catch { /* noop */ }
  }
}
