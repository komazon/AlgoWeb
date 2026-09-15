import { useState, useRef, useEffect, useCallback } from 'react';
import { usePeer } from './hooks/usePeer';
import { usePhysics } from './hooks/usePhysics';
import { SyncMessage, PhysicsBody, ChatMessage, Player, ToolType } from './types';

function App() {
  const [screen, setScreen] = useState<'lobby' | 'game'>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const physics = usePhysics(canvasRef);
  
  const handleMessage = useCallback((msg: SyncMessage, _fromId: string) => {
    switch (msg.type) {
      case 'body_add':
        physics.addBody(msg.payload);
        break;
      case 'body_remove':
        physics.removeBody(msg.payload.id);
        break;
      case 'body_update':
        physics.updateBodies(msg.payload);
        break;
      case 'chat':
        setChatMessages(prev => [...prev.slice(-50), {
          id: Date.now().toString() + Math.random(),
          senderId: msg.senderId,
          senderName: msg.payload.name,
          text: msg.payload.text,
          timestamp: msg.timestamp,
        }]);
        break;
      case 'scene_sync':
        if (msg.payload.bodies) {
          physics.clearAll();
          msg.payload.bodies.forEach((body: PhysicsBody) => {
            physics.addBody(body);
          });
        }
        break;
    }
  }, [physics]);

  const handlePlayerJoin = useCallback((player: Player) => {
    setChatMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      senderId: 'system',
      senderName: 'システム',
      text: `${player.name}さんが入室しました`,
      timestamp: Date.now(),
    }]);
  }, []);

  const handlePlayerLeave = useCallback((_playerId: string) => {
    setChatMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      senderId: 'system',
      senderName: 'システム',
      text: `プレイヤーが退室しました`,
      timestamp: Date.now(),
    }]);
  }, []);

  const peer = usePeer({
    playerName,
    onMessage: handleMessage,
    onPlayerJoin: handlePlayerJoin,
    onPlayerLeave: handlePlayerLeave,
  });

  // 物理エンジンの初期化
  useEffect(() => {
    if (screen === 'game') {
      const timer = setTimeout(() => {
        const cleanup = physics.init();
        return cleanup;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [screen]);

  // 物体作成時のコールバック
  useEffect(() => {
    if (screen !== 'game') return;
    
    physics.setOnBodyCreated((body: PhysicsBody) => {
      if (peer.isConnected) {
        const msg: SyncMessage = {
          type: 'body_add',
          payload: body,
          senderId: peer.localPlayerId,
          timestamp: Date.now(),
        };
        peer.broadcastToAll(msg);
      }
    });

    physics.setOnSync((states: PhysicsBody[]) => {
      if (peer.isConnected && peer.isHost && states.length > 0) {
        const msg: SyncMessage = {
          type: 'body_update',
          payload: states,
          senderId: peer.localPlayerId,
          timestamp: Date.now(),
        };
        peer.broadcastToAll(msg);
      }
    });
  }, [screen, peer.isConnected, peer.isHost, peer.localPlayerId, physics]);

  // ウィンドウリサイズ
  useEffect(() => {
    const handleResize = () => {
      if (screen === 'game') {
        physics.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [physics, screen]);

  const handleHost = () => {
    if (!playerName.trim()) return;
    peer.host();
    setScreen('game');
  };

  const handleJoin = () => {
    if (!playerName.trim() || !roomIdInput.trim()) return;
    peer.join(roomIdInput.trim());
    setScreen('game');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const msg: SyncMessage = {
      type: 'chat',
      payload: { name: playerName, text: chatInput },
      senderId: peer.localPlayerId,
      timestamp: Date.now(),
    };
    peer.broadcastToAll(msg);
    
    setChatMessages(prev => [...prev.slice(-50), {
      id: Date.now().toString() + Math.random(),
      senderId: peer.localPlayerId,
      senderName: playerName,
      text: chatInput,
      timestamp: Date.now(),
    }]);
    setChatInput('');
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(peer.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    peer.disconnect();
    physics.clearAll();
    setScreen('lobby');
    setChatMessages([]);
  };

  const handleClearAll = () => {
    physics.clearAll();
    if (peer.isConnected) {
      const msg: SyncMessage = {
        type: 'scene_sync',
        payload: { bodies: [] },
        senderId: peer.localPlayerId,
        timestamp: Date.now(),
      };
      peer.broadcastToAll(msg);
    }
  };

  const handleSendScene = () => {
    if (!peer.isConnected) return;
    const bodies = physics.getAllBodies();
    const msg: SyncMessage = {
      type: 'scene_sync',
      payload: { bodies },
      senderId: peer.localPlayerId,
      timestamp: Date.now(),
    };
    peer.broadcastToAll(msg);
    
    setChatMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      senderId: 'system',
      senderName: 'システム',
      text: `シーンを同期しました（${bodies.length}個のオブジェクト）`,
      timestamp: Date.now(),
    }]);
  };

  // ロビー画面
  if (screen === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-20 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-green-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
        
        <div className="relative bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-700/50">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🎮</div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Algodoo マルチプレイヤー
            </h1>
            <p className="text-slate-400 text-sm">
              2D物理シミュレーション × P2Pリアルタイム対戦
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/30">WebRTC</span>
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30">P2P接続</span>
              <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">物理演算</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                👤 プレイヤー名
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="名前を入力..."
                maxLength={20}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              onClick={handleHost}
              disabled={!playerName.trim()}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/30"
            >
              🏠 ホスト（部屋を作る）
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 text-slate-500 bg-slate-800/90">接続する</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                🔑 ルームID
              </label>
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="ルームIDを入力..."
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              onClick={handleJoin}
              disabled={!playerName.trim() || !roomIdInput.trim()}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
            >
              🔗 部屋に参加
            </button>
          </div>

          <div className="mt-6 p-4 bg-slate-700/30 rounded-xl border border-slate-600/30">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">📖 遊び方</h3>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-green-400">1.</span>
                <span>ホストが部屋を作成し、ルームIDを共有</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400">2.</span>
                <span>他のプレイヤーがIDを入力して参加</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">3.</span>
                <span>キャンバスに図形を描いて物理演算を楽しむ</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">4.</span>
                <span>P2P接続で全プレイヤーの画面がリアルタイム同期</span>
              </li>
            </ul>
          </div>

          {peer.error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>{peer.error}</span>
            </div>
          )}

          <div className="mt-4 text-center">
            <p className="text-xs text-slate-500">
              オリジナル: Ivan1248/Algodoo-Multiplayer をベースにWeb版として再構築
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ゲーム画面
  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      {/* ヘッダー */}
      <header className="bg-slate-800/95 backdrop-blur border-b border-slate-700 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-white flex items-center gap-1.5">
            <span>🎮</span>
            <span className="hidden sm:inline">Algodoo MP</span>
          </h1>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-700/50 rounded-full">
            <span className={`w-2 h-2 rounded-full ${peer.isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
            <span className="text-xs text-slate-400">
              {peer.isConnected ? (peer.isHost ? 'ホスト' : 'クライアント') : '未接続'}
            </span>
          </div>
          {peer.roomId && (
            <div className="hidden md:flex items-center gap-1.5">
              <code className="text-xs bg-slate-700 px-2 py-0.5 rounded text-purple-300 font-mono">
                {peer.roomId}
              </code>
              <button
                onClick={handleCopyRoomId}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-1"
                title="ルームIDをコピー"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300 hidden sm:inline">👤 {playerName}</span>
          <button
            onClick={handleDisconnect}
            className="px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white text-xs rounded-md transition-colors"
          >
            切断
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ツールバー */}
        <div className="w-12 bg-slate-800/95 border-r border-slate-700 flex flex-col items-center py-2 gap-1.5 shrink-0">
          <ToolButton
            icon="⭕"
            label="円を作成"
            active={physics.selectedTool === 'circle'}
            onClick={() => physics.setSelectedTool('circle')}
          />
          <ToolButton
            icon="⬜"
            label="四角形を作成"
            active={physics.selectedTool === 'rectangle'}
            onClick={() => physics.setSelectedTool('rectangle')}
          />
          <ToolButton
            icon="✋"
            label="選択/移動"
            active={physics.selectedTool === 'select'}
            onClick={() => physics.setSelectedTool('select')}
          />
          <ToolButton
            icon="🗑️"
            label="消しゴム"
            active={physics.selectedTool === 'eraser'}
            onClick={() => physics.setSelectedTool('eraser')}
          />
          
          <div className="border-t border-slate-600/50 w-8 my-1"></div>
          
          <ToolButton
            icon="🌍"
            label="重力切替"
            active={false}
            onClick={() => physics.toggleGravity()}
          />
          <ToolButton
            icon="🧹"
            label="全消去"
            active={false}
            onClick={handleClearAll}
          />
          <ToolButton
            icon="📤"
            label="シーン同期"
            active={false}
            onClick={handleSendScene}
          />
        </div>

        {/* キャンバス */}
        <div className="flex-1 relative bg-slate-900">
          <canvas
            ref={canvasRef}
            className="w-full h-full block cursor-crosshair"
          />
          
          {/* 操作ヒント */}
          <div className="absolute bottom-3 left-3 bg-slate-800/90 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-slate-400 border border-slate-700/50">
            {physics.selectedTool === 'circle' && '⭕ ドラッグして円を作成（距離＝半径）'}
            {physics.selectedTool === 'rectangle' && '⬜ ドラッグして矩形を作成'}
            {physics.selectedTool === 'select' && '✋ オブジェクトを掴んで移動'}
            {physics.selectedTool === 'eraser' && '🗑️ クリックでオブジェクトを削除'}
          </div>

          {/* 接続状態表示 */}
          {!peer.isConnected && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-yellow-900/80 backdrop-blur border border-yellow-700/50 rounded-lg px-4 py-2 text-xs text-yellow-300">
              ⏳ 接続待機中... {peer.isHost ? '（プレイヤーの参加を待っています）' : '（ホストに接続中...）'}
            </div>
          )}
        </div>

        {/* サイドパネル */}
        <div className="w-56 bg-slate-800/95 border-l border-slate-700 flex flex-col shrink-0">
          {/* プレイヤーリスト */}
          <div className="border-b border-slate-700">
            <button
              onClick={() => setShowPlayers(!showPlayers)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-slate-300 hover:bg-slate-700/50 transition-colors"
            >
              <span>👥 プレイヤー ({peer.players.length + 1})</span>
              <span className="text-slate-500">{showPlayers ? '▾' : '▸'}</span>
            </button>
            {showPlayers && (
              <div className="px-3 pb-2 space-y-1 max-h-32 overflow-y-auto">
                <div className="flex items-center gap-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  <span className="text-xs text-white truncate">{playerName}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">自分</span>
                </div>
                {peer.players.map(player => (
                  <div key={player.id} className="flex items-center gap-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span className="text-xs text-slate-300 truncate">{player.name}</span>
                    <span className="text-[10px] text-slate-500 ml-auto">{player.ping}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* チャット */}
          <div className="flex-1 flex flex-col min-h-0">
            <button
              onClick={() => setShowChat(!showChat)}
              className="px-3 py-2 flex items-center justify-between text-xs font-medium text-slate-300 hover:bg-slate-700/50 transition-colors border-b border-slate-700"
            >
              <span>💬 チャット</span>
              <span className="text-slate-500">{showChat ? '▾' : '▸'}</span>
            </button>
            {showChat && (
              <>
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      メッセージはまだありません
                    </p>
                  )}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className="text-xs leading-relaxed">
                      {msg.senderId === 'system' ? (
                        <span className="text-yellow-400/80 italic text-[11px]">{msg.text}</span>
                      ) : (
                        <>
                          <span className={`font-semibold ${msg.senderId === peer.localPlayerId ? 'text-green-400' : 'text-blue-400'}`}>
                            {msg.senderName}
                          </span>
                          <span className="text-slate-500">: </span>
                          <span className="text-slate-300">{msg.text}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-slate-700">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                      placeholder="メッセージ..."
                      maxLength={200}
                      className="flex-1 px-2 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim()}
                      className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs rounded transition-colors"
                    >
                      送信
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* フッター情報 */}
          <div className="border-t border-slate-700 px-3 py-2">
            <div className="text-[10px] text-slate-500 space-y-0.5">
              <p>🔗 P2P接続 (WebRTC)</p>
              <p>⚡ Matter.js 物理エンジン</p>
              <p>🌐 サーバー不要・直接接続</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ツールボタンコンポーネント
function ToolButton({ icon, label, active, onClick }: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm transition-all ${
        active
          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 scale-105'
          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600 hover:text-white'
      }`}
    >
      {icon}
    </button>
  );
}

export default App;
