import NetInfo from "@react-native-community/netinfo";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from "react-native";

import { CheckState, HandshakePanel } from "../components/HandshakePanel";
import { MessageBubble } from "../components/MessageBubble";
import { PendingCard } from "../components/PendingCard";
import { ModelPicker } from "../components/ModelPicker";
import { QueuedList } from "../components/QueuedList";
import { requestLandingNotification, sendLandedNotification } from "../notify";
import { enqueue, loadQueue, QueuedMessage } from "../queue/offlineQueue";
import { startQueueProcessor } from "../queue/queueProcessor";
import { historyFor } from "../state/history";
import { useMetricsStore } from "../state/metricsStore";
import {
  LONG_ANSWER_WARNING_MS,
  QUIET_RETRIES_BEFORE_SURFACING,
  useSettingsStore,
} from "../state/settingsStore";
import { PendingSend, ThreadMessage } from "../state/thread";
import { useThreadStore } from "../state/threadStore";
import { pickDefaultModel, useEntitlementStore } from "../state/entitlementStore";
import { buyAddOn, initPurchases, restorePurchases } from "../billing";
import { PressState } from "../components/pressState";
import { useWide, WIDE_COLUMN } from "../layout";
import { COMPOSER_ID } from "../webStyles";
import { colors, fonts } from "../theme";
import { checkHealth, HttpError } from "../transport/httpClient";
import { generateId } from "../transport/ids";
import { sendPrompt } from "../transport/reassembly";
import { ReassemblyStatus } from "../transport/reassemblyState";

/**
 * What survives leaving the Chat tab.
 *
 * The tab bar unmounts this screen, so anything held in component state is lost
 * the moment someone looks at Settings — which put the opening screen back in
 * their way every time they returned, and re-ran the startup checks over a line
 * that may barely work. Module scope lasts exactly as long as the app is open,
 * which is the intended lifetime: gone on reload, kept while you use it.
 */
const launch = {
  setupDismissed: false,
  checksRun: false,
  network: "pending" as CheckState,
  relay: "pending" as CheckState,
};

