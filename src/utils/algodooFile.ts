// phun-js-box2dのパーサーをベースにしたAlgodooファイルパーサー
// 参考: https://github.com/EJTH/phun-js-box2d

import JSZip from 'jszip';
import { PhysicsBody } from '../types';

// Thymeパーサー（phun-js-box2dから移植）
// このパーサーはAlgodooの.phnファイル形式（Thymeスクリプト）を解析します

interface ThymeNode {
  type: 'call' | 'struct';
  name: string;
  arguments?: any;
  properties?: any;
}

// 簡易Thymeパーサー
class ThymeParser {
  private input: string;
  private pos: number;

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
  }

  parse(): ThymeNode[] {
    const nodes: ThymeNode[] = [];
    
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;
      
      const node = this.parseNode();
      if (node) {
        nodes.push(node);
      }
      
      this.skipWhitespace();
      if (this.peek() === ';') {
        this.pos++;
      }
    }
    
    return nodes;
  }

  private parseNode(): ThymeNode | null {
    this.skipWhitespace();
    
    // 関数呼び出し: Scene.addBox({...})
    const name = this.parseIdentifier();
    if (!name) return null;
    
    this.skipWhitespace();
    
    // -> で始まる場合は構造体
    if (this.input.substr(this.pos, 2) === '->') {
      this.pos += 2;
      this.skipWhitespace();
      const properties = this.parseObject();
      return { type: 'struct', name, properties };
    }
    
    // ( で始まる場合は関数呼び出し
    if (this.peek() === '(') {
      this.pos++;
      this.skipWhitespace();
      const args = this.parseArguments();
      this.skipWhitespace();
      if (this.peek() === ')') this.pos++;
      return { type: 'call', name, arguments: args };
    }
    
    return null;
  }

  private parseIdentifier(): string {
    const start = this.pos;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (/[a-zA-Z0-9_.]/.test(ch)) {
        this.pos++;
      } else {
        break;
      }
    }
    return this.input.substring(start, this.pos);
  }

  private parseObject(): any {
    if (this.peek() !== '{') return null;
    this.pos++;
    this.skipWhitespace();
    
    const obj: any = {};
    
    while (this.pos < this.input.length && this.peek() !== '}') {
      this.skipWhitespace();
      if (this.peek() === '}') break;
      
      const key = this.parseIdentifier();
      if (!key) break;
      
      this.skipWhitespace();
      
      // = または :=
      if (this.input.substr(this.pos, 2) === ':=') {
        this.pos += 2;
      } else if (this.peek() === '=') {
        this.pos++;
      }
      
      this.skipWhitespace();
      const value = this.parseValue();
      obj[key] = value;
      
      this.skipWhitespace();
      if (this.peek() === ';') {
        this.pos++;
      }
    }
    
    if (this.peek() === '}') this.pos++;
    return obj;
  }

  private parseArguments(): any {
    this.skipWhitespace();
    if (this.peek() === '{') {
      return this.parseObject();
    }
    
    const args: any[] = [];
    while (this.pos < this.input.length && this.peek() !== ')') {
      this.skipWhitespace();
      if (this.peek() === ')') break;
      
      const value = this.parseValue();
      args.push(value);
      
      this.skipWhitespace();
      if (this.peek() === ',') {
        this.pos++;
      }
    }
    
    return args.length === 1 ? args[0] : args;
  }

  private parseValue(): any {
    this.skipWhitespace();
    const ch = this.peek();
    
    // 文字列
    if (ch === '"') {
      return this.parseString();
    }
    
    // 配列
    if (ch === '[') {
      return this.parseArray();
    }
    
    // オブジェクト
    if (ch === '{') {
      return this.parseObject();
    }
    
    // 数値
    if (/[0-9\-]/.test(ch)) {
      return this.parseNumber();
    }
    
    // 真偽値
    if (this.input.substr(this.pos, 4) === 'true') {
      this.pos += 4;
      return true;
    }
    if (this.input.substr(this.pos, 5) === 'false') {
      this.pos += 5;
      return false;
    }
    
    // 識別子
    return this.parseIdentifier();
  }

  private parseString(): string {
    this.pos++; // skip "
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== '"') {
      this.pos++;
    }
    const str = this.input.substring(start, this.pos);
    if (this.peek() === '"') this.pos++;
    return str;
  }

  private parseArray(): any[] {
    this.pos++; // skip [
    this.skipWhitespace();
    
    const arr: any[] = [];
    while (this.pos < this.input.length && this.peek() !== ']') {
      this.skipWhitespace();
      if (this.peek() === ']') break;
      
      const value = this.parseValue();
      arr.push(value);
      
      this.skipWhitespace();
      if (this.peek() === ',') {
        this.pos++;
      }
    }
    
    if (this.peek() === ']') this.pos++;
    return arr;
  }

  private parseNumber(): number {
    const start = this.pos;
    if (this.peek() === '-') this.pos++;
    
    while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
      this.pos++;
    }
    
    return parseFloat(this.input.substring(start, this.pos));
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }
}

