const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

describe("Make a user", () => {
  let app;

  before(async () => {
    app = await startServer();
  });

  after(() => app.stop());

  it("Case 1: username and two matching passwords -> PASSED (account is created)", async () => {
    const visitor = app.visitor();
    const res = await visitor.register("new_player", "matching-pass-1", "matching-pass-1");

    assert.equal(res.status, 201);
    assert.equal(res.body.user.username, "new_player");
    assert.equal(res.body.user.isGuest, false);
    assert.ok(res.body.token, "a session token should come back");
    assert.equal(JSON.stringify(res.body).includes("passwordHash"), false, "the password hash must not leak");

    // The account really exists: it can sign in afterwards
    const login = await app.visitor().login("new_player", "matching-pass-1");
    assert.equal(login.status, 200);
  });

  it("Case 2: username and two mismatching passwords -> FAILURE (no account is created)", async () => {
    const visitor = app.visitor();
    const res = await visitor.register("mismatch_player", "first-password-1", "second-password-2");

    assert.equal(res.status, 400);
    assert.match(res.body.error, /don't match/);
    assert.equal(res.body.token, undefined, "no session should be started");

    // The account does not exist: signing in with either password is refused
    for (const password of ["first-password-1", "second-password-2"]) {
      const login = await app.visitor().login("mismatch_player", password);
      assert.equal(login.status, 401);
    }
  });
});
