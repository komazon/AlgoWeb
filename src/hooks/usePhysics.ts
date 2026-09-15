import { useRef, useCallback, useState, useEffect } from 'react';
import Matter from 'matter-js';
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
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const bodyDataRef = useRef<Map<string, PhysicsBody>>(new Map());
  const [selectedTool, setSelectedTool] = useState<ToolType>('circle');
  const [isRunning, setIsRunning] = useState(true);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedToolRef = useRef<ToolType>('circle');
  const syncIntervalRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

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
    if (!engineRef.current) return;
    const body = bodiesRef.current.get(id);
    if (body) {
      try {
        Matter.Composite.remove(engineRef.current.world, body);
      } catch (e) {
        console.warn('Body removal error:', e);
      }
      bodiesRef.current.delete(id);
      bodyDataRef.current.delete(id);
    }
  }, []);

  const init = useCallback(() => {
    if (!canvasRef.current || isInitializedRef.current) return;
    
    try {
      isInitializedRef.current = true;

      const engine = Matter.Engine.create({
        gravity: { x: 0, y: 1, scale: 0.001 },
      });

      const parent = canvasRef.current.parentElement;
      const w = parent?.clientWidth || 800;
      const h = parent?.clientHeight || 600;

      const render = Matter.Render.create({
        canvas: canvasRef.current,
        engine: engine,
        options: {
          width: w,
          height: h,
          wireframes: false,
          background: '#1a1a2e',
          pixelRatio: window.devicePixelRatio || 1,
        },
      });

      // 地面と壁を追加
      const walls = [
        Matter.Bodies.rectangle(w / 2, h + 25, w + 100, 50, {
          isStatic: true,
          render: { fillStyle: '#16213e' },
          label: 'wall',
        }),
        Matter.Bodies.rectangle(-25, h / 2, 50, h + 100, {
          isStatic: true,
          render: { fillStyle: '#16213e' },
          label: 'wall',
        }),
        Matter.Bodies.rectangle(w + 25, h / 2, 50, h + 100, {
          isStatic: true,
          render: { fillStyle: '#16213e' },
          label: 'wall',
        }),
      ];

      Matter.Composite.add(engine.world, walls);

      const runner = Matter.Runner.create();
      Matter.Runner.run(runner, engine);
      Matter.Render.run(render);

      // マウスイベント
      const mouse = Matter.Mouse.create(render.canvas);
      const mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
          stiffness: 0.2,
          render: { visible: false },
        },
      });

      Matter.Composite.add(engine.world, mouseConstraint);
      render.mouse = mouse;

      Matter.Events.on(mouseConstraint, 'mousedown', (event: any) => {
        const { x, y } = event.mouse.position;
        const tool = selectedToolRef.current;
        
        if (tool === 'select' || tool === 'drag' || tool === 'pan') {
          return;
        }
        
        if (tool === 'eraser') {
          const bodies = Matter.Query.point(Array.from(bodiesRef.current.values()), { x, y });
          bodies.forEach(body => {
            if (body.label !== 'wall') {
              removeBody(body.label);
            }
          });
          return;
        }

        dragStartRef.current = { x, y };
      });

      Matter.Events.on(mouseConstraint, 'mouseup', (event: any) => {
        if (!dragStartRef.current) return;
        
        const { x, y } = event.mouse.position;
        const startX = dragStartRef.current.x;
        const startY = dragStartRef.current.y;
        dragStartRef.current = null;

        const tool = selectedToolRef.current;
        if (tool === 'select' || tool === 'drag' || tool === 'eraser' || tool === 'pan') return;

        const dx = x - startX;
        const dy = y - startY;
        const centerX = (startX + x) / 2;
        const centerY = (startY + y) / 2;

        let body: Matter.Body;
        const color = getRandomColor();
        const id = 'body_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        if (tool === 'circle') {
          const radius = Math.max(15, Math.sqrt(dx * dx + dy * dy));
          body = Matter.Bodies.circle(centerX, centerY, radius, {
            render: { fillStyle: color },
            restitution: 0.7,
            friction: 0.1,
            label: id,
          });
          
          bodyDataRef.current.set(id, {
            id,
            type: 'circle',
            x: centerX,
            y: centerY,
            angle: 0,
            vx: 0,
            vy: 0,
            angularVelocity: 0,
            radius,
            color,
            ownerId: '',
            isStatic: false,
            restitution: 0.7,
            friction: 0.1,
            density: 0.001,
          });
        } else if (tool === 'rectangle') {
          const width = Math.max(30, Math.abs(dx));
          const height = Math.max(30, Math.abs(dy));
          body = Matter.Bodies.rectangle(centerX, centerY, width, height, {
            render: { fillStyle: color },
            restitution: 0.5,
            friction: 0.1,
            label: id,
          });
          
          bodyDataRef.current.set(id, {
            id,
            type: 'rectangle',
            x: centerX,
            y: centerY,
            angle: 0,
            vx: 0,
            vy: 0,
            angularVelocity: 0,
            width,
            height,
            color,
            ownerId: '',
            isStatic: false,
            restitution: 0.5,
            friction: 0.1,
            density: 0.001,
          });
        } else {
          return;
        }

        Matter.Composite.add(engine.world, body);
        bodiesRef.current.set(id, body);
        
        const bodyData = bodyDataRef.current.get(id);
        if (bodyData) {
          onBodyCreatedRef.current?.(bodyData);
        }
      });

      engineRef.current = engine;
      renderRef.current = render;
      runnerRef.current = runner;

      // 定期的な状態同期
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      syncIntervalRef.current = window.setInterval(() => {
        const states: PhysicsBody[] = [];
        bodyDataRef.current.forEach((data, id) => {
          const body = bodiesRef.current.get(id);
          if (body) {
            states.push({
              ...data,
              x: body.position.x,
              y: body.position.y,
              angle: body.angle,
              vx: body.velocity.x,
              vy: body.velocity.y,
              angularVelocity: body.angularVelocity,
            });
          }
        });
        onSyncRef.current?.(states);
      }, 100);

    } catch (error) {
      console.error('Physics initialization error:', error);
      isInitializedRef.current = false;
    }
  }, [canvasRef, removeBody]);

  const cleanup = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    
    if (renderRef.current) {
      try {
        (Matter.Render as any).stop(renderRef.current);
      } catch (e) {
        console.warn('Render stop error:', e);
      }
      renderRef.current = null;
    }
    
    if (runnerRef.current) {
      try {
        (Matter.Runner as any).stop(runnerRef.current);
      } catch (e) {
        console.warn('Runner stop error:', e);
      }
      runnerRef.current = null;
    }
    
    if (engineRef.current) {
      try {
        Matter.Engine.clear(engineRef.current);
      } catch (e) {
        console.warn('Engine clear error:', e);
      }
      engineRef.current = null;
    }
    
    bodiesRef.current.clear();
    bodyDataRef.current.clear();
    isInitializedRef.current = false;
  }, []);

  const addBody = useCallback((data: PhysicsBody) => {
    if (!engineRef.current) return;
    if (bodiesRef.current.has(data.id)) return;

    try {
      let body: Matter.Body;

      if (data.type === 'circle' && data.radius) {
        body = Matter.Bodies.circle(data.x, data.y, data.radius, {
          render: { fillStyle: data.color },
          restitution: data.restitution,
          friction: data.friction,
          density: data.density,
          isStatic: data.isStatic,
          label: data.id,
        });
      } else if (data.type === 'rectangle' && data.width && data.height) {
        body = Matter.Bodies.rectangle(data.x, data.y, data.width, data.height, {
          render: { fillStyle: data.color },
          restitution: data.restitution,
          friction: data.friction,
          density: data.density,
          isStatic: data.isStatic,
          angle: data.angle,
          label: data.id,
        });
      } else {
        return;
      }

      Matter.Body.setVelocity(body, { x: data.vx, y: data.vy });
      Matter.Body.setAngularVelocity(body, data.angularVelocity);

      Matter.Composite.add(engineRef.current.world, body);
      bodiesRef.current.set(data.id, body);
      bodyDataRef.current.set(data.id, data);
    } catch (error) {
      console.error('Add body error:', error);
    }
  }, []);

  const updateBodies = useCallback((states: PhysicsBody[]) => {
    states.forEach(state => {
      const body = bodiesRef.current.get(state.id);
      if (body) {
        try {
          Matter.Body.setPosition(body, { x: state.x, y: state.y });
          Matter.Body.setAngle(body, state.angle);
          Matter.Body.setVelocity(body, { x: state.vx, y: state.vy });
          Matter.Body.setAngularVelocity(body, state.angularVelocity);
        } catch (e) {
          // ignore update errors
        }
      }
    });
  }, []);

  const clearAll = useCallback(() => {
    if (!engineRef.current) return;
    bodiesRef.current.forEach((body) => {
      try {
        Matter.Composite.remove(engineRef.current!.world, body);
      } catch (e) {
        // ignore
      }
    });
    bodiesRef.current.clear();
    bodyDataRef.current.clear();
  }, []);

  const toggleGravity = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.gravity.y = engineRef.current.gravity.y === 0 ? 1 : 0;
  }, []);

  const resize = useCallback(() => {
    if (!renderRef.current || !canvasRef.current) return;
    const parent = canvasRef.current.parentElement;
    if (!parent) return;
    
    renderRef.current.canvas.width = parent.clientWidth;
    renderRef.current.canvas.height = parent.clientHeight;
    renderRef.current.options.width = parent.clientWidth;
    renderRef.current.options.height = parent.clientHeight;
  }, [canvasRef]);

  const getAllBodies = useCallback((): PhysicsBody[] => {
    const states: PhysicsBody[] = [];
    bodyDataRef.current.forEach((data, id) => {
      const body = bodiesRef.current.get(id);
      if (body) {
        states.push({
          ...data,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          vx: body.velocity.x,
          vy: body.velocity.y,
          angularVelocity: body.angularVelocity,
        });
      }
    });
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
