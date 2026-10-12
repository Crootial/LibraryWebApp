const express = require("express");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const auth = require("./auth");
const profile = require("./profile");
const friends = require("./friends");

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const RAWG_API_KEY = process.env.RAWG_API_KEY || "d75605f6b2254c428360a0a491247add";

app.use("/api/auth", auth.router);
app.use("/api/profile", profile.router);
app.use("/api/friends", friends.router);

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

app.post("/api/games", auth.requireMember("add games to your collection"), (req, res) => {
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
app.post("/api/wishlist", auth.requireMember("keep a wishlist"), (req, res) => {
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

app.post("/api/wishlist/:id/collect", auth.requireMember("add games to your collection"), (req, res) => {
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
// Ask for more than we show, because duplicates and adult-only games are dropped from the list
const TRENDING_FETCH = 30;
const TRENDING_TTL = 60 * 60 * 1000;
let trending = { at: 0, games: [] };
let refreshing = null;

const isoDate = (date) => date.toISOString().slice(0, 10);

// Adult-only games stay off the home page. Mainstream mature games carry tags like "Nudity", so those
// alone don't count (Grand Theft Auto VI has it).
const ADULT_ONLY_TAGS = new Set(["hentai", "nsfw", "erotic", "eroge", "porn"]);
const adultOnly = (game) =>
  game.esrb_rating?.slug === "adults-only" || (game.tags ?? []).some((tag) => ADULT_ONLY_TAGS.has(tag.slug));

function withoutRepeats(games) {
  const seen = new Set();
  return games.filter((game) => !seen.has(game.id) && seen.add(game.id));
}

async function fetchTrending() {
  try {
    // RAWG's own "New and trending" list, the one rawg.io puts first. It ranks by player counts and
    // release date, so big games that are about to launch are in it too. It isn't in RAWG's public
    // docs, so if it ever stops answering we fall back to the documented query below.
    const response = await axios.get("https://api.rawg.io/api/games/lists/main", {
      params: { key: RAWG_API_KEY, ordering: "-relevance", discover: true, page_size: TRENDING_FETCH },
      timeout: 8000,
    });
    if (Array.isArray(response.data.results) && response.data.results.length) return response.data.results;
    throw new Error("the list came back empty");
  } catch (error) {
    console.error("RAWG trending list failed, using the plain query instead:", error.response?.data || error.message);
    const today = new Date();
    const since = new Date(today.getTime() - TRENDING_DAYS * 24 * 60 * 60 * 1000);
    const response = await axios.get("https://api.rawg.io/api/games", {
      params: {
        key: RAWG_API_KEY,
        dates: isoDate(since) + "," + isoDate(today),
        ordering: "-added",
        exclude_additions: true,
        page_size: TRENDING_FETCH,
      },
      timeout: 8000,
    });
    return response.data.results;
  }
}

function refreshTrending() {
  // Coalesce concurrent requests into a single in-flight RAWG request
  if (!refreshing) {
    refreshing = fetchTrending()
      .then((results) => {
        const games = withoutRepeats(results).filter((game) => !adultOnly(game)).slice(0, TRENDING_SIZE);
        trending = { at: Date.now(), games: games.map(summarize) };
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
    const [gameRes, screenRes] = await Promise.all([
      axios.get("https://api.rawg.io/api/games/" + id, {
        params: { key: RAWG_API_KEY },
        timeout: 10000,
      }),
      axios.get("https://api.rawg.io/api/games/" + id + "/screenshots", {
        params: { key: RAWG_API_KEY },
        timeout: 8000,
      }).catch(() => null),
    ]);

    const game = gameRes.data;
    const screenshots = (screenRes?.data?.results || [])
      .map((s) => s.image)
      .filter(Boolean);

    if (!screenshots.length) {
      if (game.background_image) screenshots.push(game.background_image);
      if (game.background_image_additional) screenshots.push(game.background_image_additional);
    }

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
      developers: (game.developers || []).map((d) => d.name),
      publishers: (game.publishers || []).map((p) => p.name),
      genres: (game.genres || []).map((g) => g.name),
      tags: (game.tags || []).map((t) => t.name),
      platforms: (game.platforms || []).map((p) => ({
        name: p.platform ? p.platform.name : "",
        requirements: p.requirements || null,
      })),
      stores: (game.stores || []).map((s) => {
        let storeUrl = s.url;
        if (!storeUrl || !storeUrl.startsWith("http")) {
          if (s.store?.domain === "store.steampowered.com") {
            storeUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
          } else if (s.store?.domain) {
            storeUrl = `https://${s.store.domain}`;
          } else {
            storeUrl = `https://www.google.com/search?q=${encodeURIComponent(game.name + " " + (s.store?.name || ""))}`;
          }
        }
        return {
          id: s.store?.id,
          name: s.store ? s.store.name : "Store",
          domain: s.store ? s.store.domain : "",
          url: storeUrl,
        };
      }),
      background_image: game.background_image || null,
      background_image_additional: game.background_image_additional || null,
      image: game.background_image || null,
      screenshots,
      clip: game.clip ? (game.clip.clip || game.clip.video) : null,
      updated: game.updated || null,
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "Game not found on RAWG" });
    }
    console.error("RAWG Details Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch game details from RAWG service" });
  }
});

// Game forums: every game has its own thread. Anyone can read it; posting and voting need a real account.
const FORUM_MAX_LENGTH = 1000;
const FORUM_MAX_SHOWN = 200;
const FORUM_BURST = { count: 5, windowMs: 60 * 1000 };

// A thread is keyed by RAWG ID, or by normalized title for games added by hand.
function forumKey(raw) {
  const key = String(raw ?? "").trim();
  if (/^rawg-\d{1,9}$/.test(key)) return key;
  if (key.startsWith("title-")) {
    const title = key.slice(6).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
    if (title && !/[\u0000-\u001f]/.test(title)) return "title-" + title;
  }
  return null;
}

const requireMember = auth.requireMember("join the forum");

// Each author's current account, looked up when a comment is read, so a new profile picture also
// shows on the comments written before it.
const forumAuthors = () => new Map(db.users.read().map((user) => [user.id, user]));

// Votes live on the comment as { userId: 1 | -1 }; the page only gets totals and its own vote.
function forumView(comment, viewer, authors) {
  let likes = 0;
  let dislikes = 0;
  for (const value of Object.values(comment.votes ?? {})) {
    if (value === 1) likes++;
    else if (value === -1) dislikes++;
  }
  return {
    id: comment.id,
    username: comment.username,
    avatarAt: authors.get(comment.userId)?.avatarAt ?? null,
    body: comment.body,
    createdAt: comment.createdAt,
    likes,
    dislikes,
    myVote: viewer ? comment.votes?.[viewer.id] ?? 0 : 0,
    mine: Boolean(viewer && comment.userId === viewer.id),
  };
}

app.get("/api/forum/:key/comments", (req, res) => {
  try {
    const key = forumKey(req.params.key);
    if (!key) return res.status(400).json({ error: "That game has no forum." });

    const viewer = auth.currentUser(req);
    const comments = db.comments.read()
      .filter((c) => c.gameKey === key)
      .sort((a, b) => b.id - a.id)
      .slice(0, FORUM_MAX_SHOWN);
    res.set("Cache-Control", "no-store");
    const authors = forumAuthors();
    res.json(comments.map((c) => forumView(c, viewer, authors)));
  } catch (error) {
    console.error("Forum Read Error:", error);
    res.status(500).json({ error: "Failed to load the comments" });
  }
});

app.post("/api/forum/:key/comments", requireMember, (req, res) => {
  try {
    const key = forumKey(req.params.key);
    if (!key) return res.status(400).json({ error: "That game has no forum." });

    const text = typeof req.body?.body === "string"
      ? req.body.body.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      : "";
    if (!text) return res.status(400).json({ error: "Write something before you post." });
    if (text.length > FORUM_MAX_LENGTH) {
      return res.status(400).json({ error: "Comments can be up to " + FORUM_MAX_LENGTH + " characters." });
    }

    const comments = db.comments.read();
    const since = Date.now() - FORUM_BURST.windowMs;
    const recent = comments.filter((c) => c.userId === req.user.id && Date.parse(c.createdAt) > since);
    if (recent.length >= FORUM_BURST.count) {
      return res.status(429).json({ error: "You're posting fast. Wait a minute, then try again." });
    }

    const comment = {
      id: db.newId(comments),
      gameKey: key,
      userId: req.user.id,
      username: req.user.username,
      body: text,
      createdAt: new Date().toISOString(),
      votes: {},
    };
    comments.push(comment);
    db.comments.write(comments);
    res.status(201).json(forumView(comment, req.user, forumAuthors()));
  } catch (error) {
    console.error("Forum Post Error:", error);
    res.status(500).json({ error: "Failed to post your comment" });
  }
});

// Set (not toggle) a vote so a double click or a retry cannot flip it: 1 likes, -1 dislikes, 0 clears.
app.post("/api/forum/comments/:id/vote", requireMember, (req, res) => {
  try {
    const value = req.body?.value;
    if (value !== 1 && value !== -1 && value !== 0) {
      return res.status(400).json({ error: "A vote is 1 (like), -1 (dislike) or 0 (clear)." });
    }

    const comments = db.comments.read();
    const comment = comments.find((c) => String(c.id) === String(req.params.id));
    if (!comment) return res.status(404).json({ error: "That comment is gone." });

    comment.votes = comment.votes ?? {};
    if (value === 0) delete comment.votes[req.user.id];
    else comment.votes[req.user.id] = value;
    db.comments.write(comments);
    res.json(forumView(comment, req.user, forumAuthors()));
  } catch (error) {
    console.error("Forum Vote Error:", error);
    res.status(500).json({ error: "Failed to save your vote" });
  }
});

app.delete("/api/forum/comments/:id", requireMember, (req, res) => {
  try {
    const comments = db.comments.read();
    const rest = comments.filter((c) => !(c.userId === req.user.id && String(c.id) === String(req.params.id)));
    if (rest.length === comments.length) {
      return res.status(404).json({ error: "Comment not found" });
    }

    db.comments.write(rest);
    res.json({ message: "Comment deleted" });
  } catch (error) {
    console.error("Forum Delete Error:", error);
    res.status(500).json({ error: "Failed to delete the comment" });
  }
});

// The test suite loads the app without starting a server of its own
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running at http://localhost:" + PORT);
  });
}
