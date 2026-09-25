// The systems a game can be filed under. The web page draws its platform picker from this list.
//   abbr  - short label on the picker tiles
//   brand - picks the tile colour in the UI
//   match - recognises the names Wikidata uses ("PlayStation 4", "Microsoft Windows", ...)
const PLATFORMS = [
 { id: "pc", name: "PC", abbr: "PC", brand: "pc", match: /windows(?! phone)|linux|mac ?os|os x|\bdos\b|steam|web browser|\bpc\b/i },
 { id: "playstation", name: "PlayStation", abbr: "PS", brand: "sony", match: /playstation|\bpsp\b|ps vita/i },
 { id: "xbox", name: "Xbox", abbr: "Xbox", brand: "microsoft", match: /xbox/i },
 { id: "switch", name: "Nintendo Switch", abbr: "Switch", brand: "nintendo", match: /nintendo switch/i },
 { id: "ds", name: "Nintendo DS / 3DS", abbr: "DS", brand: "nintendo", match: /nintendo (?:3ds|dsi?)\b|new nintendo 3ds/i },
 { id: "gameboy", name: "Game Boy", abbr: "GB", brand: "nintendo", match: /game boy|virtual boy/i },
 { id: "nes", name: "NES", abbr: "NES", brand: "nintendo", match: /^(?:nintendo entertainment system|family computer|famicom)/i },
 { id: "snes", name: "Super Nintendo", abbr: "SNES", brand: "nintendo", match: /super (?:nintendo|nes|famicom)|\bsnes\b/i },
 { id: "n64", name: "Nintendo 64", abbr: "N64", brand: "nintendo", match: /nintendo 64|\bn64\b/i },
 { id: "gamecube", name: "GameCube", abbr: "GC", brand: "nintendo", match: /gamecube/i },
 { id: "wii", name: "Wii / Wii U", abbr: "Wii", brand: "nintendo", match: /^wii/i },
 { id: "sega", name: "Sega", abbr: "Sega", brand: "sega", match: /sega|dreamcast|mega drive|genesis|master system|game gear/i },
 { id: "arcade", name: "Arcade", abbr: "Arcade", brand: "other", match: /arcade/i },
 { id: "mobile", name: "Mobile", abbr: "Mobile", brand: "other", match: /^(?:ios|ipados|android)$|iphone|windows phone|mobile|blackberry|symbian|micro edition|n-gage/i },
 { id: "other", name: "Other", abbr: "Other", brand: "other", match: null },
];

exports.PLATFORMS = PLATFORMS;

// Turn a list of platform names into our platform ids, dropping repeats and names we don't know.
exports.platformIds = (names) => {
 const ids = [];
 for (const name of names) {
  const platform = PLATFORMS.find((p) => p.match && p.match.test(name));
  if (platform && !ids.includes(platform.id)) ids.push(platform.id);
 }
 return ids;
};
