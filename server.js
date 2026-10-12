const express = require("express");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const auth = require("./auth");
const profile = require("./profile");
const friends = require("./friends");

const app = express();
app.set("trust proxy", 1);
app.use(cors(), express.json(), express.static("public"));
app.use("/api/auth", auth.router);
app.use("/api/profile", profile.router);
app.use("/api/friends", friends.router);

const RAWG_API_KEY = process.env.RAWG_API_KEY || "d75605f6b2254c428360a0a491247add";
const rawg = (path, params, timeout) =>
  axios.get("https://api.rawg.io/api/" + path, { params: { key: RAWG_API_KEY, ...params }, timeout }).then((res) => res.data);

// ---------- Collection and wishlist: every record belongs to the account that saved it ----------

const mine = (req) => (item) => item.userId === req.user.id;
const mineWithId = (req) => (item) => item.userId === req.user.id && String(item.id) === String(req.params.id);
// Two records are the same game when they share a RAWG id or a title (ignoring case and spaces)
const titleKey = (game) => String(game.title ?? "").trim().toLowerCase();
const sameGame = (a, b) => Boolean((a.rawg_id && a.rawg_id === b.rawg_id) || (titleKey(a) && titleKey(a) === titleKey(b)));
const WISH_FIELDS = ["rawg_id", "title", "released", "rating", "image", "platforms", "genres",
  "developers", "publishers", "website", "esrb", "metacritic", "playtime"];

// Adds a game to the caller's collection; any id or userId the client sent is ignored
function addGame(req, { id, userId, addedAt, ...fields }) {
  const games = db.games.read();
  const game = { id: db.newId(games), ...fields, userId: req.user.id };
  db.games.write([...games, game]);
  return game;
}

// Deletes the caller's record with the id in the address; false when there is none
function removeMine(table, req) {
  const list = table.read();
  const rest = list.filter((item) => !mineWithId(req)(item));
  if (rest.length !== list.length) table.write(rest);
  return rest.length !== list.length;
}

app.get("/api/games", auth.requireAuth, (req, res) => res.json(db.games.read().filter(mine(req))));

app.post("/api/games", auth.requireMember("add games to your collection"), (req, res) => {
  const game = addGame(req, req.body ?? {});
  // A game that is now owned leaves the wishlist
  const wishlist = db.wishlist.read();
  const rest = wishlist.filter((item) => !(mine(req)(item) && sameGame(item, game)));
  if (rest.length !== wishlist.length) db.wishlist.write(rest);
  res.status(201).json(game);
});

app.put("/api/games/:id", auth.requireAuth, (req, res) => {
  const games = db.games.read();
  const game = games.find(mineWithId(req));
  if (!game) return res.status(404).json({ error: "Game not found" });
  const { id, userId, ...changes } = req.body ?? {};
  Object.assign(game, changes);
  db.games.write(games);
  res.json(game);
});

app.delete("/api/games/:id", auth.requireAuth, (req, res) => {
  if (!removeMine(db.games, req)) return res.status(404).json({ error: "Game not found" });
  res.json({ message: "Game deleted successfully" });
});

app.get("/api/wishlist", auth.requireAuth, (req, res) => res.json(db.wishlist.read().filter(mine(req))));

