import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "@/App";

describe("Whitelist error feedback", () => {
  it("shows an error message on failed whitelist update and auto clears", async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({});
    });

    chrome.runtime.sendMessage = vi.fn((message, callback) => {
      if (message.action === "getCurrentDomain") {
        callback({ domain: "example.com" });
        return;
      }

      if (message.action === "checkDomainWhitelist") {
        callback({ isWhitelisted: false });
        return;
      }

      if (message.action === "updateWhitelist") {
        callback({ success: false, message: "Update failed" });
      }
    });

    render(<App />);

    await screen.findByText("example.com");

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText("to Whitelist"));

    expect(screen.getByText("Update failed")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText("Update failed")).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
