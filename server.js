const express = require("express");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const RAWG_API_KEY = process.env.RAWG_API_KEY || "d75605f6b2254c428360a0a491247add";

// READ - Get all saved games from your database
app.get("/api/games", (req, res) => {
  try {
    const games = db.read();
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "Failed to read database" });
  }
});

// CREATE - Add a game to your database
app.post("/api/games", (req, res) => {
  try {
    const games = db.read();
    const game = { id: Date.now(), ...req.body };
    games.push(game);
    db.write(games);
    res.status(201).json(game);
  } catch (error) {
    res.status(500).json({ error: "Failed to create game entry" });
  }
});

// UPDATE - Edit a game by ID
app.put("/api/games/:id", (req, res) => {
  try {
    const games = db.read();
    // Convert both IDs to String for a safe match
    const game = games.find((g) => String(g.id) === String(req.params.id));

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    Object.assign(game, req.body);
    db.write(games);
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: "Failed to update game" });
  }
});

// DELETE - Remove a game by ID from library.json
app.delete("/api/games/:id", (req, res) => {
  try {
    const games = db.read();
    
    // Convert parameter ID to a string for a safe comparison
    const targetId = String(req.params.id);

    // Filter out the item matching the target ID
    const updatedGames = games.filter((g) => String(g.id) !== targetId);

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

    const results = response.data.results.map((game) => ({
      rawg_id: game.id,
      title: game.name,
      released: game.released || "N/A", 
      rating: game.rating || "N/A",
      image: game.background_image || null,
      platforms: game.platforms
        ? game.platforms.map((p) => p.platform.name)
        : [],
      genres: game.genres ? game.genres.map((g) => g.name) : [],
    }));

    res.json(results);
  } catch (error) {
    console.error("RAWG Lookup Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch games from RAWG service" });
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

    // The description can run to thousands of characters, so keep the start of it.
    const text = game.description_raw || "";
    const description = text.length > 1200 ? text.slice(0, 1200).replace(/\s+\S*$/, "") + "…" : text;

    res.json({
      developers: (game.developers || []).map((d) => d.name),
      publishers: (game.publishers || []).map((p) => p.name),
      website: game.website || null,
      esrb: game.esrb_rating ? game.esrb_rating.name : null,
      metacritic: game.metacritic || null,
      playtime: game.playtime || null,
      description: description || null,
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "Game not found on RAWG" });
    }
    console.error("RAWG Details Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch game details from RAWG service" });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});