app.post("/api/wishlist", auth.requireMember("keep a wishlist"), (req, res) => {
  const body = req.body ?? {};
  if (typeof body.title !== "string" || !body.title.trim()) return res.status(400).json({ error: "A game needs a title" });
  const fields = Object.fromEntries(WISH_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  fields.title = body.title.trim();

  if (db.games.read().some((g) => mine(req)(g) && sameGame(g, fields))) {
    return res.status(409).json({ error: "That game is already in your collection." });
  }
  const wishlist = db.wishlist.read();
  if (wishlist.some((item) => mine(req)(item) && sameGame(item, fields))) {
    return res.status(409).json({ error: "That game is already on your wishlist." });
  }
  const item = { id: db.newId(wishlist), ...fields, userId: req.user.id, addedAt: new Date().toISOString() };
  db.wishlist.write([...wishlist, item]);
  res.status(201).json(item);
});

app.delete("/api/wishlist/:id", auth.requireAuth, (req, res) => {
  if (!removeMine(db.wishlist, req)) return res.status(404).json({ error: "Wishlist entry not found" });
  res.json({ message: "Removed from wishlist" });
});

// Moves a wishlist entry into the collection: 201 when it was added, 200 when the game was already owned
app.post("/api/wishlist/:id/collect", auth.requireMember("add games to your collection"), (req, res) => {
  const wishlist = db.wishlist.read();
  const item = wishlist.find(mineWithId(req));
  if (!item) return res.status(404).json({ error: "Wishlist entry not found" });
  const owned = db.games.read().find((g) => mine(req)(g) && sameGame(g, item));
  const game = owned || addGame(req, item);
  db.wishlist.write(wishlist.filter((w) => w !== item));
  res.status(owned ? 200 : 201).json(game);
});

// ---------- RAWG: search, game details and the trending list ----------

const names = (list) => (list || []).map((entry) => entry.name);
const summarize = (game) => ({
  rawg_id: game.id,
  title: game.name,
  released: game.released || "N/A",
  rating: game.rating || "N/A",
  image: game.background_image || null,
  platforms: (game.platforms || []).map((p) => p.platform.name),
  genres: names(game.genres),
});

app.get("/api/lookup", async (req, res) => {
  if (!req.query.title) return res.status(400).json({ error: "Title query parameter is required" });
  const data = await rawg("games", { search: req.query.title, page_size: 5 });
  res.json(data.results.map(summarize));
});

// A store without a usable link gets a search for the game, or the store's home page
function storeLink(store, title) {
  if (store.url?.startsWith("http")) return store.url;
  const domain = store.store?.domain;
  if (domain === "store.steampowered.com") return "https://store.steampowered.com/search/?term=" + encodeURIComponent(title);
  if (domain) return "https://" + domain;
  return "https://www.google.com/search?q=" + encodeURIComponent(title + " " + (store.store?.name || ""));
}

app.get("/api/lookup/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "Game id must be a number" });
  const [game, shots] = await Promise.all([
    rawg("games/" + id, {}, 10000),
    rawg("games/" + id + "/screenshots", {}, 8000).catch(() => null),
  ]);
  const screenshots = (shots?.results || []).map((s) => s.image).filter(Boolean);
  if (!screenshots.length) screenshots.push(...[game.background_image, game.background_image_additional].filter(Boolean));

  res.json({
    id: game.id,
    rawg_id: game.id,
    name: game.name,
    title: game.name,
    description_raw: game.description_raw || game.description || "",
    description: game.description || game.description_raw || "",
    released: game.released || null,
    rating: game.rating || null,
    rating_top: game.rating_top || null,
    ratings: game.ratings || [],
    ratings_count: game.ratings_count || 0,
    reviews_count: game.reviews_count || 0,
    playtime: game.playtime || null,
    metacritic: game.metacritic || null,
    website: game.website || null,
    esrb: game.esrb_rating ? game.esrb_rating.name : null,
    developers: names(game.developers),
    publishers: names(game.publishers),
    genres: names(game.genres),
    tags: names(game.tags),
    platforms: (game.platforms || []).map((p) => ({ name: p.platform ? p.platform.name : "", requirements: p.requirements || null })),
    stores: (game.stores || []).map((s) => ({
      id: s.store?.id,
      name: s.store ? s.store.name : "Store",
      domain: s.store ? s.store.domain : "",
      url: storeLink(s, game.name),
    })),
    background_image: game.background_image || null,
    background_image_additional: game.background_image_additional || null,
    image: game.background_image || null,
    screenshots,
    clip: game.clip ? game.clip.clip || game.clip.video : null,
    updated: game.updated || null,
  });
});

// Trending: RAWG's own "New and trending" list, cached for an hour. That list is not in RAWG's public
// docs, so when it fails the documented query (recent games by popularity) stands in.
const TRENDING_DAYS = Number(process.env.TRENDING_DAYS) || 120;
const TRENDING_SIZE = 12;
const TRENDING_FETCH = 30; // more than are shown, because repeats and adult-only games are dropped
const TRENDING_TTL = 60 * 60 * 1000;
let trending = { at: 0, games: [] };
let refreshing = null;

// Mainstream mature games carry tags like "Nudity", so only these tags (or an AO rating) count as adult-only
const ADULT_ONLY_TAGS = new Set(["hentai", "nsfw", "erotic", "eroge", "porn"]);
const adultOnly = (game) =>
  game.esrb_rating?.slug === "adults-only" || (game.tags ?? []).some((tag) => ADULT_ONLY_TAGS.has(tag.slug));

async function fetchTrending() {
  try {
    const data = await rawg("games/lists/main", { ordering: "-relevance", discover: true, page_size: TRENDING_FETCH }, 8000);
    if (data.results?.length) return data.results;
    throw new Error("the list came back empty");
  } catch (error) {
    console.error("RAWG trending list failed, using the plain query instead:", error.response?.data || error.message);
    const day = (date) => date.toISOString().slice(0, 10);
    const today = new Date();
    const since = new Date(today.getTime() - TRENDING_DAYS * 24 * 60 * 60 * 1000);
    const params = { dates: day(since) + "," + day(today), ordering: "-added", exclude_additions: true, page_size: TRENDING_FETCH };
    return (await rawg("games", params, 8000)).results;
  }
}

