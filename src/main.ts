import Phaser from 'phaser';
import './style.css';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

type HotspotDefinition = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  clue: string;
};

const HOTSPOTS: HotspotDefinition[] = [
  { id: 'book', x: 160, y: 250, width: 120, height: 210, title: 'O livro inclinado', clue: 'Os fundamentos da República estão no início da Constituição.' },
  { id: 'portrait', x: 505, y: 105, width: 145, height: 155, title: 'O retrato restaurado', clue: 'Pense no valor que coloca a pessoa no centro do Estado.' },
  { id: 'scales', x: 545, y: 430, width: 145, height: 110, title: 'A balança', clue: 'Nem todo princípio é fundamento. Separe o artigo 1º do artigo 3º.' },
  { id: 'window', x: 890, y: 105, width: 190, height: 280, title: 'A janela sob a chuva', clue: 'SO-CI-DI-VA-PLU. O terceiro fragmento é a chave.' },
  { id: 'letter', x: 820, y: 510, width: 160, height: 80, title: 'A carta esquecida', clue: 'A resposta é um fundamento ligado ao valor intrínseco de cada pessoa.' },
];

class LibraryScene extends Phaser.Scene {
  private found = new Set<string>();
  private counter?: Phaser.GameObjects.Text;
  private messagePanel?: Phaser.GameObjects.Container;
  private challengePanel?: Phaser.GameObjects.Container;
  private rainGraphics?: Phaser.GameObjects.Graphics;
  private rainEnabled = true;
  private ambientEnabled = false;
  private audioContext?: AudioContext;
  private rainNode?: AudioBufferSourceNode;
  private rainGain?: GainNode;

  constructor() {
    super('Library');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#090c12');
    this.drawLibrary();
    this.createRain();
    this.createHeader();
    this.createHotspots();
    this.createAudioControl();
    this.showIntro();

    this.scale.on('resize', () => this.cameras.main.centerOn(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2));
  }

  update(_: number, delta: number): void {
    if (!this.rainGraphics || !this.rainEnabled) return;
    const rain = this.rainGraphics;
    rain.y += delta * 0.42;
    if (rain.y > 26) rain.y = 0;
  }

