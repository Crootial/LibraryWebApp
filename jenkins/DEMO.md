# Demo script: automatic pipeline

Every commit starts a build by itself. Jenkins checks the repository every minute (`pollSCM` in the
`Jenkinsfile`, and the same trigger in `casc.yaml` so it is active before the first build). Nobody
presses "Build Now".

Flow: `git commit` -> Jenkins sees the new commit -> Checkout -> Build test image -> Lint -> Test -> Build app image.

Jenkins only builds **committed** code. Uncommitted edits are invisible to it.

## Before the demo (do this 10 minutes ahead)

1. Commit the pipeline files on the branch you will demo (here `v0.3.1`). `main` has no Jenkinsfile yet.
2. Start Docker Desktop and wait until it says "running".
3. Start Jenkins on that branch (PowerShell, from the repository root):

   ```powershell
   cd jenkins
   $env:REPO_BRANCH = "v0.3.1"
   docker compose up -d --build
   ```

4. Open http://localhost:8080 and log in as `admin` / `admin`.
5. Within about a minute build #1 appears on its own ("Started by an SCM change"). Wait until it is green
   so the Docker layers are cached and the later builds are fast.

## During the demo

1. **Show the setup.** Open the `Jenkinsfile`: the `triggers { pollSCM(...) }` block and the five stages.
   In Jenkins open the job, then Configure, and show "Poll SCM" with `* * * * *`.
2. **Good commit -> green build.** Make a harmless change and commit it:

   ```powershell
   Add-Content README.md "`nDemo change"
   git commit -am "Demo: harmless change"
   ```

   Do not press anything in Jenkins. Within a minute build #2 starts, cause "Started by an SCM change".
   Open Stage View: all five stages go green. Open Test Result: 12 of 12 passed.
3. **Bad commit -> red build.** Break the rule that guests cannot save games (line 48 of `server.js`):

   ```powershell
   (Get-Content server.js) | ForEach-Object { if ($_ -match '^app\.post\("/api/games"') { $_ -replace 'auth\.requireMember\("add games to your collection"\)', '(req, res, next) => next()' } else { $_ } } | Set-Content server.js
   git commit -am "Demo: remove the guest check"
   ```

   Build #3 starts by itself and turns red at the Test stage. Open Test Result: 2 of 12 fail, both in
   the "Adding a game to the collection and wishlist" group: "Case 2: guest adds to collection and
   wishlist" (the guest is no longer refused) and "Case 1: user is logged in..." (this edit also removes
   the login lookup, so a member's save breaks too). The Build app image stage is skipped, so a broken
   version is never packaged.
4. **Fix -> green again.**

   ```powershell
   git revert --no-edit HEAD
   ```

   Build #4 starts by itself and is green.
5. **Show the result.** The image built by the last green build is ready to run:

   ```powershell
   docker images librarywebapp
   docker run --rm -p 3000:3000 librarywebapp:latest
   ```

   Open http://localhost:3000.

## After the demo

```powershell
cd jenkins
docker compose down -v
```

## If something goes wrong

- **No build starts:** wait one more minute, or press "Poll Now" ("Git Polling Log" in the job menu shows what Jenkins saw). Check that you committed, and that `REPO_BRANCH` is the branch you committed on.
- **Docker error in a stage:** Docker Desktop is not running or still starting.
- **Port 8080 busy:** set `$env:JENKINS_PORT = "8081"` before `docker compose up`.
- **Want a webhook instead of polling:** this repository is private and Jenkins runs on a laptop, so GitHub cannot reach it. Polling is the version that works without a public URL.

## 10/16/2026 - oreos

## 10/16/2026 - oreos / build test
