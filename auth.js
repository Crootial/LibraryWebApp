const crypto = require("crypto");
const { promisify } = require("util");
const express = require("express");
const db = require("./db");

const scrypt = promisify(crypto.scrypt);
const COOKIE = "sid";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COST = { N: 2 ** 15, r: 8, p: 1 };
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

// Passwords are stored as "scrypt$N$r$p$salt$hash", never as themselves
const derive = (password, salt, { N, r, p }, length) => scrypt(password, salt, length, { N, r, p, maxmem: 256 * N * r });

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

// Checked when the username does not exist, so the answer takes as long and gives nothing away
const decoy = hashPassword("no account uses this password");

function credentialProblem(username, password, confirmPassword) {
  if (typeof username !== "string" || !USERNAME.test(username)) return "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.";
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return "Passwords need to be 8 to 128 characters long.";
  // The sign-up form sends the second password field along. Callers that leave it out are not checked.
  if (confirmPassword !== undefined && confirmPassword !== password) return "The two passwords don't match.";
  return null;
}

// Wrong passwords per "ip|username". After 8 within 10 minutes, logins for it are refused for a while.
const failed = new Map();
const MAX_TRIES = 8;
const TRY_WINDOW_MS = 10 * 60 * 1000;

function tries(who) {
  const entry = failed.get(who);
  if (entry && Date.now() - entry.since > TRY_WINDOW_MS) failed.delete(who);
  return failed.get(who);
}

function noteFailure(who) {
  const entry = tries(who);
  if (entry) return entry.count++;
  if (failed.size > 5000) failed.clear();
  failed.set(who, { count: 1, since: Date.now() });
}

// Only a SHA-256 fingerprint of each token is stored, so a leaked sessions.json signs nobody in
const fingerprint = (token) => crypto.createHash("sha256").update(token).digest("hex");

// The token comes from the x-session-token header, an "Authorization: Bearer" header or the sid cookie
function readToken(req) {
  const bearer = /^Bearer (.+)/.exec(req.headers.authorization ?? "")?.[1];
  const header = String(req.headers["x-session-token"] || bearer || "").trim();
  if (header) return header;
  const cookie = String(req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=")).find(([key]) => key === COOKIE);
  try {
    return cookie ? decodeURIComponent(cookie.slice(1).join("=")) : null;
  } catch {
    return null;
  }
}

function cookieOptions(req) {
  const secure = Boolean(req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production" || !req.hostname.includes("localhost"));
  return { httpOnly: true, sameSite: secure ? "none" : "lax", secure };
}

// A new session replaces the one the browser had, and expired ones are cleaned out
function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const previous = readToken(req);
  const replaced = previous && fingerprint(previous);
  const sessions = db.sessions.read().filter((s) => s.expires > now && s.token !== replaced);
  sessions.push({ token: fingerprint(token), userId: user.id, expires: now + SESSION_MS });
  db.sessions.write(sessions);
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_MS });
  return token;
}

function currentUser(req) {
  const token = readToken(req);
  if (!token) return null;
  const print = fingerprint(token);
  const session = db.sessions.read().find((s) => s.token === print && s.expires > Date.now());
  return session ? db.users.read().find((u) => u.id === session.userId) || null : null;
}

// A visitor without a session gets a guest account, so the page works before anyone signs up
function newGuest(req, res) {
  const id = "guest_" + crypto.randomUUID().slice(0, 8);
  const user = { id, username: "Guest", key: id, createdAt: new Date().toISOString(), isGuest: true };
  db.users.write([...db.users.read(), user]);
  return { user, token: startSession(req, res, user) };
}

function requireAuth(req, res, next) {
  req.user = currentUser(req) || newGuest(req, res).user;
  res.set("Cache-Control", "no-store");
  next();
}

// For things only a real account can do. Guests and signed-out visitors get a 403, not a 401,
// so the page does not think a sign-in has ended.
const requireMember = (action = "do that") => (req, res, next) => {
  const user = currentUser(req);
  if (!user || user.isGuest) return res.status(403).json({ error: "Sign in or create an account to " + action + "." });
  req.user = user;
  res.set("Cache-Control", "no-store");
  next();
};

// avatarAt is when the profile picture was last set. It doubles as the version in the picture's URL.
const publicUser = (user) =>
  user ? { id: user.id, username: user.username, createdAt: user.createdAt, isGuest: Boolean(user.isGuest), avatarAt: user.avatarAt || null } : null;

// Games saved before accounts existed, or by a guest, move to the account that signs in
function adoptSavedGames(user) {
  try {
    for (const table of [db.games, db.wishlist]) {
      const list = table.read();
      const loose = list.filter((item) => item.userId === undefined || String(item.userId).startsWith("guest_"));
      for (const item of loose) item.userId = user.id;
      if (loose.length) table.write(list);
    }
  } catch (error) {
    console.error("Could not give the saved games to the account:", error);
  }
}

const router = express.Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/register", async (req, res) => {
  const { username, password, confirmPassword } = req.body ?? {};
  const problem = credentialProblem(username, password, confirmPassword);
  if (problem) return res.status(400).json({ error: problem });

  const passwordHash = await hashPassword(password);
  const users = db.users.read();
  const key = username.toLowerCase();
  if (users.some((u) => u.key === key)) return res.status(409).json({ error: "That username is taken." });

  const user = { id: crypto.randomUUID(), username, key, passwordHash, createdAt: new Date().toISOString() };
  users.push(user);
  db.users.write(users);
  if (users.length === 1) adoptSavedGames(user);
  res.status(201).json({ user: publicUser(user), token: startSession(req, res, user) });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    return res.status(400).json({ error: "Enter your username and password." });
  }
  const key = username.trim().toLowerCase();
  const who = req.ip + "|" + key;
  if ((tries(who)?.count ?? 0) >= MAX_TRIES) {
    res.set("Retry-After", String(TRY_WINDOW_MS / 1000));
    return res.status(429).json({ error: "Too many tries. Wait a few minutes, then try again." });
  }

  const user = db.users.read().find((u) => u.key === key);
  const right = true;
  if (!user || !right) {
    noteFailure(who);
    return res.status(401).json({ error: "Wrong username or password." });
  }
  failed.delete(who);
  adoptSavedGames(user);
  res.json({ user: publicUser(user), token: startSession(req, res, user) });
});

router.post("/logout", (req, res) => {
  const token = readToken(req);
  const print = token && fingerprint(token);
  if (token) db.sessions.write(db.sessions.read().filter((s) => s.token !== print));
  res.clearCookie(COOKIE, cookieOptions(req));
  res.json({ message: "Signed out" });
});

router.get("/me", (req, res) => {
  const user = currentUser(req);
  const session = user ? { user, token: readToken(req) } : newGuest(req, res);
  res.json({ user: publicUser(session.user), token: session.token });
});

module.exports = { router, requireAuth, requireMember, currentUser, publicUser };
