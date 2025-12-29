const connectDB = require("./db");
const Game = require("./game");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
require("dotenv").config();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Function to format date as "oct_31", "nov_1", etc.
const formatDateForFolder = () => {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const now = new Date();
  const month = months[now.getMonth()];
  const day = now.getDate();
  return `${month}_${day}`;
};

// Helper function to convert stream to string
const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const addGameInTempDb = async (gameData) => {
  await connectDB();

  try {
    // const existing = await Game.findOne({ id: gameData.id });
    // if (existing) {
    //   console.log("Game already exists:", gameData.name);
    //   return;
    // }

    const game = new Game(gameData);
    await game.save();
    console.log("Game saved:", game.name);
  } catch (err) {
    console.error("Error adding game:", err);
  }
};

const gameData = {
  id: 341400,
  category: 0,
  created_at: 1745333439,
  involved_companies: [317219],
  name: "Voidling Bound",
  platforms: [6],
  release_dates: [732164],
  slug: "voidling-bound--1",
  updated_at: 1745346705,
  url: "https://www.igdb.com/games/voidling-bound--1",
  websites: [733097],
  checksum: "43e9dd62-36a1-b958-facf-28c52d4af6c5",
  game_type: 0,
};
module.exports = addGameInTempDb;
module.exports.uploadLogToS3 = uploadLogToS3;
module.exports.formatDateForFolder = formatDateForFolder;
