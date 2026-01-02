import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom';
import htm from 'htm';

const html = htm.bind(React.createElement);

const GRID_SIZE = 50;
const WIDTH = 600;
const HEIGHT = 600;

const COLORS = {
    frog: '#2ecc71',
    road: '#1a1a1f',
    grass: '#102a10',
    safe: '#222233',
    water: '#0984e3',
    log: '#634433',
    cars: ['#ff4757', '#eccc68', '#70a1ff', '#ffa502', '#5352ed']
};

// Audio Synthesis Utility
const playSound = (type) => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        switch (type) {
            case 'move':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'win':
                osc.type = 'square';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.1);
                osc.frequency.setValueAtTime(783.99, now + 0.2);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'lose':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(110, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                break;
            case 'start':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
        }
    } catch (e) { console.error("Audio error", e); }
};

const App = () => {
    const [score, setScore] = useState(0);
    const [stage, setStage] = useState(1);
    const [highScore, setHighScore] = useState(localStorage.getItem('frogger-high-score') || 0);
    const [gameState, setGameState] = useState('START');

    const startGame = () => {
        playSound('start');
        setScore(0);
        setStage(1);
        setGameState('PLAYING');
    };

    const handleGameOver = (finalScore) => {
        if (gameState !== 'PLAYING') return;
        playSound('lose');
        setGameState('GAMEOVER');
        if (finalScore > highScore) {
            setHighScore(finalScore);
            localStorage.setItem('frogger-high-score', finalScore);
        }
    };

    const handleStageComplete = () => {
        playSound('win');
        setScore(prev => prev + 10);
        setStage(prev => prev + 1);
    };

    useEffect(() => {
        const handleSpace = (e) => {
            if (e.key === ' ' && gameState !== 'PLAYING') {
                e.preventDefault();
                startGame();
            }
        };
        window.addEventListener('keydown', handleSpace);
        return () => window.removeEventListener('keydown', handleSpace);
    }, [gameState]);

    return html`
        <div id="game-container">
            <div class="hud">
                <div class="stat-box">
                    <div class="stat-label">Bölüm</div>
                    <div class="stat-value">${stage}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Skor</div>
                    <div class="stat-value">${score}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">En Yüksek</div>
                    <div class="stat-value">${highScore}</div>
                </div>
            </div>

            <${GameCanvas} 
                gameState=${gameState} 
                stage=${stage}
                score=${score}
                onGameOver=${handleGameOver}
                onStageComplete=${handleStageComplete}
            />

            ${gameState !== 'PLAYING' ? html`
                <div id="overlay">
                    <div class="modal">
                        <h1>${gameState === 'START' ? 'KURBAĞA' : 'YANDIN!'}</h1>
                        <p>${gameState === 'START' ? 'Trafikte hayatta kal ve karşıya geç!' : `Skorun: ${score}. Tekrar dene?`}</p>
                        <button onClick=${startGame}>${gameState === 'START' ? 'BAŞLA' : 'TEKRAR DENE'}</button>
                        <div class="controls-hint">
                            <span class="kbd">BOŞLUK</span> veya <span class="kbd">DOKUN</span> ile başlat, <span class="kbd">↑↓←→</span> veya <span class="kbd">KAYDIR</span> ile oyna!
                        </div>
                    </div>
                </div>
            ` : null}
        </div>
    `;
};

