import { historyFor, HISTORY_MAX_MESSAGES } from "../history";
import { ThreadMessage } from "../thread";

const message = (
  content: string,
  role: ThreadMessage["role"] = "user",
  status: ThreadMessage["status"] = "delivered"
): ThreadMessage => ({ id: content, role, content, timestamp: 0, status });

test("the conversation so far travels with the question", () => {
  const history = historyFor([message("first"), message("answer", "assistant")]);

  expect(history).toEqual([
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
  ]);
});

test("a question still in flight is not part of what was said", () => {
  // It is appended before the send, and the prompt travels on its own.
  expect(historyFor([message("asking now", "user", "sending")])).toEqual([]);
});

test("a failed or queued message never reached the model", () => {
  expect(historyFor([message("lost", "user", "failed"), message("waiting", "user", "queued")])).toEqual([]);
});

test("only the recent end of a long conversation is carried", () => {
  const many = Array.from({ length: 40 }, (_, i) => message(`m${i}`));

  const history = historyFor(many);

  expect(history).toHaveLength(HISTORY_MAX_MESSAGES);
  expect(history[history.length - 1].content).toBe("m39");
});

test("a few enormous messages are cut before they flood a thin line", () => {
  const huge = Array.from({ length: 5 }, (_, i) => message("x".repeat(4000) + i));

  const history = historyFor(huge);

  expect(history.length).toBeLessThan(5);
  // Whatever is kept is the most recent, so the reply follows on from it.
  expect(history[history.length - 1].content.endsWith("4")).toBe(true);
});

test("one message longer than the whole budget is still sent", () => {
  expect(historyFor([message("y".repeat(20000))])).toHaveLength(1);
});
