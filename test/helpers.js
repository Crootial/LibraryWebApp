const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Stands in for a browser: it keeps the sign-in cookie between requests, the way a real visitor's browser does.
class Visitor {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = null;
  }

  async send(method, route, body) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;

    const res = await fetch(this.baseUrl + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [name, value] = pair.split("=");
      if (name === "sid") this.cookie = value ? pair : null;
    }

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, body: data };
  }

  get(route) {
    return this.send("GET", route);
  }

  post(route, body = {}) {
    return this.send("POST", route, body);
  }

  register(username, password, confirmPassword = password) {
    return this.post("/api/auth/register", { username, password, confirmPassword });
  }

  login(username, password) {
    return this.post("/api/auth/login", { username, password });
  }
}

// Every test file runs in its own process, so each one gets its own empty "database" folder
// and never touches the real users.json, library.json and the rest.
async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "library-test-"));
  process.env.DATA_DIR = dataDir;
  const app = require("../server");

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const baseUrl = "http://127.0.0.1:" + server.address().port;

  return {
    visitor: () => new Visitor(baseUrl),
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// A visitor who has registered and is signed in
async function signedInVisitor(app, username, password = "correct-horse-9") {
  const visitor = app.visitor();
  const res = await visitor.register(username, password);
  if (res.status !== 201) throw new Error("Could not set up the test account: " + JSON.stringify(res));
  return visitor;
}

module.exports = { startServer, signedInVisitor };