  private drawLibrary(): void {
    const g = this.add.graphics();

    g.fillGradientStyle(0x121926, 0x121926, 0x06080d, 0x06080d, 1);
    g.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    g.fillStyle(0x22170f, 1);
    g.fillRect(0, 570, DESIGN_WIDTH, 150);
    for (let x = 0; x < DESIGN_WIDTH; x += 86) {
      g.lineStyle(2, 0x3b291d, 0.5);
      g.lineBetween(x, 570, x + 40, 720);
    }

    this.drawShelf(g, 55, 105, 315, 450);
    this.drawShelf(g, 910, 80, 315, 475);

    g.fillStyle(0x2d1c12, 1);
    g.fillRoundedRect(425, 390, 430, 165, 14);
    g.fillStyle(0x4a2f1c, 1);
    g.fillRoundedRect(390, 370, 500, 42, 12);
    g.fillStyle(0x1b110c, 1);
    g.fillRect(450, 535, 42, 95);
    g.fillRect(790, 535, 42, 95);

    g.fillStyle(0x0e141d, 1);
    g.fillRoundedRect(865, 60, 260, 355, 130);
    g.lineStyle(8, 0x65482f, 1);
    g.strokeRoundedRect(865, 60, 260, 355, 130);
    g.lineStyle(3, 0x65482f, 0.7);
    g.lineBetween(995, 70, 995, 405);
    g.lineBetween(875, 235, 1115, 235);

    g.fillStyle(0x271a12, 1);
    g.fillRect(478, 82, 200, 210);
    g.lineStyle(12, 0x7e5d37, 1);
    g.strokeRect(478, 82, 200, 210);
    g.fillStyle(0x15191d, 1);
    g.fillEllipse(578, 175, 95, 130);

    g.fillStyle(0xe8be70, 0.2);
    g.fillCircle(650, 425, 210);
    g.fillStyle(0xffd998, 0.08);
    g.fillCircle(650, 425, 330);

    this.add.text(86, 134, 'CONSTITUCIONAL', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#d9b77b', letterSpacing: 2,
    }).setRotation(-Math.PI / 2).setOrigin(0.5);
  }

  private drawShelf(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    g.fillStyle(0x281a11, 1);
    g.fillRoundedRect(x, y, width, height, 10);
    g.lineStyle(6, 0x5b3c23, 1);
    g.strokeRoundedRect(x, y, width, height, 10);

    const shelfHeight = height / 4;
    for (let row = 0; row < 4; row += 1) {
      const shelfY = y + row * shelfHeight;
      g.fillStyle(0x16100c, 1);
      g.fillRect(x + 14, shelfY + 12, width - 28, shelfHeight - 24);
      g.fillStyle(0x68452a, 1);
      g.fillRect(x + 8, shelfY + shelfHeight - 12, width - 16, 12);

      let bookX = x + 25;
      const palette = [0x6e2f2c, 0x27485b, 0x66542c, 0x3d4f39, 0x543149];
      for (let i = 0; i < 9; i += 1) {
        const bookWidth = 18 + ((i * 7 + row * 3) % 11);
        const bookHeight = 55 + ((i * 13 + row * 5) % 28);
        g.fillStyle(palette[(i + row) % palette.length], 1);
        g.fillRoundedRect(bookX, shelfY + shelfHeight - 18 - bookHeight, bookWidth, bookHeight, 2);
        bookX += bookWidth + 5;
      }
    }
  }

  private createHeader(): void {
    this.add.text(36, 28, 'LIMIAR', {
      fontFamily: 'Georgia, serif', fontSize: '32px', color: '#f2e8d5', letterSpacing: 8,
    });
    this.add.text(38, 70, 'PRIMEIRA LUZ  ·  A BIBLIOTECA', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#b99a6a', letterSpacing: 3,
    });

    this.counter = this.add.text(1115, 34, 'Pistas 0/5', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#e8d2aa',
    }).setOrigin(1, 0);
  }

  private createHotspots(): void {
    HOTSPOTS.forEach((definition) => {
      const zone = this.add.zone(definition.x, definition.y, definition.width, definition.height)
        .setOrigin(0)
        .setInteractive({ cursor: 'pointer' });

      const glow = this.add.rectangle(
        definition.x + definition.width / 2,
        definition.y + definition.height / 2,
        definition.width,
        definition.height,
        0xd6ad68,
        0,
      ).setStrokeStyle(2, 0xd6ad68, 0).setDepth(4);

      zone.on('pointerover', () => {
        if (!this.found.has(definition.id)) {
          this.tweens.add({ targets: glow, alpha: 0.16, duration: 180 });
          glow.setStrokeStyle(2, 0xe7c78a, 0.75);
        }
      });
      zone.on('pointerout', () => {
        this.tweens.add({ targets: glow, alpha: 0, duration: 180 });
        glow.setStrokeStyle(2, 0xe7c78a, 0);
      });
      zone.on('pointerup', () => this.discover(definition, glow));
    });
  }

  private discover(definition: HotspotDefinition, glow: Phaser.GameObjects.Rectangle): void {
    if (this.messagePanel) this.messagePanel.destroy();

    if (!this.found.has(definition.id)) {
      this.found.add(definition.id);
      this.counter?.setText(`Pistas ${this.found.size}/5`);
      glow.setFillStyle(0xd6ad68, 0.12).setStrokeStyle(2, 0xf2d49a, 0.6);
    }

    this.messagePanel = this.createPanel(definition.title, definition.clue, 'Guardar pista');

    if (this.found.size === HOTSPOTS.length) {
      this.time.delayedCall(650, () => this.showChallenge());
    }
  }

  private createPanel(title: string, body: string, buttonLabel: string): Phaser.GameObjects.Container {
    const overlay = this.add.rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT, 0x020306, 0.62).setOrigin(0).setDepth(20).setInteractive();
    const panel = this.add.rectangle(640, 375, 620, 285, 0x111824, 0.98).setStrokeStyle(2, 0x8b6a3d, 1).setDepth(21);
    const titleText = this.add.text(640, 292, title, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#f0dfc0', align: 'center',
    }).setOrigin(0.5).setDepth(22);
    const bodyText = this.add.text(640, 360, body, {
      fontFamily: 'Georgia, serif', fontSize: '21px', color: '#d7cbb8', align: 'center', wordWrap: { width: 510 }, lineSpacing: 8,
    }).setOrigin(0.5).setDepth(22);
    const button = this.add.rectangle(640, 458, 220, 46, 0x76532f, 1).setStrokeStyle(1, 0xd4b77c).setDepth(22).setInteractive({ cursor: 'pointer' });
    const buttonText = this.add.text(640, 458, buttonLabel, {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#fff3da',
    }).setOrigin(0.5).setDepth(23);

    const container = this.add.container(0, 0, [overlay, panel, titleText, bodyText, button, buttonText]).setDepth(20);
    button.on('pointerup', () => container.destroy());
    return container;
  }

  private showIntro(): void {
    const panel = this.createPanel(
      'A primeira luz',
      'Algumas respostas não permanecem dentro dos livros. Encontre cinco pistas espalhadas pela biblioteca.',
      'Começar a explorar',
    );
    this.messagePanel = panel;
  }

  private showChallenge(): void {
    if (this.messagePanel) this.messagePanel.destroy();
    if (this.challengePanel) return;

    const overlay = this.add.rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT, 0x020306, 0.72).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(640, 360, 780, 450, 0x101722, 0.99).setStrokeStyle(2, 0xa47b45);
    const title = this.add.text(640, 190, 'O primeiro mistério', {
      fontFamily: 'Georgia, serif', fontSize: '32px', color: '#f0dfc0',
    }).setOrigin(0.5);
    const question = this.add.text(640, 270, 'Qual destes é fundamento da República Federativa do Brasil?', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#ddd1bc', align: 'center', wordWrap: { width: 650 },
    }).setOrigin(0.5);

    const answers = [
      ['Erradicação da pobreza', false],
      ['Dignidade da pessoa humana', true],
      ['Redução das desigualdades regionais', false],
    ] as const;

    const objects: Phaser.GameObjects.GameObject[] = [overlay, panel, title, question];
    answers.forEach(([label, correct], index) => {
      const y = 340 + index * 66;
      const bg = this.add.rectangle(640, y, 520, 50, 0x202b3b, 1).setStrokeStyle(1, 0x6f604d).setInteractive({ cursor: 'pointer' });
      const text = this.add.text(640, y, label, { fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#f3eadb' }).setOrigin(0.5);
      bg.on('pointerup', () => this.resolveChallenge(correct));
      objects.push(bg, text);
    });

    this.challengePanel = this.add.container(0, 0, objects).setDepth(30);
  }

  private resolveChallenge(correct: boolean): void {
    this.challengePanel?.destroy();
    this.challengePanel = undefined;

    if (!correct) {
      this.messagePanel = this.createPanel(
        'O livro permanece fechado',
        'Os objetivos fundamentais aparecem no artigo 3º. Volte às pistas e procure o fundamento indicado pelo fragmento “DI”.',
        'Tentar novamente',
      );
      this.time.delayedCall(300, () => {
        const button = this.messagePanel?.list.find((item) => item instanceof Phaser.GameObjects.Rectangle && item.input) as Phaser.GameObjects.Rectangle | undefined;
        button?.once('pointerup', () => this.showChallenge());
      });
      return;
    }

    localStorage.setItem('limiar:first-mystery', JSON.stringify({ completedAt: new Date().toISOString(), reviewDueAt: new Date(Date.now() + 86400000).toISOString() }));
    this.lightTheLibrary();
    this.messagePanel = this.createPanel(
      'A biblioteca respondeu',
      'Dignidade da pessoa humana é fundamento da República (art. 1º, III). Uma nova luz foi acesa. A primeira revisão estará disponível amanhã.',
      'Permanecer na biblioteca',
    );
  }

  private lightTheLibrary(): void {
    const light = this.add.circle(645, 430, 20, 0xffc871, 0.95).setDepth(5);
    this.add.circle(645, 430, 95, 0xffd394, 0.15).setDepth(4);
    this.tweens.add({ targets: light, alpha: { from: 0.55, to: 1 }, scale: { from: 0.85, to: 1.15 }, duration: 850, yoyo: true, repeat: -1 });
  }

  private createRain(): void {
    this.rainGraphics = this.add.graphics().setDepth(3);
    this.rainGraphics.lineStyle(1, 0xaec7dc, 0.32);
    for (let i = 0; i < 120; i += 1) {
      const x = Phaser.Math.Between(870, 1125);
      const y = Phaser.Math.Between(60, 410);
      this.rainGraphics.lineBetween(x, y, x - 8, y + 18);
    }
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff).fillRoundedRect(865, 60, 260, 355, 130);
    this.rainGraphics.setMask(maskShape.createGeometryMask());
  }

  private createAudioControl(): void {
    const bg = this.add.rectangle(1195, 84, 120, 42, 0x151e2b, 0.94).setStrokeStyle(1, 0x7a664b).setInteractive({ cursor: 'pointer' }).setDepth(10);
    const label = this.add.text(1195, 84, '🌧 Som: off', {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#e5d5bb',
    }).setOrigin(0.5).setDepth(11);

    bg.on('pointerup', () => {
      this.ambientEnabled = !this.ambientEnabled;
      label.setText(this.ambientEnabled ? '🌧 Som: on' : '🌧 Som: off');
      if (this.ambientEnabled) this.startRainAudio(); else this.stopRainAudio();
    });
  }

  private startRainAudio(): void {
    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
    if (this.rainNode) return;

    const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 3, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    const source = this.audioContext.createBufferSource();
    const highpass = this.audioContext.createBiquadFilter();
    const lowpass = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();
    source.buffer = buffer;
    source.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 420;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2200;
    gain.gain.value = 0.065;
    source.connect(highpass).connect(lowpass).connect(gain).connect(this.audioContext.destination);
    source.start();
    this.rainNode = source;
    this.rainGain = gain;
  }

  private stopRainAudio(): void {
    this.rainNode?.stop();
    this.rainNode?.disconnect();
    this.rainGain?.disconnect();
    this.rainNode = undefined;
    this.rainGain = undefined;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#090c12',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  scene: [LibraryScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
});