// Algodooシーンデータ
export interface AlgodooScene {
  version: string;
  objects: AlgodooObject[];
  planes: AlgodooPlane[];
  camera?: any;
  sim?: any;
}

export interface AlgodooObject {
  type: 'circle' | 'rectangle' | 'polygon';
  pos: [number, number];
  vel?: [number, number];
  angle?: number;
  angvel?: number;
  color?: [number, number, number, number];
  radius?: number;
  size?: [number, number];
  vertices?: [number, number][];
  density?: number;
  restitution?: number;
  friction?: number;
  static?: boolean;
  name?: string;
  geomID?: number;
  entityID?: number;
  body?: number;
}

export interface AlgodooPlane {
  pos: [number, number];
  angle?: number;
  color?: [number, number, number, number];
}

// 座標変換（Algodooはメートル、Matter.jsはピクセル）
const UNIT_CONVERSION = 100; // 1m = 100px

// .phnファイル（Thymeスクリプト）をパース
export function parsePhn(content: string): AlgodooScene {
  const parser = new ThymeParser(content);
  const nodes = parser.parse();
  
  const scene: AlgodooScene = {
    version: '2.1.0',
    objects: [],
    planes: [],
  };

  nodes.forEach(node => {
    if (node.type === 'call') {
      const name = node.name;
      const args = node.arguments;
      
      if (name === 'Scene.addCircle') {
        scene.objects.push({
          type: 'circle',
          pos: args.pos || [0, 0],
          radius: args.radius || 0.5,
          vel: args.vel,
          angle: args.angle,
          angvel: args.angvel,
          color: args.color,
          density: args.density,
          restitution: args.restitution,
          friction: args.friction,
          static: args.glued,
          geomID: args.geomID,
          entityID: args.entityID,
          body: args.body,
        });
      } else if (name === 'Scene.addBox') {
        scene.objects.push({
          type: 'rectangle',
          pos: args.pos || [0, 0],
          size: args.size || [1, 1],
          vel: args.vel,
          angle: args.angle,
          angvel: args.angvel,
          color: args.color,
          density: args.density,
          restitution: args.restitution,
          friction: args.friction,
          static: args.glued,
          geomID: args.geomID,
          entityID: args.entityID,
          body: args.body,
        });
      } else if (name === 'Scene.addPolygon') {
        scene.objects.push({
          type: 'polygon',
          pos: args.pos || [0, 0],
          vertices: args.vertices,
          vel: args.vel,
          angle: args.angle,
          angvel: args.angvel,
          color: args.color,
          density: args.density,
          restitution: args.restitution,
          friction: args.friction,
          static: args.glued,
          geomID: args.geomID,
          entityID: args.entityID,
          body: args.body,
        });
      } else if (name === 'Scene.addPlane') {
        scene.planes.push({
          pos: args.pos || [0, 0],
          angle: args.angle,
          color: args.color,
        });
      }
    } else if (node.type === 'struct') {
      if (node.name === 'Scene.Camera') {
        scene.camera = node.properties;
      } else if (node.name === 'Sim') {
        scene.sim = node.properties;
      }
    }
  });

  return scene;
}

