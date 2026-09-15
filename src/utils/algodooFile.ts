import JSZip from 'jszip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { PhysicsBody } from '../types';

// Algodooの.phnファイル形式（XML）
interface AlgodooScene {
  version: string;
  objects: AlgodooObject[];
  planes: AlgodooPlane[];
  water?: AlgodooWater[];
}

interface AlgodooObject {
  type: 'circle' | 'rectangle' | 'polygon' | 'gear' | 'cloth' | 'chain' | 'plane' | 'text' | 'laser' | 'spring' | 'tracer';
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
}

interface AlgodooPlane {
  pos: [number, number];
  angle?: number;
  color?: [number, number, number, number];
}

interface AlgodooWater {
  pos: [number, number];
  size: [number, number];
  color?: [number, number, number, number];
}

// XMLパーサーの設定
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  trimValues: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true,
});

// 文字列から配列へ変換（例: "1.0,2.0" -> [1.0, 2.0]）
function parseVector(str: string | undefined, dimensions: number = 2): number[] | undefined {
  if (!str) return undefined;
  const parts = str.split(',').map(Number);
  if (parts.length < dimensions) return undefined;
  return parts.slice(0, dimensions);
}

// 配列から文字列へ変換（例: [1.0, 2.0] -> "1.0,2.0"）
function vectorToString(vec: number[]): string {
  return vec.join(',');
}

// 色をAlgodoo形式に変換（例: "#FF0000" -> "1,0,0,1"）
function colorToAlgodoo(color: string): [number, number, number, number] {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b, 1];
  }
  // 既にRGBA形式の場合
  const parts = color.split(',').map(Number);
  if (parts.length === 4) {
    return parts as [number, number, number, number];
  }
  return [0.5, 0.5, 0.5, 1];
}

