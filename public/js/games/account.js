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
  renderProfile();
  renderFriends();
}

// Starts the page over for whoever is signed in now (a member, a guest, or nobody)
function applyUser() {
  const { user } = store;
  const member = isMember();
  Object.assign(store, { games: [], wishlist: [], friends: { friends: [], incoming: [], outgoing: [] } });
  store.loaded = { games: false, wishlist: false, friends: false };

  $("account-heading").textContent = member ? "Profile" : "Account";
  $("account-name").textContent = member ? user.username : user ? "Guest" : "Sign in";
  renderAccountLink();
  renderAccountBadge();
  $("account-link").hidden = false;
  $("stat").hidden = !user;
  $("account-guest").hidden = member;
  $("account-member").hidden = !member;
  $("filter").closest(".search").hidden = !user;
  $("add-form").hidden = !member;
  $("add-hint").hidden = !member;
  if (member) $("add-empty").hidden = true;
  else fillEmpty($("add-empty"), { title: "Sign in to add games", text: "Games you add are saved to your account.", links: SIGN_IN_LINKS });

  renderAll();
  if (user) {
    loadList("games");
    loadList("wishlist");
    loadFriends();
  } else {
    $("games").removeAttribute("aria-busy");
    $("wishlist").removeAttribute("aria-busy");
  }
  // A player's page that was open (or opened by its address) needs to know who is signed in now
  if (location.hash.startsWith("#user")) showPerson();
}

async function signInWith(form, path, body, busyLabel, welcome) {
  const button = form.querySelector("button[type=submit]");
  setBusy(button, true, busyLabel);
  try {
    store.user = (await api(path, { method: "POST", body })).user;
    form.reset();
    applyUser();
    toast(welcome + store.user.username + ".");
    // A forum prompt sends people here; after signing in they go back to that game, not to the last tab
    const returnTo = store.returnTo;
    store.returnTo = null;
    location.hash = returnTo || store.back();
  } catch (err) {
    showFormError(form, err.message);
  } finally {
    setBusy(button, false);
  }
}

function initAccount() {
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-mode]");
    if (toggle) showMode(toggle.dataset.mode);
  });

  const signIn = $("signin-form");
  onSubmit(signIn, () => {
    const username = signIn.elements.username.value.trim();
    const password = signIn.elements.password.value;
    if (!username) return showFormError(signIn, "Type your username.", "username");
    if (!password) return showFormError(signIn, "Type your password.", "password");
    signInWith(signIn, "/api/auth/login", { username, password }, "Signing in", "Welcome back, ");
  });

  const signUp = $("signup-form");
  onSubmit(signUp, () => {
    const { username, password, confirm } = signUp.elements;
    const name = username.value.trim();
    if (!USERNAME.test(name)) return showFormError(signUp, "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.", "username");
    if (password.value.length < 8) return showFormError(signUp, "Use at least 8 characters for the password.", "password");
    if (password.value !== confirm.value) return showFormError(signUp, "The two passwords don't match.", "confirm");
    const body = { username: name, password: password.value, confirmPassword: confirm.value };
    signInWith(signUp, "/api/auth/register", body, "Creating", "Welcome to MyGameVault, ");
  });

  $("signout").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    setBusy(button, true, "Signing out");
    try {
      await api("/api/auth/logout", { method: "POST" });
      tryStorage("localStorage", "removeItem", "mgv_token");
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

  window.addEventListener("session-ended", () => {
    if (!store.user) return;
    store.user = null;
    applyUser();
    toast("Your sign-in ended. Sign in again to carry on.", "error");
  });
}
