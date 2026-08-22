import { Platform } from "react-native";

/**
 * The composer's scrollbar, once a question grows past the field.
 *
 * A browser's default scrollbar is a grey slab against a track, which looks
 * like a mistake inside a rounded chat input. React Native has no style for
 * this, so on web it is done with the real thing: a thin rounded thumb, no
 * track, dim until you are near it.
 */
export const COMPOSER_ID = "ferry-composer";

const CSS = `
/* The composer is the only textarea in the app, so it is addressed directly —
   an id set through nativeID does not reliably reach the DOM. */
/* A pasted URL or a run of characters with no spaces in it has nowhere to wrap,
   so it runs straight out of its bubble. This only acts when a word would
   overflow — text that fits is untouched. */
* { overflow-wrap: anywhere; word-break: break-word; }

textarea {
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.38) transparent;
}
textarea::-webkit-scrollbar { width: 8px; }
textarea::-webkit-scrollbar-track { background: transparent; }
textarea::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.38);
  border-radius: 4px;
}
textarea::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.55); }
`;

export function installWebStyles(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("ferry-web-styles")) return;
  const style = document.createElement("style");
  style.id = "ferry-web-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}
