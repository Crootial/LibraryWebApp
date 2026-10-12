// The grid of console tiles on the add and edit forms. Each tile is a checkbox underneath.
function buildPicker(form, selected = []) {
  form.querySelector(".platform-grid").replaceChildren(...PLATFORMS.map((p) =>
    el("label", { class: "platform-option", "data-brand": p.brand, title: p.name },
      el("input", { type: "checkbox", name: "platform", value: p.id, "aria-label": p.name }),
      el("span", { class: "platform-tile" }, icon(p.id), el("span", { class: "platform-abbr", text: p.abbr })),
    )));
  checkPlatforms(form, selected);
}

function checkPlatforms(form, ids) {
  for (const box of form.querySelectorAll("input[name=platform]")) box.checked = ids.includes(box.value);
}

const knownPlatformIds = (game) =>
  [...new Set(platformNames(game).map((name) => platformFor(name)).filter(Boolean).map((p) => p.id))];

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

// Checks the add or edit form: { values } when it is fine, { error, field } when it is not
function readForm(form) {
  const title = form.elements.title.value.trim();
  const rating = form.elements.rating.value.trim();
  const year = form.elements.year.value.trim();
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
      platformIds: [...form.querySelectorAll("input[name=platform]:checked")].map((box) => box.value),
      rating: rating ? Number(rating) : null,
      year: year ? Number(year) : null,
      developers: listOf(form.elements.developer.value),
      publishers: listOf(form.elements.publisher.value),
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
  if (!field) return;
  form.elements[field].setAttribute("aria-invalid", "true");
  form.elements[field].focus();
}

// Runs `submit` with the form's error box cleared, and clears it again as soon as the user types
function onSubmit(form, submit) {
  form.addEventListener("input", () => clearFormError(form));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormError(form);
    submit();
  });
}
