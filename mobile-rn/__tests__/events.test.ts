import { parseDataChannelEvent, toTimelineEvent } from "../src/contracts/events";

describe("data-channel parser", () => {
  it("parses translation.final event", () => {
    const payload = JSON.stringify({
      type: "translation.final",
      session_id: "session_1",
      room_id: "room_1",
      utterance_id: "utt_1",
      speaker_identity: "host_1",
      source_lang: "vi",
      target_lang: "en",
      timestamp: "2026-04-14T00:00:00.000Z",
      text: "xin chao",
      translated_text: "hello"
    });

    const event = parseDataChannelEvent(payload);
    expect(event).not.toBeNull();
    if (!event) return;
    const timeline = toTimelineEvent(event);
    expect(timeline.translatedText).toBe("hello");
    expect(timeline.sourceLang).toBe("vi");
    expect(timeline.targetLang).toBe("en");
  });

  it("rejects invalid translation.final without translated_text", () => {
    const payload = JSON.stringify({
      type: "translation.final",
      session_id: "session_1",
      room_id: "room_1",
      timestamp: "2026-04-14T00:00:00.000Z"
    });
    expect(parseDataChannelEvent(payload)).toBeNull();
  });
});
