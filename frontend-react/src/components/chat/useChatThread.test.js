// Pins the chat thread merge. Every message the user sees passes through here,
// and the two failure modes are both bad in the same way: a duplicate bubble
// makes the product look broken, and a dropped message loses a support reply.
import { describe, expect, it } from "vitest";
import { mergeMessages } from "./useChatThread";

const msg = (seq, body, extra = {}) => ({
  id: seq,
  seq,
  sender: "user",
  body,
  created_at: "2026-07-30T10:00:00Z",
  ...extra,
});

describe("mergeMessages", () => {
  it("appends new messages in seq order", () => {
    const out = mergeMessages([msg(1, "a")], [msg(2, "b"), msg(3, "c")]);
    expect(out.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("sorts an out-of-order batch by seq, not arrival order", () => {
    const out = mergeMessages([], [msg(3, "c"), msg(1, "a"), msg(2, "b")]);
    expect(out.map((m) => m.body)).toEqual(["a", "b", "c"]);
  });

  it("drops a message the thread already has", () => {
    // A poll that overlaps a send can legitimately return a seq we hold.
    const out = mergeMessages([msg(1, "a"), msg(2, "b")], [msg(2, "b"), msg(3, "c")]);
    expect(out.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("replaces an optimistic bubble with the server's copy, in place", () => {
    const pending = msg(null, "hello", {
      id: "tmp-x",
      client_msg_id: "x",
      pending: true,
    });
    const prev = [msg(1, "earlier"), pending];
    const out = mergeMessages(prev, [msg(2, "hello", { client_msg_id: "x" })]);

    expect(out).toHaveLength(2);
    expect(out[1].seq).toBe(2);
    expect(out[1].pending).toBeUndefined();
  });

  it("does not double-add when the poll also returns our own message", () => {
    // The send response and the next poll both carry the same row.
    const pending = msg(null, "hi", { id: "tmp-y", client_msg_id: "y", pending: true });
    const afterSend = mergeMessages([pending], [msg(5, "hi", { client_msg_id: "y" })]);
    const afterPoll = mergeMessages(afterSend, [msg(5, "hi", { client_msg_id: "y" })]);
    expect(afterPoll).toHaveLength(1);
    expect(afterPoll[0].seq).toBe(5);
  });

  it("keeps pending sends at the bottom while they have no seq", () => {
    const pending = msg(null, "typing this", {
      id: "tmp-z",
      client_msg_id: "z",
      pending: true,
    });
    const out = mergeMessages([msg(1, "a"), pending], [msg(2, "admin reply")]);
    expect(out.map((m) => m.body)).toEqual(["a", "admin reply", "typing this"]);
  });

  it("leaves the thread untouched on an empty batch", () => {
    const prev = [msg(1, "a")];
    expect(mergeMessages(prev, [])).toBe(prev);
  });

  it("does not confuse two different pending sends", () => {
    const p1 = msg(null, "one", { id: "tmp-1", client_msg_id: "c1", pending: true });
    const p2 = msg(null, "two", { id: "tmp-2", client_msg_id: "c2", pending: true });
    const out = mergeMessages([p1, p2], [msg(7, "one", { client_msg_id: "c1" })]);

    const settled = out.filter((m) => m.seq != null);
    const stillPending = out.filter((m) => m.pending);
    expect(settled.map((m) => m.body)).toEqual(["one"]);
    expect(stillPending.map((m) => m.body)).toEqual(["two"]);
  });
});
