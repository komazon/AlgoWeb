import { Vec2 } from './vec2';

export type BodyType = 'circle' | 'rectangle';

export interface BodyOptions {
  type: BodyType;
  position: Vec2;
  radius?: number;
  width?: number;
  height?: number;
  isStatic?: boolean;
  restitution?: number;
  friction?: number;
  density?: number;
  color?: string;
  id?: string;
}

export class Body {
  id: string;
  type: BodyType;
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
  radius: number;
  width: number;
  height: number;
  isStatic: boolean;
  restitution: number;
  friction: number;
  density: number;
  mass: number;
  invMass: number;
  inertia: number;
  invInertia: number;
  color: string;
  force: Vec2;

  constructor(options: BodyOptions) {
    this.id = options.id || `body_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = options.type;
    this.position = options.position.clone();
    this.velocity = new Vec2(0, 0);
    this.angle = 0;
    this.angularVelocity = 0;
    this.radius = options.radius || 0;
    this.width = options.width || 0;
    this.height = options.height || 0;
    this.isStatic = options.isStatic || false;
    this.restitution = options.restitution !== undefined ? options.restitution : 0.5;
    this.friction = options.friction !== undefined ? options.friction : 0.3;
    this.density = options.density !== undefined ? options.density : 1;
    this.color = options.color || '#4CAF50';
    this.force = new Vec2(0, 0);

    // 質量と慣性を計算
    if (this.isStatic) {
      this.mass = 0;
      this.invMass = 0;
      this.inertia = 0;
      this.invInertia = 0;
    } else {
      if (this.type === 'circle') {
        this.mass = Math.PI * this.radius * this.radius * this.density;
        this.inertia = this.mass * this.radius * this.radius / 2;
      } else {
        this.mass = this.width * this.height * this.density;
        this.inertia = this.mass * (this.width * this.width + this.height * this.height) / 12;
      }
      this.invMass = this.mass > 0 ? 1 / this.mass : 0;
      this.invInertia = this.inertia > 0 ? 1 / this.inertia : 0;
    }
  }

  applyForce(force: Vec2): void {
    this.force.add(force);
  }

  applyImpulse(impulse: Vec2): void {
    if (!this.isStatic) {
      this.velocity.add(Vec2.mul(impulse, this.invMass));
    }
  }

  update(dt: number): void {
    if (this.isStatic) return;

    // 加速度を計算
    const acceleration = Vec2.mul(this.force, this.invMass);

    // 速度を更新
    this.velocity.add(Vec2.mul(acceleration, dt));

    // 位置を更新
    this.position.add(Vec2.mul(this.velocity, dt));

    // 角度を更新
    this.angle += this.angularVelocity * dt;

    // 力をリセット
    this.force.set(0, 0);
  }

  getAABB(): { min: Vec2; max: Vec2 } {
    if (this.type === 'circle') {
      return {
        min: new Vec2(this.position.x - this.radius, this.position.y - this.radius),
        max: new Vec2(this.position.x + this.radius, this.position.y + this.radius)
      };
    } else {
      // 矩形のAABB（回転を考慮）
      const corners = this.getCorners();
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      for (const corner of corners) {
        minX = Math.min(minX, corner.x);
        minY = Math.min(minY, corner.y);
        maxX = Math.max(maxX, corner.x);
        maxY = Math.max(maxY, corner.y);
      }
      
      return {
        min: new Vec2(minX, minY),
        max: new Vec2(maxX, maxY)
      };
    }
  }

  getCorners(): Vec2[] {
    if (this.type !== 'rectangle') return [];
    
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const corners: Vec2[] = [
      new Vec2(-halfW, -halfH),
      new Vec2(halfW, -halfH),
      new Vec2(halfW, halfH),
      new Vec2(-halfW, halfH)
    ];
    
    return corners.map(c => Vec2.add(Vec2.rotate(c, this.angle), this.position));
  }
}
