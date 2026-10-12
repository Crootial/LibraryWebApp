const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signedInVisitor } = require("./helpers");

const THREAD = "/api/forum/rawg-3328/comments";

describe("Adding a comment in the forum", () => {
  let app;

  before(async () => {
    app = await startServer();
  });

  after(() => app.stop());

  it("Case 1: user is logged in, posts a comment -> PASSED (the comment is posted)", async () => {
    const member = await signedInVisitor(app, "forum_fan");
    const res = await member.post(THREAD, { body: "Best open world I have played." });

    assert.equal(res.status, 201);
    assert.equal(res.body.username, "forum_fan");
    assert.equal(res.body.body, "Best open world I have played.");

    const thread = await app.visitor().get(THREAD);
    assert.deepEqual(thread.body.map((c) => c.body), ["Best open world I have played."]);
  });

  it("Case 2: user is not logged in, posts a comment -> FAILURE (refused, nothing is posted)", async () => {
    const res = await app.visitor().post(THREAD, { body: "I should not be able to post this." });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /Sign in or create an account/);

    const thread = await app.visitor().get(THREAD);
    assert.equal(
      thread.body.some((c) => c.body === "I should not be able to post this."),
      false,
      "a signed-out comment ended up in the thread",
    );
  });
});
