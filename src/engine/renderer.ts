import { Vec2 } from './vec2';
import { Body } from './body';
import { World } from './world';

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  world: World;
  camera: { x: number; y: number; zoom: number };

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.world = world;
    this.camera = { x: 0, y: 0, zoom: 1 };
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth;
      this.canvas.height = parent.clientHeight;
    }
  }

  render(): void {
    const { ctx, canvas } = this;
    
    // 背景をクリア
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // カメラ変換
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 地面を描画
    this.drawGround();

    // 全てのボディを描画
    for (const body of this.world.bodies) {
      this.drawBody(body);
    }

    ctx.restore();
  }

  drawGround(): void {
    const { ctx, canvas } = this;
    const groundY = canvas.height / this.camera.zoom;
    
    ctx.fillStyle = '#16213e';
    ctx.fillRect(-canvas.width, groundY - 50, canvas.width * 3, 100);
    
    // 地面の線
    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-canvas.width, groundY);
    ctx.lineTo(canvas.width * 2, groundY);
    ctx.stroke();
  }

  drawBody(body: Body): void {
    const { ctx } = this;
    
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    
    if (body.type === 'circle') {
      this.drawCircle(body);
    } else if (body.type === 'rectangle') {
      this.drawRectangle(body);
    }
    
    ctx.restore();
  }

  drawCircle(body: Body): void {
    const { ctx } = this;
    
    // 塗り
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(0, 0, body.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 回転を示す線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(body.radius * 0.8, 0);
    ctx.stroke();
  }

  drawRectangle(body: Body): void {
    const { ctx } = this;
    const halfW = body.width / 2;
    const halfH = body.height / 2;
    
    // 塗り
    ctx.fillStyle = body.color;
    ctx.fillRect(-halfW, -halfH, body.width, body.height);
    
    // 枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-halfW, -halfH, body.width, body.height);
  }

  screenToWorld(screenX: number, screenY: number): Vec2 {
    const { canvas, camera } = this;
    const worldX = (screenX - canvas.width / 2) / camera.zoom + camera.x;
    const worldY = (screenY - canvas.height / 2) / camera.zoom + camera.y;
    return new Vec2(worldX, worldY);
  }

  worldToScreen(worldX: number, worldY: number): Vec2 {
    const { canvas, camera } = this;
    const screenX = (worldX - camera.x) * camera.zoom + canvas.width / 2;
    const screenY = (worldY - camera.y) * camera.zoom + canvas.height / 2;
    return new Vec2(screenX, screenY);
  }
}
