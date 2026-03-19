import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- ÉTAT DU JEU ---
let numbersToGuess: number[] = [];
let currentCardIndex = 0;
let cardsLaunched = 0;
let currentQuestionIndex = 0; 
let players: Record<string, { name: string, cardScore: number, totalScore: number, found: boolean, history: any[] }> = {};
let gameState = 'WAITING_FOR_CARD'; 
let timer: NodeJS.Timeout | null = null;
let timeLeft = 180;

// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Joueur connecté:', socket.id);
  
  socket.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });

  socket.on('join', (name) => {
    console.log('Joueur rejoint:', name);
    players[socket.id] = { name, cardScore: 0, totalScore: 0, found: false, history: [] };
    io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
  });

  socket.on('guess', (guess) => {
    if (gameState !== 'GUESSING' || !players[socket.id] || players[socket.id].found) return;
    
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
    
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      timeLeft--;
      io.emit('timer', timeLeft);
      
      const allFound = Object.keys(players).length > 0 && Object.values(players).every(p => p.found);
      
      if (timeLeft <= 0 || allFound) { 
        if (timer) clearInterval(timer); 
        gameState = 'FEEDBACK'; 
        io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft }); 
      }
    }, 1000);
  });

  socket.on('admin:stopQuestion', () => {
    console.log('Admin stop question');
    if (timer) clearInterval(timer);
    currentQuestionIndex++;
    if (currentQuestionIndex >= 4) {
        gameState = 'CARD_FINISHED';
    } else {
        gameState = 'FEEDBACK';
    }
    io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
  });

  socket.on('admin:deletePlayer', (playerId) => {
    console.log('Admin delete player:', playerId);
    delete players[playerId];
    io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
  });

  socket.on('admin:finishGame', () => {
    console.log('Admin finish game');
    if (timer) clearInterval(timer);
    gameState = 'GAME_FINISHED';
    io.emit('update', { players, gameState, currentCardIndex, currentQuestionIndex, timeLeft });
  });

  socket.on('admin:resetGame', () => {
    console.log('Admin reset game');
    if (timer) clearInterval(timer);
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
  });
});

// --- ROUTES & FICHIERS STATIQUES (CORRIGÉ POUR RENDER) ---

// On définit le chemin vers le dossier "public" à partir de la racine du projet
const publicPath = path.join(process.cwd(), 'public');

// Utilisation du dossier public pour les assets (CSS, images, JS client)
app.use(express.static(publicPath));

// Routes vers les fichiers HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});

// --- LANCEMENT ---
const PORT: number = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`---`);
  console.log(`🚀 ZEKATON Serveur Live sur le port ${PORT}`);
  console.log(`---`);
});

export {};