// AlgodooSceneを.phn（Thymeスクリプト）に変換
export function buildPhn(scene: AlgodooScene): string {
  const lines: string[] = [];
  
  // カメラ設定
  if (scene.camera) {
    lines.push(`Scene.Camera -> {`);
    lines.push(`  pan := [${scene.camera.pan?.join(', ') || '0, 0'}];`);
    lines.push(`  zoom := ${scene.camera.zoom || 1};`);
    lines.push(`};`);
  }
  
  // シミュレーション設定
  if (scene.sim) {
    lines.push(`Sim -> {`);
    lines.push(`  gravitySwitch := ${scene.sim.gravitySwitch !== false};`);
    lines.push(`  gravityStrength := ${scene.sim.gravityStrength || 10};`);
    lines.push(`};`);
  }
  
  // 平面
  scene.planes.forEach((plane, i) => {
    lines.push(`Scene.addPlane({`);
    lines.push(`  pos := [${plane.pos.join(', ')}];`);
    if (plane.angle !== undefined) lines.push(`  angle := ${plane.angle};`);
    if (plane.color) lines.push(`  color := [${plane.color.join(', ')}];`);
    lines.push(`  geomID := ${i};`);
    lines.push(`});`);
  });
  
  // オブジェクト
  scene.objects.forEach((obj, i) => {
    if (obj.type === 'circle') {
      lines.push(`Scene.addCircle({`);
      lines.push(`  pos := [${obj.pos.join(', ')}];`);
      lines.push(`  radius := ${obj.radius || 0.5};`);
      if (obj.vel) lines.push(`  vel := [${obj.vel.join(', ')}];`);
      if (obj.angle !== undefined) lines.push(`  angle := ${obj.angle};`);
      if (obj.angvel !== undefined) lines.push(`  angvel := ${obj.angvel};`);
      if (obj.color) lines.push(`  color := [${obj.color.join(', ')}];`);
      if (obj.density !== undefined) lines.push(`  density := ${obj.density};`);
      if (obj.restitution !== undefined) lines.push(`  restitution := ${obj.restitution};`);
      if (obj.friction !== undefined) lines.push(`  friction := ${obj.friction};`);
      if (obj.static) lines.push(`  glued := true;`);
      lines.push(`  geomID := ${100 + i};`);
      lines.push(`  entityID := ${100 + i};`);
      lines.push(`});`);
    } else if (obj.type === 'rectangle') {
      lines.push(`Scene.addBox({`);
      lines.push(`  pos := [${obj.pos.join(', ')}];`);
      lines.push(`  size := [${(obj.size || [1, 1]).join(', ')}];`);
      if (obj.vel) lines.push(`  vel := [${obj.vel.join(', ')}];`);
      if (obj.angle !== undefined) lines.push(`  angle := ${obj.angle};`);
      if (obj.angvel !== undefined) lines.push(`  angvel := ${obj.angvel};`);
      if (obj.color) lines.push(`  color := [${obj.color.join(', ')}];`);
      if (obj.density !== undefined) lines.push(`  density := ${obj.density};`);
      if (obj.restitution !== undefined) lines.push(`  restitution := ${obj.restitution};`);
      if (obj.friction !== undefined) lines.push(`  friction := ${obj.friction};`);
      if (obj.static) lines.push(`  glued := true;`);
      lines.push(`  geomID := ${100 + i};`);
      lines.push(`  entityID := ${100 + i};`);
      lines.push(`});`);
    }
  });
  
  return lines.join('\n');
}

// PhysicsBodyをAlgodooObjectに変換
export function physicsBodyToAlgodoo(body: PhysicsBody): AlgodooObject {
  const obj: AlgodooObject = {
    type: body.type === 'circle' ? 'circle' : body.type === 'rectangle' ? 'rectangle' : 'polygon',
    pos: [body.x / UNIT_CONVERSION, body.y / UNIT_CONVERSION],
    vel: [body.vx / UNIT_CONVERSION, body.vy / UNIT_CONVERSION],
    angle: body.angle,
    angvel: body.angularVelocity,
    color: hexToAlgodooColor(body.color),
    density: body.density,
    restitution: body.restitution,
    friction: body.friction,
    static: body.isStatic,
  };

  if (body.type === 'circle' && body.radius) {
    obj.radius = body.radius / UNIT_CONVERSION;
  } else if (body.type === 'rectangle' && body.width && body.height) {
    obj.size = [body.width / UNIT_CONVERSION, body.height / UNIT_CONVERSION];
  }

  return obj;
}

