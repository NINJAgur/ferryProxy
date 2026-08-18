import NetInfo from "@react-native-community/netinfo";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { HandshakePanel } from "../components/HandshakePanel";
import { MessageBubble } from "../components/MessageBubble";
import { PendingCard } from "../components/PendingCard";
import { ProviderPicker } from "../components/ProviderPicker";
import { QueuedList } from "../components/QueuedList";
import { requestLandingNotification, sendLandedNotification } from "../notify";
import { enqueue, loadQueue, QueuedMessage } from "../queue/offlineQueue";
import { startQueueProcessor } from "../queue/queueProcessor";
import { useMetricsStore } from "../state/metricsStore";
import {
  LONG_ANSWER_WARNING_MS,
  QUIET_RETRIES_BEFORE_SURFACING,
  useSettingsStore,
} from "../state/settingsStore";
import { PendingSend, ThreadMessage } from "../state/thread";
import { useThreadStore } from "../state/threadStore";
import { useKeyStore } from "../state/keyStore";
import { PressState } from "../components/pressState";
import { colors, fonts } from "../theme";
import { checkHealth, HttpError } from "../transport/httpClient";
import { generateId } from "../transport/ids";
import { sendPrompt } from "../transport/reassembly";
import { ReassemblyStatus } from "../transport/reassemblyState";
import { Provider, ProviderStatus } from "../transport/types";
import { useHandshakeVisibility } from "../useHandshakeVisibility";

