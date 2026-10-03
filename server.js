const express = require("express");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const auth = require("./auth");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const RAWG_API_KEY = process.env.RAWG_API_KEY || "d75605f6b2254c428360a0a491247add";

// ACCOUNTS - Register, sign in, sign out and "who am I" live in auth.js.
// Every route below that reads or writes a person's games asks for a signed-in account first
// and only ever touches the entries marked with that account's id.
app.use("/api/auth", auth.router);

// The entries (games or wishlist) that belong to the signed-in person
const mine = (req) => (item) => item.userId === req.user.id;

// Two entries are the same game when they share a RAWG id or a title.
const titleKey = (game) => String(game.title ?? "").trim().toLowerCase();
const sameGame = (a, b) =>
  Boolean((a.rawg_id && a.rawg_id === b.rawg_id) || (titleKey(a) && titleKey(a) === titleKey(b)));

// READ - Get the signed-in person's saved games from the database
app.get("/api/games", auth.requireAuth, (req, res) => {
  try {
    const games = db.read().filter(mine(req));
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "Failed to read database" });
  }
});

// CREATE - Add a game to the signed-in person's collection
app.post("/api/games", auth.requireAuth, (req, res) => {
  try {
    const games = db.read();
    // The id and the owner are set here. The request can't choose them.
    const { id, userId, ...fields } = req.body ?? {};
    const game = { id: db.newId(games), ...fields, userId: req.user.id };
    games.push(game);
    db.write(games);
    leaveWishlist(req, game);
    res.status(201).json(game);
  } catch (error) {
    res.status(500).json({ error: "Failed to create game entry" });
  }
});

// A game that has been collected is no longer wanted. The game is already saved by now, so a
// problem with the wishlist file is only logged.
function leaveWishlist(req, game) {
  try {
    const wishlist = db.wishlist.read();
    const rest = wishlist.filter((item) => !(mine(req)(item) && sameGame(item, game)));
    if (rest.length !== wishlist.length) db.wishlist.write(rest);
  } catch (error) {
    console.error("Wishlist Error:", error);
  }
}

// UPDATE - Edit a game by ID
app.put("/api/games/:id", auth.requireAuth, (req, res) => {
  try {
    const games = db.read();
    // Convert both IDs to String for a safe match
    const game = games.find((g) => mine(req)(g) && String(g.id) === String(req.params.id));

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const { id, userId, ...changes } = req.body ?? {};
    Object.assign(game, changes);
    db.write(games);
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: "Failed to update game" });
  }
});

// DELETE - Remove a game by ID from library.json
app.delete("/api/games/:id", auth.requireAuth, (req, res) => {
  try {
    const games = db.read();

    // Convert parameter ID to a string for a safe comparison
    const targetId = String(req.params.id);

    // Filter out the item matching the target ID, if it is one of this person's
    const updatedGames = games.filter((g) => !(mine(req)(g) && String(g.id) === targetId));

    // If array lengths are equal, nothing was removed
    if (games.length === updatedGames.length) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Save the updated list back to library.json
    db.write(updatedGames);

    res.json({ message: "Game deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Failed to delete game" });
  }
});

// WISHLIST - Games the signed-in person wants but doesn't own yet. An entry has the same
// fields as a search result, and only these are kept.
const WISH_FIELDS = [
  "rawg_id", "title", "released", "rating", "image", "platforms", "genres",
  "developers", "publishers", "website", "esrb", "metacritic", "playtime",
];

// READ - Get the wishlist
app.get("/api/wishlist", auth.requireAuth, (req, res) => {
  try {
    res.json(db.wishlist.read().filter(mine(req)));
  } catch (error) {
    res.status(500).json({ error: "Failed to read wishlist" });
  }
});

// CREATE - Put a game on the wishlist
app.post("/api/wishlist", auth.requireAuth, (req, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body.title !== "string" || !body.title.trim()) {
      return res.status(400).json({ error: "A game needs a title" });
    }

    const fields = {};
    for (const key of WISH_FIELDS) {
      if (body[key] !== undefined) fields[key] = body[key];
    }
    fields.title = body.title.trim();

    if (db.read().some((g) => mine(req)(g) && sameGame(g, fields))) {
      return res.status(409).json({ error: "That game is already in your collection." });
    }
    const wishlist = db.wishlist.read();
    if (wishlist.some((item) => mine(req)(item) && sameGame(item, fields))) {
      return res.status(409).json({ error: "That game is already on your wishlist." });
    }

    const item = { id: db.newId(wishlist), ...fields, userId: req.user.id, addedAt: new Date().toISOString() };
    wishlist.push(item);
    db.wishlist.write(wishlist);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
});

