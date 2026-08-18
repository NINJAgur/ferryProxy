import { PressableStateCallbackType } from "react-native";

/** react-native-web adds `hovered` at runtime; RN's own types don't declare it. */
export type PressState = PressableStateCallbackType & { hovered?: boolean };
