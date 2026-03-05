import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.generateTextures();
    this.scene.start('MenuScene');
  }

  private generateTextures() {
    this.generateParticleTexture();
    this.generateSignTexture();
  }

  private generateParticleTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
  }

  private generateSignTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x8b6914, 1);
    g.fillRect(0, 0, 10, 40);
    g.fillStyle(0xc4a03c, 1);
    g.fillRoundedRect(0, 0, 180, 80, 4);
    g.lineStyle(2, 0x8b6914, 1);
    g.strokeRoundedRect(0, 0, 180, 80, 4);
    g.generateTexture('sign_bg', 180, 80);
    g.destroy();
  }
}
