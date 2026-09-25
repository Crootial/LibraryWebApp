// The systems a game can be filed under, and how to recognise them from the names RAWG uses.
//   name  - shown in the picker, and saved on a game when its tile is ticked
//   abbr  - short label on tiles and chips
//   brand - picks the tile colour (see style.css)
//   match - the names it recognises, such as "PlayStation 5", "Xbox Series S/X" or a typed "PS5"
const PLATFORMS = [
  { id: "pc", name: "PC", abbr: "PC", brand: "pc", match: /^(?:pc|web|linux|macos|classic macintosh)$|windows(?! phone)|\bdos\b|steam/i },
  { id: "playstation", name: "PlayStation", abbr: "PS", brand: "sony", match: /playstation|^ps ?[1-5]$|^psp$|^ps vita$/i },
  { id: "xbox", name: "Xbox", abbr: "Xbox", brand: "microsoft", match: /xbox/i },
  { id: "switch", name: "Nintendo Switch", abbr: "Switch", brand: "nintendo", match: /nintendo switch|^switch$/i },
  { id: "ds", name: "Nintendo DS / 3DS", abbr: "DS", brand: "nintendo", match: /nintendo (?:3ds|dsi?)\b|new nintendo 3ds|^(?:3ds|dsi?)$/i },
  { id: "gameboy", name: "Game Boy", abbr: "GB", brand: "nintendo", match: /game boy|virtual boy|^gb[ac]?$/i },
  { id: "nes", name: "NES", abbr: "NES", brand: "nintendo", match: /^(?:nes|nintendo entertainment system|family computer|famicom)/i },
  { id: "snes", name: "Super Nintendo", abbr: "SNES", brand: "nintendo", match: /^snes$|super (?:nintendo|nes|famicom)/i },
  { id: "n64", name: "Nintendo 64", abbr: "N64", brand: "nintendo", match: /nintendo 64|^n64$/i },
  { id: "gamecube", name: "GameCube", abbr: "GC", brand: "nintendo", match: /gamecube|^gcn?$/i },
  { id: "wii", name: "Wii / Wii U", abbr: "Wii", brand: "nintendo", match: /^wii/i },
  { id: "sega", name: "Sega", abbr: "Sega", brand: "sega", match: /sega|dreamcast|genesis|mega drive|master system|game gear/i },
  { id: "arcade", name: "Arcade", abbr: "Arcade", brand: "other", match: /arcade/i },
  { id: "mobile", name: "Mobile", abbr: "Mobile", brand: "other", match: /^(?:ios|ipados|android)$|iphone|windows phone|mobile|blackberry|symbian/i },
  { id: "other", name: "Other", abbr: "Other", brand: "other", match: /^other$/i },
];

const platformById = (id) => PLATFORMS.find((p) => p.id === id);

// The platform a name belongs to, or null when we don't know it.
function platformFor(name) {
  const text = String(name ?? "").trim();
  return PLATFORMS.find((p) => p.match && p.match.test(text)) || null;
}
