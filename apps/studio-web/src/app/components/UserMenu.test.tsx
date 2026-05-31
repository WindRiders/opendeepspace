import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserMenu } from "./UserMenu";
import type { UserProfile } from "../hooks/useAuth";

const mockUser: UserProfile = {
  id: "user-1",
  email: "test@example.com",
  username: "testuser",
  avatarUrl: null,
  role: "user",
  createdAt: "2024-01-01T00:00:00Z",
  lastLoginAt: "2024-01-01T00:00:00Z",
};

const mockProps = {
  user: mockUser,
  onLogout: vi.fn(),
  onUpdateProfile: vi.fn(() => Promise.resolve()),
  error: "",
  onClearError: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function getUsernameInput() {
  // Label "Username" is followed by an input — find it by traversing the DOM
  const label = screen.getByText("Username");
  const container = label.parentElement?.parentElement;
  return container?.querySelector("input") as HTMLInputElement;
}

function getPasswordInputs() {
  return screen.getAllByPlaceholderText(/password/i);
}

describe("UserMenu", () => {
  it("renders user avatar with initials", () => {
    render(<UserMenu {...mockProps} />);
    expect(screen.getByText("TE")).toBeTruthy();
  });

  it("opens dropdown menu when avatar is clicked", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    expect(screen.getByText("Profile Settings")).toBeTruthy();
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("displays user info in the dropdown menu", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    // "testuser" appears in both the button and dropdown — query within the dropdown
    const dropdown = screen.getByText("Profile Settings").closest(".absolute")!;
    expect(dropdown.querySelector("p")?.textContent).toBe("testuser");
    expect(dropdown.querySelectorAll("p")[1]?.textContent).toBe("test@example.com");
    expect(dropdown.querySelector("span")?.textContent).toBe("user");
  });

  it("opens profile dialog when Profile Settings is clicked", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    expect(screen.getByText("Profile Settings")).toBeTruthy();
    expect(getUsernameInput()).toBeTruthy();
  });

  it("calls onLogout when Sign Out is clicked", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Sign Out"));
    expect(mockProps.onLogout).toHaveBeenCalledTimes(1);
  });

  it("renders profile dialog with current username", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    expect(getUsernameInput().value).toBe("testuser");
  });

  it("allows changing the username in the profile dialog", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    const usernameInput = getUsernameInput();
    fireEvent.change(usernameInput, { target: { value: "newusername" } });
    expect(usernameInput.value).toBe("newusername");
  });

  it("shows error when new passwords do not match", async () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    const [current, newPassword, confirmPassword] = getPasswordInputs();
    fireEvent.change(current, { target: { value: "oldpass123" } });
    fireEvent.change(newPassword, { target: { value: "newpassword1" } });
    fireEvent.change(confirmPassword, { target: { value: "differentpass" } });
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(screen.getByText("New passwords do not match")).toBeTruthy();
    });
  });

  it("shows error when new password is shorter than 8 characters", async () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    const [current, newPassword, confirmPassword] = getPasswordInputs();
    fireEvent.change(current, { target: { value: "oldpass123" } });
    fireEvent.change(newPassword, { target: { value: "short" } });
    fireEvent.change(confirmPassword, { target: { value: "short" } });
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(screen.getByText("New password must be at least 8 characters")).toBeTruthy();
    });
  });

  it("shows error when current password is missing for password change", async () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    const [, newPassword, confirmPassword] = getPasswordInputs();
    fireEvent.change(newPassword, { target: { value: "newpassword1" } });
    fireEvent.change(confirmPassword, { target: { value: "newpassword1" } });
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(screen.getByText("Current password is required to change password")).toBeTruthy();
    });
  });

  it("calls onUpdateProfile with username changes when Save is clicked", async () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    fireEvent.click(screen.getByText("Profile Settings"));
    const usernameInput = getUsernameInput();
    fireEvent.change(usernameInput, { target: { value: "updateduser" } });
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockProps.onUpdateProfile).toHaveBeenCalledWith({
        username: "updateduser",
      });
    });
  });

  it("closes the dropdown menu when clicking outside", () => {
    render(<UserMenu {...mockProps} />);
    fireEvent.click(screen.getByRole("button", { name: /testuser/i }));
    expect(screen.getByText("Profile Settings")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Profile Settings")).toBeNull();
  });
});
