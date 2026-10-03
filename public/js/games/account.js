// The Account tab: signing in, creating an account, signing out, and what changes with who is here.

// The Account tab shows one of its two forms. Links that lead there say which one they want.
function showMode(mode) {
  for (const name of ["signin", "signup"]) {
    $(name + "-form").hidden = name !== mode;
    $("seg-" + name).setAttribute("aria-pressed", String(name === mode));
  }
}

function renderAccount() {
  const { user } = store;
  $("member-name").textContent = user ? user.username : "";
  $("member-games").textContent = store.games.length;
  $("member-wishes").textContent = store.wishlist.length;
  $("member-since").textContent = (user && formatDate(user.createdAt)) || "-";
}

// Everything that depends on who is signed in: the button in the masthead, which forms and
// lists are on show, and the person's own collection and wishlist, which are fetched
// afresh. A visitor gets signed-out versions of them.
function applyUser() {
  const { user } = store;
  store.games = [];
  store.wishlist = [];

  $("account-name").textContent = user ? user.username : "Sign in";
  $("account-link").setAttribute("aria-label", user ? "Your account: " + user.username : "Sign in or create an account");
  $("account-link").hidden = false;
  $("stat").hidden = !user;
  $("account-guest").hidden = Boolean(user);
  $("account-member").hidden = !user;
  $("filter").closest(".search").hidden = !user;
  $("home-hint").textContent = HOME_HINT + (user ? "" : " Sign in to save any of them.");

  $("add-form").hidden = !user;
  $("add-hint").hidden = !user;
  if (user) $("add-empty").hidden = true;
  else fillEmpty($("add-empty"), { title: "Sign in to add games", text: "Games you add are saved to your account.", links: SIGN_IN_LINKS });

  // Drawn first for both kinds of visitor. For a signed-in person the loading placeholders
  // replace it straight away, before the browser paints.
  renderAll();
  if (user) {
    loadGames();
    loadWishlist();
  } else {
    $("games").removeAttribute("aria-busy");
    $("wishlist").removeAttribute("aria-busy");
  }
}

// Sign in or create an account, then go back to the tab the person came from.
async function signInWith(form, path, body, busyLabel, welcome) {
  const button = form.querySelector("button[type=submit]");
  setBusy(button, true, busyLabel);
  try {
    store.user = (await api(path, { method: "POST", body })).user;
    form.reset();
    applyUser();
    toast(welcome(store.user));
    location.hash = store.back();
  } catch (err) {
    showFormError(form, err.message);
  } finally {
    setBusy(button, false);
  }
}

function initSignInForm() {
  const form = $("signin-form");
  watchForm(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormError(form);
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    if (!username) return showFormError(form, "Type your username.", "username");
    if (!password) return showFormError(form, "Type your password.", "password");
    signInWith(form, "/api/auth/login", { username, password }, "Signing in", (me) => "Welcome back, " + me.username + ".");
  });
}

function initSignUpForm() {
  const form = $("signup-form");
  watchForm(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormError(form);
    const { username, password, confirm: again } = form.elements;
    const name = username.value.trim();
    if (!USERNAME.test(name)) {
      return showFormError(form, "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.", "username");
    }
    if (password.value.length < 8) return showFormError(form, "Use at least 8 characters for the password.", "password");
    if (password.value !== again.value) return showFormError(form, "The two passwords don't match.", "confirm");
    signInWith(form, "/api/auth/register", { username: name, password: password.value }, "Creating", (me) => "Welcome to MyGameVault, " + me.username + ".");
  });
}

function initSignOut() {
  $("signout").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    setBusy(button, true, "Signing out");
    try {
      await api("/api/auth/logout", { method: "POST" });
      store.user = null;
      applyUser();
      location.hash = "home";
      toast("Signed out.");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
}

function initAccount() {
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-mode]");
    if (toggle) showMode(toggle.dataset.mode);
  });
  initSignInForm();
  initSignUpForm();
  initSignOut();

  // A sign-in can run out while the page is open (api() says so on a 401). The page then falls
  // back to its signed-out self.
  window.addEventListener("session-ended", () => {
    if (!store.user) return;
    store.user = null;
    applyUser();
    toast("Your sign-in ended. Sign in again to carry on.", "error");
  });
}
