const axios = require("axios");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const connectDB = require("./db");
const Game = require("./game");
require("dotenv").config();

// IGDB/Twitch credentials - add these to your .env file
const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_DUMPS_URL = "https://api.igdb.com/v4/dumps/games";
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
// Get Twitch OAuth access token
const getAccessToken = async () => {
  try {
    const response = await axios.post(TWITCH_AUTH_URL, null, {
      params: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
      },
    });
    console.log("✅ Access token obtained successfully");
    return response.data.access_token;
  } catch (error) {
    console.error("❌ Error getting access token:", error.message);
    throw error;
  }
};

// Fetch dump metadata from IGDB to get download URL
const getDumpInfo = async (accessToken) => {
  try {
    const response = await axios.get(IGDB_DUMPS_URL, {
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    console.log("✅ Dump info fetched successfully");
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching dump info:", error.message);
    throw error;
  }
};

// Download the CSV dump file (S3 pre-signed URL - no auth headers needed)
const downloadDump = async (downloadUrl) => {
  const tempFilePath = path.join(__dirname, "temp_games_dump.csv");

  try {
    console.log("⬇️  Downloading dump file...");
    console.log(`📦 File size: ~${(277765881 / 1024 / 1024).toFixed(2)} MB`);

    const response = await axios({
      method: "get",
      url: downloadUrl,
      responseType: "stream",
      // No headers needed - S3 URL is pre-signed with auth in query params
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("✅ Dump file downloaded successfully");
    return tempFilePath;
  } catch (error) {
    console.error("❌ Error downloading dump:", error.message);
    throw error;
  }
};

// Check if a game already exists in temp DB
const gameExistsInDb = async (gameId) => {
  const existing = await Game.findOne({ id: gameId });
  return !!existing;
};

// Add game to temp DB
const addGameToDb = async (gameData) => {
  try {
    const game = new Game(gameData);
    await game.save();
    return true;
  } catch (error) {
    console.error(`❌ Error saving game ${gameData.name}:`, error.message);
    return false;
  }
};

// Parse CSV value - handle arrays and numbers
const parseValue = (value, key) => {
  if (!value || value === "") return undefined;

  // Array fields in the schema
  const arrayFields = [
    "game_modes",
    "genres",
    "involved_companies",
    "platforms",
    "player_perspectives",
    "release_dates",
    "screenshots",
    "themes",
    "videos",
    "websites",
    "language_supports",
  ];

  // Number fields in the schema
  const numberFields = [
    "id",
    "category",
    "cover",
    "created_at",
    "first_release_date",
    "parent_game",
    "updated_at",
    "game_type",
  ];

  if (arrayFields.includes(key)) {
    // Parse array format: {1,2,3} or [1,2,3]
    const cleaned = value.replace(/[{}\[\]]/g, "");
    if (!cleaned) return [];
    return cleaned
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  if (numberFields.includes(key)) {
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }

  return value;
};

// Process the CSV file and sync games
const processAndSyncGames = async (csvFilePath) => {
  await connectDB();

  const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
  const twentyFourHoursAgo = now - 24 * 60 * 60; // 24 hours ago

  let totalProcessed = 0;
  let filteredCount = 0;
  let addedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  console.log("📊 Processing CSV dump...");
  console.log(
    `⏰ Filtering games updated after: ${new Date(
      twentyFourHoursAgo * 1000
    ).toISOString()}`
  );

  return new Promise((resolve, reject) => {
    const games = [];

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on("data", (row) => {
        totalProcessed++;

        // Parse updated_at from the row
        const updatedAt = parseValue(row.updated_at, "updated_at");

        // Filter: only games updated in last 24 hours
        if (updatedAt && updatedAt >= twentyFourHoursAgo) {
          const gameData = {};

          // Map CSV columns to schema fields
          Object.keys(row).forEach((key) => {
            const value = parseValue(row[key], key);
            if (value !== undefined) {
              gameData[key] = value;
            }
          });

          games.push(gameData);
          filteredCount++;
        }
      })
      .on("end", async () => {
        console.log(`\n📈 Stats after filtering:`);
        console.log(`   Total games in dump: ${totalProcessed}`);
        console.log(`   Games updated in last 24h: ${filteredCount}`);

        // Process filtered games - check existence and add
        console.log("\n🔄 Syncing to database...");

        for (const gameData of games) {
          try {
            const exists = await gameExistsInDb(gameData.id);

            if (exists) {
              skippedCount++;
              console.log(
                `⏭️  Skipped (exists): ${gameData.name} (ID: ${gameData.id})`
              );
            } else {
              const added = await addGameToDb(gameData);
              if (added) {
                addedCount++;
                console.log(`✅ Added: ${gameData.name} (ID: ${gameData.id})`);
              } else {
                errorCount++;
              }
            }
          } catch (error) {
            errorCount++;
            console.error(
              `❌ Error processing game ${gameData.id}:`,
              error.message
            );
          }
        }

        console.log("\n📊 Final Summary:");
        console.log(`   ✅ Added: ${addedCount}`);
        console.log(`   ⏭️  Skipped (already exists): ${skippedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);

        resolve({
          totalProcessed,
          filteredCount,
          addedCount,
          skippedCount,
          errorCount,
        });
      })
      .on("error", (error) => {
        console.error("❌ Error processing CSV:", error.message);
        reject(error);
      });
  });
};

// Cleanup temp files
const cleanup = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🧹 Temp file cleaned up");
    }
  } catch (error) {
    console.error("⚠️  Warning: Could not delete temp file:", error.message);
  }
};

// Main function
const syncGamesFromDump = async () => {
  console.log("🚀 Starting IGDB Games Dump Sync...\n");

  let tempFilePath = null;

  try {
    // Step 1: Get access token
    const accessToken = await getAccessToken();
    console.log(accessToken, "accessToken");
    // Step 2: Get dump info
    const dumpInfo = await getDumpInfo(accessToken);
    console.log("📦 Dump info:", JSON.stringify(dumpInfo, null, 2));

    if (!dumpInfo || !dumpInfo.s3_url) {
      throw new Error("No download URL found in dump info");
    }

    // Step 3: Download the dump (S3 URL is pre-signed, no auth needed)
    tempFilePath = await downloadDump(dumpInfo.s3_url);

    // Step 4: Process and sync games
    const results = await processAndSyncGames(tempFilePath);

    console.log("\n✅ Sync completed successfully!");
    return results;
  } catch (error) {
    console.error("\n❌ Sync failed:", error.message);
    throw error;
  } finally {
    // Cleanup temp file
    if (tempFilePath) {
      cleanup(tempFilePath);
    }

    // Close MongoDB connection
    const mongoose = require("mongoose");
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// Run if executed directly
if (require.main === module) {
  syncGamesFromDump()
    .then(() => {
      console.log("\n👋 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

module.exports = syncGamesFromDump;
