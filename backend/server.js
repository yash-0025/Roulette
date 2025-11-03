const express = require('express');
const http = require('http');
const { Server } = require('socket.io')
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config('.env');
const cors = require('cors');

const User = require('./models/User');
const Game = require('./models/Game');
const Transaction = require('./models/Transaction');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const MONGO_URI = process.env.URI

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true
    },
});

// Database connection
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Database connected successfully "))
    .catch((err) => console.error(err));

// Mock wallet APIs 
app.post('/api/deposit', async(req,res) => {
    const { userId, amount } = req.body;
    if(amount <= 0) {
        return res.status(400).json({
            message: 'Amount must be positive'
        });
    }

    const user = await User.findByIdAndUpdate(userId, { $inc: {balance:amount}}, {new: true});
    await Transaction.create({
        user: userId,
        type: 'deposit',
        amount: amount
    });
    res.json(user);
})

app.post('/api/withdraw', async(req,res) => {
    const { userId, amount } = req.body;
    const user = await User.findById(userId);

    if(!user) return res.status(404).json({
        message:'User not found',
    });
    if(user.balance < amount) {
        return res.status(400).json({
            message: 'Insufficient funds',
        })
    }
    if(amount<=0) {
        return res.status(400).json({
            message: 'Amount must be positive'
        });
    }

    user.balance -= amount;
    await user.save();
    await Transaction.create({
        user: userId,
        type: 'withdraw',
        amount: -amount
    });
    res.json(user);
});

// Real time game logic 
// Store socket.id instead of userId to allow same user to play multiple games
const activeSockets = new Map(); // socket.id -> { userId, username }
let waitingPlayer = null;
const WAGER_AMOUNT = 10;

