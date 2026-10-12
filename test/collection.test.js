const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signedInVisitor } = require("./helpers");

const WITCHER = { rawg_id: 3328, title: "The Witcher 3: Wild Hunt", released: "2015-05-18", rating: 4.66, platforms: ["PC"], genres: ["RPG"] };
const PORTAL = { rawg_id: 4200, title: "Portal 2", released: "2011-04-18", rating: 4.61, platforms: ["PC"], genres: ["Puzzle"] };

describe("Adding a game to the collection and wishlist", () => {
  let app;

  before(async () => {
    app = await startServer();
  });

  after(() => app.stop());

  it("Case 1: user is logged in, adds to collection and wishlist -> PASSED (both are saved)", async () => {
    const member = await signedInVisitor(app, "collector");

    const collected = await member.post("/api/games", WITCHER);
    assert.equal(collected.status, 201);
    assert.equal(collected.body.title, WITCHER.title);

    const wished = await member.post("/api/wishlist", PORTAL);
    assert.equal(wished.status, 201);
    assert.equal(wished.body.title, PORTAL.title);

    const games = await member.get("/api/games");
    assert.deepEqual(games.body.map((g) => g.title), [WITCHER.title]);
    const wishlist = await member.get("/api/wishlist");
    assert.deepEqual(wishlist.body.map((g) => g.title), [PORTAL.title]);
  });

  it("Case 2: guest adds to collection and wishlist -> FAILURE (both are refused, nothing is saved)", async () => {
    // A guest is what the page makes of every new visitor (GET /api/auth/me); the other
    // visitor never loads the page and has no session at all.
    const guest = app.visitor();
    assert.equal((await guest.get("/api/auth/me")).body.user.isGuest, true);
    const stranger = app.visitor();

    for (const visitor of [guest, stranger]) {
      const collected = await visitor.post("/api/games", WITCHER);
      assert.equal(collected.status, 403);
      assert.match(collected.body.error, /Sign in or create an account/);

      const wished = await visitor.post("/api/wishlist", PORTAL);
      assert.equal(wished.status, 403);
      assert.match(wished.body.error, /Sign in or create an account/);
    }

    // Nothing was saved for the guest, and nothing leaked into anybody else's lists
    assert.deepEqual((await guest.get("/api/games")).body, []);
    assert.deepEqual((await guest.get("/api/wishlist")).body, []);
    const member = app.visitor();
    assert.equal((await member.login("collector", "correct-horse-9")).status, 200);
    assert.equal((await member.get("/api/games")).body.length, 1, "the member's collection should be untouched");
  });
});