const GameCanvas = ({ gameState, stage, score, onGameOver, onStageComplete }) => {
    const canvasRef = useRef(null);
    const spriteRef = useRef(new Image());
    const carSpriteRef = useRef(new Image());
    const [frogPos, setFrogPos] = useState({ x: WIDTH / 2 - 15, y: HEIGHT - GRID_SIZE + 10 });
    const [isJumping, setIsJumping] = useState(false);
    const lanesRef = useRef([]);
    const requestRef = useRef();
    const scoreRef = useRef(0);
    const frogRef = useRef({ x: WIDTH / 2 - 15, y: HEIGHT - GRID_SIZE + 10 });
    const touchStartRef = useRef(null);

    useEffect(() => {
        spriteRef.current.src = 'pixel_frog_jumping_16x16.gif';
        carSpriteRef.current.src = 'car1_spr.png';
    }, []);

    useEffect(() => {
        scoreRef.current = score;
    }, [score]);

    useEffect(() => {
        frogRef.current = frogPos;
    }, [frogPos]);

    const initLanes = useCallback(() => {
        const laneCount = 3 + Math.floor(Math.random() * 2);
        const newLanes = [];
        const laneAreaHeight = (HEIGHT - 2 * GRID_SIZE);
        const laneSpacing = laneAreaHeight / laneCount;

        for (let i = 0; i < laneCount; i++) {
            const y = GRID_SIZE + i * laneSpacing + (laneSpacing - GRID_SIZE) / 2;
            const speed = (1.2 + Math.random() * 1.5 + stage * 0.15) * (i % 2 === 0 ? 1 : -1);
            const type = Math.random() > 0.5 ? 'WATER' : 'ROAD';
            const objects = [];
            const numObjects = 2 + Math.floor(Math.random() * 2);

            for (let j = 0; j < numObjects; j++) {
                objects.push({
                    x: Math.random() * WIDTH,
                    width: type === 'WATER' ? 80 + Math.random() * 40 : 40 + Math.random() * 30,
                    color: type === 'WATER' ? COLORS.log : COLORS.cars[Math.floor(Math.random() * COLORS.cars.length)]
                });
            }
            newLanes.push({ y, speed, objects, type });
        }
        lanesRef.current = newLanes;
    }, [stage]);

    useEffect(() => {
        if (gameState === 'PLAYING') {
            initLanes();
            setFrogPos({ x: WIDTH / 2 - 15, y: HEIGHT - GRID_SIZE + 10 });
        }
    }, [gameState, stage, initLanes]);

    const handleKeyDown = useCallback((e) => {
        if (gameState !== 'PLAYING') return;
        setFrogPos(prev => {
            let { x, y } = prev;
            let moved = false;
            const key = e.key.toLowerCase();
            if (key === 'arrowup' || key === 'w') { y -= GRID_SIZE; moved = true; }
            if (key === 'arrowdown' || key === 's') { y += GRID_SIZE; moved = true; }
            if (key === 'arrowleft' || key === 'a') { x -= GRID_SIZE; moved = true; }
            if (key === 'arrowright' || key === 'd') { x += GRID_SIZE; moved = true; }

            if (moved) {
                playSound('move');
                setIsJumping(true);
                setTimeout(() => setIsJumping(false), 150);
                x = Math.max(-30, Math.min(WIDTH, x));
                y = Math.max(0, Math.min(HEIGHT - GRID_SIZE + 10, y));

                if (y < GRID_SIZE) {
                    setTimeout(onStageComplete, 0);
                    return { x: WIDTH / 2 - 15, y: HEIGHT - GRID_SIZE + 10 };
                }
                return { x, y };
            }
            return prev;
        });
    }, [gameState, onStageComplete]);

    const handleTouchStart = useCallback((e) => {
        if (gameState !== 'PLAYING') return;
        e.preventDefault();
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    }, [gameState]);

    const handleTouchMove = useCallback((e) => {
        if (gameState === 'PLAYING') e.preventDefault();
    }, [gameState]);

    const handleTouchEnd = useCallback((e) => {
        if (!touchStartRef.current || gameState !== 'PLAYING') return;
        e.preventDefault();

        const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
        const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (Math.max(absX, absY) > 20) { // Slightly lower threshold for easier mobile play
            let direction = '';
            if (absX > absY) {
                direction = deltaX > 0 ? 'arrowright' : 'arrowleft';
            } else {
                direction = deltaY > 0 ? 'arrowdown' : 'arrowup';
            }
            handleKeyDown({ key: direction, preventDefault: () => { } });
        }
        touchStartRef.current = null;
    }, [gameState, handleKeyDown]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
            canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (canvas) {
                canvas.removeEventListener('touchstart', handleTouchStart);
                canvas.removeEventListener('touchmove', handleTouchMove);
                canvas.removeEventListener('touchend', handleTouchEnd);
            }
        };
    }, [handleKeyDown, handleTouchStart, handleTouchMove, handleTouchEnd]);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const currentFrog = frogRef.current;

        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.fillStyle = COLORS.safe;
        ctx.fillRect(0, 0, WIDTH, GRID_SIZE);
        ctx.fillRect(0, HEIGHT - GRID_SIZE, WIDTH, GRID_SIZE);

        if (gameState === 'PLAYING') {
            let inWater = false;
            let onLog = false;
            let currentLogSpeed = 0;

            lanesRef.current.forEach(lane => {
                const laneVisualTop = lane.y - 10;
                const isFrogInThisLane = (currentFrog.y + 15 > laneVisualTop && currentFrog.y + 15 < laneVisualTop + GRID_SIZE);

                ctx.fillStyle = lane.type === 'WATER' ? COLORS.water : COLORS.road;
                ctx.fillRect(0, laneVisualTop, WIDTH, GRID_SIZE);

                if (lane.type === 'WATER' && isFrogInThisLane) inWater = true;

                lane.objects.forEach(obj => {
                    obj.x += lane.speed;
                    if (lane.speed > 0 && obj.x > WIDTH) obj.x = -obj.width;
                    if (lane.speed < 0 && obj.x < -obj.width) obj.x = WIDTH;

                    if (lane.type === 'ROAD' && carSpriteRef.current.complete) {
                        ctx.save();
                        ctx.imageSmoothingEnabled = false;
                        if (lane.speed > 0) {
                            ctx.translate(obj.x + obj.width, lane.y);
                            ctx.scale(-1, 1);
                            ctx.drawImage(carSpriteRef.current, 0, 0, obj.width, 30);
                        } else {
                            ctx.drawImage(carSpriteRef.current, obj.x, lane.y, obj.width, 30);
                        }
                        ctx.restore();
                    } else {
                        ctx.fillStyle = obj.color;
                        ctx.beginPath();
                        ctx.roundRect(obj.x, lane.y, obj.width, 30, 5);
                        ctx.fill();
                    }

                    if (lane.type === 'ROAD') {
                        // Collision Detection
                        if (currentFrog.x < obj.x + obj.width &&
                            currentFrog.x + 30 > obj.x &&
                            currentFrog.y < lane.y + 30 &&
                            currentFrog.y + 30 > lane.y) {
                            onGameOver(scoreRef.current);
                        }
                    } else if (lane.type === 'WATER') {
                        // Draw Log with texture
                        ctx.fillStyle = obj.color;
                        ctx.beginPath();
                        ctx.roundRect(obj.x, lane.y, obj.width, 30, 5);
                        ctx.fill();

                        // Wood lines/texture
                        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(obj.x + 10, lane.y + 10);
                        ctx.lineTo(obj.x + obj.width - 10, lane.y + 10);
                        ctx.moveTo(obj.x + 15, lane.y + 20);
                        ctx.lineTo(obj.x + obj.width - 15, lane.y + 20);
                        ctx.stroke();

                        if (currentFrog.x + 15 > obj.x &&
                            currentFrog.x + 15 < obj.x + obj.width &&
                            isFrogInThisLane) {
                            onLog = true;
                            currentLogSpeed = lane.speed;
                        }
                    }
                });
            });

            if (inWater && !onLog) onGameOver(scoreRef.current);

            if (onLog && currentLogSpeed !== 0) {
                const nextX = currentFrog.x + currentLogSpeed;
                if (nextX < -30 || nextX > WIDTH) {
                    onGameOver(scoreRef.current);
                } else {
                    setFrogPos(prev => ({ ...prev, x: nextX }));
                }
            }

            if (currentFrog.x < -10 || currentFrog.x > WIDTH - 20) {
                onGameOver(scoreRef.current);
            }
        }

        // Draw Frog Sprite
        if (spriteRef.current.complete) {
            const frameX = isJumping ? 16 : 0;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                spriteRef.current,
                frameX, 0, 16, 16,
                currentFrog.x, currentFrog.y, 30, 30
            );
        } else {
            ctx.fillStyle = COLORS.frog;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(currentFrog.x + 15, currentFrog.y + 15, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        requestRef.current = requestAnimationFrame(animate);
    }, [gameState, onGameOver, isJumping]);

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [animate]);

    return html`<canvas ref=${canvasRef} width=${WIDTH} height=${HEIGHT}></canvas>`;
};

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