export function HomeScreen() {
  const sessionId = useRef(generateId()).current;
  const inputRef = useRef<TextInput>(null);
  const wide = useWide();
  const notifyRef = useRef(false);

  const [draft, setDraft] = useState("");
  // A web textarea does not grow on its own: without a height taken from its
  // content it keeps its one row and scrolls, which is not what a composer does.
  const [draftHeight, setDraftHeight] = useState(0);
  const [modelId, setModelId] = useState<string>("");
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
  const [network, setNetworkState] = useState<CheckState>(launch.network);
  const [relay, setRelayState] = useState<CheckState>(launch.relay);
  const [dismissedSetup, setDismissedSetup] = useState(launch.setupDismissed);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);

  const addMetric = useMetricsStore((s) => s.addMessage);
  const entitlement = useEntitlementStore();
  const settings = useSettingsStore();

  const setNetwork = (s: CheckState) => {
    launch.network = s;
    setNetworkState(s);
  };
  const setRelay = (s: CheckState) => {
    launch.relay = s;
    setRelayState(s);
  };
  const dismissSetup = () => {
    launch.setupDismissed = true;
    setDismissedSetup(true);
  };

  /**
   * Picking a different model starts a fresh chat.
   *
   * Every send carries the conversation so far, so continuing a thread across a
   * switch means paying to re-send another model's answers over a line that may
   * barely carry the question. Only a deliberate choice does this — the default
   * model chosen at launch goes through setModelId and leaves the chat alone.
   */
  const chooseModel = (next: string) => {
    if (next !== modelId && messages.length > 0) startNew(generateId());
    setModelId(next);
  };

  const refreshQueue = () => void loadQueue().then(setQueued);
  const patch = patchMessage;

  useEffect(() => {
    const next = pickDefaultModel(entitlement.models, modelId);
    if (next && next !== modelId) setModelId(next);
  }, [modelId, entitlement.models]);

  useEffect(() => {
    // The startup checks run once per app launch, not once per visit to this tab:
    // asking the relay again every time someone glances at Settings is a request
    // the line may not be able to spare.
    if (!launch.checksRun) {
      launch.checksRun = true;
      void NetInfo.fetch().then((s) => {
        setNetwork(s.isConnected ? "ok" : "failed");
        setOnline(!!s.isConnected);
      });
      void checkHealth().then((ok) => setRelay(ok ? "ok" : "failed"));
      // Ask what this device can use. Someone who already bought the add-on, here or
      // on an old phone, should arrive unlocked without pressing anything — but a
      // free install must not wait on the store, because the free model owes it nothing.
      void initPurchases().then((receipt) => entitlement.load(receipt ?? undefined));
    }

    // Always resubscribed, unlike the checks: this screen remounts on every tab
    // switch, and a stale mount's listener dies with it. Skipping it would leave
    // the app unable to notice the line coming back.
    return NetInfo.addEventListener((s) => {
      setOnline(!!s.isConnected);
      setNetwork(s.isConnected ? "ok" : "failed");
    });
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

  async function attemptSend(id: string, content: string, used: string) {
    notifyRef.current = false;
    setPending({ userMessageId: id, startedAt: Date.now(), notifyRequested: false });
    setPendingState({ status: "idle" });
    patch(id, { status: "sending" });
    try {
      const store = useThreadStore.getState();
      const open = store.conversations.find((c) => c.id === store.activeId);
      const result = await sendPrompt(
        {
          prompt: content,
          // Everything said before this question. Without it the relay forwards a
          // lone prompt and the model answers as though nothing came before.
          history: historyFor(open?.messages ?? []),
          model: used,
          sessionId,
          brief: settings.answerShortFirst,
          receipt: entitlement.receipt ?? undefined,
        },
        setPendingState
      );
      patch(id, { status: "delivered", failReason: undefined });
      const pieces = result.metrics.totalChunks;
      // The answer and its measurement share an id, so the chat can show what
      // the message cost beside the message itself.
      const answerId = generateId();
      appendMessage({
        id: answerId,
        role: "assistant",
        content: result.response.content,
        timestamp: Date.now(),
        status: "delivered",
        note: pieces > 1 ? `Arrived in ${pieces} pieces` : undefined,
      });
      const thread = useThreadStore.getState();
      addMetric({
        id: answerId,
        timestamp: Date.now(),
        prompt: content,
        conversationId: thread.activeId ?? undefined,
        conversationTitle: thread.conversations.find((c) => c.id === thread.activeId)?.title,
        ...result.metrics,
      });
      if (notifyRef.current) void sendLandedNotification();
    } catch (err) {
      if (err instanceof HttpError) {
        patch(id, { status: "failed", failReason: err.message });
        // 403 model not unlocked, 429 allowance spent, 503 no key on the relay:
        // what this device may use has changed, so re-read it and let the picker
        // reflect that. The chat stays put — yanking someone back to the opening
        // screen loses their place to tell them something the message already says.
        if ([403, 429, 503].includes(err.status)) {
          void entitlement.load();
        }
      } else {
        await enqueue({ id, prompt: content, model: used });
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
    setDraftHeight(0);
    fitComposer();
    const id = generateId();

    // A conversation is created by the first thing said in it, not by opening the
    // tab. Read through the store rather than the hook: this has to be true before
    // the message is appended, and React has not re-rendered yet.
    if (!useThreadStore.getState().activeId) startNew(generateId());

    if (!online) {
      const waiting = useThreadStore.getState();
      const thread = waiting.conversations.find((c) => c.id === waiting.activeId);
      await enqueue({ id, prompt: content, model: modelId, history: historyFor(thread?.messages ?? []) });
      refreshQueue();
      return;
    }
    appendMessage({ id, role: "user", content, timestamp: Date.now(), status: "sending" });
    await attemptSend(id, content, modelId);
  }

  /**
   * Enter sends, shift+Enter makes a newline — the convention every chat on the
   * web follows. Not on a phone: there the return key is the only newline key
   * there is, so it stays one and the Send button sends.
   */
  function handleComposerKey(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const native = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
    if (native.key !== "Enter" || native.shiftKey) return;
    (event as unknown as { preventDefault?: () => void }).preventDefault?.();
    void handleSend();
  }

  /**
   * Size the composer to its text, on web.
   *
   * Going through measured state does not survive the field scrolling: once it
   * has a height of its own it reports that height rather than the one its text
   * needs, so deleting a line never gave the space back — and dropping the
   * height first made it collapse, because a scrolling field measures what is
   * visible. Setting it to auto and reading the real scroll height is exact in
   * both directions, which is what every auto-growing textarea on the web does.
   */
  function fitComposer() {
    if (Platform.OS !== "web") return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node || !node.style) return;
    node.style.height = "auto";
    const floor = wide ? 54 : 44;
    // Two pixels of slack. Set to exactly the scroll height, a sub-pixel
    // rounding difference is enough for the browser to decide it overflows and
    // draw a scrollbar on the very first line.
    const fitted = Math.max(node.scrollHeight + 2, floor);
    node.style.height = `${Math.min(fitted, COMPOSER_MAX_HEIGHT)}px`;
  }

  async function handleNotifyMe() {
    if (await requestLandingNotification()) {
      notifyRef.current = true;
      setPending((p) => (p ? { ...p, notifyRequested: true } : p));
    }
  }

  async function runPurchase(
    step: () => Promise<{ receipt: string | null; error?: string; pending?: boolean }>,
    nothingHappened: string
  ) {
    setPurchaseBusy(true);
    setPurchaseNote(null);
    const result = await step();
    if (result.pending) {
      // A web checkout opens a browser, so there is no result to wait for. Say
      // where the purchase went rather than reporting a failure that has not
      // happened; coming back and pressing Restore picks it up.
      setPurchaseNote("Finish the purchase in your browser, then press Restore purchases.");
      setPurchaseBusy(false);
      return;
    }
    // The relay decides what a receipt is worth, so reload rather than trusting
    // the store's answer — a restore that finds nothing must stay locked. Which
    // means the reload, not the receipt, is what says whether anything changed.
    if (result.receipt) await entitlement.load(result.receipt);
    // Say something either way. Succeeding silently looks identical to a button
    // that does nothing, which is how this read when the models were already on.
    if (result.error) setPurchaseNote(result.error);
    else if (useEntitlementStore.getState().unlocked) setPurchaseNote("Everything is unlocked.");
    else setPurchaseNote(nothingHappened);
    setPurchaseBusy(false);
  }

  const busy = !!pending;
  const offlineMode = !online || queued.length > 0;

  // Setup owns the screen until it is dismissed, and then never takes it back.
  // Tying this to the entitlement phase meant every refresh of it — after a
  // refused send, say — threw the user back to the opening screen mid-conversation.
  // Dismissal is only reachable from the ready state, so this cannot skip setup.
  const setupDone = dismissedSetup;

  if (!setupDone) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.handshakeContent, wide && styles.fill]}>
        <HandshakePanel
          network={network}
          relay={relay}
          phase={entitlement.phase}
          unlocked={entitlement.unlocked}
          answersAllowed={entitlement.answersAllowed}
          models={entitlement.models}
          error={entitlement.error}
          note={purchaseNote}
          busy={purchaseBusy}
          onUnlock={() => void runPurchase(buyAddOn, "That didn't go through. Nothing was charged.")}
          onRestore={() =>
            void runPurchase(restorePurchases, "No purchase found for this device.")
          }
          onRetry={() => void entitlement.load()}
          onContinue={() => {
            dismissSetup();
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // iOS only. Android is set to pan, so the system already lifts the whole
      // window when the keyboard opens; adding padding on top of that overshoots
      // and pushes the header off the screen.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={12}
    >
      <View style={[styles.header, wide && styles.headerWide, offlineMode && styles.headerOffline]}>
        <View style={[styles.headerRow, wide && styles.column]}>
          <View style={styles.headerText}>
            {offlineMode ? (
              <>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: colors.neutral600 }]} />
                  <Text style={[styles.statusText, wide && styles.statusTextWide]}>
                    {online ? "The line keeps dropping" : "No connection right now"}
                  </Text>
                </View>
                <Text style={[styles.headerTitle, wide && styles.headerTitleWide]}>
                  {queued.length === 0
                    ? "Nothing waiting"
                    : `${countWord(queued.length)} question${queued.length === 1 ? "" : "s"} waiting`}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.headerTitle, wide && styles.headerTitleWide]}>Ferry</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.statusText, wide && styles.statusTextWide]}>Slow but steady</Text>
                </View>
              </>
            )}
          </View>
          {/* Starting a fresh chat belongs beside the chat, not in the list of
              old ones. */}
          <Pressable
            onPress={() => startNew(generateId())}
            style={({ hovered }: PressState) => [
              styles.newBtn,
              hovered && { backgroundColor: colors.accent900 },
            ]}
          >
            <Text style={styles.newLabel}>New chat</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.modelRow, wide && styles.column]}>
        <ModelPicker
          value={modelId}
          onChange={chooseModel}
          disabled={busy}
          models={entitlement.models}
        />
      </View>

      <ScrollView style={styles.thread} contentContainerStyle={[styles.threadContent, wide && styles.column]}>
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
              onRetry={m.status === "failed" ? () => attemptSend(m.id, m.content, modelId) : undefined}
            />
          )
        )}
      </ScrollView>

      <View style={styles.composerBar}>
      <View style={[styles.composer, wide && styles.column]}>
        <TextInput
          ref={inputRef}
          nativeID={COMPOSER_ID}
          style={[
            styles.input,
            wide && styles.inputWide,
            // Only with something in it. An empty multiline field reports a
            // content size of its own and would open several lines tall.
            Platform.OS !== "web" && draft.length > 0 && draftHeight > 0
              // Two pixels of slack: set to exactly the content height, a
              // sub-pixel rounding difference is enough for the browser to
              // decide it overflows and draw a scrollbar on the first line.
              ? {
                  height: Math.min(
                    Math.max(Math.ceil(draftHeight) + 2, wide ? 54 : 44),
                    COMPOSER_MAX_HEIGHT
                  ),
                }
              : null,
          ]}
          multiline
          onContentSizeChange={(e) => setDraftHeight(e.nativeEvent.contentSize.height)}
          // One row to start with. Without it a multiline field opens at the
          // browser's own idea of a textarea and fills the bottom of the screen.
          numberOfLines={1}
          placeholder={offlineMode ? "Write the next one" : "Ask something"}
          placeholderTextColor={colors.text40}
          value={draft}
          onChangeText={(next) => {
            setDraft(next);
            fitComposer();
          }}
          onSubmitEditing={handleSend}
          onKeyPress={Platform.OS === "web" ? handleComposerKey : undefined}
          editable={!busy}
          returnKeyType="send"
        />
        <Pressable
          onPress={handleSend}
          disabled={busy || !draft.trim()}
          style={({ hovered }: PressState) => [
            offlineMode ? styles.queueBtn : styles.sendBtn,
            wide && styles.sendBtnWide,
            hovered && draft.trim() && !busy && { backgroundColor: colors.accent900 },
            (!draft.trim() || busy) && styles.btnDim,
          ]}
        >
          <Text style={[styles.sendLabel, wide && styles.sendLabelWide]}>{offlineMode ? "Queue" : "Send"}</Text>
        </Pressable>
      </View>
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

