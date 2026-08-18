import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestLandingNotification(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function sendLandedNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: "Ferry", body: "Your answer arrived." },
    trigger: null,
  });
}
