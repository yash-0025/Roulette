const { Schema, model } = require('mongoose');


const UserSchema = new Schema({
    username: {type: String, required: true, unique: true},
    balance: {type: Number, default:1000},
});

const User = model('User', UserSchema);

module.exports = User;

