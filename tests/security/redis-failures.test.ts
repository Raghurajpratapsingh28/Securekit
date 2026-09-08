import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RedisStore } from "../../packages/redis/dist/index.js";

function createFailingClient() {
  return {
    hGetAll: async () => {
      throw new Error("ECONNREFUSED");
    },
    hSet: async () => {
      throw new Error("ECONNREFUSED");
    },
    pExpire: async () => 1,
    del: async () => 1,
  };
}

describe("RedisStore failure injection", () => {
  it("propagates store errors from increment without crashing the process", async () => {
    const store = new RedisStore(createFailingClient());
    await assert.rejects(() => store.increment("user:1", 60_000), /ECONNREFUSED/);
    await store.destroy();
  });

  it("destroy does not require quit on shared clients", async () => {
    let quitCalled = false;
    const store = new RedisStore({
      hGetAll: async () => ({}),
      hSet: async () => 1,
      pExpire: async () => 1,
      del: async () => 1,
      quit: async () => {
        quitCalled = true;
      },
    });
    await store.destroy();
    assert.equal(quitCalled, false);
  });
});
