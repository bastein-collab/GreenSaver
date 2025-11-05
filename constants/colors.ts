// constants/colors.ts
// Centralized palette with backward-compatible aliases so all components
// (old and new) compile and render consistently.
const COLORS = {
  // Core palette
  green: "#145A32",       // primary deep green (status bar + buttons)
  mint: "#E4F4EA",        // light green card background
  peach: "#FFE1D6",       // top brands card background
  peachDark: "#F5B7A8",   // darker peach for dividers/accents
  ink: "#0F172A",         // near-black headings
  text: "#3C4B5C",        // body text
  badgeBg: "#DFF5E7",     // percent badge bg
  badgeText: "#115E3B",   // percent badge text
  chip: "#EEF2F7",        // ZIP pill bg
  cardBorder: "#DFE7ED",  // subtle borders

  // Extras
  greenDark: "#0B572C",   // darker shade for loading screen

  // Aliases (UPPER_SNAKE compatibility with earlier components)
  WHITE: "#FFFFFF",
  GREEN: "#145A32",
  GREEN_TEXT: "#0F172A",  // map to ink for headings
  TEXT_DARK: "#0F172A",   // map to ink
  TEXT_MID: "#3C4B5C",    // map to text
  TEXT_SUBTLE: "#3C4B5C", // reuse text (components can adjust opacity)
  BADGE: "#DFF5E7",       // map to badgeBg
};

export default COLORS;
