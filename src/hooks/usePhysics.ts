import { useRef, useCallback, useState, useEffect } from 'react';
import { Vec2 } from '../engine/vec2';
import { World } from '../engine/world';
import { Renderer } from '../engine/renderer';
import { Body } from '../engine/body';
import { PhysicsBody, ToolType } from '../types';

const COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#795548',
  '#607D8B', '#CDDC39', '#FFC107', '#3F51B5',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function usePhysics(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const worldRef = useRef<World | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolType>('circle');
  const [isRunning, setIsRunning] = useState(true);
  const selectedToolRef = useRef<ToolType>('circle');
  const isInitializedRef = useRef(false);
  const lastTimeRef = useRef<number>(0);
  const dragStartRef = useRef<Vec2 | null>(null);
  const mouseRef = useRef<Vec2>(new Vec2(0, 0));
  const isDraggingRef = useRef(false);

  // コールバックrefs
  const onBodyCreatedRef = useRef<((body: PhysicsBody) => void) | null>(null);
  const onSyncRef = useRef<((states: PhysicsBody[]) => void) | null>(null);

  const setOnBodyCreated = useCallback((cb: (body: PhysicsBody) => void) => {
    onBodyCreatedRef.current = cb;
  }, []);

  const setOnSync = useCallback((cb: (states: PhysicsBody[]) => void) => {
    onSyncRef.current = cb;
  }, []);

  const removeBody = useCallback((id: string) => {
    if (!worldRef.current) return;
    worldRef.current.removeBody(id);
  }, []);

  const init = useCallback(() => {
    if (!canvasRef.current || isInitializedRef.current) return;
    
    try {
      isInitializedRef.current = true;

      // ワールドを作成
      const world = new World(new Vec2(0, 980));
      worldRef.current = world;

      // レンダラーを作成
      const renderer = new Renderer(canvasRef.current, world);
      renderer.resize();
      rendererRef.current = renderer;

      // 地面を追加
      const canvas = canvasRef.current;
      world.addBody({
        type: 'rectangle',
        position: new Vec2(canvas.width / 2, canvas.height + 25),
        width: canvas.width + 200,
        height: 50,
        isStatic: true,
        color: '#16213e',
        id: 'ground'
      });

      // 左壁
      world.addBody({
        type: 'rectangle',
        position: new Vec2(-25, canvas.height / 2),
        width: 50,
        height: canvas.height + 200,
        isStatic: true,
        color: '#16213e',
        id: 'wall_left'
      });

      // 右壁
      world.addBody({
        type: 'rectangle',
        position: new Vec2(canvas.width + 25, canvas.height / 2),
        width: 50,
        height: canvas.height + 200,
        isStatic: true,
        color: '#16213e',
        id: 'wall_right'
      });

      // マウスイベント
      const handleMouseDown = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = renderer.screenToWorld(x, y);
        mouseRef.current = worldPos;

        const tool = selectedToolRef.current;
        
        if (tool === 'select') {
          // 選択モード
          isDraggingRef.current = true;
          return;
        }
        
        if (tool === 'eraser') {
          // 消しゴムモード
          for (const body of world.bodies) {
            if (body.id.startsWith('wall') || body.id === 'ground') continue;
            
            const dx = body.position.x - worldPos.x;
            const dy = body.position.y - worldPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const radius = body.type === 'circle' ? body.radius : Math.max(body.width, body.height) / 2;
            if (dist < radius) {
              world.removeBody(body.id);
              break;
            }
          }
          return;
        }

        if (tool === 'circle' || tool === 'rectangle') {
          dragStartRef.current = worldPos;
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mouseRef.current = renderer.screenToWorld(x, y);
      };

      const handleMouseUp = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = renderer.screenToWorld(x, y);

        const tool = selectedToolRef.current;
        
        if (tool === 'select') {
          isDraggingRef.current = false;
          return;
        }

        if (tool === 'circle' && dragStartRef.current) {
          const start = dragStartRef.current;
          const dx = worldPos.x - start.x;
          const dy = worldPos.y - start.y;
          const radius = Math.max(15, Math.sqrt(dx * dx + dy * dy));
          
          const body = world.addBody({
            type: 'circle',
            position: new Vec2(start.x, start.y),
            radius,
            color: getRandomColor(),
            restitution: 0.7,
            friction: 0.3,
            density: 1
          });

          dragStartRef.current = null;

          // コールバック
          if (onBodyCreatedRef.current) {
            onBodyCreatedRef.current({
              id: body.id,
              type: 'circle',
              x: body.position.x,
              y: body.position.y,
              angle: body.angle,
              vx: body.velocity.x,
              vy: body.velocity.y,
              angularVelocity: body.angularVelocity,
              radius: body.radius,
              color: body.color,
              ownerId: '',
              isStatic: body.isStatic,
              restitution: body.restitution,
              friction: body.friction,
              density: body.density
            });
          }
        } else if (tool === 'rectangle' && dragStartRef.current) {
          const start = dragStartRef.current;
          const width = Math.max(30, Math.abs(worldPos.x - start.x));
          const height = Math.max(30, Math.abs(worldPos.y - start.y));
          const centerX = (start.x + worldPos.x) / 2;
          const centerY = (start.y + worldPos.y) / 2;
          
          const body = world.addBody({
            type: 'rectangle',
            position: new Vec2(centerX, centerY),
            width,
            height,
            color: getRandomColor(),
            restitution: 0.5,
            friction: 0.3,
            density: 1
          });

          dragStartRef.current = null;

          // コールバック
          if (onBodyCreatedRef.current) {
            onBodyCreatedRef.current({
              id: body.id,
              type: 'rectangle',
              x: body.position.x,
              y: body.position.y,
              angle: body.angle,
              vx: body.velocity.x,
              vy: body.velocity.y,
              angularVelocity: body.angularVelocity,
              width: body.width,
              height: body.height,
              color: body.color,
              ownerId: '',
              isStatic: body.isStatic,
              restitution: body.restitution,
              friction: body.friction,
              density: body.density
            });
          }
        }
      };

      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);

      // アニメーションループ
      const animate = (time: number) => {
        if (!lastTimeRef.current) lastTimeRef.current = time;
        const dt = Math.min((time - lastTimeRef.current) / 1000, 0.016); // 最大60FPS
        lastTimeRef.current = time;

        if (isRunning) {
          world.step(dt / 3); // サブステップ
          world.step(dt / 3);
          world.step(dt / 3);
        }

        renderer.render();
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);

      // 定期同期
      const syncInterval = setInterval(() => {
        if (onSyncRef.current) {
          const states: PhysicsBody[] = [];
          for (const body of world.bodies) {
            if (body.id.startsWith('wall') || body.id === 'ground') continue;
            
            states.push({
              id: body.id,
              type: body.type,
              x: body.position.x,
              y: body.position.y,
              angle: body.angle,
              vx: body.velocity.x,
              vy: body.velocity.y,
              angularVelocity: body.angularVelocity,
              radius: body.radius,
              width: body.width,
              height: body.height,
              color: body.color,
              ownerId: '',
              isStatic: body.isStatic,
              restitution: body.restitution,
              friction: body.friction,
              density: body.density
            });
          }
          onSyncRef.current(states);
        }
      }, 100);

      return () => {
        clearInterval(syncInterval);
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
      };

    } catch (error) {
      console.error('Physics initialization error:', error);
      isInitializedRef.current = false;
    }
  }, [canvasRef, isRunning]);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (worldRef.current) {
      worldRef.current.clear();
      worldRef.current = null;
    }
    
    rendererRef.current = null;
    isInitializedRef.current = false;
  }, []);

  const addBody = useCallback((data: PhysicsBody) => {
    if (!worldRef.current) return;
    if (worldRef.current.getBody(data.id)) return;

    try {
      // polygonはrectangleとして扱う
      const bodyType = data.type === 'polygon' ? 'rectangle' : data.type;
      
      const body = worldRef.current.addBody({
        type: bodyType,
        position: new Vec2(data.x, data.y),
        radius: data.radius,
        width: data.width,
        height: data.height,
        isStatic: data.isStatic,
        restitution: data.restitution,
        friction: data.friction,
        density: data.density,
        color: data.color,
        id: data.id
      });

      body.velocity.set(data.vx, data.vy);
      body.angularVelocity = data.angularVelocity;
      body.angle = data.angle;
    } catch (error) {
      console.error('Add body error:', error);
    }
  }, []);

  const updateBodies = useCallback((states: PhysicsBody[]) => {
    if (!worldRef.current) return;
    
    for (const state of states) {
      const body = worldRef.current.getBody(state.id);
      if (body) {
        body.position.set(state.x, state.y);
        body.velocity.set(state.vx, state.vy);
        body.angle = state.angle;
        body.angularVelocity = state.angularVelocity;
      }
    }
  }, []);

  const clearAll = useCallback(() => {
    if (!worldRef.current) return;
    
    // 壁と地面以外を削除
    const toRemove = worldRef.current.bodies.filter(b => 
      !b.id.startsWith('wall') && b.id !== 'ground'
    );
    for (const body of toRemove) {
      worldRef.current.removeBody(body.id);
    }
  }, []);

  const toggleGravity = useCallback(() => {
    if (!worldRef.current) return;
    worldRef.current.gravity.y = worldRef.current.gravity.y === 0 ? 980 : 0;
  }, []);

  const resize = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.resize();
    }
  }, []);

  const getAllBodies = useCallback((): PhysicsBody[] => {
    if (!worldRef.current) return [];
    
    const states: PhysicsBody[] = [];
    for (const body of worldRef.current.bodies) {
      if (body.id.startsWith('wall') || body.id === 'ground') continue;
      
      states.push({
        id: body.id,
        type: body.type,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        vx: body.velocity.x,
        vy: body.velocity.y,
        angularVelocity: body.angularVelocity,
        radius: body.radius,
        width: body.width,
        height: body.height,
        color: body.color,
        ownerId: '',
        isStatic: body.isStatic,
        restitution: body.restitution,
        friction: body.friction,
        density: body.density
      });
    }
    return states;
  }, []);

  const handleToolChange = useCallback((tool: ToolType) => {
    selectedToolRef.current = tool;
    setSelectedTool(tool);
  }, []);

  return {
    init,
    cleanup,
    selectedTool,
    setSelectedTool: handleToolChange,
    isRunning,
    setIsRunning,
    addBody,
    removeBody,
    updateBodies,
    clearAll,
    toggleGravity,
    resize,
    getAllBodies,
    setOnBodyCreated,
    setOnSync,
  };
}
