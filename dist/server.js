"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// --- ÉTAT DU JEU ---
let numbersToGuess = [];
let currentCardIndex = 0;
let cardsLaunched = 0;
let currentQuestionIndex = 0;
let players = {};
let gameState = 'WAITING_FOR_CARD';
let timer = null;
let timeLeft = 180;
function getLanOrigins(port) {
    const interfaces = os_1.default.networkInterfaces();
    const origins = new Set();
    for (const networkInterface of Object.values(interfaces)) {
        if (!networkInterface)
            continue;
        for (const address of networkInterface) {
            if (address.family === 'IPv4' && !address.internal) {
                origins.add(`http://${address.address}:${port}`);
            }
        }
    }
    return Array.from(origins);
}
// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('Joueur connecté:', socket.id);
    socket.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    socket.on('join', (name) => {
        console.log('Joueur rejoint:', name, 'socket:', socket.id);
        // Chercher si un joueur avec ce nom existe déjà
        let existingPlayerKey = null;
        for (let id in players) {
            if (players[id].name === name) {
                existingPlayerKey = id;
                break;
            }
        }
        if (existingPlayerKey) {
            // Réactiver le joueur existant - copier ses données à la nouvelle clé socket.id
            console.log('Joueur reconnecté:', existingPlayerKey, '-> nouveau socket:', socket.id);
            const existingPlayer = players[existingPlayerKey];
            players[socket.id] = { ...existingPlayer, left: false };
            // Supprimer l'ancienne entrée si la clé est différente
            if (existingPlayerKey !== socket.id) {
                delete players[existingPlayerKey];
            }
        }
        else {
            // Créer un nouveau joueur
            console.log('Nouveau joueur créé:', name);
            players[socket.id] = { name, cardScore: 0, totalScore: 0, found: false, history: [], left: false };
        }
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('player:leave', () => {
        console.log('Joueur parti:', socket.id);
        if (players[socket.id]) {
            players[socket.id].left = true;
            io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
        }
    });
    socket.on('guess', (guess) => {
        if (gameState !== 'GUESSING' || !players[socket.id] || players[socket.id].found)
            return;
        const target = numbersToGuess[currentCardIndex];
        let feedback = guess > target ? "C'est moins !" : (guess < target ? "C'est plus !" : "BRAVO !");
        players[socket.id].history.push({ question: currentQuestionIndex + 1, guess, feedback });
        if (guess === target) {
            players[socket.id].found = true;
            const points = (5 - (currentQuestionIndex + 1));
            players[socket.id].cardScore += points;
            players[socket.id].totalScore += points;
        }
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:setNumbers', (nums) => {
        console.log('Admin set numbers:', nums);
        numbersToGuess = nums;
        currentCardIndex = 0;
        cardsLaunched = 0;
    });
    socket.on('admin:startCard', () => {
        console.log('Admin start card');
        if (cardsLaunched > 0) {
            currentCardIndex++;
        }
        cardsLaunched++;
        currentQuestionIndex = 0;
        Object.values(players).forEach(p => { p.found = false; p.history = []; p.cardScore = 0; });
        gameState = 'WAITING_FOR_QUESTION';
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:startQuestion', () => {
        console.log('Admin start question');
        gameState = 'GUESSING';
        timeLeft = 180;
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
        if (timer)
            clearInterval(timer);
        timer = setInterval(() => {
            timeLeft--;
            io.emit('timer', timeLeft);
            const allFound = Object.keys(players).length > 0 && Object.values(players).every(p => p.found);
            if (timeLeft <= 0 || allFound) {
                if (timer)
                    clearInterval(timer);
                gameState = 'FEEDBACK';
                io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
            }
        }, 1000);
    });
    socket.on('admin:stopQuestion', () => {
        console.log('Admin stop question');
        if (timer)
            clearInterval(timer);
        currentQuestionIndex++;
        if (currentQuestionIndex >= 4) {
            gameState = 'CARD_FINISHED';
        }
        else {
            gameState = 'FEEDBACK';
        }
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:prevCard', () => {
        console.log('Admin prev card');
        if (timer)
            clearInterval(timer);
        if (currentCardIndex > 0) {
            currentCardIndex--;
        }
        currentQuestionIndex = 0;
        gameState = 'WAITING_FOR_QUESTION';
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:nextCard', () => {
        console.log('Admin next card');
        if (timer)
            clearInterval(timer);
        currentCardIndex++;
        currentQuestionIndex = 0;
        gameState = 'WAITING_FOR_QUESTION';
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:prevQuestion', () => {
        console.log('Admin prev question');
        if (timer)
            clearInterval(timer);
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
        }
        gameState = 'WAITING_FOR_QUESTION';
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:nextQuestion', () => {
        console.log('Admin next question');
        if (timer)
            clearInterval(timer);
        if (currentQuestionIndex < 3) {
            currentQuestionIndex++;
        }
        else {
            // Après la question 4, passer à la carte suivante
            currentCardIndex++;
            currentQuestionIndex = 0;
        }
        gameState = 'WAITING_FOR_QUESTION';
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:deletePlayer', (playerId) => {
        console.log('Admin delete player:', playerId);
        delete players[playerId];
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:finishGame', () => {
        console.log('Admin finish game');
        if (timer)
            clearInterval(timer);
        gameState = 'GAME_FINISHED';
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:resetGame', () => {
        console.log('Admin reset game');
        if (timer)
            clearInterval(timer);
        numbersToGuess = [];
        currentCardIndex = 0;
        cardsLaunched = 0;
        currentQuestionIndex = 0;
        players = {};
        gameState = 'WAITING_FOR_CARD';
        timeLeft = 180;
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('disconnect', () => {
        console.log('Joueur déconnecté:', socket.id);
        // Les données du joueur restent en mémoire pour la reconnexion
        // Rien n'est supprimé ici
    });
});
// --- ROUTES & FICHIERS STATIQUES (CORRIGÉ POUR RENDER) ---
// On définit le chemin vers le dossier "public" à partir de la racine du projet
const publicPath = path_1.default.join(process.cwd(), 'public');
// Utilisation du dossier public pour les assets (CSS, images, JS client)
app.use(express_1.default.static(publicPath));
// Routes vers les fichiers HTML
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(publicPath, 'index.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path_1.default.join(publicPath, 'admin.html'));
});
app.get('/scores', (req, res) => {
    res.sendFile(path_1.default.join(publicPath, 'scoreboard.html'));
});
app.get('/api/connection-info', (req, res) => {
    const hostHeader = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';
    const currentOrigin = `${protocol}://${hostHeader}`;
    const portFromHost = Number(hostHeader.split(':')[1]) || PORT;
    const lanOrigins = getLanOrigins(portFromHost);
    res.json({
        currentOrigin,
        lanOrigins,
        playerPath: '/',
        adminPath: '/admin',
        scoreboardPath: '/scores?fs=1'
    });
});
// --- LANCEMENT ---
const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`---`);
    console.log(`🚀 ZEKATON Serveur Live sur le port ${PORT}`);
    console.log(`---`);
});
