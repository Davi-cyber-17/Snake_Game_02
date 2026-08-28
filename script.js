import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
    getFirestore,
    doc,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const highScoreElement = document.getElementById("highScore");
const highScoreNameElement = document.getElementById("highScoreName");
const levelElement = document.getElementById("level");
const scoreStat = scoreElement.closest(".stat");
const levelStat = levelElement.closest(".stat");
const syncStatus = document.getElementById("syncStatus");

const message = document.getElementById("message");
const messageTitle = document.getElementById("messageTitle");
const messageText = document.getElementById("messageText");

const nicknameModal = document.getElementById("nicknameModal");
const nicknameText = document.getElementById("nicknameText");
const nicknameInput = document.getElementById("nicknameInput");
const nicknameSubmit = document.getElementById("nicknameSubmit");
const nicknameSkip = document.getElementById("nicknameSkip");

const countdown = document.getElementById("countdown");
const countdownNumber = document.getElementById("countdownNumber");

const restartButton = document.getElementById("restartButton");
const restartTopButton = document.getElementById("restartTopButton");
const pauseButton = document.getElementById("pauseButton");
const muteButton = document.getElementById("muteButton");
const diffButtons = document.querySelectorAll(".diffButton");

const gridSize = 24;
const tileSize = canvas.width / gridSize;

/* ---------- Armazenamento local (recorde salvo no navegador) ---------- */
const memoryFallback = {};

function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return Object.prototype.hasOwnProperty.call(memoryFallback, key)
            ? memoryFallback[key]
            : null;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        memoryFallback[key] = String(value);
    }
}

const DIFFICULTIES = {
    easy: { startSpeed: 165, minSpeed: 90 },
    normal: { startSpeed: 135, minSpeed: 55 },
    hard: { startSpeed: 105, minSpeed: 45 }
};

let difficulty = "normal";

let snake;
let prevSnake;
let food;
let particles = [];
let direction;
let nextDirection;
let score;
let level;
let speed;
let gameOver;
let paused;
let countingDown;
let lastTime = 0;
let accumulator = 0;

/* ---------- Recorde global (Firebase Firestore) ---------- */
let highScore = 0;
let highScoreHolder = "";
let firebaseReady = false;
let db = null;
let globalScoreRef = null;

const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLE_AQUI");

if (isConfigured) {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        globalScoreRef = doc(db, "leaderboard", "global");
        firebaseReady = true;

        onSnapshot(
            globalScoreRef,
            snapshot => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    highScore = Number(data.score) || 0;
                    highScoreHolder = data.name || "";
                    updateStats();
                }
                setSyncStatus("");
            },
            () => {
                setSyncStatus("Recorde global indisponível — jogando offline.");
            }
        );
    } catch (e) {
        setSyncStatus("Recorde global indisponível — jogando offline.");
    }
} else {
    setSyncStatus("Configure firebase-config.js para ativar o recorde global.");
}

function setSyncStatus(text) {
    if (!syncStatus) return;
    syncStatus.textContent = text;
    syncStatus.classList.toggle("hidden", !text);
}

async function trySaveGlobalScore(finalScore, name) {
    if (!firebaseReady) return { saved: false, reason: "offline" };

    try {
        const result = await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(globalScoreRef);
            const currentScore = snapshot.exists() ? Number(snapshot.data().score) || 0 : 0;

            if (finalScore <= currentScore) {
                return { saved: false, currentScore };
            }

            transaction.set(globalScoreRef, {
                score: finalScore,
                name: name.slice(0, 20),
                updatedAt: serverTimestamp()
            });

            return { saved: true, currentScore: finalScore };
        });

        return { saved: result.saved, reason: result.saved ? null : "beaten" };
    } catch (e) {
        return { saved: false, reason: "error" };
    }
}

let muted = safeGetItem("snakeMuted") === "true";
updateMuteButton();

/* ---------- Áudio ---------- */
let audioCtx = null;

function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}

