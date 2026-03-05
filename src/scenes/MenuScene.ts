import Phaser from 'phaser';
import { soundManager } from '../game/SoundManager';

interface FloatingGoo {
  x: number; y: number; vx: number; vy: number;
  r: number; color: number; eyeColor: number; phase: number;
}

export class MenuScene extends Phaser.Scene {
  private balls: FloatingGoo[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private elapsed = 0;

  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    this.gfx = this.add.graphics();
    soundManager.init();

    this.drawBackground(width, height);
    this.initFloatingGoo(width, height);

    const titleY = height * 0.20;

    this.add.text(width / 2, titleY, 'World of Goo', {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '74px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 10,
      shadow: { offsetX: 4, offsetY: 4, color: '#000', blur: 14, fill: true },
    }).setOrigin(0.5);

    this.add.text(width / 2, titleY + 72, 'web edition', {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#8888aa',
    }).setOrigin(0.5);

    const playBtn = this.add.text(width / 2, height * 0.52, '[ PLAY ]', {
      fontFamily: 'Georgia, serif',
      fontSize: '44px',
      color: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playBtn.on('pointerover', () => { playBtn.setScale(1.12); soundManager.playTick(); });
    playBtn.on('pointerout', () => playBtn.setScale(1));
    playBtn.on('pointerdown', () => {
      soundManager.ensureResumed();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => this.scene.start('LevelSelectScene'));
    });

    this.add.text(width / 2, height * 0.68, 'Right-click to pan camera\nClick goo balls to build structures', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      color: '#666688',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    const caAddress = '4zduL6iSAb9HK5hK8qQhS6mfCzpFuZAk7NKwnKprpump';
    const caText = this.add.text(width / 2, height * 0.85, `CA: ${caAddress}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: '#7788aa',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    caText.on('pointerover', () => caText.setColor('#aabbdd'));
    caText.on('pointerout', () => caText.setColor('#7788aa'));
    caText.on('pointerdown', () => {
      navigator.clipboard.writeText(caAddress).then(() => {
        caText.setText('Copied!');
        caText.setColor('#44ff88');
        this.time.delayedCall(1500, () => {
          caText.setText(`CA: ${caAddress}`);
          caText.setColor('#7788aa');
        });
      });
    });

    const xLink = this.add.text(width / 2, height * 0.92, '𝕏  @wrldofgoo', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      color: '#7788aa',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    xLink.on('pointerover', () => xLink.setColor('#ffffff'));
    xLink.on('pointerout', () => xLink.setColor('#7788aa'));
    xLink.on('pointerdown', () => {
      window.open('https://x.com/wrldofgoo', '_blank');
    });

    this.cameras.main.fadeIn(600, 0, 0, 0);
  }

  update(_t: number, delta: number) {
    this.elapsed += delta;
    this.gfx.clear();

    for (const p of this.balls) {
      p.x += p.vx;
      p.y += p.vy;
      p.phase += delta * 0.003;
      if (p.y < -30) { p.y = 750; p.x = Math.random() * 1280; }
      if (p.y > 750) { p.y = -30; p.x = Math.random() * 1280; }
      if (p.x < -30) p.x = 1310;
      if (p.x > 1310) p.x = -30;

      const g = this.gfx;
      const wx = p.x + Math.sin(p.phase) * 2;
      const wy = p.y + Math.cos(p.phase * 1.3) * 2;

      g.fillStyle(0x000000, 0.1);
      g.fillCircle(wx + 1, wy + 2, p.r + 1);

      g.fillStyle(p.color, 0.7);
      g.fillCircle(wx, wy, p.r);

      g.fillStyle(0xffffff, 0.08);
      g.fillCircle(wx - p.r * 0.2, wy - p.r * 0.25, p.r * 0.35);

      if (p.r > 5) {
        const er = p.r * 0.22;
        const eox = p.r * 0.25;
        const ey = wy - p.r * 0.05;
        g.fillStyle(p.eyeColor, 0.8);
        g.fillCircle(wx - eox, ey, er);
        g.fillCircle(wx + eox, ey, er);
        g.fillStyle(0x111111, 0.9);
        g.fillCircle(wx - eox, ey, er * 0.55);
        g.fillCircle(wx + eox, ey, er * 0.55);
      }
    }
  }

  private drawBackground(w: number, h: number) {
    const bg = this.add.graphics();
    const steps = 50;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Phaser.Math.Linear(0x06, 0x12, t);
      const g = Phaser.Math.Linear(0x04, 0x08, t);
      const b = Phaser.Math.Linear(0x1e, 0x08, t);
      const color = (r << 16) | (g << 8) | b;
      bg.fillStyle(color, 1);
      bg.fillRect(0, (h / steps) * i, w, h / steps + 1);
    }
    bg.setDepth(-10);
    this.gfx.setDepth(-5);
  }

  private initFloatingGoo(w: number, h: number) {
    const types = [
      { color: 0x2a2a2a, eye: 0xffffff },
      { color: 0x3a7a3a, eye: 0xccffcc },
      { color: 0xcc3344, eye: 0xffcccc },
      { color: 0xddddcc, eye: 0xffffff },
      { color: 0x4488cc, eye: 0xccddff },
    ];
    for (let i = 0; i < 35; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      this.balls.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.3 - 0.15,
        r: 5 + Math.random() * 10,
        color: t.color,
        eyeColor: t.eye,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
}
