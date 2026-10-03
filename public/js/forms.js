// ---------- Platform picker ----------

// Fill a form's platform tiles. Each tile is a checkbox underneath, so it works with the
// keyboard and screen readers, and a game can sit on as many platforms as it needs.
function buildPicker(form, selected = []) {
  const options = PLATFORMS.map((p) =>
    el("label", { class: "platform-option", "data-brand": p.brand, title: p.name },
      el("input", { type: "checkbox", name: "platform", value: p.id, "aria-label": p.name }),
      el("span", { class: "platform-tile" },
        icon(p.id),
        el("span", { class: "platform-abbr", text: p.abbr }),
      ),
    ));
  form.querySelector(".platform-grid").replaceChildren(...options);
  checkPlatforms(form, selected);
}

function checkPlatforms(form, ids) {
  for (const box of form.querySelectorAll("input[name=platform]")) box.checked = ids.includes(box.value);
}

const checkedPlatforms = (form) =>
  [...form.querySelectorAll("input[name=platform]:checked")].map((box) => box.value);

// The systems on a game that have a tile in the picker. Names we don't recognise have none.
const knownPlatformIds = (game) =>
  [...new Set(platformNames(game).map((name) => platformFor(name)).filter(Boolean).map((p) => p.id))];

// ---------- Forms ----------

// The same rule the server applies to a new account's username.
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

// Read a game form. Gives back { values } or { error, field }.
function readForm(form) {
  const title = form.elements.title.value.trim();
  const rating = form.elements.rating.value.trim();
  const year = form.elements.year.value.trim();
  const developers = listOf(form.elements.developer.value);
  const publishers = listOf(form.elements.publisher.value);
  if (!title) return { error: "Give the game a title.", field: "title" };
  if (rating && (!/^\d(\.\d{1,2})?$/.test(rating) || Number(rating) > 5)) {
    return { error: "Rating should be a number from 0 to 5, like 4.5.", field: "rating" };
  }
  if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > MAX_YEAR)) {
    return { error: "Year should be a number between 1 and " + MAX_YEAR + ".", field: "year" };
  }
  return {
    values: {
      title,
      platformIds: checkedPlatforms(form),
      rating: rating ? Number(rating) : null,
      year: year ? Number(year) : null,
      developers,
      publishers,
    },
  };
}

function clearFormError(form) {
  form.querySelector(".form-error").hidden = true;
  for (const input of form.querySelectorAll("input")) input.removeAttribute("aria-invalid");
}

function showFormError(form, message, field) {
  clearFormError(form);
  const box = form.querySelector(".form-error");
  box.textContent = message;
  box.hidden = false;
  if (field) {
    form.elements[field].setAttribute("aria-invalid", "true");
    form.elements[field].focus();
  }
}

// Clear the error as soon as the person starts typing again.
function watchForm(form) {
  form.addEventListener("input", () => clearFormError(form));
}
