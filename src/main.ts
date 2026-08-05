import Phaser from 'phaser';
import './style.css';

const W = 1280;
const H = 720;
const LIBRARY_IMAGE = 'https://cdn.loc.gov/service/pnp/ds/06600/06610v.jpg';
const RAIN_AUDIO = 'https://rainsoundsforsleeping.com/rain-base.mp3';

type Clue = {
  id: string;
  x: number;
  y: number;
  radius: number;
  title: string;
  text: string;
  draw: (scene: Phaser.Scene, x: number, y: number) => Phaser.GameObjects.Container;
};

function makeBook(scene: Phaser.Scene, x: number, y: number) {
  const pages = scene.add.rectangle(5, 0, 31, 58, 0xd8c9a7);
  const cover = scene.add.rectangle(0, 0, 42, 68, 0x5c2a26).setStrokeStyle(2, 0xb89a62);
  const spine = scene.add.rectangle(-18, 0, 6, 66, 0x2a1312);
  return scene.add.container(x, y, [pages, cover, spine]).setRotation(-0.12);
}

function makeLetter(scene: Phaser.Scene, x: number, y: number) {
  const paper = scene.add.rectangle(0, 0, 58, 38, 0xd8c6a2).setStrokeStyle(2, 0x7f6742);
  const flap1 = scene.add.line(0, 0, -29, -19, 0, 7, 0x8f7651).setLineWidth(2);
  const flap2 = scene.add.line(0, 0, 29, -19, 0, 7, 0x8f7651).setLineWidth(2);
  const seal = scene.add.circle(0, 4, 7, 0x7c2222);
  return scene.add.container(x, y, [paper, flap1, flap2, seal]).setRotation(0.08);
}

function makeScales(scene: Phaser.Scene, x: number, y: number) {
  const stem = scene.add.rectangle(0, 2, 4, 52, 0xb89555);
  const beam = scene.add.rectangle(0, -20, 64, 4, 0xb89555);
  const left = scene.add.arc(-25, 4, 16, 0, 180, false, 0x6f552d).setStrokeStyle(2, 0xd0ad6b);
  const right = scene.add.arc(25, 4, 16, 0, 180, false, 0x6f552d).setStrokeStyle(2, 0xd0ad6b);
  const base = scene.add.ellipse(0, 29, 44, 10, 0x4f351c).setStrokeStyle(2, 0xb89555);
  return scene.add.container(x, y, [stem, beam, left, right, base]);
}

function makeMedallion(scene: Phaser.Scene, x: number, y: number) {
  const outer = scene.add.circle(0, 0, 24, 0x6c522c).setStrokeStyle(3, 0xd0ad6b);
  const inner = scene.add.circle(0, 0, 15, 0x24303c).setStrokeStyle(2, 0xb89555);
  const star = scene.add.star(0, 0, 6, 5, 12, 0xc4a66a);
  return scene.add.container(x, y, [outer, inner, star]);
}

function makeKey(scene: Phaser.Scene, x: number, y: number) {
  const ring = scene.add.circle(-17, 0, 11, 0x000000, 0).setStrokeStyle(4, 0xc09a55);
  const shaft = scene.add.rectangle(9, 0, 42, 5, 0xc09a55);
  const tooth1 = scene.add.rectangle(24, 7, 5, 13, 0xc09a55);
  const tooth2 = scene.add.rectangle(33, 5, 5, 9, 0xc09a55);
  return scene.add.container(x, y, [ring, shaft, tooth1, tooth2]).setRotation(-0.2);
}

const CLUES: Clue[] = [
  { id: 'book', x: 245, y: 474, radius: 44, title: 'O livro fora do lugar', text: 'Os fundamentos da República aparecem logo no artigo 1º.', draw: makeBook },
  { id: 'letter', x: 665, y: 558, radius: 42, title: 'A carta selada', text: 'A resposta está ligada ao valor intrínseco de cada pessoa.', draw: makeLetter },
  { id: 'scales', x: 808, y: 514, radius: 44, title: 'A pequena balança', text: 'Não confunda fundamentos com objetivos fundamentais.', draw: makeScales },
  { id: 'medallion', x: 1020, y: 395, radius: 42, title: 'O medalhão', text: 'SO-CI-DI-VA-PLU: o terceiro fragmento é a chave.', draw: makeMedallion },
  { id: 'key', x: 463, y: 585, radius: 40, title: 'A chave antiga', text: 'Procure o conceito que coloca a pessoa no centro do Estado.', draw: makeKey },
];