// Algodoo色をHEXに変換
function algodooToHex(color: [number, number, number, number]): string {
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// .phnファイル（XML）をパース
export function parsePhn(xmlContent: string): AlgodooScene {
  const parsed = xmlParser.parse(xmlContent);
  
  const scene: AlgodooScene = {
    version: parsed.Scene?._attributes?.version || '2.1.0',
    objects: [],
    planes: [],
    water: [],
  };

  const sceneData = parsed.Scene || {};

  // 平面（Plane）をパース
  if (sceneData.Plane) {
    const planes = Array.isArray(sceneData.Plane) ? sceneData.Plane : [sceneData.Plane];
    planes.forEach((plane: any) => {
      const pos = parseVector(plane.pos) as [number, number] || [0, 0];
      const angle = plane.angle !== undefined ? Number(plane.angle) : undefined;
      const color = parseVector(plane.color, 4) as [number, number, number, number] | undefined;
      
      scene.planes.push({ pos, angle, color });
    });
  }

  // 水（Water）をパース
  if (sceneData.Water) {
    const waters = Array.isArray(sceneData.Water) ? sceneData.Water : [sceneData.Water];
    waters.forEach((water: any) => {
      const pos = parseVector(water.pos) as [number, number] || [0, 0];
      const size = parseVector(water.size) as [number, number] || [1, 1];
      const color = parseVector(water.color, 4) as [number, number, number, number] | undefined;
      
      scene.water!.push({ pos, size, color });
    });
  }

  // 円（Circle）をパース
  if (sceneData.Circle) {
    const circles = Array.isArray(sceneData.Circle) ? sceneData.Circle : [sceneData.Circle];
    circles.forEach((circle: any) => {
      const obj: AlgodooObject = {
        type: 'circle',
        pos: parseVector(circle.pos) as [number, number] || [0, 0],
        radius: circle.radius !== undefined ? Number(circle.radius) : 0.5,
      };
      
      if (circle.vel) obj.vel = parseVector(circle.vel) as [number, number];
      if (circle.angle !== undefined) obj.angle = Number(circle.angle);
      if (circle.angvel !== undefined) obj.angvel = Number(circle.angvel);
      if (circle.color) obj.color = parseVector(circle.color, 4) as [number, number, number, number];
      if (circle.density !== undefined) obj.density = Number(circle.density);
      if (circle.restitution !== undefined) obj.restitution = Number(circle.restitution);
      if (circle.friction !== undefined) obj.friction = Number(circle.friction);
      if (circle.static !== undefined) obj.static = circle.static === true || circle.static === 'true';
      if (circle.name) obj.name = circle.name;
      
      scene.objects.push(obj);
    });
  }

  // 四角形（Rectangle）をパース
  if (sceneData.Rectangle) {
    const rectangles = Array.isArray(sceneData.Rectangle) ? sceneData.Rectangle : [sceneData.Rectangle];
    rectangles.forEach((rect: any) => {
      const obj: AlgodooObject = {
        type: 'rectangle',
        pos: parseVector(rect.pos) as [number, number] || [0, 0],
        size: parseVector(rect.size) as [number, number] || [1, 1],
      };
      
      if (rect.vel) obj.vel = parseVector(rect.vel) as [number, number];
      if (rect.angle !== undefined) obj.angle = Number(rect.angle);
      if (rect.angvel !== undefined) obj.angvel = Number(rect.angvel);
      if (rect.color) obj.color = parseVector(rect.color, 4) as [number, number, number, number];
      if (rect.density !== undefined) obj.density = Number(rect.density);
      if (rect.restitution !== undefined) obj.restitution = Number(rect.restitution);
      if (rect.friction !== undefined) obj.friction = Number(rect.friction);
      if (rect.static !== undefined) obj.static = rect.static === true || rect.static === 'true';
      if (rect.name) obj.name = rect.name;
      
      scene.objects.push(obj);
    });
  }

  // 多角形（Polygon）をパース
  if (sceneData.Polygon) {
    const polygons = Array.isArray(sceneData.Polygon) ? sceneData.Polygon : [sceneData.Polygon];
    polygons.forEach((poly: any) => {
      const obj: AlgodooObject = {
        type: 'polygon',
        pos: parseVector(poly.pos) as [number, number] || [0, 0],
        vertices: [],
      };
      
      if (poly.vertices) {
        const verts = poly.vertices.split(';').map((v: string) => {
          const coords = v.split(',').map(Number);
          return [coords[0], coords[1]] as [number, number];
        });
        obj.vertices = verts;
      }
      
      if (poly.vel) obj.vel = parseVector(poly.vel) as [number, number];
      if (poly.angle !== undefined) obj.angle = Number(poly.angle);
      if (poly.angvel !== undefined) obj.angvel = Number(poly.angvel);
      if (poly.color) obj.color = parseVector(poly.color, 4) as [number, number, number, number];
      if (poly.density !== undefined) obj.density = Number(poly.density);
      if (poly.restitution !== undefined) obj.restitution = Number(poly.restitution);
      if (poly.friction !== undefined) obj.friction = Number(poly.friction);
      if (poly.static !== undefined) obj.static = poly.static === true || poly.static === 'true';
      if (poly.name) obj.name = poly.name;
      
      scene.objects.push(obj);
    });
  }

  return scene;
}

// AlgodooSceneを.phn（XML）に変換
export function buildPhn(scene: AlgodooScene): string {
  const xmlDoc: any = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8',
    },
    Scene: {
      '@_version': scene.version,
    },
  };

  // 平面を追加
  if (scene.planes.length > 0) {
    xmlDoc.Scene.Plane = scene.planes.map(plane => {
      const attrs: any = {
        '@_pos': vectorToString(plane.pos),
      };
      if (plane.angle !== undefined) attrs['@_angle'] = plane.angle;
      if (plane.color) attrs['@_color'] = vectorToString(plane.color);
      return attrs;
    });
  }

  // 水を追加
  if (scene.water && scene.water.length > 0) {
    xmlDoc.Scene.Water = scene.water.map(water => {
      const attrs: any = {
        '@_pos': vectorToString(water.pos),
        '@_size': vectorToString(water.size),
      };
      if (water.color) attrs['@_color'] = vectorToString(water.color);
      return attrs;
    });
  }

  // オブジェクトを追加
  const circles = scene.objects.filter(o => o.type === 'circle');
  const rectangles = scene.objects.filter(o => o.type === 'rectangle');
  const polygons = scene.objects.filter(o => o.type === 'polygon');

  if (circles.length > 0) {
    xmlDoc.Scene.Circle = circles.map(circle => {
      const attrs: any = {
        '@_pos': vectorToString(circle.pos),
        '@_radius': circle.radius,
      };
      if (circle.vel) attrs['@_vel'] = vectorToString(circle.vel);
      if (circle.angle !== undefined) attrs['@_angle'] = circle.angle;
      if (circle.angvel !== undefined) attrs['@_angvel'] = circle.angvel;
      if (circle.color) attrs['@_color'] = vectorToString(circle.color);
      if (circle.density !== undefined) attrs['@_density'] = circle.density;
      if (circle.restitution !== undefined) attrs['@_restitution'] = circle.restitution;
      if (circle.friction !== undefined) attrs['@_friction'] = circle.friction;
      if (circle.static) attrs['@_static'] = true;
      if (circle.name) attrs['@_name'] = circle.name;
      return attrs;
    });
  }

  if (rectangles.length > 0) {
    xmlDoc.Scene.Rectangle = rectangles.map(rect => {
      const attrs: any = {
        '@_pos': vectorToString(rect.pos),
        '@_size': vectorToString(rect.size!),
      };
      if (rect.vel) attrs['@_vel'] = vectorToString(rect.vel);
      if (rect.angle !== undefined) attrs['@_angle'] = rect.angle;
      if (rect.angvel !== undefined) attrs['@_angvel'] = rect.angvel;
      if (rect.color) attrs['@_color'] = vectorToString(rect.color);
      if (rect.density !== undefined) attrs['@_density'] = rect.density;
      if (rect.restitution !== undefined) attrs['@_restitution'] = rect.restitution;
      if (rect.friction !== undefined) attrs['@_friction'] = rect.friction;
      if (rect.static) attrs['@_static'] = true;
      if (rect.name) attrs['@_name'] = rect.name;
      return attrs;
    });
  }

  if (polygons.length > 0) {
    xmlDoc.Scene.Polygon = polygons.map(poly => {
      const attrs: any = {
        '@_pos': vectorToString(poly.pos),
      };
      if (poly.vertices) {
        attrs['@_vertices'] = poly.vertices.map(v => vectorToString(v)).join(';');
      }
      if (poly.vel) attrs['@_vel'] = vectorToString(poly.vel);
      if (poly.angle !== undefined) attrs['@_angle'] = poly.angle;
      if (poly.angvel !== undefined) attrs['@_angvel'] = poly.angvel;
      if (poly.color) attrs['@_color'] = vectorToString(poly.color);
      if (poly.density !== undefined) attrs['@_density'] = poly.density;
      if (poly.restitution !== undefined) attrs['@_restitution'] = poly.restitution;
      if (poly.friction !== undefined) attrs['@_friction'] = poly.friction;
      if (poly.static) attrs['@_static'] = true;
      if (poly.name) attrs['@_name'] = poly.name;
      return attrs;
    });
  }

  return xmlBuilder.build(xmlDoc);
}

