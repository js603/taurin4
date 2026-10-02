import { beforeEach, describe, expect, it } from "vitest";
import { ApiClient } from "./shared/api";
import { localDb } from "./shared/localDb";
import type { Session } from "./domain";

const session: Session = {
  token: "offline-token",
  user: { id:"u1", handle:"offline_writer", penName:"오프라인 문장가", tagline:"" },
};

describe("offline-first mobile data layer", () => {
  beforeEach(async () => {
    await localDb.clear();
    await localDb.set("session", session);
    Object.defineProperty(globalThis.navigator, "onLine", { value:false, configurable:true });
  });

  it("keeps drafts and newly written posts in local SQLite-compatible storage while offline", async () => {
    const client = new ApiClient();
    client.configure("https://offline.invalid", session.token);
    await client.saveDraft("연결이 없어도 문장은 사라지지 않는다.", "sentence");
    expect((await client.draft()).content).toContain("사라지지 않는다");

    const created = await client.createPost({
      type:"sentence",
      content:"연결이 없어도 문장은 사라지지 않는다.",
      topics:["기록"],
      visibility:"public",
    });
    expect(created.post.id.startsWith("local-post:")).toBe(true);
    expect((await client.feed()).items[0].content).toContain("사라지지 않는다");
    expect(await localDb.outboxCount()).toBe(1);
  });
});
