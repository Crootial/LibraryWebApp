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

function applyUser() {
  const { user } = store;
  store.games = [];
  store.wishlist = [];

  const isRealUser = user && !user.isGuest;
  $("account-name").textContent = isRealUser ? user.username : (user ? "Guest" : "Sign in");
  $("account-link").setAttribute("aria-label", user ? "Your account: " + user.username : "Sign in or create an account");
  $("account-link").hidden = false;
  $("stat").hidden = !user;
  $("account-guest").hidden = isRealUser;
  $("account-member").hidden = !isRealUser;
  $("filter").closest(".search").hidden = !user;
  $("home-hint").textContent = HOME_HINT;

  $("add-form").hidden = !user;
  $("add-hint").hidden = !user;
  if (user) $("add-empty").hidden = true;
  else fillEmpty($("add-empty"), { title: "Sign in to add games", text: "Games you add are saved to your account.", links: SIGN_IN_LINKS });

  renderAll();
  if (user) {
    loadGames();
    loadWishlist();
  } else {
    $("games").removeAttribute("aria-busy");
    $("wishlist").removeAttribute("aria-busy");
  }
}

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
      try { localStorage.removeItem("mgv_token"); } catch {}
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

  window.addEventListener("session-ended", () => {
    if (!store.user) return;
    store.user = null;
    applyUser();
    toast("Your sign-in ended. Sign in again to carry on.", "error");
  });
}
