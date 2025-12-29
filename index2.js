const axios = require("axios");
const { Pool } = require("pg");
const { DateTime } = require("luxon");
const express = require("express");
require("dotenv").config();
const addGameInTempDb = require("./addGamesInTempDb");
const app = express();
app.use(express.json());
//prod cred:
const strapiUrl = process.env.PROD_STRAPI_URL;
const strapiToken = process.env.PROD_API_TOKEN;

//stage cred:
// const strapiUrl = process.env.STAGE_STRAPI_URL;
// const strapiToken = process.env.STAGE_API_TOKEN;

// const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/token";
// const IGDB_API_URL = "https://api.igdb.com/v4/games";
// const CHUNK_SIZE = 75;
// const CLIENT_ID = "d0vu4uargc119cfvauchk0hw7n0qh6";
// const CLIENT_SECRET = "18r7bxgrlr5n2jnqomhd5vtsnaq605";

// const categoryMapping = {
//   0: "main_game",
//   1: "dlc_addon",
//   2: "expansion",
//   3: "bundle",
//   4: "standalone_expansion",
//   5: "mod",
//   6: "episode",
//   7: "season",
//   8: "remake",
//   9: "remaster",
//   10: "expanded_game",
//   11: "port",
//   12: "fork",
//   13: "pack",
//   14: "update",
// };

//production database cred
const dbClient = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 10,
  idleTimeoutMillis: 30000,
});

//stage database cred
// const dbClient = new Client({
// user: process.env.DB_USER,
// host: process.env.DB_HOST,
// database: process.env.DB_DATABASE,
// password: process.env.DB_PASSWORD,
// port: process.env.DB_PORT,
// });

let accessToken = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkIfGameExists = async (slug) => {
  try {
    const strapiApiUrl = `${strapiUrl}/api/games/${slug}`;
    const response = await axios.get(strapiApiUrl);
    return response.data;
  } catch (error) {
    console.error(`Error checking for game with slug "${slug}":`, error);
    return null;
  }
};

const createGameEntryInStrapi = async (gameData) => {
  try {
    const strapiApiUrl = `${strapiUrl}/api/games`;
    const response = await axios.post(strapiApiUrl, { data: gameData });
    console.log("Game entry created successfully:");
    return response.data;
  } catch (error) {
    console.error(
      "Error creating game entry:",
      error.response ? error.response.data : error
    );
  }
};

const fetchWithRetry = async (
  url,
  data,
  headers,
  retries = 5,
  retryCount = 1
) => {
  try {
    return await axios.post(url, data, { headers });
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      const retryAfter = 2 ** retryCount * 2000;
      await delay(retryAfter);
      return fetchWithRetry(url, data, headers, retries - 1, retryCount + 1);
    }
    throw error;
  }
};

app.post("/upload-files", async (req, res) => {
  try {
    const igdbData = req.body;
    console.log(igdbData, "IGDB DATA");
    console.log(req.headers, "HEADERS");
    console.log(req.body, "RAW IGDB DATA");

    const method = req.body.method;
    console.log("Webhook Method:", method);

    if (!igdbData) {
      return res.status(400).send("No data received");
    }
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

    await addGameInTempDb(igdbData);

    res.send({ message: "Data uploaded successfully" });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.listen(3002, () => {
  console.log(`Example app listening on port ${3002}`);
});
