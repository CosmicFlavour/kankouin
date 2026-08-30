import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "./AIChatSidebar";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

describe("AIChatSidebar", () => {
  it("shows a placeholder when there are no messages yet", () => {
    render(
      <AIChatSidebar
        open
        projectId="project-1"
        workspaceId="workspace-1"
        onMutation={() => {}}
      />,
    );

    expect(
      screen.getByText(/ask me to break a task down/i),
    ).toBeInTheDocument();
  });

  it("sends a message on button click and renders both sides of the exchange", async () => {
    const user = userEvent.setup();
    mockCommands({ chat_with_ai: () => "Here's a plan." });
    render(
      <AIChatSidebar
        open
        projectId="project-1"
        workspaceId="workspace-1"
        onMutation={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText("Message the AI assistant…");
    await user.type(textarea, "Break this down");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Here's a plan.")).toBeInTheDocument();
    expect(screen.getByText("Break this down")).toBeInTheDocument();
    expect(textarea).toHaveValue("");
    expect(mockInvoke).toHaveBeenCalledWith("chat_with_ai", {
      message: "Break this down",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
  });

  it("sends a message on Enter without Shift, but not with Shift", async () => {
    const user = userEvent.setup();
    mockCommands({ chat_with_ai: () => "ok" });
    render(
      <AIChatSidebar
        open
        projectId="project-1"
        workspaceId="workspace-1"
        onMutation={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText("Message the AI assistant…");
    await user.type(textarea, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(mockInvoke).not.toHaveBeenCalled();

    await user.type(textarea, "{Enter}");
    expect(mockInvoke).toHaveBeenCalledWith(
      "chat_with_ai",
      expect.objectContaining({ message: "Line one\nLine two" }),
    );
  });

  it("calls onMutation after a successful reply", async () => {
    const user = userEvent.setup();
    mockCommands({ chat_with_ai: () => "done" });
    let mutated = false;
    render(
      <AIChatSidebar
        open
        projectId="project-1"
        workspaceId="workspace-1"
        onMutation={() => {
          mutated = true;
        }}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "add a subtask",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("done");
    expect(mutated).toBe(true);
  });

  it("shows an error when the backend call fails", async () => {
    const user = userEvent.setup();
    mockCommands({
      chat_with_ai: () => {
        throw new Error("ai backend unavailable");
      },
    });
    render(
      <AIChatSidebar
        open
        projectId="project-1"
        workspaceId="workspace-1"
        onMutation={() => {}}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Message the AI assistant…"),
      "hello",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Error: ai backend unavailable"),
    ).toBeInTheDocument();
  });
});