/** Six or so lines. Past that the composer would be eating the conversation it
 *  belongs to, so it scrolls — the same place Gemini stops growing. */
const COMPOSER_MAX_HEIGHT = 160;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider09 },
  headerOffline: { backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerText: { flex: 1 },
  newBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 13 },
  newLabel: { fontFamily: fonts.heading, fontSize: 13, color: colors.accent },
  headerTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text, lineHeight: 20.4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: fonts.body, fontSize: 12, color: colors.text55 },
  modelRow: { paddingHorizontal: 18, paddingTop: 14 },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  handshakeContent: { paddingBottom: 32 },
  headerWide: { paddingTop: 26, paddingBottom: 20 },
  headerTitleWide: { fontSize: 24, lineHeight: 29 },
  statusTextWide: { fontSize: 14 },
  inputWide: { minHeight: 54, borderRadius: 27, fontSize: 16, paddingHorizontal: 20 },
  sendBtnWide: { height: 54, borderRadius: 27, paddingHorizontal: 28 },
  sendLabelWide: { fontSize: 16 },
  // Bars and dividers stay full width; what you read sits in a column.
  // The same frame screen A uses: full-window bars, content at a readable
  // width, sized for the window rather than for a phone held at arm's length.
  column: { width: "100%", maxWidth: WIDE_COLUMN, alignSelf: "center", paddingHorizontal: 40 },
  fill: { flexGrow: 1, justifyContent: "center" },
  composerBar: { borderTopWidth: 1, borderTopColor: colors.divider09 },
  composer: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: COMPOSER_MAX_HEIGHT,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 22,
    color: colors.text,
    // 16 exactly: below it, mobile Safari zooms the page when the field takes
    // focus, which then leaves the whole layout scaled up.
    fontSize: 16,
    fontFamily: fonts.body,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
