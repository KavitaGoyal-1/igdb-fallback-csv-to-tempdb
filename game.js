// models/Game.js
const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
  id: Number,
  category: Number,
  cover: Number,
  created_at: Number,
  first_release_date: Number,
  game_modes: [Number],
  genres: [Number],
  involved_companies: [Number],
  name: String,
  parent_game: Number,
  platforms: [Number],
  player_perspectives: [Number],
  release_dates: [Number],
  screenshots: [Number],
  slug: String,
  summary: String,
  themes: [Number],
  updated_at: Number,
  url: String,
  videos: [Number],
  websites: [Number],
  checksum: String,
  language_supports: [Number],
  game_type: Number
});

module.exports = mongoose.model('Game', GameSchema);