// DELETE - Take a game off the wishlist
app.delete("/api/wishlist/:id", auth.requireAuth, (req, res) => {
  try {
    const wishlist = db.wishlist.read();
    const targetId = String(req.params.id);
    const rest = wishlist.filter((item) => !(mine(req)(item) && String(item.id) === targetId));

    if (rest.length === wishlist.length) {
      return res.status(404).json({ error: "Wishlist entry not found" });
    }

    db.wishlist.write(rest);
    res.json({ message: "Removed from wishlist" });
  } catch (error) {
    console.error("Wishlist Delete Error:", error);
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
});

// UPDATE - Move a wishlist entry into the collection: the person has got the game.
// The answer is the game as it now sits in the collection.
app.post("/api/wishlist/:id/collect", auth.requireAuth, (req, res) => {
  try {
    const wishlist = db.wishlist.read();
    const item = wishlist.find((w) => mine(req)(w) && String(w.id) === String(req.params.id));

    if (!item) {
      return res.status(404).json({ error: "Wishlist entry not found" });
    }

    // A game that is already owned just leaves the wishlist
    const games = db.read();
    let game = games.find((g) => mine(req)(g) && sameGame(g, item));
    const status = game ? 200 : 201;
    if (!game) {
      const { id, userId, addedAt, ...fields } = item;
      game = { id: db.newId(games), ...fields, userId: req.user.id };
      games.push(game);
      db.write(games);
    }

    db.wishlist.write(wishlist.filter((w) => w !== item));
    res.status(status).json(game);
  } catch (error) {
    console.error("Collect Error:", error);
    res.status(500).json({ error: "Failed to move the game to your collection" });
  }
});

// What a RAWG game looks like to the page. A search result and a trending game share it.
const summarize = (game) => ({
  rawg_id: game.id,
  title: game.name,
  released: game.released || "N/A",
  rating: game.rating || "N/A",
  image: game.background_image || null,
  platforms: game.platforms
    ? game.platforms.map((p) => p.platform.name)
    : [],
  genres: game.genres ? game.genres.map((g) => g.name) : [],
});

// INTEGRATION - Look up games from RAWG API
app.get("/api/lookup", async (req, res) => {
  try {
    const { title } = req.query;

    if (!title) {
      return res.status(400).json({ error: "Title query parameter is required" });
    }

    const response = await axios.get("https://api.rawg.io/api/games", {
      params: {
        key: RAWG_API_KEY,
        search: title,
        page_size: 5,
      },
    });

    const results = response.data.results.map(summarize);

    res.json(results);
  } catch (error) {
    console.error("RAWG Lookup Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch games from RAWG service" });
  }
});

// INTEGRATION - What is trending: of the games released lately, the ones that the most RAWG
// users have added to their libraries. Everyone sees the same list, so RAWG is asked at most
// once an hour however many people open the home page.
const TRENDING_DAYS = Number(process.env.TRENDING_DAYS) || 120;
const TRENDING_SIZE = 12;
const TRENDING_TTL = 60 * 60 * 1000;
let trending = { at: 0, games: [] };
let refreshing = null;

const isoDate = (date) => date.toISOString().slice(0, 10);

function refreshTrending() {
  // Several people arriving at once share one request to RAWG
  if (!refreshing) {
    const today = new Date();
    const since = new Date(today.getTime() - TRENDING_DAYS * 24 * 60 * 60 * 1000);
    refreshing = axios
      .get("https://api.rawg.io/api/games", {
        params: {
          key: RAWG_API_KEY,
          dates: isoDate(since) + "," + isoDate(today),
          ordering: "-added",
          exclude_additions: true,
          page_size: TRENDING_SIZE,
        },
        timeout: 10000,
      })
      .then((response) => {
        trending = { at: Date.now(), games: response.data.results.map(summarize) };
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

app.get("/api/trending", async (req, res) => {
  try {
    if (Date.now() - trending.at > TRENDING_TTL) await refreshTrending();
    res.json(trending.games);
  } catch (error) {
    console.error("RAWG Trending Error:", error.response?.data || error.message);
    // RAWG can't be reached. An old list is better than none, and the next try comes in a minute.
    if (trending.games.length) {
      trending.at = Date.now() - TRENDING_TTL + 60 * 1000;
      return res.json(trending.games);
    }
    res.status(500).json({ error: "Failed to fetch trending games from RAWG service" });
  }
});

// INTEGRATION - Get the details of one RAWG game: developers, publishers, age rating and more.
// The search results above don't carry these, only RAWG's page for a single game does.
// Example request: GET http://localhost:3000/api/lookup/41494
app.get("/api/lookup/:id", async (req, res) => {
  const { id } = req.params;

  // RAWG ids are whole numbers. RAWG also accepts names in this spot, so only numbers go through.
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Game id must be a number" });
  }

  try {
    const response = await axios.get("https://api.rawg.io/api/games/" + id, {
      params: { key: RAWG_API_KEY },
      timeout: 10000,
    });
    const game = response.data;

    res.json({
      developers: (game.developers || []).map((d) => d.name),
      publishers: (game.publishers || []).map((p) => p.name),
      website: game.website || null,
      esrb: game.esrb_rating ? game.esrb_rating.name : null,
      metacritic: game.metacritic || null,
      playtime: game.playtime || null,
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "Game not found on RAWG" });
    }
    console.error("RAWG Details Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch game details from RAWG service" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});
