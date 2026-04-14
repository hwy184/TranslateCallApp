import { mapCreateToRoomContext } from "../src/store/session-mapper";

describe("session state mapping", () => {
  it("maps create room payload into room context", () => {
    const context = mapCreateToRoomContext({
      role: "host",
      displayName: "Host A",
      payload: {
        room: {
          roomId: "room_1",
          sessionId: "session_1",
          hostParticipantId: "p_host",
          status: "waiting_guest",
          createdAt: "2026-04-14T00:00:00.000Z",
          providerProfile: "x",
          supportedLanguages: ["vi", "en"]
        },
        participant: {
          participantId: "p_host",
          identity: "host_identity",
          role: "host",
          userId: "u1",
          joinedAt: "2026-04-14T00:00:00.000Z",
          settings: {
            source_language: "vi",
            target_language: "en",
            voice_profile: "host-default"
          }
        },
        metadata: {
          room: {
            session_id: "session_1",
            mode: "bidirectional",
            audio_mode: "translated_only",
            supported_languages: ["vi", "en"],
            provider_profile: "x"
          },
          participant: {
            role: "host",
            identity: "host_identity",
            source_language: "vi",
            target_language: "en",
            voice_profile: "host-default"
          }
        },
        livekit: {
          room_name: "room_1",
          token: "token_1",
          token_status: "issued"
        }
      }
    });

    expect(context.roomId).toBe("room_1");
    expect(context.sessionId).toBe("session_1");
    expect(context.livekitToken).toBe("token_1");
    expect(context.participantIdentity).toBe("host_identity");
  });
});
