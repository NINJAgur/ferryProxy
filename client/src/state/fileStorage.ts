import { Platform } from "react-native";
import { StateStorage } from "zustand/middleware";

/**
 * Persists a store to a real file in the app's document directory.
 *
 * Chats are documents, not cache. Key/value stores are the wrong home for them:
 * AsyncStorage is a small scratch space the OS is free to clear, and on web it is
 * literally browser storage that a "clear site data" wipes. A file in the document
 * directory is backed up with the app and can be exported or inspected.
 *
 * Web has no such directory, so it keeps the previous behaviour and says so.
 */
export function createFileStorage(filename: string): StateStorage {
  if (Platform.OS === "web") {
    return {
      getItem: (name) => localStorage.getItem(name),
      setItem: (name, value) => localStorage.setItem(name, value),
      removeItem: (name) => localStorage.removeItem(name),
    };
  }

  // Required lazily: importing expo-file-system on web pulls in a module with no
  // document directory to point at.
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const file = () => new File(Paths.document, filename);

  return {
    getItem: async () => {
      const f = file();
      return f.exists ? await f.text() : null;
    },
    setItem: async (_name, value) => {
      const f = file();
      if (!f.exists) f.create({ intermediates: true });
      f.write(value);
    },
    removeItem: async () => {
      const f = file();
      if (f.exists) f.delete();
    },
  };
}

/** Where the chats actually are, for showing the user. */
export function chatFileLocation(filename: string): string {
  if (Platform.OS === "web") return "this browser's local storage";
  try {
    const { Paths } = require("expo-file-system") as typeof import("expo-file-system");
    return `${Paths.document.uri}${filename}`;
  } catch {
    return filename;
  }
}