// Visitors who ask at the same moment share one RAWG call
function refreshTrending() {
  refreshing ??= fetchTrending()
    .then((results) => {
      const seen = new Set();
      const games = results.filter((game) => !seen.has(game.id) && seen.add(game.id) && !adultOnly(game));
      trending = { at: Date.now(), games: games.slice(0, TRENDING_SIZE).map(summarize) };
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

app.get("/api/trending", async (req, res) => {
  try {
    if (Date.now() - trending.at > TRENDING_TTL) await refreshTrending();
  } catch (error) {
    if (!trending.games.length) throw error;
    // RAWG failed but an older list exists: serve it, and try RAWG again in a minute
    console.error("RAWG Trending Error:", error.response?.data || error.message);
    trending.at = Date.now() - TRENDING_TTL + 60 * 1000;
  }
  res.json(trending.games);
});

// ---------- Forums: one thread per game. Anyone can read; posting and voting need an account ----------

const FORUM_MAX_LENGTH = 1000;
const FORUM_MAX_SHOWN = 200;
const FORUM_BURST = { count: 5, windowMs: 60 * 1000 };
const requireMember = auth.requireMember("join the forum");

// A thread is "rawg-<id>", or "title-<lower-case title>" for a game added by hand
function forumKey(raw) {
  const key = String(raw ?? "").trim();
  if (/^rawg-\d{1,9}$/.test(key)) return key;
  const title = key.startsWith("title-") && key.slice(6).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  return title && !/[\u0000-\u001f]/.test(title) ? "title-" + title : null;
}

// The page gets vote totals and its own vote, never who voted. Authors are looked up when a comment is
// read, so a new profile picture also shows on older comments.
function forumView(comment, viewer, authors = new Map(db.users.read().map((user) => [user.id, user]))) {
  const votes = Object.values(comment.votes ?? {});
  return {
    id: comment.id,
    username: comment.username,
    avatarAt: authors.get(comment.userId)?.avatarAt ?? null,
    body: comment.body,
    createdAt: comment.createdAt,
    likes: votes.filter((value) => value === 1).length,
    dislikes: votes.filter((value) => value === -1).length,
    myVote: viewer ? comment.votes?.[viewer.id] ?? 0 : 0,
    mine: Boolean(viewer && comment.userId === viewer.id),
  };
}

app.get("/api/forum/:key/comments", (req, res) => {
  const key = forumKey(req.params.key);
  if (!key) return res.status(400).json({ error: "That game has no forum." });
  const viewer = auth.currentUser(req);
  const authors = new Map(db.users.read().map((user) => [user.id, user]));
  const comments = db.comments.read().filter((c) => c.gameKey === key).sort((a, b) => b.id - a.id).slice(0, FORUM_MAX_SHOWN);
  res.set("Cache-Control", "no-store");
  res.json(comments.map((c) => forumView(c, viewer, authors)));
});

app.post("/api/forum/:key/comments", requireMember, (req, res) => {
  const key = forumKey(req.params.key);
  if (!key) return res.status(400).json({ error: "That game has no forum." });
  const text = typeof req.body?.body === "string" ? req.body.body.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!text) return res.status(400).json({ error: "Write something before you post." });
  if (text.length > FORUM_MAX_LENGTH) return res.status(400).json({ error: "Comments can be up to " + FORUM_MAX_LENGTH + " characters." });

  const comments = db.comments.read();
  const since = Date.now() - FORUM_BURST.windowMs;
  if (comments.filter((c) => c.userId === req.user.id && Date.parse(c.createdAt) > since).length >= FORUM_BURST.count) {
    return res.status(429).json({ error: "You're posting fast. Wait a minute, then try again." });
  }
  const comment = { id: db.newId(comments), gameKey: key, userId: req.user.id, username: req.user.username,
    body: text, createdAt: new Date().toISOString(), votes: {} };
  db.comments.write([...comments, comment]);
  res.status(201).json(forumView(comment, req.user));
});

// Sets (never toggles) a vote, so a double click or a retry cannot flip it: 1 likes, -1 dislikes, 0 clears
app.post("/api/forum/comments/:id/vote", requireMember, (req, res) => {
  const value = req.body?.value;
  if (![1, -1, 0].includes(value)) return res.status(400).json({ error: "A vote is 1 (like), -1 (dislike) or 0 (clear)." });
  const comments = db.comments.read();
  const comment = comments.find((c) => String(c.id) === String(req.params.id));
  if (!comment) return res.status(404).json({ error: "That comment is gone." });
  comment.votes ??= {};
  if (value === 0) delete comment.votes[req.user.id];
  else comment.votes[req.user.id] = value;
  db.comments.write(comments);
  res.json(forumView(comment, req.user));
});

app.delete("/api/forum/comments/:id", requireMember, (req, res) => {
  if (!removeMine(db.comments, req)) return res.status(404).json({ error: "Comment not found" });
  res.json({ message: "Comment deleted" });
});

// Express 5 sends every thrown or rejected error here, so the routes need no try/catch of their own
app.use((error, req, res, next) => {
  if (error.type === "entity.too.large") return res.status(413).json({ error: "That picture is too big. The limit is 512 KB." });
  if (error.expose) return res.status(error.status).json({ error: error.message }); // a request body that can't be read
  console.error(req.method + " " + req.path + ":", error.response?.data || error);
  if (error.response?.status === 404) return res.status(404).json({ error: "Game not found on RAWG" });
  res.status(500).json({ error: error.isAxiosError ? "Failed to fetch games from the RAWG service" : "Something went wrong on the server" });
});

// The test suite loads the app without starting a server of its own
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log("Server running at http://localhost:" + PORT));
}
