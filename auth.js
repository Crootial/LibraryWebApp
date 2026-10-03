const crypto = require("crypto");
const { promisify } = require("util");
const express = require("express");
const db = require("./db");

const scrypt = promisify(crypto.scrypt);

const COOKIE = "sid";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// ---------- Passwords ----------

// scrypt comes with Node, so passwords are hashed without adding a package. The settings are
// saved inside each hash ("scrypt$N$r$p$salt$hash"), so they can be raised later without
// locking anyone out.
const COST = { N: 2 ** 15, r: 8, p: 1 };

const derive = (password, salt, { N, r, p }, length) =>
  scrypt(password, salt, length, { N, r, p, maxmem: 256 * N * r });

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, COST, 64);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("hex"), hash.toString("hex")].join("$");
}

async function checkPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await derive(password, Buffer.from(salt, "hex"), { N: +N, r: +r, p: +p }, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// A username that doesn't exist is checked against this, so a wrong username takes as long
// to answer as a wrong password and the difference can't be used to find real usernames.
const decoy = hashPassword("no account uses this password");

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

// What is wrong with a new account's details, or null when they are fine.
function credentialProblem(username, password) {
  if (typeof username !== "string" || !USERNAME.test(username)) {
    return "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.";
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return "Passwords need to be 8 to 128 characters long.";
  }
  return null;
}

// ---------- Too many tries ----------

// Too many wrong passwords for one username from one address, and that pair has to wait.
const failed = new Map();
const MAX_TRIES = 8;
const TRY_WINDOW_MS = 10 * 60 * 1000;

function tooManyTries(who) {
  const entry = failed.get(who);
  if (!entry) return false;
  if (Date.now() - entry.since > TRY_WINDOW_MS) {
    failed.delete(who);
    return false;
  }
  return entry.count >= MAX_TRIES;
}

function noteFailure(who) {
  const entry = failed.get(who);
  if (entry && Date.now() - entry.since <= TRY_WINDOW_MS) {
    entry.count++;
    return;
  }
  if (failed.size > 5000) failed.clear(); // someone is guessing usernames: forget the old tallies
  failed.set(who, { count: 1, since: Date.now() });
}

// ---------- Sessions ----------

// A signed-in browser holds a random token in a cookie. The sessions file keeps only a
// fingerprint of each token, so a copy of that file can't be used to sign in.
const fingerprint = (token) => crypto.createHash("sha256").update(token).digest("hex");

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

const cookieOptions = (req) => ({
  httpOnly: true, // the page's scripts can't read it
  sameSite: "lax", // other sites can't send it along with their requests
  secure: req.secure || process.env.COOKIE_SECURE === "true",
});

function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  // Signing in replaces whatever session this browser already had, and drops any that have run out.
  const previous = readCookie(req, COOKIE);
  const replaced = previous && fingerprint(previous);
  const sessions = db.sessions.read().filter((s) => s.expires > now && s.token !== replaced);
  sessions.push({ token: fingerprint(token), userId: user.id, expires: now + SESSION_MS });
  db.sessions.write(sessions);
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_MS });
}

// The account behind the request's cookie, or null.
function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const print = fingerprint(token);
  const session = db.sessions.read().find((s) => s.token === print && s.expires > Date.now());
  if (!session) return null;
  return db.users.read().find((u) => u.id === session.userId) || null;
}

// Guards the routes that hold a person's own data. They find the person in req.user.
function requireAuth(req, res, next) {
  try {
    req.user = currentUser(req);
  } catch (error) {
    console.error("Session Error:", error);
    return res.status(500).json({ error: "Failed to check your sign-in" });
  }
  res.set("Cache-Control", "no-store"); // what follows belongs to one person
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  next();
}

// The parts of an account that are safe to send to its owner's browser.
const publicUser = (user) =>
  user ? { id: user.id, username: user.username, createdAt: user.createdAt } : null;

// Games saved before accounts existed belong to nobody. The first account takes them over,
// so a collection built up beforehand isn't lost.
function adoptSavedGames(user) {
  try {
    const games = db.read();
    const loose = games.filter((game) => game.userId === undefined);
    if (!loose.length) return;
    for (const game of loose) game.userId = user.id;
    db.write(games);
  } catch (error) {
    console.error("Could not give the saved games to the first account:", error);
  }
}

// ---------- Routes ----------

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// CREATE - Make an account and sign in to it
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    const problem = credentialProblem(username, password);
    if (problem) return res.status(400).json({ error: problem });

    // Hash first. Nothing can then slip in between reading the user list and writing it back.
    const passwordHash = await hashPassword(password);

    const users = db.users.read();
    const key = username.toLowerCase();
    if (users.some((u) => u.key === key)) {
      return res.status(409).json({ error: "That username is taken." });
    }

    const user = {
      id: crypto.randomUUID(),
      username,
      key,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    db.users.write(users);
    if (users.length === 1) adoptSavedGames(user);

    startSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: "Failed to create the account" });
  }
});

// Sign in to an existing account
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
      return res.status(400).json({ error: "Enter your username and password." });
    }

    const key = username.trim().toLowerCase();
    const who = req.ip + "|" + key;
    if (tooManyTries(who)) {
      res.set("Retry-After", String(TRY_WINDOW_MS / 1000));
      return res.status(429).json({ error: "Too many tries. Wait a few minutes, then try again." });
    }

    const user = db.users.read().find((u) => u.key === key);
    const right = password.length <= 128 && (await checkPassword(password, user ? user.passwordHash : await decoy));
    if (!user || !right) {
      noteFailure(who);
      return res.status(401).json({ error: "Wrong username or password." });
    }

    failed.delete(who);
    startSession(req, res, user);
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

// Sign out: end this browser's session
router.post("/logout", (req, res) => {
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const print = fingerprint(token);
      db.sessions.write(db.sessions.read().filter((s) => s.token !== print));
    }
    res.clearCookie(COOKIE, cookieOptions(req));
    res.json({ message: "Signed out" });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({ error: "Failed to sign out" });
  }
});

// READ - Who is signed in? Answers { user: null } for a visitor, so the page can ask on every load.
router.get("/me", (req, res) => {
  try {
    res.json({ user: publicUser(currentUser(req)) });
  } catch (error) {
    console.error("Session Error:", error);
    res.status(500).json({ error: "Failed to check your sign-in" });
  }
});

module.exports = { router, requireAuth };
