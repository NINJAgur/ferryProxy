import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { PressState } from "./src/components/pressState";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { useThreadStore } from "./src/state/threadStore";
import { useWide } from "./src/layout";
import { installWebStyles } from "./src/webStyles";
import { colors, fonts } from "./src/theme";

type Screen = "chat" | "chats" | "data" | "settings";

const TABS: { key: Screen; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "chats", label: "History" },
  { key: "data", label: "Data" },
  { key: "settings", label: "Settings" },
];

installWebStyles();

export default function App() {
  const [screen, setScreen] = useState<Screen>("chat");
  const wide = useWide();
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const openChat = useThreadStore((s) => s.open);

  if (!loaded) {
    return <View style={styles.container} />;
  }

  return (
    // React Native's own SafeAreaView does nothing on Android, where the app now
    // draws under the status bar and the gesture bar — so the tabs and the
    // composer ended up beneath the system's own controls.
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.frame}>
          <View style={[styles.nav, wide && styles.navWide]}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setScreen(tab.key)}
                style={({ hovered }: PressState) => [
                  styles.navItem,
                  wide && styles.navItemWide,
                  hovered && { backgroundColor: colors.textHover },
                ]}
              >
                <Text style={[styles.navLabel, wide && styles.navLabelWide, screen === tab.key && styles.navLabelActive]}>
                  {tab.label}
                </Text>
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
            />
          ) : screen === "data" ? (
            <HistoryScreen />
          ) : (
            <SettingsScreen />
          )}
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  frame: { flex: 1, width: "100%" },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  // A row of 13px labels tucked into a corner reads as an afterthought on a
  // monitor. Same bar, sized for the window it is actually in.
  navWide: { paddingHorizontal: 32, paddingTop: 14, paddingBottom: 8, gap: 6 },
  navItem: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8 },
  navItemWide: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  navLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.text55 },
  navLabelWide: { fontSize: 16 },
  navLabelActive: { color: colors.accent },
});
