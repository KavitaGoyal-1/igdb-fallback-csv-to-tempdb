const axios = require("axios");
const connectDB = require("./db");
const Game = require("./game");
require("dotenv").config();

// IGDB/Twitch credentials
const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_GAMES_URL = "https://api.igdb.com/v4/games";
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

// Get yesterday's date range in UTC (start and end timestamps)
const getYesterdayRange = () => {
  const now = new Date();

  // Yesterday start: 00:00:00 UTC
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCDate(now.getUTCDate() - 1);
  yesterdayStart.setUTCHours(0, 0, 0, 0);

  // Yesterday end: 23:59:59 UTC
  const yesterdayEnd = new Date(now);
  yesterdayEnd.setUTCDate(now.getUTCDate() - 1);
  yesterdayEnd.setUTCHours(23, 59, 59, 999);

  return {
    start: Math.floor(yesterdayStart.getTime() / 1000),
    end: Math.floor(yesterdayEnd.getTime() / 1000),
    startDate: yesterdayStart,
    endDate: yesterdayEnd,
  };
};

// Fetch games from IGDB API with pagination
const fetchGamesFromAPI = async (
  accessToken,
  yesterdayRange,
  offset = 0,
  limit = 500
) => {
  const query = `
    fields id, name, slug, url, category, cover, created_at, updated_at, 
           first_release_date, game_modes, genres, involved_companies, 
           parent_game, platforms, player_perspectives, release_dates, 
           screenshots, summary, themes, videos, websites, checksum, 
           language_supports, game_type;
    where updated_at >= ${yesterdayRange.start} & updated_at <= ${yesterdayRange.end};
    sort updated_at desc;
    limit ${limit};
    offset ${offset};
  `;

  try {
    const response = await axios.post(IGDB_GAMES_URL, query, {
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      // Rate limited - wait and retry
      console.log("⏳ Rate limited, waiting 1 second...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchGamesFromAPI(accessToken, yesterdayRange, offset, limit);
    }
    throw error;
  }
};

// Get count of games updated yesterday
const getUpdatedGamesCount = async (accessToken, yesterdayRange) => {
  const query = `
    fields id;
    where updated_at >= ${yesterdayRange.start} & updated_at <= ${yesterdayRange.end};
    limit 1;
  `;

  try {
    const response = await axios.post(
      "https://api.igdb.com/v4/games/count",
      query,
      {
        headers: {
          "Client-ID": CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "text/plain",
        },
      }
    );
    return response.data.count;
  } catch (error) {
    console.log("⚠️ Could not get count, will paginate until empty");
    return null;
  }
};

// Main sync function
const syncGamesFromAPI = async () => {
  console.log("🚀 Starting IGDB Games Sync (API Method)...\n");

  // Get yesterday's date range
  const yesterdayRange = getYesterdayRange();

  console.log(`📅 Today (UTC): ${new Date().toUTCString()}`);
  console.log(
    `📅 Fetching games updated on: ${yesterdayRange.startDate
      .toUTCString()
      .split(" ")
      .slice(0, 4)
      .join(" ")}`
  );
  console.log(`⏰ From: ${yesterdayRange.startDate.toISOString()} (UTC)`);
  console.log(`⏰ To:   ${yesterdayRange.endDate.toISOString()} (UTC)`);
  console.log(
    `🔢 Unix timestamps: ${yesterdayRange.start} to ${yesterdayRange.end}\n`
  );

  let addedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalFetched = 0;

  try {
    // Step 1: Get access token
    const accessToken = await getAccessToken();

    // Step 2: Connect to database
    await connectDB();

    // Step 3: Get estimated count
    const estimatedCount = await getUpdatedGamesCount(
      accessToken,
      yesterdayRange
    );
    if (estimatedCount !== null) {
      console.log(`📊 Estimated games to process: ${estimatedCount}\n`);
    }

    // Step 4: Fetch and process games in batches
    const batchSize = 500; // IGDB max limit per request
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      console.log(`📥 Fetching batch: offset ${offset}...`);

      const games = await fetchGamesFromAPI(
        accessToken,
        yesterdayRange,
        offset,
        batchSize
      );

      if (!games || games.length === 0) {
        hasMore = false;
        break;
      }

      totalFetched += games.length;
      console.log(`   Got ${games.length} games (total: ${totalFetched})`);

      // Process each game
      for (const gameData of games) {
        try {
          const exists = await gameExistsInDb(gameData.id);

          if (exists) {
            skippedCount++;
            // Uncomment below line if you want to see skipped games
            // console.log(`   ⏭️ Skipped: ${gameData.name}`);
          } else {
            const added = await addGameToDb(gameData);
            if (added) {
              addedCount++;
              console.log(`   ✅ Added: ${gameData.name} (ID: ${gameData.id})`);
            } else {
              errorCount++;
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`   ❌ Error: ${gameData.id} - ${error.message}`);
        }
      }

      // Move to next batch
      offset += batchSize;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 SYNC COMPLETE - SUMMARY");
    console.log("=".repeat(50));
    console.log(`   📥 Total fetched from IGDB: ${totalFetched}`);
    console.log(`   ✅ Added to DB: ${addedCount}`);
    console.log(`   ⏭️  Skipped (already exists): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log("=".repeat(50));

    return { totalFetched, addedCount, skippedCount, errorCount };
  } catch (error) {
    console.error("\n❌ Sync failed:", error.message);
    throw error;
  } finally {
    // Close MongoDB connection
    const mongoose = require("mongoose");
    await mongoose.connection.close();
    console.log("\n🔌 Database connection closed");
  }
};

// Run if executed directly
if (require.main === module) {
  syncGamesFromAPI()
    .then(() => {
      console.log("\n👋 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

module.exports = syncGamesFromAPI;
