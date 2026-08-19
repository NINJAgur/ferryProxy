import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { PressState } from "./src/components/pressState";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { useThreadStore } from "./src/state/threadStore";
import { colors, fonts } from "./src/theme";
import { fetchProviders } from "./src/transport/httpClient";
import { generateId } from "./src/transport/ids";
import { ProviderStatus } from "./src/transport/types";

type Screen = "chat" | "chats" | "data" | "settings";

const TABS: { key: Screen; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "chats", label: "History" },
  { key: "data", label: "Data" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("chat");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const openChat = useThreadStore((s) => s.open);
  const startNew = useThreadStore((s) => s.startNew);

  const refreshProviders = useCallback(() => {
    void fetchProviders().then(setProviders);
  }, []);

  useEffect(refreshProviders, [refreshProviders]);

  if (!loaded) {
    return <View style={styles.container} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.nav}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setScreen(tab.key)}
            style={({ hovered }: PressState) => [
              styles.navItem,
              hovered && { backgroundColor: colors.textHover },
            ]}
          >
            <Text style={[styles.navLabel, screen === tab.key && styles.navLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {screen === "chat" ? (
        <HomeScreen />
      ) : screen === "chats" ? (
        <ChatsScreen
          onOpen={(id) => {
            openChat(id);
            setScreen("chat");
          }}
          onNew={() => {
            startNew(generateId());
            setScreen("chat");
          }}
        />
      ) : screen === "data" ? (
        <HistoryScreen />
      ) : (
        <SettingsScreen />
      )}
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  navItem: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8 },
  navLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.text55 },
  navLabelActive: { color: colors.accent },
});
