import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { SyncMessage, Player } from '../types';

interface UsePeerOptions {
  playerName: string;
  onMessage: (msg: SyncMessage, fromId: string) => void;
  onPlayerJoin: (player: Player) => void;
  onPlayerLeave: (playerId: string) => void;
}

export function usePeer(options: UsePeerOptions) {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [localPlayerId, setLocalPlayerId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const localPlayerIdRef = useRef('');
  const playerNameRef = useRef('');

  useEffect(() => {
    playerNameRef.current = options.playerName;
  }, [options.playerName]);

  const sendMessage = useCallback((msg: SyncMessage, targetId?: string) => {
    if (targetId) {
      const conn = connectionsRef.current.get(targetId);
      if (conn && conn.open) {
        conn.send(msg);
      }
    }
  }, []);

  const broadcastToAll = useCallback((msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch (e) {
          console.error('送信エラー:', e);
        }
      }
    });
  }, []);

  const setupConnection = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      connectionsRef.current.set(conn.peer, conn);
      
      // 自分の情報を送る
      const joinMsg: SyncMessage = {
        type: 'player_join',
        payload: {
          id: localPlayerIdRef.current,
          name: playerNameRef.current,
          team: 'blue',
        },
        senderId: localPlayerIdRef.current,
        timestamp: Date.now(),
      };
      
      try {
        conn.send(joinMsg);
      } catch (e) {
        console.error('joinメッセージ送信エラー:', e);
      }
      
      setIsConnected(true);
    });

    conn.on('data', (data: unknown) => {
      const msg = data as SyncMessage;
      
      if (msg.type === 'player_join') {
        const player: Player = {
          id: msg.payload.id || msg.senderId,
          name: msg.payload.name,
          team: msg.payload.team || 'blue',
          ping: 0,
          isHost: false,
        };
        
        setPlayers(prev => {
          const exists = prev.find(p => p.id === player.id);
          if (exists) return prev;
          return [...prev, player];
        });
        
        optionsRef.current.onPlayerJoin(player);
      }
      
      if (msg.type === 'ping') {
        const pong: SyncMessage = {
          type: 'pong',
          payload: { originalTimestamp: msg.payload.timestamp },
          senderId: localPlayerIdRef.current,
          timestamp: Date.now(),
        };
        try {
          conn.send(pong);
        } catch (e) {
          // ignore
        }
      }
      
      if (msg.type === 'pong') {
        const ping = Date.now() - msg.payload.originalTimestamp;
        setPlayers(prev => prev.map(p => 
          p.id === msg.senderId ? { ...p, ping } : p
        ));
      }
      
      optionsRef.current.onMessage(msg, msg.senderId);
    });

    conn.on('close', () => {
      connectionsRef.current.delete(conn.peer);
      setPlayers(prev => prev.filter(p => p.id !== conn.peer));
      optionsRef.current.onPlayerLeave(conn.peer);
      
      if (connectionsRef.current.size === 0 && !peerRef.current) {
        setIsConnected(false);
      }
    });

    conn.on('error', (err) => {
      console.error('接続エラー:', err);
      connectionsRef.current.delete(conn.peer);
    });
  }, []);

  const host = useCallback(() => {
    setError(null);
    const id = 'algodoo-' + Math.random().toString(36).substring(2, 8);
    
    const peer = new Peer(id, {
      debug: 1,
    });

    peer.on('open', (peerId) => {
      localPlayerIdRef.current = peerId;
      setLocalPlayerId(peerId);
      setRoomId(id);
      setIsHost(true);
      setIsConnected(true);
      setError(null);

      const hostPlayer: Player = {
        id: peerId,
        name: playerNameRef.current,
        team: 'red',
        ping: 0,
        isHost: true,
      };
      setPlayers([hostPlayer]);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('ピアエラー:', err);
      setError(`接続エラー: ${err.type}`);
    });

    peer.on('disconnected', () => {
      console.log('ピアサーバーから切断されました');
    });

    peerRef.current = peer;
  }, [setupConnection]);

  const join = useCallback((targetRoomId: string) => {
    setError(null);
    
    const peer = new Peer({
      debug: 1,
    });

    peer.on('open', (peerId) => {
      localPlayerIdRef.current = peerId;
      setLocalPlayerId(peerId);
      setRoomId(targetRoomId);
      setIsHost(false);
      setError(null);

      const conn = peer.connect(targetRoomId, { reliable: true, serialization: 'json' });
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('ピアエラー:', err);
      if (err.type === 'peer-unavailable') {
        setError('ルームが見つかりません。IDを確認してください。');
      } else {
        setError(`接続エラー: ${err.type}`);
      }
    });

    peer.on('disconnected', () => {
      console.log('ピアサーバーから切断されました');
    });

    peerRef.current = peer;
  }, [setupConnection]);

  const disconnect = useCallback(() => {
    connectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch (e) { /* ignore */ }
    });
    connectionsRef.current.clear();
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
      peerRef.current = null;
    }
    setIsConnected(false);
    setIsHost(false);
    setPlayers([]);
    setRoomId('');
    localPlayerIdRef.current = '';
  }, []);

  // ピング送信
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      const pingMsg: SyncMessage = {
        type: 'ping',
        payload: { timestamp: Date.now() },
        senderId: localPlayerIdRef.current,
        timestamp: Date.now(),
      };
      broadcastToAll(pingMsg);
    }, 3000);

    return () => clearInterval(interval);
  }, [isConnected, broadcastToAll]);

  useEffect(() => {
    return () => {
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  return {
    isHost,
    isConnected,
    roomId,
    localPlayerId,
    players,
    error,
    host,
    join,
    disconnect,
    sendMessage,
    broadcastToAll,
    setPlayers,
  };
}
