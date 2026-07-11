import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTags } from "./useTags";
import { mockInvoke, mockCommands } from "@/test/tauriMock";

const tag = { id: "tag-1", workspace_id: "ws-1", name: "urgent", color: "red" };

describe("useTags", () => {
  it("does nothing when workspaceId is null", () => {
    const { result } = renderHook(() => useTags(null));
    expect(result.current.tags).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches tags for the given workspace", async () => {
    mockCommands({ list_tags: () => [tag] });

    const { result } = renderHook(() => useTags("ws-1"));

    await waitFor(() => expect(result.current.tags).toEqual([tag]));
    expect(mockInvoke).toHaveBeenCalledWith("list_tags", { workspaceId: "ws-1" });
  });

  it("createTag appends the created tag and returns it", async () => {
    mockCommands({
      list_tags: () => [],
      create_tag: () => tag,
    });

    const { result } = renderHook(() => useTags("ws-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createTag("urgent", "red");
    });

    expect(created).toEqual(tag);
    expect(result.current.tags).toEqual([tag]);
    expect(mockInvoke).toHaveBeenCalledWith("create_tag", {
      workspaceId: "ws-1",
      name: "urgent",
      color: "red",
    });
  });

  it("deleteTag removes the tag from local state", async () => {
    mockCommands({
      list_tags: () => [tag],
      delete_tag: () => undefined,
    });

    const { result } = renderHook(() => useTags("ws-1"));
    await waitFor(() => expect(result.current.tags).toEqual([tag]));

    await act(async () => {
      await result.current.deleteTag("tag-1");
    });

    expect(result.current.tags).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("delete_tag", { id: "tag-1" });
  });
});
