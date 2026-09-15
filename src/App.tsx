import { useState, useRef, useEffect, useCallback } from 'react';
import { usePeer } from './hooks/usePeer';
import { usePhysics } from './hooks/usePhysics';
import { SyncMessage, PhysicsBody, ChatMessage, Player, ToolType } from './types';
import { 
  loadPhz, 
  loadPhn, 
  savePhz, 
  savePhn, 
  physicsBodiesToScene, 
  sceneToPhysicsBodies 
} from './utils/algodooFile';

function App() {
  const [screen, setScreen] = useState<'lobby' | 'game'>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
        physics.init();
      }, 50);
      
      return () => {
        clearTimeout(timer);
        physics.cleanup();
      };
    }
  }, [screen, physics]);

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

  // ファイル読み込み処理（共通）
  const importFile = async (file: File) => {
    try {
      let scene;
      const extension = file.name.toLowerCase().split('.').pop();
      
      if (extension === 'phz') {
        scene = await loadPhz(file);
      } else if (extension === 'phn') {
        scene = await loadPhn(file);
      } else {
        throw new Error('サポートされていないファイル形式です。.phzまたは.phnファイルを選択してください。');
      }

      physics.clearAll();
      const bodies = sceneToPhysicsBodies(scene);
      bodies.forEach(body => physics.addBody(body));

      setLoadedFileName(file.name);

      if (peer.isConnected) {
        const msg: SyncMessage = {
          type: 'scene_sync',
          payload: { bodies },
          senderId: peer.localPlayerId,
          timestamp: Date.now(),
        };
        peer.broadcastToAll(msg);
      }

      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        senderId: 'system',
        senderName: 'システム',
        text: `📂 読み込み: ${file.name}（${bodies.length}個のオブジェクト）`,
        timestamp: Date.now(),
      }]);
    } catch (error) {
      console.error('ファイル読み込みエラー:', error);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        senderId: 'system',
        senderName: 'システム',
        text: `❌ エラー: ${error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました'}`,
        timestamp: Date.now(),
      }]);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importFile(file);
    event.target.value = '';
  };

  // ドラッグ&ドロップハンドラー
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const extension = file.name.toLowerCase().split('.').pop();
      if (extension === 'phz' || extension === 'phn') {
        await importFile(file);
      } else {
        setChatMessages(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          senderId: 'system',
          senderName: 'システム',
          text: '❌ .phzまたは.phnファイルのみ対応しています',
          timestamp: Date.now(),
        }]);
      }
    }
  };

  // ファイル名を生成
  const generateExportFilename = (extension: string): string => {
    if (loadedFileName) {
      const baseName = loadedFileName.replace(/\.(phz|phn)$/i, '');
      return `${baseName}.${extension}`;
    }
    return `scene_${Date.now()}.${extension}`;
  };

  const handleExportPhz = async () => {
    try {
      const bodies = physics.getAllBodies();
      const scene = physicsBodiesToScene(bodies);
      const filename = generateExportFilename('phz');
      await savePhz(scene, filename);

      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        senderId: 'system',
        senderName: 'システム',
        text: `💾 保存: ${filename}（${bodies.length}個のオブジェクト）`,
        timestamp: Date.now(),
      }]);
      setShowExportMenu(false);
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        senderId: 'system',
        senderName: 'システム',
        text: `❌ エラー: ファイルの保存に失敗しました`,
        timestamp: Date.now(),
      }]);
    }
  };

  const handleExportPhn = async () => {
    try {
      const bodies = physics.getAllBodies();
      const scene = physicsBodiesToScene(bodies);
      const filename = generateExportFilename('phn');
      await savePhn(scene, filename);

      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        senderId: 'system',
        senderName: 'システム',
        text: `💾 保存: ${filename}（${bodies.length}個のオブジェクト）`,
        timestamp: Date.now(),
      }]);
      setShowExportMenu(false);
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        senderId: 'system',
        senderName: 'システム',
        text: `❌ エラー: ファイルの保存に失敗しました`,
        timestamp: Date.now(),
      }]);
    }
  };

  // ロビー画面
  if (screen === 'lobby') {
    return (
      <div className="lobby-container">
        <div className="window lobby-window">
          <div className="title-bar">
            <div className="title-bar-text">🎮 Algodoo マルチプレイヤー</div>
            <div className="title-bar-controls">
              <button aria-label="Minimize"></button>
              <button aria-label="Maximize"></button>
              <button aria-label="Close"></button>
            </div>
          </div>
          <div className="window-body">
            <fieldset>
              <legend>プレイヤー設定</legend>
              <div className="form-group">
                <label htmlFor="playerName">プレイヤー名:</label>
                <input
                  type="text"
                  id="playerName"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="名前を入力..."
                  maxLength={20}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend>接続方法</legend>
              <div className="button-group">
                <button onClick={handleHost} disabled={!playerName.trim()}>
                  🏠 ホスト（部屋を作る）
                </button>
              </div>
              
              <div className="separator"></div>
              
              <div className="form-group">
                <label htmlFor="roomId">ルームID:</label>
                <input
                  type="text"
                  id="roomId"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  placeholder="ルームIDを入力..."
                />
              </div>
              
              <div className="button-group">
                <button onClick={handleJoin} disabled={!playerName.trim() || !roomIdInput.trim()}>
                  🔗 部屋に参加
                </button>
              </div>
            </fieldset>

            <div className="info-box">
              <strong>📖 遊び方:</strong>
              <ul>
                <li>ホストが部屋を作成し、ルームIDを共有</li>
                <li>他のプレイヤーがIDを入力して参加</li>
                <li>キャンバスに図形を描いて物理演算を楽しむ</li>
                <li>P2P接続で全プレイヤーの画面がリアルタイム同期</li>
              </ul>
            </div>

            {peer.error && (
              <div className="error-message">
                ⚠️ {peer.error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ゲーム画面
  return (
    <div className="app-container">
      {/* タイトルバー */}
      <div className="title-bar">
        <div className="title-bar-text">
          🎮 Algodoo MP - {playerName}
          {peer.roomId && (
            <span style={{ marginLeft: '8px', fontSize: '10px' }}>
              Room: {peer.roomId}
              <button 
                onClick={handleCopyRoomId}
                style={{ marginLeft: '4px', width: 'auto', height: 'auto', padding: '0 4px' }}
              >
                {copied ? '✓' : '📋'}
              </button>
            </span>
          )}
        </div>
        <div className="title-bar-controls">
          <button onClick={handleDisconnect} aria-label="Close">✕</button>
        </div>
      </div>

      {/* メインエリア */}
      <div className="window-body">
        {/* ツールバー */}
        <div className="toolbar">
          <button
            className={physics.selectedTool === 'circle' ? 'active' : ''}
            onClick={() => physics.setSelectedTool('circle')}
            title="円を作成"
          >
            ⭕
          </button>
          <button
            className={physics.selectedTool === 'rectangle' ? 'active' : ''}
            onClick={() => physics.setSelectedTool('rectangle')}
            title="四角形を作成"
          >
            ⬜
          </button>
          <button
            className={physics.selectedTool === 'select' ? 'active' : ''}
            onClick={() => physics.setSelectedTool('select')}
            title="選択/移動"
          >
            ✋
          </button>
          <button
            className={physics.selectedTool === 'eraser' ? 'active' : ''}
            onClick={() => physics.setSelectedTool('eraser')}
            title="消しゴム"
          >
            🗑️
          </button>
          
          <div className="separator" style={{ width: '100%', height: '2px', margin: '4px 0' }}></div>
          
          <button onClick={() => physics.toggleGravity()} title="重力切替">
            🌍
          </button>
          <button onClick={handleClearAll} title="全消去">
            🧹
          </button>
          <button onClick={handleSendScene} title="シーン同期">
            📤
          </button>
          <button onClick={() => fileInputRef.current?.click()} title="ファイル読込">
            📂
          </button>
          <div className="toolbar-button-wrapper">
            <button onClick={() => setShowExportMenu(!showExportMenu)} title="ファイル保存">
              💾
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={handleExportPhz}>.phz で保存</button>
                <button onClick={handleExportPhn}>.phn で保存</button>
              </div>
            )}
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".phz,.phn"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>

        {/* キャンバス */}
        <div 
          className="canvas-container"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <canvas ref={canvasRef} />
          
          {/* ドラッグ&ドロップオーバーレイ */}
          {isDragging && (
            <div className="drop-overlay">
              <div className="icon">📂</div>
              <div>Algodooシーンをドロップ</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>.phz または .phn ファイル</div>
            </div>
          )}
          
          {/* ツールチップ */}
          <div className="tooltip">
            {physics.selectedTool === 'circle' && '⭕ ドラッグして円を作成'}
            {physics.selectedTool === 'rectangle' && '⬜ ドラッグして矩形を作成'}
            {physics.selectedTool === 'select' && '✋ オブジェクトを掴んで移動'}
            {physics.selectedTool === 'eraser' && '🗑️ クリックで削除'}
          </div>

          {/* ファイル名表示 */}
          {loadedFileName && (
            <div className="filename-display">
              📄 {loadedFileName}
            </div>
          )}

          {/* 接続状態表示 */}
          {!peer.isConnected && (
            <div className="connection-status">
              ⏳ 接続待機中... {peer.isHost ? '（プレイヤーの参加を待っています）' : '（ホストに接続中...）'}
            </div>
          )}
        </div>

        {/* サイドパネル */}
        <div className="side-panel">
          <fieldset>
            <legend>👥 プレイヤー ({peer.players.length + 1})</legend>
            <div className="player-list">
              <div className="player-item">
                <div className="player-dot self"></div>
                <div className="player-name">{playerName}</div>
                <div className="player-ping">自分</div>
              </div>
              {peer.players.map(player => (
                <div key={player.id} className="player-item">
                  <div className="player-dot other"></div>
                  <div className="player-name">{player.name}</div>
                  <div className="player-ping">{player.ping}ms</div>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <legend>💬 チャット</legend>
            <div className="chat-container">
              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <div style={{ color: '#808080', textAlign: 'center', padding: '8px' }}>
                    メッセージはまだありません
                  </div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`chat-message ${msg.senderId === 'system' ? 'system' : ''}`}>
                    {msg.senderId === 'system' ? (
                      <span>{msg.text}</span>
                    ) : (
                      <>
                        <span className={`sender ${msg.senderId === peer.localPlayerId ? 'self' : 'other'}`}>
                          {msg.senderName}:
                        </span>{' '}
                        <span>{msg.text}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="chat-input-container">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="メッセージ..."
                  maxLength={200}
                />
                <button onClick={handleSendChat} disabled={!chatInput.trim()}>
                  送信
                </button>
              </div>
            </div>
          </fieldset>
        </div>
      </div>

      {/* ステータスバー */}
      <div className="status-bar">
        <div className="status-bar-field">
          <span className={`player-dot ${peer.isConnected ? 'self' : 'other'}`} style={{ width: '6px', height: '6px' }}></span>
          <span>{peer.isConnected ? (peer.isHost ? 'ホスト' : 'クライアント') : '未接続'}</span>
        </div>
        <div className="status-bar-field">
          <span>🔗 P2P接続 (WebRTC)</span>
        </div>
        <div className="status-bar-field">
          <span>⚡ Matter.js</span>
        </div>
      </div>
    </div>
  );
}

export default App;
