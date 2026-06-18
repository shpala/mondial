import { afterEach, describe, expect, it } from "vitest";
import { fetchWithTimeout } from "@/lib/api/http";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("fetchWithTimeout", () => {
  it("aborts and rejects when the request exceeds the timeout", async () => {
    // A fetch that never resolves on its own — it only settles when its abort
    // signal fires, exactly like a hung upstream origin.
    global.fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      })) as typeof fetch;

    await expect(fetchWithTimeout("https://example.test", {}, 20)).rejects.toThrow();
  });

  it("forwards url + init, returns the response, and attaches an abort signal", async () => {
    let seen: { url: unknown; init: RequestInit | undefined } | null = null;
    const response = new Response("ok");
    global.fetch = ((url: string, init?: RequestInit) => {
      seen = { url, init };
      return Promise.resolve(response);
    }) as typeof fetch;

    const res = await fetchWithTimeout("https://example.test", {
      next: { revalidate: 600 },
      headers: { "User-Agent": "mondial-app" },
    } as RequestInit);

    expect(res).toBe(response);
    expect(seen!.url).toBe("https://example.test");
    expect(seen!.init?.signal).toBeInstanceOf(AbortSignal);
    // Caller-supplied options must survive (Next caching + headers).
    expect((seen!.init as { next?: unknown }).next).toEqual({ revalidate: 600 });
    expect(seen!.init?.headers).toEqual({ "User-Agent": "mondial-app" });
  });
});
