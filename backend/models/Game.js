const { Schema, model } = require('mongoose');

const GameSchema = new Schema({
    players: [{ type: Schema.Types.ObjectId , ref: 'User', required: true}],
    winner: { type: Schema.Types.ObjectId , ref: 'User', required: true},
    loser: { type: Schema.Types.ObjectId , ref: 'User', required: true},
    wager: { type: Number, required: true},
    winningColor: {type: String, enum: ['Red', 'Black'], required: true},
    createdAt: {type:Date, default: Date.now},
})


const Game = model('Game', GameSchema);

module.exports = Game;