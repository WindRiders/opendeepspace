import {
  fetchMarketplaceAgents,
  fetchMarketplaceAgent,
  publishAgent,
  starAgent,
  downloadMarketplaceAgent,
  deleteMarketplaceAgent,
} from "../lib/marketplace-api";

const API_URL = "http://localhost:3001";

describe("Marketplace API", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchMarketplaceAgents", () => {
    it("should fetch agent list", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "a1", name: "Agent 1", stars: 5, downloads: 10 },
          ]),
      } as any);

      const result = await fetchMarketplaceAgents();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Agent 1");
    });

    it("should pass search query", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as any);

      await fetchMarketplaceAgents("python");

      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/marketplace?search=python`,
        expect.any(Object),
      );
    });

    it("should pass limit and offset", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as any);

      await fetchMarketplaceAgents(undefined, undefined, 10, 20);

      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/marketplace?limit=10&offset=20`,
        expect.any(Object),
      );
    });

    it("should return empty array on error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false } as any);

      const result = await fetchMarketplaceAgents();
      expect(result).toEqual([]);
    });
  });

  describe("fetchMarketplaceAgent", () => {
    it("should fetch single agent", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "a1", name: "Agent 1" }),
      } as any);

      const result = await fetchMarketplaceAgent("a1");

      expect(result!.name).toBe("Agent 1");
      expect(fetch).toHaveBeenCalledWith(`${API_URL}/marketplace/a1`, expect.any(Object));
    });

    it("should return null on error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false } as any);

      const result = await fetchMarketplaceAgent("bad-id");
      expect(result).toBeNull();
    });
  });

  describe("publishAgent", () => {
    it("should publish an agent", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "new-id", name: "New Agent" }),
      } as any);

      const result = await publishAgent({
        name: "New Agent",
        description: "desc",
        dna: "dna",
        tags: ["ai"],
      });

      expect(result!.id).toBe("new-id");
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/marketplace`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("starAgent", () => {
    it("should star an agent", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "a1", stars: 6 }),
      } as any);

      const result = await starAgent("a1");

      expect(result!.stars).toBe(6);
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/marketplace/a1/star`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("downloadMarketplaceAgent", () => {
    it("should increment download count", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ downloads: 5 }),
      } as any);

      const downloads = await downloadMarketplaceAgent("a1");

      expect(downloads).toBe(5);
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/marketplace/a1/download`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should return null on error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false } as any);

      const result = await downloadMarketplaceAgent("bad-id");
      expect(result).toBeNull();
    });
  });

  describe("deleteMarketplaceAgent", () => {
    it("should delete an agent", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: true } as any);

      const result = await deleteMarketplaceAgent("a1");

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/marketplace/a1`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("should return false on error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({ ok: false } as any);

      const result = await deleteMarketplaceAgent("bad-id");
      expect(result).toBe(false);
    });
  });
});