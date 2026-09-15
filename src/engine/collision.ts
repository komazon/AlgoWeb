import { Vec2 } from './vec2';
import { Body } from './body';

export interface CollisionInfo {
  bodyA: Body;
  bodyB: Body;
  normal: Vec2;
  depth: number;
  contactPoint: Vec2;
}

// AABB衝突判定
export function testAABB(a: Body, b: Body): boolean {
  const aabbA = a.getAABB();
  const aabbB = b.getAABB();
  
  return !(aabbA.max.x < aabbB.min.x ||
           aabbA.min.x > aabbB.max.x ||
           aabbA.max.y < aabbB.min.y ||
           aabbA.min.y > aabbB.max.y);
}

// 円-円衝突判定
export function testCircleCircle(a: Body, b: Body): CollisionInfo | null {
  if (a.type !== 'circle' || b.type !== 'circle') return null;
  
  const diff = Vec2.sub(b.position, a.position);
  const dist = diff.length();
  const sumRadii = a.radius + b.radius;
  
  if (dist > sumRadii) return null;
  
  const normal = dist > 0 ? diff.normalize() : new Vec2(1, 0);
  const depth = sumRadii - dist;
  const contactPoint = Vec2.add(a.position, Vec2.mul(normal, a.radius));
  
  return { bodyA: a, bodyB: b, normal, depth, contactPoint };
}

// 円-矩形衝突判定
export function testCircleRect(circle: Body, rect: Body): CollisionInfo | null {
  if (circle.type !== 'circle' || rect.type !== 'rectangle') return null;
  
  // 矩形のローカル座標に変換
  const localPos = Vec2.rotate(Vec2.sub(circle.position, rect.position), -rect.angle);
  
  // 矩形の範囲内にクランプ
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const closest = new Vec2(
    Math.max(-halfW, Math.min(halfW, localPos.x)),
    Math.max(-halfH, Math.min(halfH, localPos.y))
  );
  
  const diff = Vec2.sub(localPos, closest);
  const dist = diff.length();
  
  if (dist > circle.radius) return null;
  
  // 法線をワールド座標に戻す
  let normal = dist > 0 ? diff.normalize() : new Vec2(0, -1);
  normal = Vec2.rotate(normal, rect.angle);
  
  const depth = circle.radius - dist;
  const contactPoint = Vec2.add(rect.position, Vec2.rotate(closest, rect.angle));
  
  return { bodyA: circle, bodyB: rect, normal, depth, contactPoint };
}

// 矩形-矩形衝突判定（SAT: Separating Axis Theorem）
export function testRectRect(a: Body, b: Body): CollisionInfo | null {
  if (a.type !== 'rectangle' || b.type !== 'rectangle') return null;
  
  const cornersA = a.getCorners();
  const cornersB = b.getCorners();
  
  // 各矩形の軸を取得
  const axes = [
    getEdgeNormal(cornersA[0], cornersA[1]),
    getEdgeNormal(cornersA[1], cornersA[2]),
    getEdgeNormal(cornersB[0], cornersB[1]),
    getEdgeNormal(cornersB[1], cornersB[2])
  ];
  
  let minOverlap = Infinity;
  let smallestAxis = axes[0];
  
  for (const axis of axes) {
    const projA = projectOntoAxis(cornersA, axis);
    const projB = projectOntoAxis(cornersB, axis);
    
    const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);
    
    if (overlap <= 0) return null; // 分離軸が見つかった
    
    if (overlap < minOverlap) {
      minOverlap = overlap;
      smallestAxis = axis;
    }
  }
  
  // 法線の向きを調整（AからBに向かう）
  const d = Vec2.sub(b.position, a.position);
  if (Vec2.dot(d, smallestAxis) < 0) {
    smallestAxis = smallestAxis.negate();
  }
  
  const contactPoint = findContactPoint(cornersA, cornersB);
  
  return { bodyA: a, bodyB: b, normal: smallestAxis, depth: minOverlap, contactPoint };
}

function getEdgeNormal(v1: Vec2, v2: Vec2): Vec2 {
  const edge = Vec2.sub(v2, v1);
  return new Vec2(-edge.y, edge.x).normalize();
}

function projectOntoAxis(corners: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  
  for (const corner of corners) {
    const proj = Vec2.dot(corner, axis);
    min = Math.min(min, proj);
    max = Math.max(max, proj);
  }
  
  return { min, max };
}

function findContactPoint(cornersA: Vec2[], cornersB: Vec2[]): Vec2 {
  // 最も近い頂点のペアを見つける
  let minDist = Infinity;
  let contactPoint = cornersA[0];
  
  for (const ca of cornersA) {
    for (const cb of cornersB) {
      const dist = ca.distance(cb);
      if (dist < minDist) {
        minDist = dist;
        contactPoint = Vec2.mul(Vec2.add(ca, cb), 0.5);
      }
    }
  }
  
  return contactPoint;
}

// 衝突判定のメイン関数
export function detectCollision(a: Body, b: Body): CollisionInfo | null {
  // まずAABBで Broad Phase
  if (!testAABB(a, b)) return null;
  
  // Narrow Phase
  if (a.type === 'circle' && b.type === 'circle') {
    return testCircleCircle(a, b);
  } else if (a.type === 'circle' && b.type === 'rectangle') {
    return testCircleRect(a, b);
  } else if (a.type === 'rectangle' && b.type === 'circle') {
    const result = testCircleRect(b, a);
    if (result) {
      // 法線を反転
      result.normal = result.normal.negate();
      result.bodyA = a;
      result.bodyB = b;
    }
    return result;
  } else if (a.type === 'rectangle' && b.type === 'rectangle') {
    return testRectRect(a, b);
  }
  
  return null;
}
