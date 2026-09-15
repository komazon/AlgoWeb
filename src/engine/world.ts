import { Vec2 } from './vec2';
import { Body, BodyOptions } from './body';
import { detectCollision, CollisionInfo } from './collision';

export class World {
  bodies: Body[] = [];
  gravity: Vec2;
  iterations: number = 10;

  constructor(gravity: Vec2 = new Vec2(0, 980)) {
    this.gravity = gravity;
  }

  addBody(options: BodyOptions): Body {
    const body = new Body(options);
    this.bodies.push(body);
    return body;
  }

  removeBody(id: string): void {
    const index = this.bodies.findIndex(b => b.id === id);
    if (index !== -1) {
      this.bodies.splice(index, 1);
    }
  }

  getBody(id: string): Body | undefined {
    return this.bodies.find(b => b.id === id);
  }

  clear(): void {
    this.bodies = [];
  }

  step(dt: number): void {
    // 重力を適用
    for (const body of this.bodies) {
      if (!body.isStatic) {
        body.applyForce(Vec2.mul(this.gravity, body.mass));
      }
    }

    // 速度と位置を更新
    for (const body of this.bodies) {
      body.update(dt);
    }

    // 衝突判定と応答
    this.solveCollisions();
  }

  solveCollisions(): void {
    for (let iter = 0; iter < this.iterations; iter++) {
      for (let i = 0; i < this.bodies.length; i++) {
        for (let j = i + 1; j < this.bodies.length; j++) {
          const a = this.bodies[i];
          const b = this.bodies[j];

          // 両方とも静的ならスキップ
          if (a.isStatic && b.isStatic) continue;

          const collision = detectCollision(a, b);
          if (collision) {
            this.resolveCollision(collision);
          }
        }
      }
    }
  }

  resolveCollision(collision: CollisionInfo): void {
    const { bodyA, bodyB, normal, depth } = collision;

    // 位置補正（ペンetrationを解消）
    const totalInvMass = bodyA.invMass + bodyB.invMass;
    if (totalInvMass > 0) {
      const correction = Vec2.mul(normal, depth / totalInvMass);
      if (!bodyA.isStatic) {
        bodyA.position.sub(Vec2.mul(correction, bodyA.invMass));
      }
      if (!bodyB.isStatic) {
        bodyB.position.add(Vec2.mul(correction, bodyB.invMass));
      }
    }

    // 相対速度を計算
    const relativeVelocity = Vec2.sub(bodyB.velocity, bodyA.velocity);
    const velocityAlongNormal = Vec2.dot(relativeVelocity, normal);

    // 既に分離している場合はスキップ
    if (velocityAlongNormal > 0) return;

    // 反発係数
    const e = Math.min(bodyA.restitution, bodyB.restitution);

    // インパルスを計算
    const j = -(1 + e) * velocityAlongNormal;
    const impulse = Vec2.mul(normal, j / totalInvMass);

    // インパルスを適用
    if (!bodyA.isStatic) {
      bodyA.velocity.sub(Vec2.mul(impulse, bodyA.invMass));
    }
    if (!bodyB.isStatic) {
      bodyB.velocity.add(Vec2.mul(impulse, bodyB.invMass));
    }

    // 摩擦
    const tangent = Vec2.sub(relativeVelocity, Vec2.mul(normal, velocityAlongNormal));
    const tangentLength = tangent.length();
    if (tangentLength > 0.0001) {
      const tangentNorm = Vec2.div(tangent, tangentLength);
      const jt = -Vec2.dot(relativeVelocity, tangentNorm) / totalInvMass;
      
      const mu = (bodyA.friction + bodyB.friction) / 2;
      const frictionImpulse = Math.abs(jt) < j * mu
        ? Vec2.mul(tangentNorm, jt)
        : Vec2.mul(tangentNorm, -j * mu);

      if (!bodyA.isStatic) {
        bodyA.velocity.sub(Vec2.mul(frictionImpulse, bodyA.invMass));
      }
      if (!bodyB.isStatic) {
        bodyB.velocity.add(Vec2.mul(frictionImpulse, bodyB.invMass));
      }
    }
  }
}
