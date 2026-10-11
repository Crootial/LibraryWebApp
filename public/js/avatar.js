// Profile pictures: the uploaded photo when someone has one, otherwise a tile with the first letter
// of their name. The photo is laid over the tile, so a picture that fails to load just shows the letter.

// avatarAt (when the picture was last set) goes in the address, so a new picture is a new URL
const avatarSrc = (username, avatarAt) =>
  "/api/profile/" + encodeURIComponent(username) + "/avatar?v=" + encodeURIComponent(avatarAt);

function avatarTile(name, size, src) {
  const tile = el("span", { class: "avatar avatar-" + size, "aria-hidden": "true" },
    el("span", { class: "avatar-letter", text: String(name || "?").charAt(0) }),
  );
  if (src) {
    const photo = el("img", { src, alt: "", loading: "lazy", decoding: "async" });
    photo.addEventListener("error", () => photo.remove());
    tile.append(photo);
  }
  return tile;
}

const avatar = (name, avatarAt, size = "md") =>
  avatarTile(name, size, avatarAt ? avatarSrc(name, avatarAt) : null);
