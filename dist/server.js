"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// État du jeu
let numbersToGuess = [];
let currentCardIndex = -1;
let currentQuestionIndex = 0;
let players = {};
let gameState = 'WAITING_FOR_CARD';
let timer = null;
let timeLeft = 180;
io.on('connection', (socket) => {
    console.log('Joueur connecté:', socket.id);
    socket.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    socket.on('join', (name) => {
        console.log('Joueur rejoint:', name);
        players[socket.id] = { name, cardScore: 0, totalScore: 0, found: false, history: [] };
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
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
        socket.emit('feedback', feedback);
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    // Admin Controls
    socket.on('admin:setNumbers', (nums) => {
        console.log('Admin set numbers:', nums);
        numbersToGuess = nums;
        currentCardIndex = -1;
    });
    socket.on('admin:startCard', () => {
        console.log('Admin start card');
        currentCardIndex++;
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
        // Bloquer à 4 questions
        if (currentQuestionIndex >= 4) {
            gameState = 'CARD_FINISHED';
        }
        else {
            gameState = 'FEEDBACK';
        }
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:deletePlayer', (playerId) => {
        console.log('Admin delete player:', playerId);
        delete players[playerId];
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
    socket.on('admin:resetGame', () => {
        console.log('Admin reset game');
        if (timer)
            clearInterval(timer);
        numbersToGuess = [];
        currentCardIndex = -1;
        currentQuestionIndex = 0;
        players = {};
        gameState = 'WAITING_FOR_CARD';
        timeLeft = 180;
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
    });
});
app.get('/', (req, res) => res.sendFile(path_1.default.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path_1.default.join(__dirname, 'admin.html')));
httpServer.listen(3000, '0.0.0.0', () => console.log('Serveur lancé'));
