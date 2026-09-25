const express = require("express");
const cors = require("cors");
const db = require("./db");
const { PLATFORMS } = require("./platforms");
const { searchGames } = require("./wikidata");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
// Check and tidy the fields of a game. Gives back { game } or { error }.
function parseGame(body = {}) {
 const title = String(body.title ?? "").trim();
 const developer = String(body.developer ?? "").trim();
 const platform = String(body.platform ?? "other");
 const year = String(body.year ?? "").trim();
 const maxYear = new Date().getFullYear() + 1;
 if (!title) return { error: "Title is required." };
 if (!PLATFORMS.some((p) => p.id === platform)) return { error: "Pick a platform from the list." };
 if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > maxYear)) {
  return { error: "Year should be a number between 1 and " + maxYear + "." };
 }
 return { game: { title, platform, developer: developer || "Unknown", year: year ? Number(year) : null } };
}
// READ - the platforms a game can be filed under
app.get("/api/platforms", (req, res) => {
 res.json(PLATFORMS.map(({ id, name, abbr, brand }) => ({ id, name, abbr, brand })));
});
// READ - get all games
app.get("/api/games", (req, res) => {
 res.json(db.read());
});
// CREATE - add a game
app.post("/api/games", (req, res) => {
 const { game: fields, error } = parseGame(req.body);
 if (error) return res.status(400).json({ error });
 const games = db.read();
 const game = { id: Date.now(), ...fields };
 games.push(game);
 db.write(games);
 res.json(game);
});
// UPDATE - edit a game by id
app.put("/api/games/:id", (req, res) => {
 const games = db.read();
 const game = games.find((g) => g.id == req.params.id);
 if (!game) return res.status(404).json({ error: "Game not found." });
 const { game: fields, error } = parseGame(req.body);
 if (error) return res.status(400).json({ error });
 Object.assign(game, fields);
 db.write(games);
 res.json(game);
});
// DELETE - remove a game by id
app.delete("/api/games/:id", (req, res) => {
 const games = db.read();
 if (!games.some((g) => g.id == req.params.id)) {
  return res.status(404).json({ error: "Game not found." });
 }
 db.write(games.filter((g) => g.id != req.params.id));
 res.json({ message: "Game deleted" });
});
// INTEGRATION - look up a game from an external service (Wikidata)
app.get("/api/lookup", async (req, res) => {
 const title = String(req.query.title ?? "").trim();
 if (!title) return res.status(400).json({ error: "Type a title to search for." });
 try {
  res.json(await searchGames(title));
 } catch (err) {
  res.status(502).json({ error: "Couldn't reach Wikidata. Try again in a moment." });
 }
});
app.listen(3000, () => {
 console.log("Server running at http://localhost:3000");
});