// AlgodooObjectをPhysicsBodyに変換
export function algodooToPhysicsBody(obj: AlgodooObject, id: string): PhysicsBody {
  const body: PhysicsBody = {
    id,
    type: obj.type,
    x: obj.pos[0] * UNIT_CONVERSION,
    y: obj.pos[1] * UNIT_CONVERSION,
    angle: obj.angle || 0,
    vx: obj.vel ? obj.vel[0] * UNIT_CONVERSION : 0,
    vy: obj.vel ? obj.vel[1] * UNIT_CONVERSION : 0,
    angularVelocity: obj.angvel || 0,
    color: algodooColorToHex(obj.color || [0.5, 0.5, 0.5, 1]),
    ownerId: '',
    isStatic: obj.static || false,
    restitution: obj.restitution !== undefined ? obj.restitution : 0.5,
    friction: obj.friction !== undefined ? obj.friction : 0.5,
    density: obj.density !== undefined ? obj.density : 1,
  };

  if (obj.type === 'circle' && obj.radius) {
    body.radius = obj.radius * UNIT_CONVERSION;
  } else if (obj.type === 'rectangle' && obj.size) {
    body.width = obj.size[0] * UNIT_CONVERSION;
    body.height = obj.size[1] * UNIT_CONVERSION;
  }

  return body;
}

// 色変換ユーティリティ
function hexToAlgodooColor(hex: string): [number, number, number, number] {
  if (hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1];
  }
  return [0.5, 0.5, 0.5, 1];
}

function algodooColorToHex(color: [number, number, number, number]): string {
  const r = Math.round(color[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(color[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(color[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// .phzファイルを読み込み（ZIP展開して.phnを取得）
export async function loadPhz(file: File): Promise<AlgodooScene> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  
  // .phnファイルを探す
  const phnFile = contents.file(/\.phn$/i)[0];
  if (!phnFile) {
    throw new Error('.phzファイル内に.phnファイルが見つかりません');
  }
  
  const phnContent = await phnFile.async('string');
  return parsePhn(phnContent);
}

// .phnファイルを読み込み
export async function loadPhn(file: File): Promise<AlgodooScene> {
  const content = await file.text();
  return parsePhn(content);
}

// AlgodooSceneを.phzファイルとして保存
export async function savePhz(scene: AlgodooScene, filename: string = 'scene.phz'): Promise<void> {
  const phnContent = buildPhn(scene);
  
  const zip = new JSZip();
  zip.file('scene.phn', phnContent);
  
  // サムネイル画像（空のPNG）
  const thumbnail = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  zip.file('thumbnail.png', thumbnail, { base64: true });
  
  // チェックサム
  const checksum = generateChecksum(phnContent);
  zip.file('checksums.txt', checksum);
  
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, filename);
}

// AlgodooSceneを.phnファイルとして保存
export async function savePhn(scene: AlgodooScene, filename: string = 'scene.phn'): Promise<void> {
  const phnContent = buildPhn(scene);
  const blob = new Blob([phnContent], { type: 'text/plain' });
  downloadBlob(blob, filename);
}

function generateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `scene.phn: ${Math.abs(hash).toString(16)}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// PhysicsBody配列をAlgodooSceneに変換
export function physicsBodiesToScene(bodies: PhysicsBody[]): AlgodooScene {
  const scene: AlgodooScene = {
    version: '2.1.0',
    objects: bodies.map(physicsBodyToAlgodoo),
    planes: [
      {
        pos: [0, 5],
        angle: 0,
        color: [0.1, 0.1, 0.2, 1],
      },
    ],
  };

  return scene;
}

// AlgodooSceneをPhysicsBody配列に変換
export function sceneToPhysicsBodies(scene: AlgodooScene): PhysicsBody[] {
  return scene.objects.map((obj, index) => {
    const id = `imported_${Date.now()}_${index}`;
    return algodooToPhysicsBody(obj, id);
  });
}
