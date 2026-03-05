import Phaser from 'phaser';
import { LEVELS } from '../data/levels';

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create() {
    const { width, height } = this.scale;

    this.drawBackground(width, height);

    this.add.text(width / 2, 50, 'Select a Level', {
      fontFamily: 'Georgia, serif',
      fontSize: '40px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    const cols = 5;
    const btnW = 160;
    const btnH = 100;
    const gapX = 30;
    const gapY = 25;
    const totalW = cols * btnW + (cols - 1) * gapX;
    const startX = (width - totalW) / 2 + btnW / 2;
    const startY = 140;

    const progress = this.loadProgress();

    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnW + gapX);
      const y = startY + row * (btnH + gapY);

      const unlocked = i === 0 || progress[LEVELS[i - 1].id];
      const completed = !!progress[level.id];
      this.createLevelButton(x, y, btnW, btnH, i, level.name, level.chapter, unlocked, completed);
    }

    const backBtn = this.add.text(60, height - 40, '< Back', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#aaaaaa',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout', () => backBtn.setColor('#aaaaaa'));
    backBtn.on('pointerdown', () => this.scene.start('MenuScene'));

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  private createLevelButton(
    x: number, y: number, w: number, h: number,
    index: number, name: string, chapter: number, unlocked: boolean, completed: boolean,
  ) {
    const chapterColors = [0x334433, 0x443344, 0x443333, 0x333344];
    const bgColor = unlocked ? (chapterColors[chapter - 1] ?? 0x333333) : 0x222222;

    const g = this.add.graphics();
    g.fillStyle(bgColor, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.lineStyle(2, unlocked ? 0x888888 : 0x444444, 1);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);

    const numText = this.add.text(x, y - 14, `${index + 1}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '28px',
      color: unlocked ? '#ffffff' : '#555555',
    }).setOrigin(0.5);

    this.add.text(x, y + 18, name, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: unlocked ? '#cccccc' : '#444444',
      align: 'center',
      wordWrap: { width: w - 16 },
    }).setOrigin(0.5, 0);

    if (completed) {
      this.add.text(x + w / 2 - 8, y - h / 2 + 6, '✓', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#88ff88',
      }).setOrigin(0.5, 0);
    }

    if (!unlocked) return;

    const hitArea = this.add.rectangle(x, y, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => {
      g.clear();
      g.fillStyle(Phaser.Display.Color.GetColor(80, 80, 100), 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      g.lineStyle(2, 0xcccccc, 1);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      numText.setScale(1.1);
    });

    hitArea.on('pointerout', () => {
      g.clear();
      g.fillStyle(bgColor, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      g.lineStyle(2, 0x888888, 1);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      numText.setScale(1);
    });

    hitArea.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => {
        this.scene.start('GameScene', { levelIndex: index });
      });
    });
  }

  private drawBackground(w: number, h: number) {
    const bg = this.add.graphics();
    bg.setDepth(-10);
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Phaser.Math.Linear(0x0a, 0x12, t);
      const g = Phaser.Math.Linear(0x0a, 0x0e, t);
      const b = Phaser.Math.Linear(0x1e, 0x0a, t);
      const color = (r << 16) | (g << 8) | b;
      bg.fillStyle(color, 1);
      bg.fillRect(0, (h / steps) * i, w, h / steps + 1);
    }
  }

  private loadProgress(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem('wog_progress');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