// PhysicsBodyをAlgodooObjectに変換
export function physicsBodyToAlgodoo(body: PhysicsBody): AlgodooObject {
  const obj: AlgodooObject = {
    type: body.type === 'circle' ? 'circle' : body.type === 'rectangle' ? 'rectangle' : 'polygon',
    pos: [body.x / 100, body.y / 100], // ピクセルからメートルへ変換
    vel: [body.vx / 100, body.vy / 100],
    angle: body.angle,
    angvel: body.angularVelocity,
    color: colorToAlgodoo(body.color),
    density: body.density,
    restitution: body.restitution,
    friction: body.friction,
    static: body.isStatic,
  };

  if (body.type === 'circle' && body.radius) {
    obj.radius = body.radius / 100;
  } else if (body.type === 'rectangle' && body.width && body.height) {
    obj.size = [body.width / 100, body.height / 100];
  }

  return obj;
}

// AlgodooObjectをPhysicsBodyに変換
export function algodooToPhysicsBody(obj: AlgodooObject, id: string): PhysicsBody {
  const body: PhysicsBody = {
    id,
    type: obj.type === 'circle' ? 'circle' : obj.type === 'rectangle' ? 'rectangle' : 'polygon',
    x: obj.pos[0] * 100, // メートルからピクセルへ変換
    y: obj.pos[1] * 100,
    angle: obj.angle || 0,
    vx: obj.vel ? obj.vel[0] * 100 : 0,
    vy: obj.vel ? obj.vel[1] * 100 : 0,
    angularVelocity: obj.angvel || 0,
    color: obj.color ? algodooToHex(obj.color) : '#808080',
    ownerId: '',
    isStatic: obj.static || false,
    restitution: obj.restitution !== undefined ? obj.restitution : 0.5,
    friction: obj.friction !== undefined ? obj.friction : 0.1,
    density: obj.density !== undefined ? obj.density : 0.001,
  };

  if (obj.type === 'circle' && obj.radius) {
    body.radius = obj.radius * 100;
  } else if (obj.type === 'rectangle' && obj.size) {
    body.width = obj.size[0] * 100;
    body.height = obj.size[1] * 100;
  }

  return body;
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
  
  // サムネイル画像（空のPNG）を追加
  // 実際にはキャンバスから生成するが、ここではプレースホルダー
  const thumbnail = createEmptyThumbnail();
  zip.file('thumbnail.png', thumbnail, { base64: true });
  
  // チェックサムファイル
  const checksum = generateChecksum(phnContent);
  zip.file('checksums.txt', checksum);
  
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, filename);
}

// AlgodooSceneを.phnファイルとして保存
export async function savePhn(scene: AlgodooScene, filename: string = 'scene.phn'): Promise<void> {
  const phnContent = buildPhn(scene);
  const blob = new Blob([phnContent], { type: 'application/xml' });
  downloadBlob(blob, filename);
}

// 空のサムネイル画像（1x1の透明PNG）
function createEmptyThumbnail(): string {
  // 最小限のPNGデータ（1x1透明ピクセル）
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

// チェックサム生成（簡易版）
function generateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `scene.phn: ${Math.abs(hash).toString(16)}`;
}

// Blobをダウンロード
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
        pos: [0, 5], // 画面下端
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