class LibraryScene extends Phaser.Scene {
  private found = new Set<string>();
  private counter!: Phaser.GameObjects.Text;
  private modal?: Phaser.GameObjects.Container;
  private rainAudio = new Audio(RAIN_AUDIO);
  private rainButton!: Phaser.GameObjects.Text;
  private rainOn = false;

  constructor() { super('Library'); }

  preload() {
    this.load.setCORS('anonymous');
    this.load.image('library', LIBRARY_IMAGE);
  }

  create() {
    this.cameras.main.setBackgroundColor('#08090c');
    const bg = this.add.image(W / 2, H / 2, 'library').setDisplaySize(W, H).setTint(0xb9a88b);
    bg.setAlpha(0.92);
    this.add.rectangle(W / 2, H / 2, W, H, 0x05070a, 0.28);
    this.add.rectangle(W / 2, H - 88, W, 176, 0x05070a, 0.36);
    this.createRainWindowEffect();
    this.createHeader();
    this.createClues();
    this.createAudioControls();
    this.showIntro();
    this.rainAudio.loop = true;
    this.rainAudio.volume = 0.28;
  }

  private createRainWindowEffect() {
    const rain = this.add.graphics().setDepth(2);
    for (let i = 0; i < 110; i++) {
      const x = Phaser.Math.Between(850, 1210);
      const y = Phaser.Math.Between(30, 420);
      rain.lineStyle(1, 0xb8d5e8, Phaser.Math.FloatBetween(0.08, 0.24));
      rain.lineBetween(x, y, x - 5, y + Phaser.Math.Between(12, 28));
    }
    this.tweens.add({ targets: rain, y: 26, duration: 850, repeat: -1, onRepeat: () => { rain.y = 0; } });
  }

