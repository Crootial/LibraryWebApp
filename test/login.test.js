const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signedInVisitor } = require("./helpers");

const USERNAME = "gamer_one";
const PASSWORD = "correct-horse-9";

// A refused sign-in: 401, no token, and the visitor is still only a guest afterwards
async function assertRefused(visitor, res) {
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "Wrong username or password.");
  assert.equal(res.body.token, undefined, "no token should be handed out");

  const me = await visitor.get("/api/auth/me");
  assert.equal(me.body.user.isGuest, true, "the visitor must not be signed in");
}

describe("Logging in", () => {
  let app;

  before(async () => {
    app = await startServer();
    await signedInVisitor(app, USERNAME, PASSWORD);
  });

  after(() => app.stop());

  it("Case 1: right username, right password -> PASSED (signed in)", async () => {
    const visitor = app.visitor();
    const res = await visitor.login(USERNAME, PASSWORD);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, USERNAME);
    assert.ok(res.body.token, "a session token should come back");

    const me = await visitor.get("/api/auth/me");
    assert.equal(me.body.user.username, USERNAME);
    assert.equal(me.body.user.isGuest, false);
  });

  it("Case 2: right username, wrong password -> FAILURE (refused)", async () => {
    const visitor = app.visitor();
    await assertRefused(visitor, await visitor.login(USERNAME, "wrong-password-1"));
  });

  it("Case 3: wrong username, right password -> FAILURE (refused)", async () => {
    const visitor = app.visitor();
    await assertRefused(visitor, await visitor.login("someone_else", PASSWORD));
  });

  it("Case 4: wrong username, wrong password -> FAILURE (refused)", async () => {
    const visitor = app.visitor();
    await assertRefused(visitor, await visitor.login("someone_else", "wrong-password-1"));
  });
});
