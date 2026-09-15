// 2Dベクトルクラス（phun-js-box2dのb2Vec2を参考）
export class Vec2 {
  constructor(public x: number = 0, public y: number = 0) {}

  static add(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x + b.x, a.y + b.y);
  }

  static sub(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x - b.x, a.y - b.y);
  }

  static mul(v: Vec2, s: number): Vec2 {
    return new Vec2(v.x * s, v.y * s);
  }

  static div(v: Vec2, s: number): Vec2 {
    return new Vec2(v.x / s, v.y / s);
  }

  static dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
  }

  static cross(a: Vec2, b: number): Vec2 {
    return new Vec2(b * a.y, -b * a.x);
  }

  static crossVec(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vec2 {
    const len = this.length();
    if (len > 0) {
      return new Vec2(this.x / len, this.y / len);
    }
    return new Vec2(0, 0);
  }

  negate(): Vec2 {
    return new Vec2(-this.x, -this.y);
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  add(v: Vec2): void {
    this.x += v.x;
    this.y += v.y;
  }

  sub(v: Vec2): void {
    this.x -= v.x;
    this.y -= v.y;
  }

  mul(s: number): void {
    this.x *= s;
    this.y *= s;
  }

  distance(v: Vec2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  rotate(angle: number): Vec2 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  static rotate(v: Vec2, angle: number): Vec2 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }
}
