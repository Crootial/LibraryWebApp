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
    }));

    res.json(results);
  } catch (error) {
    console.error("RAWG Lookup Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch games from RAWG service" });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});