import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareDialog } from "./ShareDialog";

vi.mock("../lib/share-api", () => ({
  createShare: vi.fn(),
  fetchMyShares: vi.fn(),
  deleteShare: vi.fn(),
}));

import { createShare, fetchMyShares, deleteShare } from "../lib/share-api";

const mockCreateShare = createShare as ReturnType<typeof vi.fn>;
const mockFetchMyShares = fetchMyShares as ReturnType<typeof vi.fn>;
const mockDeleteShare = deleteShare as ReturnType<typeof vi.fn>;

const mockShare = {
  id: "share-1",
  type: "dna" as const,
  title: "My DNA Share",
  payload: '{ "name": "test" }',
  createdBy: "user-1",
  createdAt: Date.now() / 1000,
  viewCount: 3,
};

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  dna: '{"name":"test-dna"}',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShareDialog", () => {
  it("returns null when open=false", () => {
    const { container } = render(<ShareDialog open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the dialog with title 'Share' when open=true", () => {
    render(<ShareDialog {...defaultProps} />);
    expect(screen.getByText("Share")).toBeInTheDocument();
  });

  it("shows 'No shares yet' when shares list is empty", async () => {
    mockFetchMyShares.mockResolvedValue([]);
    render(<ShareDialog {...defaultProps} />);
    expect(await screen.findByText("No shares yet")).toBeInTheDocument();
  });

  it("renders share list when data exists", async () => {
    mockFetchMyShares.mockResolvedValue([mockShare]);
    render(<ShareDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("My DNA Share")).toBeInTheDocument();
    });
    expect(screen.getAllByText("DNA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
  });

  it("supports type switching between dna, trace, and template", () => {
    render(<ShareDialog {...defaultProps} />);
    const dnaButton = screen.getByRole("button", { name: /dna/i });
    const traceButton = screen.getByRole("button", { name: /trace/i });
    const templateButton = screen.getByRole("button", { name: /template/i });

    expect(dnaButton).toBeInTheDocument();
    expect(traceButton).toBeInTheDocument();
    expect(templateButton).toBeInTheDocument();

    // Default is dna, click trace
    fireEvent.click(traceButton);
    // Click template
    fireEvent.click(templateButton);
  });

  it("creates a share with title", async () => {
    mockFetchMyShares.mockResolvedValue([]);
    mockCreateShare.mockResolvedValue({
      ...mockShare,
      id: "share-new",
      title: "New Share",
    });

    render(<ShareDialog {...defaultProps} dna="some-dna" />);

    const input = screen.getByPlaceholderText("Share title...");
    fireEvent.change(input, { target: { value: "New Share" } });

    const createButton = screen.getByRole("button", { name: /create/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockCreateShare).toHaveBeenCalledWith("dna", "New Share", "some-dna");
    });
  });

  it("disables the create button when title is empty", () => {
    render(<ShareDialog {...defaultProps} />);
    const createButton = screen.getByRole("button", { name: /create/i });
    expect(createButton).toBeDisabled();

    const input = screen.getByPlaceholderText("Share title...");
    fireEvent.change(input, { target: { value: "Some title" } });
    expect(createButton).not.toBeDisabled();

    // Clear title again
    fireEvent.change(input, { target: { value: "" } });
    expect(createButton).toBeDisabled();
  });

  it("deletes a share when delete button is clicked", async () => {
    mockFetchMyShares.mockResolvedValue([mockShare]);
    mockDeleteShare.mockResolvedValue(true);

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("My DNA Share")).toBeInTheDocument();
    });

    const deleteButton = screen.getByTitle("Delete");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteShare).toHaveBeenCalledWith("share-1");
    });
  });

  it("copies link when copy button is clicked", async () => {
    mockFetchMyShares.mockResolvedValue([mockShare]);

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("My DNA Share")).toBeInTheDocument();
    });

    const copyButton = screen.getByTitle("Copy link");
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it("does not crash when loadShares fails", async () => {
    mockFetchMyShares.mockRejectedValue(new Error("Network error"));

    expect(() => {
      render(<ShareDialog {...defaultProps} />);
    }).not.toThrow();

    // Dialog still renders with empty state
    expect(await screen.findByText("No shares yet")).toBeInTheDocument();
  });
});
