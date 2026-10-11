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

app.use("/api/auth", auth.router);

const mine = (req) => (item) => item.userId === req.user.id;

// Games match by RAWG ID or normalized title
const titleKey = (game) => String(game.title ?? "").trim().toLowerCase();
const sameGame = (a, b) =>
  Boolean((a.rawg_id && a.rawg_id === b.rawg_id) || (titleKey(a) && titleKey(a) === titleKey(b)));

app.get("/api/games", auth.requireAuth, (req, res) => {
  try {
    const games = db.read().filter(mine(req));
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "Failed to read database" });
  }
});

app.post("/api/games", auth.requireAuth, (req, res) => {
  try {
    const games = db.read();
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

// Remove game from wishlist once added to collection
function leaveWishlist(req, game) {
  try {
    const wishlist = db.wishlist.read();
    const rest = wishlist.filter((item) => !(mine(req)(item) && sameGame(item, game)));
    if (rest.length !== wishlist.length) db.wishlist.write(rest);
  } catch (error) {
    console.error("Wishlist Error:", error);
  }
}

app.put("/api/games/:id", auth.requireAuth, (req, res) => {
  try {
    const games = db.read();
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

app.delete("/api/games/:id", auth.requireAuth, (req, res) => {
  try {
    const games = db.read();
    const targetId = String(req.params.id);
    const updatedGames = games.filter((g) => !(mine(req)(g) && String(g.id) === targetId));

    if (games.length === updatedGames.length) {
      return res.status(404).json({ error: "Game not found" });
    }

    db.write(updatedGames);
    res.json({ message: "Game deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Failed to delete game" });
  }
});

const WISH_FIELDS = [
  "rawg_id", "title", "released", "rating", "image", "platforms", "genres",
  "developers", "publishers", "website", "esrb", "metacritic", "playtime",
];

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

app.post("/api/wishlist/:id/collect", auth.requireAuth, (req, res) => {
  try {
    const wishlist = db.wishlist.read();
    const item = wishlist.find((w) => mine(req)(w) && String(w.id) === String(req.params.id));

    if (!item) {
      return res.status(404).json({ error: "Wishlist entry not found" });
    }

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

// Trending games cache (1 hour TTL)
const TRENDING_DAYS = Number(process.env.TRENDING_DAYS) || 120;
const TRENDING_SIZE = 12;
const TRENDING_TTL = 60 * 60 * 1000;
let trending = { at: 0, games: [] };
let refreshing = null;

const isoDate = (date) => date.toISOString().slice(0, 10);

function refreshTrending() {
  // Coalesce concurrent requests into a single in-flight RAWG request
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
    // Fall back to stale cache on RAWG failure, retry after 1 minute
    if (trending.games.length) {
      trending.at = Date.now() - TRENDING_TTL + 60 * 1000;
      return res.json(trending.games);
    }
    res.status(500).json({ error: "Failed to fetch trending games from RAWG service" });
  }
});

app.get("/api/lookup/:id", async (req, res) => {
  const { id } = req.params;

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
