export interface Player {
  id: string;
  name: string;
  team: 'red' | 'blue';
  ping: number;
  isHost: boolean;
}

export interface PhysicsBody {
  id: string;
  type: 'circle' | 'rectangle' | 'polygon';
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  angularVelocity: number;
  radius?: number;
  width?: number;
  height?: number;
  color: string;
  ownerId: string;
  isStatic: boolean;
  restitution: number;
  friction: number;
  density: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface SyncMessage {
  type: 'body_add' | 'body_remove' | 'body_update' | 'chat' | 'player_join' | 'player_leave' | 'scene_sync' | 'ping' | 'pong';
  payload: any;
  senderId: string;
  timestamp: number;
}

export type ToolType = 'select' | 'circle' | 'rectangle' | 'polygon' | 'eraser' | 'drag' | 'pan';

export interface GameState {
  isHost: boolean;
  isConnected: boolean;
  players: Player[];
  localPlayer: Player | null;
  roomId: string;
}
