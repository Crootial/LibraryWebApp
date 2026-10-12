const crypto = require("crypto");
const { promisify } = require("util");
const express = require("express");
const db = require("./db");

const scrypt = promisify(crypto.scrypt);

const COOKIE = "sid";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// Passwords hashed using scrypt format: "scrypt$N$r$p$salt$hash"
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

// Decoy hash to normalize response timing for non-existent users
const decoy = hashPassword("no account uses this password");

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

function credentialProblem(username, password) {
  if (typeof username !== "string" || !USERNAME.test(username)) {
    return "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.";
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return "Passwords need to be 8 to 128 characters long.";
  }
  return null;
}

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
  if (failed.size > 5000) failed.clear();
  failed.set(who, { count: 1, since: Date.now() });
}

// Store SHA-256 fingerprint of tokens to prevent session hijacking if DB leaks
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

function readToken(req) {
  const header = req.headers["x-session-token"] ||
    (typeof req.headers["authorization"] === "string" && req.headers["authorization"].startsWith("Bearer ")
      ? req.headers["authorization"].slice(7)
      : null);
  if (header && header.trim()) return header.trim();
  return readCookie(req, COOKIE);
}

const cookieOptions = (req) => {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production" || !req.hostname.includes("localhost");
  return {
    httpOnly: true,
    sameSite: isSecure ? "none" : "lax",
    secure: Boolean(isSecure),
  };
};

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
  if (!session) return null;
  return db.users.read().find((u) => u.id === session.userId) || null;
}

function requireAuth(req, res, next) {
  try {
    req.user = currentUser(req);
    if (!req.user) {
      const guestId = "guest_" + crypto.randomUUID().slice(0, 8);
      const guest = {
        id: guestId,
        username: "Guest",
        key: guestId,
        createdAt: new Date().toISOString(),
        isGuest: true,
      };
      const users = db.users.read();
      users.push(guest);
      db.users.write(users);
      startSession(req, res, guest);
      req.user = guest;
    }
  } catch (error) {
    console.error("Session Error:", error);
    return res.status(500).json({ error: "Failed to check your sign-in" });
  }
  res.set("Cache-Control", "no-store");
  next();
}

// avatarAt is when the profile picture was last set. It doubles as the version in the picture's URL.
const publicUser = (user) =>
  user
    ? {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        isGuest: Boolean(user.isGuest),
        avatarAt: user.avatarAt || null,
      }
    : null;

// For things only a real account can do. A guest or a signed-out visitor gets a 403, not a 401,
// so the page does not think a sign-in has ended.
function requireMember(action = "do that") {
  return (req, res, next) => {
    try {
      const user = currentUser(req);
      if (!user || user.isGuest) {
        return res.status(403).json({ error: "Sign in or create an account to " + action + "." });
      }
      req.user = user;
      res.set("Cache-Control", "no-store");
      next();
    } catch (error) {
      console.error("Session Error:", error);
      res.status(500).json({ error: "Failed to check your sign-in" });
    }
  };
}

// Migrate unassigned or guest games to the registered account
function adoptSavedGames(user) {
  try {
    const games = db.read();
    const loose = games.filter((game) => game.userId === undefined || String(game.userId).startsWith("guest_"));
    if (loose.length) {
      for (const game of loose) game.userId = user.id;
      db.write(games);
    }
    const wishlist = db.wishlist.read();
    const looseWish = wishlist.filter((item) => item.userId === undefined || String(item.userId).startsWith("guest_"));
    if (looseWish.length) {
      for (const item of looseWish) item.userId = user.id;
      db.wishlist.write(wishlist);
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
  try {
    const { username, password, confirmPassword } = req.body ?? {};
    const problem = credentialProblem(username, password);
    if (problem) return res.status(400).json({ error: problem });
    // The sign-up form sends the second password field along. Callers that leave it out are not checked.
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({ error: "The two passwords don't match." });
    }

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

    const token = startSession(req, res, user);
    res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: "Failed to create the account" });
  }
});

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
    adoptSavedGames(user);
    const token = startSession(req, res, user);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

router.post("/logout", (req, res) => {
  try {
    const token = readToken(req);
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

router.get("/me", (req, res) => {
  try {
    let user = currentUser(req);
    let token = readToken(req);
    if (!user) {
      const guestId = "guest_" + crypto.randomUUID().slice(0, 8);
      user = {
        id: guestId,
        username: "Guest",
        key: guestId,
        createdAt: new Date().toISOString(),
        isGuest: true,
      };
      const users = db.users.read();
      users.push(user);
      db.users.write(users);
      token = startSession(req, res, user);
    }
    res.json({ user: publicUser(user), token });
  } catch (error) {
    console.error("Session Error:", error);
    res.status(500).json({ error: "Failed to check your sign-in" });
  }
});

module.exports = { router, requireAuth, requireMember, currentUser, publicUser };