io.on('connection', (socket) => {
    console.log(`🎮 User connected: ${socket.id}`);

    socket.on('find_game', async(data) => {
        console.log(`📥 Find game request from socket ${socket.id}: ${data.username}`);
        const {username} = data;

        if(!username) {
            console.log('❌ No username provided');
            return socket.emit('error', {
                message: 'Username is required'
            });
        }

        let user;

        try {
            user = await User.findOne({username: username});
            if (!user) {
                user = await User.create({ username: username, balance: 1000 });
                console.log(`✨ New user created: ${username}`);
            } else {
                console.log(`👤 Existing user found: ${username} with balance ${user.balance}`);
            }
        } catch(err) {
            console.error('❌ Database error:', err);
            return socket.emit('error', { message: 'Error finding or creating user.'});
        }

        const userIdString = user._id.toString();
        
        //  Check if THIS socket is already active, not if the user has any active socket
        // This allows the same user to reconnect or play from same browser
        if (activeSockets.has(socket.id) && activeSockets.get(socket.id).userId === userIdString) {
            console.log(`⚠️ Socket ${socket.id} already has an active game session`);
            // Don't error - just allow them to continue
        } else {
            // Register this socket
            activeSockets.set(socket.id, { userId: userIdString, username: username });
            socket.userId = userIdString;
            socket.username = username;
            console.log(`✅ Socket ${socket.id} registered for user ${username}`);
        }

        // Always send fresh balance from database
        socket.emit('user_data', {
            _id: user._id.toString(),
            username: user.username,
            balance: user.balance  // This is the fresh balance from DB
        });

        if(user.balance < WAGER_AMOUNT) {
            activeSockets.delete(socket.id);
            console.log(`💰 User ${username} has insufficient funds`);
            return socket.emit('error', {
                message: 'Not enough funds to play',
            });
        }

        // Adding a small delay to ensure user_data is processed before game_start
         await new Promise(resolve => setTimeout(resolve, 50));

        // Matchmaking logic 
        if(!waitingPlayer || waitingPlayer.socket.id === socket.id) {
            // If the same socket is waiting, don't match with themselves
            waitingPlayer = {
                socket: socket,
                userId: user._id.toString(),
                username: username,
                wager: WAGER_AMOUNT,
                color: 'Red',
            };
            console.log(`⏳ ${username} (${socket.id}) is now waiting for opponent...`);
            socket.emit('status_update', {
                message: 'Waiting for opponent...'
            });
        } else {
            console.log(`🎲 MATCH FOUND! ${waitingPlayer.username} vs ${username}`);
            
            const player1 = waitingPlayer;
            const player2 = {
                socket: socket,
                userId: user._id.toString(),
                username: username,
                wager: WAGER_AMOUNT,
                color: 'Black',
            };

            waitingPlayer = null; // Clear the waiting player

            const gameRoom = `game_${player1.socket.id}_${player2.socket.id}`;
            player1.socket.join(gameRoom);
            player2.socket.join(gameRoom);

            console.log(`🎮 Game room created: ${gameRoom}`);

            io.to(gameRoom).emit('game_start', {
                message: 'Game starting! Spinning the wheel...',
                players: [
                    { 
                        userId: player1.userId, 
                        username: player1.username,
                        color: player1.color
                    },
                    {
                        userId: player2.userId,
                        username: player2.username,
                        color: player2.color
                    },
                ],
                room: gameRoom,
            });

            // Game logic 
            setTimeout(async() => {
                try {
                    const winningColor = Math.random() < 0.5 ? "Red" : "Black";
                    const winner = (winningColor === 'Red') ? player1 : player2;
                    const loser = (winningColor === 'Red') ? player2 : player1;

                    console.log(`🎯 ${winningColor} wins! Winner: ${winner.username}`);

                    // Deduct wager from both players
                    await User.findByIdAndUpdate(player1.userId, { 
                        $inc: { balance: -WAGER_AMOUNT }
                    })
                    await User.findByIdAndUpdate(player2.userId, {
                        $inc: { balance: -WAGER_AMOUNT }
                    })

                    // Award winnings to winner
                    const winnings = WAGER_AMOUNT * 2;
                    const winnerUser = await User.findByIdAndUpdate(winner.userId, {
                        $inc: { balance: winnings }
                    }, {new: true});
                    
                    const loserUser = await User.findById(loser.userId);

                    // Creating game record
                    await Game.create({
                        players: [player1.userId, player2.userId],
                        winner: winner.userId,
                        loser: loser.userId,
                        wager: WAGER_AMOUNT,
                        winningColor: winningColor,
                    });

                    await Transaction.create({
                        user: winner.userId,
                        type: 'win',
                        amount: winnings - WAGER_AMOUNT
                    });
                    await Transaction.create({
                        user: loser.userId,
                        type: 'wager',
                        amount: -WAGER_AMOUNT
                    })

                    io.to(gameRoom).emit('game_result', {
                        winningColor: winningColor,
                        winnerId: winner.userId,
                        loserId: loser.userId,
                    });

                    player1.socket.emit('balance_update', {
                        newBalance: player1.userId === winner.userId ? winnerUser?.balance : loserUser?.balance
                    });
                    player2.socket.emit('balance_update', {
                        newBalance: player2.userId === winner.userId ? winnerUser?.balance : loserUser?.balance
                    })

                    console.log(`✅ Game completed! ${winner.username} won $${winnings - WAGER_AMOUNT}`);

                    // IMPORTANT: Don't remove from activeSockets here - let them play again!
                    // Only remove on disconnect
                    
                    player1.socket.leave(gameRoom);
                    player2.socket.leave(gameRoom);
                } catch(err) {
                    console.error('❌ Game error:', err);
                    io.to(gameRoom).emit('error', {
                        message: 'A game error occurred'
                    });
                }
            }, 3000);
        }
    })

    socket.on('disconnect', () => {
        console.log(`👋 User disconnected: ${socket.id} (${socket.username || 'unknown'})`);

        // Remove from active sockets
        if(activeSockets.has(socket.id)) {
            const userData = activeSockets.get(socket.id);
            activeSockets.delete(socket.id);
            console.log(`🗑️ Socket ${socket.id} (${userData.username}) removed from active list.`);
        }

        // Clear waiting player if it's this socket
        if(waitingPlayer && waitingPlayer.socket.id === socket.id) {
            console.log(`⏳ Waiting player ${waitingPlayer.username} disconnected, queue cleared.`);
            waitingPlayer = null;
        }
    });
});

const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`🎉 Server is up and running on http://localhost:${port}`);
})