function playTone(freq, duration, type = "sine", volume = 0.18) {
    if (muted) return;

    ensureAudio();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playEatSound() {
    playTone(520, 0.12, "square", 0.15);
    setTimeout(() => playTone(720, 0.1, "square", 0.1), 60);
}

function playGoldenSound() {
    playTone(660, 0.1, "triangle", 0.18);
    setTimeout(() => playTone(880, 0.1, "triangle", 0.18), 70);
    setTimeout(() => playTone(1040, 0.14, "triangle", 0.18), 140);
}

function playGameOverSound() {
    playTone(300, 0.18, "sawtooth", 0.16);
    setTimeout(() => playTone(220, 0.18, "sawtooth", 0.16), 140);
    setTimeout(() => playTone(140, 0.28, "sawtooth", 0.16), 280);
}

function updateMuteButton() {
    muteButton.textContent = muted ? "🔇" : "🔊";
}

muteButton.addEventListener("click", () => {
    muted = !muted;
    safeSetItem("snakeMuted", muted);
    updateMuteButton();
    if (!muted) {
        ensureAudio();
        playTone(440, 0.08, "sine", 0.12);
    }
});

/* ---------- Dificuldade ---------- */
diffButtons.forEach(button => {
    button.addEventListener("click", () => {
        difficulty = button.dataset.difficulty;

        diffButtons.forEach(b => b.classList.toggle("active", b === button));

        startGame();
    });
});

/* ---------- Estado do jogo ---------- */
function startGame() {
    const preset = DIFFICULTIES[difficulty];

    snake = [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 10, y: 12 },
        { x: 9, y: 12 }
    ];
    prevSnake = snake.map(part => ({ ...part }));

    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };

    score = 0;
    level = 1;
    speed = preset.startSpeed;
    gameOver = false;
    paused = false;
    particles = [];
    accumulator = 0;

    pauseButton.textContent = "⏸ Pausar";
    pauseButton.disabled = false;
    message.classList.add("hidden");
    nicknameModal.classList.add("hidden");
    highScoreElement.closest(".stat").classList.remove("leading");

    updateStats();
    spawnFood();
    runCountdown();
}

function updateStats(bump = false) {
    scoreElement.textContent = score;
    highScoreElement.textContent = highScore;
    highScoreNameElement.textContent = highScoreHolder ? `por ${highScoreHolder}` : "";
    levelElement.textContent = level;

    if (bump) {
        scoreStat.classList.add("bump");
        setTimeout(() => scoreStat.classList.remove("bump"), 200);
    }
}

function spawnFood(forceType) {
    let position;

    do {
        position = {
            x: Math.floor(Math.random() * gridSize),
            y: Math.floor(Math.random() * gridSize)
        };
    } while (snake.some(part => part.x === position.x && part.y === position.y));

    const type = forceType || (Math.random() < 0.18 ? "golden" : "normal");

    food = {
        x: position.x,
        y: position.y,
        type,
        createdAt: performance.now(),
        expiresIn: 4200
    };
}

/* ---------- Contagem regressiva ---------- */
function runCountdown() {
    countingDown = true;
    countdown.classList.remove("hidden");

    const steps = ["3", "2", "1", "GO!"];
    let i = 0;

    function step() {
        countdownNumber.textContent = steps[i];
        countdownNumber.style.animation = "none";
        void countdownNumber.offsetWidth;
        countdownNumber.style.animation = "";

        if (!muted) {
            playTone(i === steps.length - 1 ? 720 : 440, 0.1, "sine", 0.12);
        }

        i++;

        if (i < steps.length) {
            setTimeout(step, 550);
        } else {
            setTimeout(() => {
                countdown.classList.add("hidden");
                countingDown = false;
                lastTime = performance.now();
            }, 450);
        }
    }

    step();
}

/* ---------- Controles ---------- */
function setDirection(newDirection) {
    if (gameOver || countingDown) return;

    if (
        newDirection.x === -direction.x &&
        newDirection.y === -direction.y
    ) {
        return;
    }

    nextDirection = newDirection;
}

/* ---------- Atualização ---------- */
function update() {
    prevSnake = snake.map(part => ({ ...part }));
    direction = nextDirection;

    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
    };

    if (
        head.x < 0 ||
        head.x >= gridSize ||
        head.y < 0 ||
        head.y >= gridSize
    ) {
        endGame();
        return;
    }

    const ateFood = head.x === food.x && head.y === food.y;

    if (!ateFood) {
        snake.pop();
    }

    if (snake.some(part => part.x === head.x && part.y === head.y)) {
        endGame();
        return;
    }

    snake.unshift(head);

    if (ateFood) {
        const points = food.type === "golden" ? 3 : 1;
        score += points;

        spawnParticles(food);

        if (food.type === "golden") {
            playGoldenSound();
        } else {
            playEatSound();
        }

        const highScoreStat = highScoreElement.closest(".stat");
        highScoreStat.classList.toggle("leading", score > highScore);

        const preset = DIFFICULTIES[difficulty];

        if (score % 5 === 0) {
            level++;
            speed = Math.max(preset.minSpeed, speed - 12);
        }

        spawnFood();
        updateStats(true);
    } else if (
        food.type === "golden" &&
        performance.now() - food.createdAt > food.expiresIn
    ) {
        spawnFood("normal");
    }
}

