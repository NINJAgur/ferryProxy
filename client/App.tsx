import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { PressState } from "./src/components/pressState";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { colors, fonts } from "./src/theme";

type Screen = "home" | "history" | "settings";

const TABS: { key: Screen; label: string }[] = [
  { key: "home", label: "Thread" },
  { key: "history", label: "Data" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

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
      {screen === "home" ? <HomeScreen /> : screen === "history" ? <HistoryScreen /> : <SettingsScreen />}
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
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  navItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  navLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text55 },
  navLabelActive: { color: colors.accent },
});
