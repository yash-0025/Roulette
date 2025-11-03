"use client"
import { useState, useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';

type GameStatus = 'login' | 'idle' | 'waiting' | 'playing' | 'result';

interface User {
  _id: string;
  username: string;
  balance: number;
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [balance, setBalance] = useState(0); 
  const [status, setStatus] = useState<GameStatus>('login');
  const [gameMessage, setGameMessage] = useState('Find a game');
  const [gameResult, setGameResult] = useState<{ winningColor: string; winnerId: string } | null>(null);
  const [myColor, setMyColor] = useState<string | null>(null);
  const [isWinner, setIsWinner] = useState<boolean | null>(null);
  const [countdown, setCountdown] = useState<number>(5);
  
  const userRef = useRef<User | null>(null);
  const statusRef = useRef<GameStatus>('login');
  
  useEffect(() => {
    userRef.current = user;
    statusRef.current = status;
  }, [user, status]);

  useEffect(() => {
    socket.connect();
    console.log('🔌 Socket connecting...');

    function onConnect() { 
      setIsConnected(true);
      console.log('✅ Connected to server');
    }
    
    function onDisconnect() { 
      setIsConnected(false);
      console.log('❌ Disconnected from server');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  useEffect(() => {
    function onUserData(userData: User) {
      console.log('👤 User data received:', userData);
      setUser(userData);
      setBalance(userData.balance);
      setStatus('idle');
      setGameMessage('Click to find a game');
    }

    function onStatusUpdate(data: { message: string }) {
      console.log('📊 Status update:', data.message);
      setGameMessage(data.message);
      setStatus('waiting');
    }

    function onGameStart(data: { message: string; players: Array<{ userId: string; username: string; color: string }> }) {
      console.log('🎮 Game starting! Full data:', data);
      console.log('🔍 Current user from ref:', userRef.current);
      
      // IMPORTANT: Wait for next tick to ensure user state is set
      setTimeout(() => {
        const currentUser = userRef.current;
        console.log('🔍 Checking user after timeout:', currentUser);
        
        if (currentUser) {
          const myPlayer = data.players.find(p => {
            console.log(`Comparing: ${p.userId} === ${currentUser._id}`);
            return p.userId === currentUser._id;
          });
          
          console.log('🎨 Found my player:', myPlayer);
          
          if (myPlayer) {
            console.log(`✅ Setting your color to: ${myPlayer.color}`);
            setMyColor(myPlayer.color);
          } else {
            console.warn('⚠️ Could not find your player in the game!');
            console.warn('Available players:', data.players);
          }
        } else {
          console.error('❌ No current user found!');
        }
      }, 100);
      
      setGameMessage(data.message);
      setStatus('playing');
      setGameResult(null);
    }

    function onGameResult(data: { winningColor: string; winnerId: string; loserId: string }) {
      const currentUser = userRef.current;
      if (!currentUser) return;

      console.log('🎯 Game result:', data);
      setGameResult(data);
      setStatus('result');
      
      const didWin = data.winnerId === currentUser._id;
      setIsWinner(didWin);
      
      if (didWin) {
        setGameMessage('You Won! 🎉');
      } else {
        setGameMessage('You Lost 😢');
      }
      
      setCountdown(5);
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      setTimeout(() => {
        clearInterval(countdownInterval);
        setStatus('idle');
        setGameMessage('Click to find a game');
        setGameResult(null);
        setMyColor(null);
        setIsWinner(null);
        setCountdown(5);
      }, 5000);
    }

    function onBalanceUpdate(data: { newBalance: number }) {
      console.log('💰 Balance updated:', data.newBalance);
      setBalance(data.newBalance);
    }

    function onError(data: { message: string }) {
      console.error(`❌ Socket Error: ${data.message}`);
      alert(`Error: ${data.message}`);
      const currentUser = userRef.current;
      setStatus(currentUser ? 'idle' : 'login');
    }

    socket.on('user_data', onUserData);
    socket.on('status_update', onStatusUpdate);
    socket.on('game_start', onGameStart);
    socket.on('game_result', onGameResult);
    socket.on('balance_update', onBalanceUpdate);
    socket.on('error', onError);

    return () => {
      socket.off('user_data', onUserData);
      socket.off('status_update', onStatusUpdate);
      socket.off('game_start', onGameStart);
      socket.off('game_result', onGameResult);
      socket.off('balance_update', onBalanceUpdate);
      socket.off('error', onError);
    };
  }, [user]);

  const handleFindGame = () => {
    if (user && status === 'idle') {
      console.log('🔍 Finding game for:', user.username);
      socket.emit('find_game', { username: user.username });
      setStatus('waiting');
      setGameMessage('Sending request...');
    }
  };

  const handleLogin = () => {
    if (usernameInput.trim()) {
      console.log('🔐 Logging in as:', usernameInput);
      setStatus('waiting');
      setGameMessage('Logging in...');
      socket.emit('find_game', { username: usernameInput.trim() });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 overflow-hidden relative">
      
      {/* User info header */}
      {user && (
        <header className="absolute top-4 right-4 bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 z-20">
          <h2 className="text-xl font-bold">{user.username}</h2>
          <p className="text-2xl font-mono text-green-400">${balance.toFixed(2)}</p>
          <div className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? '● Connected' : '● Disconnected'}
          </div>
        </header>
      )}

      {/* Full screen confetti for winner */}
      {status === 'result' && isWinner && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(100)].map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20px',
                width: `${10 + Math.random() * 10}px`,
                height: `${10 + Math.random() * 10}px`,
                backgroundColor: ['#FFD700', '#FF6347', '#00FF00', '#4169E1', '#FF1493', '#00CED1', '#FFA500', '#FF4500'][Math.floor(Math.random() * 8)],
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
                animation: `confetti-fall ${2 + Math.random() * 2}s linear ${Math.random() * 0.5}s forwards`,
                opacity: 0.9
              }}
            />
          ))}
        </div>
      )}

      {/* Full screen rain for loser */}
      {status === 'result' && isWinner === false && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-50px',
                width: '3px',
                height: `${25 + Math.random() * 35}px`,
                backgroundColor: '#60A5FA',
                borderRadius: '2px',
                animation: `rain-fall ${0.8 + Math.random() * 0.5}s linear ${Math.random() * 1}s infinite`,
                opacity: 0.7
              }}
            />
          ))}
        </div>
      )}

      <main className="flex flex-col items-center justify-center text-center relative z-10">
        <h1 className="text-5xl font-bold mb-8">Color Clash</h1>
        
        {status === 'login' && (
          <div className="flex flex-col items-center animate-pop-in">
            <p className="text-xl text-gray-400 mb-8 max-w-md">
              Enter a username to play (it will be created if new)
            </p>
            <input 
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Enter your username"
              className="px-4 py-2 text-lg text-center bg-gray-800 border border-gray-700 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
            />
            <button
              onClick={handleLogin}
              disabled={!usernameInput.trim()}
              className="mt-4 px-10 py-3 bg-indigo-600 rounded-lg text-xl font-bold transition-all duration-300 hover:bg-indigo-500 hover:scale-105 transform shadow-lg disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Play
            </button>
          </div>
        )}

        {user && status !== 'login' && (
          <>
            <p className="text-xl text-gray-400 mb-6 max-w-md">
              Bet $10 and match against an opponent. Good luck, {user.username}.
            </p>

            {/* Player color badge - shown prominently above wheel */}
            {myColor && (status === 'playing' || status === 'waiting') && (
              <div className="mb-6 px-8 py-4 bg-gray-800 rounded-xl border-2 border-gray-700 shadow-xl animate-pop-in">
                <p className="text-sm text-gray-400 mb-1">Your Color</p>
                <p className={`text-3xl font-bold ${myColor === 'Red' ? 'text-red-500' : 'text-white'}`}>
                  {myColor}
                </p>
              </div>
            )}

            {/* Game wheel */}
            <div className="w-80 h-80 sm:w-96 sm:h-96 bg-gray-800 rounded-full flex items-center justify-center shadow-2xl border-4 border-gray-700 relative overflow-hidden">
              
              {status === 'playing' && (
                <>
                  <div className="absolute w-full h-full bg-red-600 animate-spin-slow"></div>
                  <div className="absolute w-1/2 h-full bg-gray-950 top-0 left-0"></div>
                </>
              )}

              <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
                {status === 'idle' && (
                  <button
                    onClick={handleFindGame}
                    className="w-48 h-48 bg-indigo-600 rounded-full text-2xl font-bold transition-all duration-300 hover:bg-indigo-500 hover:scale-105 transform shadow-lg"
                  >
                    Find Game
                  </button>
                )}

                {(status === 'waiting' || status === 'playing') && (
                  <div className="flex flex-col items-center">
                    <div className="w-24 h-24 border-t-4 border-b-4 border-blue-400 rounded-full animate-spin mb-4"></div>
                    <p className="text-xl text-gray-300 animate-pulse">{gameMessage}</p>
                  </div>
                )}

                {status === 'result' && gameResult && (
                  <div className="flex flex-col items-center animate-pop-in">
                    <div
                      className={`w-48 h-48 rounded-full flex items-center justify-center text-4xl font-bold shadow-2xl border-4 ${
                        gameResult.winningColor === 'Red' 
                          ? 'bg-red-600 border-red-400' 
                          : 'bg-gray-950 border-gray-600'
                      }`}
                    >
                      {gameResult.winningColor}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Result message and countdown - shown below wheel */}
            {status === 'result' && (
              <div className="mt-8 text-center animate-pop-in">
                <p className={`text-5xl font-extrabold mb-4 ${
                  isWinner ? 'text-green-400 animate-pulse-glow' : 'text-red-500'
                }`}>
                  {isWinner ? '🎉 YOU WON! 🎉' : '😢 YOU LOST 😢'}
                </p>
                <p className={`text-3xl font-bold mb-6 ${
                  isWinner ? 'text-green-400' : 'text-red-400'
                }`}>
                  {isWinner ? '+$10' : '-$10'}
                </p>
                <div className="inline-block px-8 py-4 bg-gray-800 rounded-xl border-2 border-gray-600 shadow-xl">
                  <p className="text-gray-400 text-base mb-1">Next game in</p>
                  <p className="text-white font-bold text-4xl">{countdown}s</p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes rain-fall {
          0% {
            transform: translateY(0);
            opacity: 0.7;
          }
          100% {
            transform: translateY(100vh);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}