function endGame() {
    gameOver = true;
    prevSnake = snake.map(part => ({ ...part }));

    playGameOverSound();

    messageTitle.textContent = "Fim de jogo!";
    messageText.textContent = `Você fez ${score} ponto${score === 1 ? "" : "s"}.`;

    if (firebaseReady && score > 0 && score > highScore) {
        nicknameText.textContent = `Você fez ${score} ponto${score === 1 ? "" : "s"} — o maior recorde até agora!`;
        nicknameInput.value = safeGetItem("snakePlayerName") || "";
        nicknameModal.classList.remove("hidden");
        setTimeout(() => nicknameInput.focus(), 50);
    } else {
        message.classList.remove("hidden");
    }
}

nicknameSubmit.addEventListener("click", async () => {
    const name = nicknameInput.value.trim() || "Anônimo";
    safeSetItem("snakePlayerName", name);

    nicknameSubmit.disabled = true;
    nicknameSubmit.textContent = "Salvando...";

    const result = await trySaveGlobalScore(score, name);

    nicknameSubmit.disabled = false;
    nicknameSubmit.textContent = "Salvar recorde";
    nicknameModal.classList.add("hidden");

    if (result.saved) {
        messageText.textContent = `Você fez ${score} ponto${score === 1 ? "" : "s"} e é o novo recorde global! 🏆`;
    } else if (result.reason === "beaten") {
        messageText.textContent = `Você fez ${score} ponto${score === 1 ? "" : "s"}, mas alguém acabou de superar essa marca.`;
    } else {
        messageText.textContent = `Você fez ${score} ponto${score === 1 ? "" : "s"}. Não foi possível salvar o recorde agora.`;
    }

    message.classList.remove("hidden");
});

nicknameSkip.addEventListener("click", () => {
    nicknameModal.classList.add("hidden");
    message.classList.remove("hidden");
});

function togglePause() {
    if (gameOver || countingDown) return;

    paused = !paused;
    pauseButton.textContent = paused ? "▶ Continuar" : "⏸ Pausar";

    if (!paused) {
        lastTime = performance.now();
    }
}

/* ---------- Partículas ---------- */
function spawnParticles(source) {
    const centerX = source.x * tileSize + tileSize / 2;
    const centerY = source.y * tileSize + tileSize / 2;
    const color = source.type === "golden" ? "255, 209, 82" : "255, 90, 90";
    const count = source.type === "golden" ? 18 : 10;

    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speedFactor = 1.2 + Math.random() * 1.6;

        particles.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speedFactor,
            vy: Math.sin(angle) * speedFactor,
            life: 1,
            color
        });
    }
}

function updateParticles(delta) {
    const factor = delta / 16.6;

    particles.forEach(particle => {
        particle.x += particle.vx * factor;
        particle.y += particle.vy * factor;
        particle.vx *= 0.94;
        particle.vy *= 0.94;
        particle.life -= 0.045 * factor;
    });

    particles = particles.filter(particle => particle.life > 0);
}

