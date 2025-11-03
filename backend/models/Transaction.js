const { Schema, model } = require('mongoose');

const TransactionSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true},
    type: {type: String, enum: ['deposit', 'withdraw', 'wager', 'win'], required:true},
    amount: { type:Number , required: true},
    createdAt: { type: Date, default: Date.now},
});

const Transaction = model('Transaction', TransactionSchema);

module.exports = Transaction;