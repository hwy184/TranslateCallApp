import { ApiClientError, friendlyErrorMessage, parseBackendError } from "../src/api/errors";

describe("api error mapping", () => {
  it("parses backend error payload", () => {
    const err = parseBackendError(409, {
      error: {
        code: "ROOM_ALREADY_HAS_GUEST",
        message: "Room already has a guest",
        details: null
      }
    });
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe("ROOM_ALREADY_HAS_GUEST");
    expect(friendlyErrorMessage(err)).toContain("Room da co guest");
  });

  it("handles unknown payload", () => {
    const err = parseBackendError(500, { foo: "bar" });
    expect(err.code).toBe("UNKNOWN_BACKEND_ERROR");
  });

  it("maps timeout message", () => {
    const err = new ApiClientError({
      status: 0,
      code: "NETWORK_TIMEOUT",
      message: "Request timed out"
    });
    expect(friendlyErrorMessage(err)).toContain("timeout");
  });
});