function drawParticles() {
    particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = Math.max(particle.life, 0);
        ctx.fillStyle = `rgb(${particle.color})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

/* ---------- Desenho ---------- */
function draw(progress) {
    drawBackground();
    drawFood();
    drawSnake(progress);
    drawParticles();
}

function drawBackground() {
    ctx.fillStyle = "#101b15";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(120, 170, 140, .055)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= gridSize; i++) {
        const p = i * tileSize;

        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, canvas.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(canvas.width, p);
        ctx.stroke();
    }
}

function drawFood() {
    const centerX = food.x * tileSize + tileSize / 2;
    const centerY = food.y * tileSize + tileSize / 2;
    const radius = tileSize * .34;

    if (food.type === "golden") {
        const remaining = 1 - (performance.now() - food.createdAt) / food.expiresIn;
        const pulse = 0.85 + Math.sin(performance.now() / 90) * 0.15;

        ctx.save();
        ctx.shadowColor = "rgba(255, 209, 82, .65)";
        ctx.shadowBlur = 20;

        ctx.fillStyle = "#ffd152";
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffb100";
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * pulse * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "rgba(255, 209, 82, .5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, tileSize * .46, -Math.PI / 2, -Math.PI / 2 + Math.max(remaining, 0) * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.shadowColor = "rgba(255, 70, 70, .45)";
    ctx.shadowBlur = 14;

    ctx.fillStyle = "#ff4f55";
    ctx.beginPath();
    ctx.arc(centerX, centerY + 2, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ef3139";
    ctx.beginPath();
    ctx.arc(centerX - 3, centerY - 2, radius * .72, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#65b86a";
    ctx.beginPath();
    ctx.ellipse(
        centerX + radius * .6,
        centerY - radius * .9,
        radius * .45,
        radius * .22,
        -0.5,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function drawSnake(progress) {
    snake.forEach((part, index) => {
        const prev = prevSnake[index] || part;
        const drawX = lerp(prev.x, part.x, progress);
        const drawY = lerp(prev.y, part.y, progress);

        const padding = index === 0 ? 1 : 2;
        const x = drawX * tileSize + padding;
        const y = drawY * tileSize + padding;
        const size = tileSize - padding * 2;
        const radius = 6;

        ctx.save();
        ctx.shadowColor = index === 0
            ? "rgba(82, 255, 151, .28)"
            : "rgba(41, 180, 100, .15)";
        ctx.shadowBlur = 8;

        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, index === 0 ? "#59e98d" : "#35c974");
        gradient.addColorStop(1, index === 0 ? "#21ad5e" : "#198e50");

        ctx.fillStyle = gradient;
        roundedRect(x, y, size, size, radius);
        ctx.fill();

        if (index === 0) {
            drawEyes(drawX, drawY);
        }

        ctx.restore();
    });
}

function drawEyes(gridX, gridY) {
    const x = gridX * tileSize;
    const y = gridY * tileSize;

    let eyes;

    if (direction.x === 1) {
        eyes = [
            { x: x + tileSize * .68, y: y + tileSize * .30 },
            { x: x + tileSize * .68, y: y + tileSize * .70 }
        ];
    } else if (direction.x === -1) {
        eyes = [
            { x: x + tileSize * .32, y: y + tileSize * .30 },
            { x: x + tileSize * .32, y: y + tileSize * .70 }
        ];
    } else if (direction.y === -1) {
        eyes = [
            { x: x + tileSize * .30, y: y + tileSize * .32 },
            { x: x + tileSize * .70, y: y + tileSize * .32 }
        ];
    } else {
        eyes = [
            { x: x + tileSize * .30, y: y + tileSize * .68 },
            { x: x + tileSize * .70, y: y + tileSize * .68 }
        ];
    }

    ctx.fillStyle = "#082015";

    eyes.forEach(eye => {
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

/* ---------- Loop principal ---------- */
function gameLoop(timestamp) {
    const delta = timestamp - lastTime;
    lastTime = timestamp;

    let progress = 1;

    if (!paused && !gameOver && !countingDown) {
        accumulator += delta;
        progress = Math.min(accumulator / speed, 1);

        if (accumulator >= speed) {
            update();
            accumulator = 0;
            progress = 0;
        }
    }

    updateParticles(Math.min(delta, 48));
    draw(progress);
    requestAnimationFrame(gameLoop);
}

/* ---------- Entrada: teclado ---------- */
document.addEventListener("keydown", event => {
    if (event.target === nicknameInput) return;

    const key = event.key.toLowerCase();

    const directions = {
        arrowup: { x: 0, y: -1 },
        w: { x: 0, y: -1 },
        arrowdown: { x: 0, y: 1 },
        s: { x: 0, y: 1 },
        arrowleft: { x: -1, y: 0 },
        a: { x: -1, y: 0 },
        arrowright: { x: 1, y: 0 },
        d: { x: 1, y: 0 }
    };

    if (directions[key]) {
        event.preventDefault();
        setDirection(directions[key]);
    }

    if (key === " ") {
        event.preventDefault();
        togglePause();
    }

    if (key === "enter" && gameOver && nicknameModal.classList.contains("hidden")) {
        startGame();
    }
});

nicknameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        nicknameSubmit.click();
    }
});

document.querySelectorAll("[data-direction]").forEach(button => {
    button.addEventListener("click", () => {
        const directions = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 }
        };

        setDirection(directions[button.dataset.direction]);
    });
});

/* ---------- Entrada: swipe no celular ---------- */
let touchStart = null;

canvas.addEventListener("touchstart", event => {
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

canvas.addEventListener("touchmove", event => {
    event.preventDefault();
}, { passive: false });

canvas.addEventListener("touchend", event => {
    if (!touchStart) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
        touchStart = null;
        return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
    } else {
        setDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
    }

    touchStart = null;
}, { passive: true });

pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startGame);
restartTopButton.addEventListener("click", startGame);

startGame();
requestAnimationFrame(gameLoop);