export function HomeScreen({
  providers,
  refreshProviders,
}: {
  providers: ProviderStatus[];
  refreshProviders: () => void;
}) {
  const sessionId = useRef(generateId()).current;
  const inputRef = useRef<TextInput>(null);
  const notifyRef = useRef(false);

  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<Provider>("demo");
  const conversations = useThreadStore((t) => t.conversations);
  const activeId = useThreadStore((t) => t.activeId);
  const appendMessage = useThreadStore((t) => t.append);
  const patchMessage = useThreadStore((t) => t.patch);
  const startNew = useThreadStore((t) => t.startNew);
  const messages = conversations.find((c) => c.id === activeId)?.messages ?? [];
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [pendingState, setPendingState] = useState<ReassemblyStatus>({ status: "idle" });
  const [queued, setQueued] = useState<QueuedMessage[]>([]);
  const [online, setOnline] = useState(true);
  const [wifiJoined, setWifiJoined] = useState(false);
  const [reachedServer, setReachedServer] = useState(false);

  const addMetric = useMetricsStore((s) => s.addMessage);
  const { keys, load } = useKeyStore();
  const settings = useSettingsStore();

  const refreshQueue = () => void loadQueue().then(setQueued);
  const patch = patchMessage;

  useEffect(() => {
    if (!activeId) startNew(generateId());
  }, [activeId, startNew]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void NetInfo.fetch().then((s) => {
      setWifiJoined(!!s.isConnected);
      setOnline(!!s.isConnected);
    });
    void checkHealth().then(setReachedServer);
    return NetInfo.addEventListener((s) => setOnline(!!s.isConnected));
  }, []);

  useEffect(() => {
    refreshQueue();
    return startQueueProcessor(
      {
        sessionId,
        onMessageComplete: (q, content) => {
          refreshQueue();
          const store = useThreadStore.getState();
          const open = store.conversations.find((c) => c.id === store.activeId);
          if (open?.messages.some((m) => m.id === q.id)) {
            store.patch(q.id, { status: "delivered" });
          } else {
            store.append({
              id: q.id,
              role: "user",
              content: q.prompt,
              timestamp: q.createdAt,
              status: "delivered",
            });
          }
          store.append({
            id: generateId(),
            role: "assistant",
            content,
            timestamp: Date.now(),
            status: "delivered",
          });
        },
        onMessageFailed: (q, reason) => {
          refreshQueue();
          patch(q.id, { status: "failed", failReason: reason });
        },
      },
      settings.sendWhenLineAppears
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, settings.sendWhenLineAppears]);

  async function attemptSend(id: string, content: string, used: Provider) {
    notifyRef.current = false;
    setPending({ userMessageId: id, startedAt: Date.now(), notifyRequested: false });
    setPendingState({ status: "idle" });
    patch(id, { status: "sending" });
    try {
      const result = await sendPrompt(
        {
          prompt: content,
          provider: used,
          sessionId,
          brief: settings.answerShortFirst,
          userKey: keys[used],
        },
        setPendingState
      );
      patch(id, { status: "delivered", failReason: undefined });
      const pieces = result.metrics.totalChunks;
      appendMessage({
        id: generateId(),
        role: "assistant",
        content: result.response.content,
        timestamp: Date.now(),
        status: "delivered",
        note: pieces > 1 ? `Arrived in ${pieces} pieces` : undefined,
      });
      addMetric({ id: generateId(), timestamp: Date.now(), prompt: content, ...result.metrics });
      if (notifyRef.current) void sendLandedNotification();
    } catch (err) {
      if (err instanceof HttpError) {
        patch(id, { status: "failed", failReason: err.message });
        // 503 no key, 401/403 rejected, 429 out of quota: the credential is the
        // problem, not the line, so show what is actually broken.
        if ([401, 403, 429, 503].includes(err.status)) {
          refreshProviders();
          reshowHandshake();
        }
      } else {
        await enqueue({ id, prompt: content, provider: used });
        patch(id, { status: "queued" });
        refreshQueue();
      }
    } finally {
      setPending(null);
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || pending) return;
    setDraft("");
    const id = generateId();

    if (!online) {
      await enqueue({ id, prompt: content, provider });
      refreshQueue();
      return;
    }
    appendMessage({ id, role: "user", content, timestamp: Date.now(), status: "sending", provider });
    await attemptSend(id, content, provider);
  }

  async function handleNotifyMe() {
    if (await requestLandingNotification()) {
      notifyRef.current = true;
      setPending((p) => (p ? { ...p, notifyRequested: true } : p));
    }
  }

  const busy = !!pending;
  const offlineMode = !online || queued.length > 0;

  const active = providers.find((p) => p.name === provider);
  const providerReady = !!active?.ready || !!keys[provider];
  const providerHint =
    active && !active.ready && !keys[provider] && active.requiresKey
      ? `${active.label} needs a key. Add your own in Settings, or set ${active.envVar} on the relay.`
      : undefined;

  // Only show the handshake for a wait that is really happening: skipped entirely
  // when the link is already up, and never flashed past for a fraction of a second.
  const linkReady = wifiJoined && reachedServer && providerReady;
  const [showHandshake, dismissHandshake, reshowHandshake] = useHandshakeVisibility(
    linkReady,
    messages.length > 0 || queued.length > 0,
    !settings.introSeen
  );

  useEffect(() => {
    if (showHandshake && !settings.introSeen) settings.markIntroSeen();
  }, [showHandshake, settings]);

  if (showHandshake) {
    return (
      <View style={styles.screen}>
        <HandshakePanel
          wifiJoined={wifiJoined}
          reachedServer={reachedServer}
          providerReady={providerReady}
          providerLabel={active?.label ?? "the model"}
          providerNeedsKey={active?.requiresKey ?? true}
          providerKnown={providers.length > 0}
          providerHint={providerHint}
          onWriteWhileWaiting={() => {
            dismissHandshake();
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onDismiss={dismissHandshake}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={12}
    >
      <View style={[styles.header, offlineMode && styles.headerOffline]}>
        {offlineMode ? (
          <>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: colors.neutral600 }]} />
              <Text style={styles.statusText}>
                {online ? "The line keeps dropping" : "No connection right now"}
              </Text>
            </View>
            <Text style={styles.headerTitle}>
              {queued.length === 0
                ? "Nothing waiting"
                : `${countWord(queued.length)} question${queued.length === 1 ? "" : "s"} waiting`}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.headerTitle}>Ferry</Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={styles.statusText}>Slow but steady</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.providerRow}>
        <ProviderPicker
          value={provider}
          onChange={setProvider}
          disabled={busy}
          readyNames={providers.length ? providers.filter((p) => p.ready).map((p) => p.name) : undefined}
        />
      </View>

      <ScrollView style={styles.thread} contentContainerStyle={styles.threadContent}>
        <QueuedList messages={queued} />
        {/* Queued messages are listed in QueuedList; don't repeat them as bubbles. */}
        {messages
          .filter((m) => m.status !== "queued")
          .map((m) =>
          pending?.userMessageId === m.id ? (
            <React.Fragment key={m.id}>
              <MessageBubble message={m} />
              <PendingCard
                state={pendingState}
                startedAt={pending.startedAt}
                quietRetries={settings.keepTryingQuietly ? QUIET_RETRIES_BEFORE_SURFACING : 0}
                warnAfterMs={settings.warnBeforeLongAnswers ? LONG_ANSWER_WARNING_MS : undefined}
                notifyRequested={pending.notifyRequested}
                partialText={partialFrom(pendingState)}
                onStop={() => setPending(null)}
                onNotifyMe={handleNotifyMe}
              />
            </React.Fragment>
          ) : (
            <MessageBubble
              key={m.id}
              message={m}
              onRetry={m.status === "failed" ? () => attemptSend(m.id, m.content, m.provider ?? provider) : undefined}
            />
          )
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={offlineMode ? "Write the next one" : "Ask something"}
          placeholderTextColor={colors.text40}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          editable={!busy}
          returnKeyType="send"
        />
        <Pressable
          onPress={handleSend}
          disabled={busy || !draft.trim()}
          style={({ hovered }: PressState) => [
            offlineMode ? styles.queueBtn : styles.sendBtn,
            hovered && draft.trim() && !busy && { backgroundColor: colors.accent900 },
            (!draft.trim() || busy) && styles.btnDim,
          ]}
        >
          <Text style={styles.sendLabel}>{offlineMode ? "Queue" : "Send"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function partialFrom(state: ReassemblyStatus): string | undefined {
  if (state.status !== "awaiting_chunks" || state.receivedCount < 1) return undefined;
  return "The answer is coming across in pieces — the first of it is here";
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function countWord(n: number): string {
  return n <= 10 ? WORDS[n] : String(n);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider09 },
  headerOffline: { backgroundColor: colors.surface },
  headerTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text, lineHeight: 20.4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: fonts.body, fontSize: 12, color: colors.text55 },
  providerRow: { paddingHorizontal: 18, paddingTop: 14 },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  composer: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.divider09,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 22,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
    paddingHorizontal: 16,
  },
  sendBtn: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  queueBtn: {
    height: 44,
    width: 74,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDim: { opacity: 0.45 },
  sendLabel: { fontFamily: fonts.heading, fontSize: 14, color: colors.accent400 },
});
