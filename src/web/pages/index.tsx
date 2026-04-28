import { useRef, useEffect, useState, useCallback } from 'react';

const W = 600, H = 600, CELL = 20, COLS = W / CELL, ROWS = H / CELL;
type Dir = 'up' | 'down' | 'left' | 'right';
type PU = { x: number; y: number; type: 'speed' | 'slow' | 'warp' | 'shrink' | 'double'; timer: number };
type Seg = { x: number; y: number };

const NEON = ['#0ff', '#f0f', '#0f0', '#ff0', '#f60', '#f06'];
const randPos = () => ({ x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) });

function initAudio() { try { new AudioContext(); } catch {} }
function tone(f: number, d: number, t: OscillatorType = 'square', v = 0.1) {
  try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.type = t; o.frequency.setValueAtTime(f, c.currentTime); g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch {} }
function sfxEat() { tone(600, 0.06, 'sine', 0.12); setTimeout(() => tone(900, 0.08, 'sine', 0.1), 50); }
function sfxPU() { [500, 700, 900, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.08, 'sine', 0.1), i * 50)); }
function sfxDie() { [400, 300, 200, 100].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sawtooth', 0.08), i * 120)); }

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<'menu' | 'play' | 'over'>('menu');
  const [score, setScore] = useState(0);
  const [hi, setHi] = useState(() => parseInt(localStorage.getItem('neonSnakeHi') || '0'));
  const [sound, setSound] = useState(true);
  const stateRef = useRef({ screen: 'menu' as string, sound: true });

  useEffect(() => { stateRef.current.screen = screen; }, [screen]);
  useEffect(() => { stateRef.current.sound = sound; }, [sound]);

  const snakeRef = useRef<Seg[]>([]);
  const dirRef = useRef<Dir>('right');
  const nextDirRef = useRef<Dir>('right');
  const foodRef = useRef(randPos());
  const puRef = useRef<PU | null>(null);
  const scoreRef = useRef(0);
  const speedRef = useRef(120);
  const warpRef = useRef(false);
  const warpEndRef = useRef(0);
  const doubleRef = useRef(false);
  const doubleEndRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number; c: string; a: number }[]>([]);
  const frameRef = useRef(0);

  const sfx = useCallback((fn: () => void) => { if (stateRef.current.sound) fn(); }, []);

  const startGame = useCallback(() => {
    initAudio();
    const mid = Math.floor(COLS / 2);
    snakeRef.current = [{ x: mid, y: Math.floor(ROWS / 2) }, { x: mid - 1, y: Math.floor(ROWS / 2) }, { x: mid - 2, y: Math.floor(ROWS / 2) }];
    dirRef.current = 'right'; nextDirRef.current = 'right';
    foodRef.current = randPos(); puRef.current = null;
    scoreRef.current = 0; speedRef.current = 120;
    warpRef.current = false; doubleRef.current = false;
    trailRef.current = [];
    setScore(0); setScreen('play');
  }, []);

  // Input
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (stateRef.current.screen === 'menu' && e.key === 'Enter') { startGame(); return; }
      if (stateRef.current.screen === 'over' && e.key === 'Enter') { startGame(); return; }
      const d = dirRef.current;
      if ((e.key === 'ArrowUp' || e.key === 'w') && d !== 'down') nextDirRef.current = 'up';
      if ((e.key === 'ArrowDown' || e.key === 's') && d !== 'up') nextDirRef.current = 'down';
      if ((e.key === 'ArrowLeft' || e.key === 'a') && d !== 'right') nextDirRef.current = 'left';
      if ((e.key === 'ArrowRight' || e.key === 'd') && d !== 'left') nextDirRef.current = 'right';
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [startGame]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    let last = 0;

    const loop = (t: number) => {
      frameRef.current = requestAnimationFrame(loop);
      const s = stateRef.current.screen;

      // Background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);
      // Grid
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke(); }
      for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke(); }

      if (s === 'menu') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0ff';
        ctx.shadowColor = '#0ff'; ctx.shadowBlur = 20;
        ctx.font = 'bold 48px monospace';
        ctx.fillText('NEON SNAKE', W / 2, H / 2 - 50);
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#f0f'; ctx.font = '20px monospace';
        ctx.fillText(`High Score: ${hi}`, W / 2, H / 2);
        ctx.fillStyle = '#fff'; ctx.font = '16px monospace';
        ctx.fillText('Press ENTER to start', W / 2, H / 2 + 40);
        ctx.fillStyle = '#666'; ctx.font = '12px monospace';
        ctx.fillText('Arrow Keys / WASD to move', W / 2, H / 2 + 70);
        ctx.shadowBlur = 0; ctx.textAlign = 'left';
        return;
      }

      if (s === 'over') {
        // Draw dead snake
        drawSnake(ctx); drawFood(ctx); drawPU(ctx);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f06'; ctx.shadowColor = '#f06'; ctx.shadowBlur = 20;
        ctx.font = 'bold 40px monospace'; ctx.fillText('GAME OVER', W / 2, H / 2 - 40);
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff0'; ctx.font = 'bold 24px monospace';
        ctx.fillText(`Score: ${scoreRef.current}`, W / 2, H / 2 + 5);
        ctx.fillStyle = '#fff'; ctx.font = '16px monospace';
        ctx.fillText('Press ENTER to retry', W / 2, H / 2 + 45);
        ctx.shadowBlur = 0; ctx.textAlign = 'left';
        return;
      }

      // Tick
      if (t - last < speedRef.current) { drawTrail(ctx); drawSnake(ctx); drawFood(ctx); drawPU(ctx); drawHUD(ctx); return; }
      last = t;

      const snake = snakeRef.current;
      dirRef.current = nextDirRef.current;
      const head = { ...snake[0] };
      if (dirRef.current === 'up') head.y--;
      if (dirRef.current === 'down') head.y++;
      if (dirRef.current === 'left') head.x--;
      if (dirRef.current === 'right') head.x++;

      // Warp or wall collision
      const now = Date.now();
      if (warpRef.current && now < warpEndRef.current) {
        head.x = (head.x + COLS) % COLS;
        head.y = (head.y + ROWS) % ROWS;
      } else {
        warpRef.current = false;
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
          sfx(sfxDie);
          if (scoreRef.current > hi) { setHi(scoreRef.current); localStorage.setItem('neonSnakeHi', scoreRef.current.toString()); }
          setScreen('over'); return;
        }
      }

      // Self collision
      if (snake.some(s => s.x === head.x && s.y === head.y)) {
        sfx(sfxDie);
        if (scoreRef.current > hi) { setHi(scoreRef.current); localStorage.setItem('neonSnakeHi', scoreRef.current.toString()); }
        setScreen('over'); return;
      }

      // Trail
      const ci = Math.floor(Date.now() / 200) % NEON.length;
      trailRef.current.push({ x: snake[0].x, y: snake[0].y, c: NEON[ci], a: 1 });
      trailRef.current = trailRef.current.filter(t => { t.a -= 0.04; return t.a > 0; });

      snake.unshift(head);

      // Food
      const food = foodRef.current;
      if (head.x === food.x && head.y === food.y) {
        sfx(sfxEat);
        const pts = doubleRef.current && now < doubleEndRef.current ? 20 : 10;
        scoreRef.current += pts; setScore(scoreRef.current);
        foodRef.current = randPos();
        // Speed up
        if (speedRef.current > 50) speedRef.current -= 2;
        // Maybe spawn powerup
        if (!puRef.current && Math.random() < 0.3) {
          const types: PU['type'][] = ['speed', 'slow', 'warp', 'shrink', 'double'];
          puRef.current = { ...randPos(), type: types[Math.floor(Math.random() * types.length)], timer: Date.now() + 8000 };
        }
      } else {
        snake.pop();
      }

      // Powerup collection
      const pu = puRef.current;
      if (pu && head.x === pu.x && head.y === pu.y) {
        sfx(sfxPU);
        if (pu.type === 'speed') speedRef.current = Math.max(40, speedRef.current - 20);
        if (pu.type === 'slow') speedRef.current = Math.min(200, speedRef.current + 30);
        if (pu.type === 'warp') { warpRef.current = true; warpEndRef.current = Date.now() + 10000; }
        if (pu.type === 'shrink' && snake.length > 3) { snake.splice(-3); }
        if (pu.type === 'double') { doubleRef.current = true; doubleEndRef.current = Date.now() + 8000; }
        scoreRef.current += 25; setScore(scoreRef.current);
        puRef.current = null;
      }
      // Powerup timeout
      if (pu && Date.now() > pu.timer) puRef.current = null;

      drawTrail(ctx); drawSnake(ctx); drawFood(ctx); drawPU(ctx); drawHUD(ctx);
    };

    function drawTrail(ctx: CanvasRenderingContext2D) {
      trailRef.current.forEach(t => {
        ctx.fillStyle = t.c + Math.floor(t.a * 40).toString(16).padStart(2, '0');
        ctx.fillRect(t.x * CELL + 2, t.y * CELL + 2, CELL - 4, CELL - 4);
      });
    }

    function drawSnake(ctx: CanvasRenderingContext2D) {
      const snake = snakeRef.current;
      snake.forEach((s, i) => {
        const ci = (Math.floor(Date.now() / 100) + i) % NEON.length;
        const col = NEON[ci];
        ctx.shadowColor = col; ctx.shadowBlur = i === 0 ? 14 : 8;
        ctx.fillStyle = col;
        const inset = i === 0 ? 1 : 2;
        ctx.fillRect(s.x * CELL + inset, s.y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
        if (i === 0) {
          // Eyes
          ctx.fillStyle = '#000';
          const d = dirRef.current;
          const ex1 = d === 'left' ? 4 : d === 'right' ? CELL - 7 : 4;
          const ey1 = d === 'up' ? 4 : d === 'down' ? CELL - 7 : 4;
          const ex2 = d === 'left' ? 4 : d === 'right' ? CELL - 7 : CELL - 7;
          const ey2 = d === 'up' ? 4 : d === 'down' ? CELL - 7 : CELL - 7;
          ctx.beginPath(); ctx.arc(s.x * CELL + ex1, s.y * CELL + ey1, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(s.x * CELL + ex2, s.y * CELL + ey2, 2, 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.shadowBlur = 0;
    }

    function drawFood(ctx: CanvasRenderingContext2D) {
      const f = foodRef.current;
      const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 150);
      ctx.shadowColor = '#f0f'; ctx.shadowBlur = 12 * pulse;
      ctx.fillStyle = '#f0f';
      ctx.beginPath();
      ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, (CELL / 2 - 2) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function drawPU(ctx: CanvasRenderingContext2D) {
      const pu = puRef.current;
      if (!pu) return;
      const cols: Record<string, string> = { speed: '#f60', slow: '#06f', warp: '#0ff', shrink: '#ff0', double: '#0f0' };
      const labels: Record<string, string> = { speed: '⚡', slow: '🐌', warp: '🌀', shrink: '✂', double: '×2' };
      const col = cols[pu.type] || '#fff';
      const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 120);
      ctx.shadowColor = col; ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pu.x * CELL + CELL / 2, pu.y * CELL + CELL / 2, (CELL / 2 - 1) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[pu.type], pu.x * CELL + CELL / 2, pu.y * CELL + CELL / 2);
      ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    function drawHUD(ctx: CanvasRenderingContext2D) {
      ctx.fillStyle = '#0ff'; ctx.shadowColor = '#0ff'; ctx.shadowBlur = 6;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`Score: ${scoreRef.current}`, 10, 24);
      ctx.fillStyle = '#f0f';
      ctx.fillText(`Hi: ${Math.max(scoreRef.current, hi)}`, W - 140, 24);
      // Active effects
      const now = Date.now();
      let ox = 10;
      if (warpRef.current && now < warpEndRef.current) {
        ctx.fillStyle = '#0ff'; ctx.fillText('🌀WARP', ox, 50); ox += 90;
      }
      if (doubleRef.current && now < doubleEndRef.current) {
        ctx.fillStyle = '#0f0'; ctx.fillText('×2 PTS', ox, 50);
      }
      ctx.shadowBlur = 0;
    }

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [hi, sfx]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl md:text-4xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-yellow-400" style={{ textShadow: '0 0 20px #0ff' }}>
        🐍 Neon Snake
      </h1>
      <canvas ref={canvasRef} className="rounded-xl border-2 border-cyan-800" style={{ maxWidth: '100%', imageRendering: 'pixelated' }} />
      <div className="flex gap-3 mt-3">
        {screen === 'menu' && <button onClick={startGame} className="px-6 py-2 bg-gradient-to-r from-cyan-700 to-fuchsia-700 text-white rounded-xl font-bold hover:scale-105 transition-transform">Start</button>}
        {screen === 'over' && <button onClick={startGame} className="px-6 py-2 bg-gradient-to-r from-cyan-700 to-fuchsia-700 text-white rounded-xl font-bold hover:scale-105 transition-transform">Retry</button>}
        <button onClick={() => setSound(s => !s)} className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm">{sound ? '🔊' : '🔇'}</button>
      </div>
      {screen === 'play' && (
        <div className="flex flex-col gap-2 md:hidden mt-3 w-full max-w-[200px]">
          <div className="flex justify-center"><button onTouchStart={() => { if (dirRef.current !== 'down') nextDirRef.current = 'up'; }} className="w-14 h-14 bg-cyan-900 rounded-xl text-2xl text-white font-bold">↑</button></div>
          <div className="flex justify-center gap-3">
            <button onTouchStart={() => { if (dirRef.current !== 'right') nextDirRef.current = 'left'; }} className="w-14 h-14 bg-cyan-900 rounded-xl text-2xl text-white font-bold">←</button>
            <button onTouchStart={() => { if (dirRef.current !== 'left') nextDirRef.current = 'right'; }} className="w-14 h-14 bg-cyan-900 rounded-xl text-2xl text-white font-bold">→</button>
          </div>
          <div className="flex justify-center"><button onTouchStart={() => { if (dirRef.current !== 'up') nextDirRef.current = 'down'; }} className="w-14 h-14 bg-cyan-900 rounded-xl text-2xl text-white font-bold">↓</button></div>
        </div>
      )}
      <p className="text-gray-600 text-xs mt-2">Power-ups: ⚡Speed 🐌Slow 🌀Warp ✂Shrink ×2Double</p>
    </div>
  );
}