  private createHeader() {
    this.add.rectangle(W / 2, 54, W, 108, 0x05070a, 0.68).setDepth(10);
    this.add.text(34, 23, 'LIMIAR', { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f3ead8', letterSpacing: 7 }).setDepth(11);
    this.add.text(36, 65, 'A PRIMEIRA BIBLIOTECA', { fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#c2a66e', letterSpacing: 3 }).setDepth(11);
    this.counter = this.add.text(1195, 36, 'Pistas 0/5', { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#ead5ae' }).setOrigin(1, 0).setDepth(11);
  }

  private createClues() {
    CLUES.forEach((clue) => {
      const object = clue.draw(this, clue.x, clue.y).setDepth(5).setAlpha(0.72).setScale(0.86);
      const zone = this.add.zone(clue.x, clue.y, clue.radius * 2, clue.radius * 2).setInteractive({ cursor: 'pointer' }).setDepth(6);
      const halo = this.add.circle(clue.x, clue.y, clue.radius + 9, 0xd8b36a, 0).setStrokeStyle(2, 0xe6c684, 0).setDepth(4);

      zone.on('pointerover', () => {
        if (this.found.has(clue.id)) return;
        this.tweens.add({ targets: object, alpha: 1, scale: 1, duration: 180 });
        this.tweens.add({ targets: halo, alpha: 0.18, duration: 180 });
        halo.setFillStyle(0xd8b36a, 0.12).setStrokeStyle(2, 0xf1d494, 0.65);
      });
      zone.on('pointerout', () => {
        if (this.found.has(clue.id)) return;
        this.tweens.add({ targets: object, alpha: 0.72, scale: 0.86, duration: 180 });
        this.tweens.add({ targets: halo, alpha: 0, duration: 180 });
        halo.setFillStyle(0xd8b36a, 0).setStrokeStyle(2, 0xf1d494, 0);
      });
      zone.on('pointerup', () => this.discover(clue, object, halo));
    });
  }

  private discover(clue: Clue, object: Phaser.GameObjects.Container, halo: Phaser.GameObjects.Arc) {
    if (!this.found.has(clue.id)) {
      this.found.add(clue.id);
      this.counter.setText(`Pistas ${this.found.size}/5`);
      object.setAlpha(1).setScale(1);
      halo.setFillStyle(0xd8b36a, 0.12).setStrokeStyle(2, 0xf1d494, 0.65);
      this.tweens.add({ targets: object, y: object.y - 5, duration: 190, yoyo: true });
    }
    this.showModal(clue.title, clue.text, 'Guardar pista');
    if (this.found.size === CLUES.length) this.time.delayedCall(600, () => this.showChallenge());
  }

  private createAudioControls() {
    this.rainButton = this.add.text(1215, 76, '🌧  chuva: desligada', {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#e7d5b7', backgroundColor: '#141820', padding: { x: 12, y: 8 },
    }).setOrigin(1, 0).setDepth(12).setInteractive({ cursor: 'pointer' });
    this.rainButton.on('pointerup', async () => {
      this.rainOn = !this.rainOn;
      if (this.rainOn) {
        try { await this.rainAudio.play(); } catch { this.rainOn = false; }
      } else {
        this.rainAudio.pause();
      }
      this.rainButton.setText(this.rainOn ? '🌧  chuva: ligada' : '🌧  chuva: desligada');
    });
  }

  private showIntro() {
    this.showModal('A primeira luz', 'Há cinco objetos que não pertencem a esta biblioteca. Encontre-os para abrir o livro de Direito Constitucional.', 'Começar');
  }

  private showModal(title: string, body: string, action: string, after?: () => void) {
    this.modal?.destroy();
    const overlay = this.add.rectangle(0, 0, W, H, 0x020305, 0.68).setOrigin(0).setDepth(20).setInteractive();
    const panel = this.add.rectangle(W / 2, 385, 660, 300, 0x111720, 0.98).setStrokeStyle(2, 0x9c7947).setDepth(21);
    const t = this.add.text(W / 2, 300, title, { fontFamily: 'Georgia, serif', fontSize: '29px', color: '#f1dfbf', align: 'center' }).setOrigin(0.5).setDepth(22);
    const b = this.add.text(W / 2, 380, body, { fontFamily: 'Georgia, serif', fontSize: '21px', color: '#d8ccb8', align: 'center', wordWrap: { width: 540 }, lineSpacing: 8 }).setOrigin(0.5).setDepth(22);
    const button = this.add.rectangle(W / 2, 478, 230, 48, 0x76532f).setStrokeStyle(1, 0xd5b97d).setDepth(22).setInteractive({ cursor: 'pointer' });
    const bt = this.add.text(W / 2, 478, action, { fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#fff3dc' }).setOrigin(0.5).setDepth(23);
    this.modal = this.add.container(0, 0, [overlay, panel, t, b, button, bt]).setDepth(20);
    button.on('pointerup', () => { this.modal?.destroy(); this.modal = undefined; after?.(); });
  }

  private showChallenge() {
    this.modal?.destroy();
    const overlay = this.add.rectangle(0, 0, W, H, 0x020305, 0.75).setOrigin(0).setDepth(25).setInteractive();
    const panel = this.add.rectangle(W / 2, 370, 780, 455, 0x111720, 0.99).setStrokeStyle(2, 0xa47b45).setDepth(26);
    const title = this.add.text(W / 2, 190, 'O primeiro mistério', { fontFamily: 'Georgia, serif', fontSize: '31px', color: '#f0dfc0' }).setOrigin(0.5).setDepth(27);
    const question = this.add.text(W / 2, 260, 'Qual destes é fundamento da República Federativa do Brasil?', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#ddd1bc', align: 'center', wordWrap: { width: 650 } }).setOrigin(0.5).setDepth(27);
    const group: Phaser.GameObjects.GameObject[] = [overlay, panel, title, question];
    const answers: [string, boolean][] = [['Erradicação da pobreza', false], ['Dignidade da pessoa humana', true], ['Redução das desigualdades regionais', false]];
    answers.forEach(([label, correct], i) => {
      const y = 340 + i * 68;
      const bg = this.add.rectangle(W / 2, y, 535, 52, 0x202b3b).setStrokeStyle(1, 0x6f604d).setDepth(27).setInteractive({ cursor: 'pointer' });
      const txt = this.add.text(W / 2, y, label, { fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#f3eadb' }).setOrigin(0.5).setDepth(28);
      bg.on('pointerup', () => {
        group.forEach((o) => o.destroy());
        if (correct) {
          localStorage.setItem('limiar:first-mystery', JSON.stringify({ completedAt: new Date().toISOString(), reviewDueAt: new Date(Date.now() + 86400000).toISOString() }));
          this.add.circle(640, 520, 26, 0xffc871, 0.92).setDepth(8);
          this.add.circle(640, 520, 120, 0xffd394, 0.12).setDepth(7);
          this.showModal('A biblioteca respondeu', 'Dignidade da pessoa humana é fundamento da República, no artigo 1º, III. Uma nova luz foi acesa e a revisão ficará disponível amanhã.', 'Permanecer');
        } else {
          this.showModal('O livro permanece fechado', 'As outras opções são objetivos fundamentais do artigo 3º. Releia as pistas e tente novamente.', 'Tentar novamente', () => this.showChallenge());
        }
      });
      group.push(bg, txt);
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: W,
  height: H,
  backgroundColor: '#08090c',
  scene: [LibraryScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false },
});
