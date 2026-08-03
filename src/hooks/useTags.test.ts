import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTags } from "./useTags";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeTag } from "@/test/factories";

const tag = makeTag({ id: "tag-1", name: "urgent", color: "red" });

describe("useTags", () => {
  it("fetches all tags globally", async () => {
    mockCommands({ list_tags: () => [tag] });

    const { result } = renderHook(() => useTags());

    await waitFor(() => expect(result.current.tags).toEqual([tag]));
    expect(mockInvoke).toHaveBeenCalledWith("list_tags");
  });

  it("createTag appends the created tag and returns it", async () => {
    mockCommands({
      list_tags: () => [],
      create_tag: () => tag,
    });

    const { result } = renderHook(() => useTags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createTag("urgent", "red");
    });

    expect(created).toEqual(tag);
    expect(result.current.tags).toEqual([tag]);
    expect(mockInvoke).toHaveBeenCalledWith("create_tag", {
      name: "urgent",
      color: "red",
    });
  });

  it("updateTag replaces the tag in local state and returns it", async () => {
    const updated = makeTag({ id: "tag-1", name: "not-urgent", color: "blue" });
    mockCommands({
      list_tags: () => [tag],
      update_tag: () => updated,
    });

    const { result } = renderHook(() => useTags());
    await waitFor(() => expect(result.current.tags).toEqual([tag]));

    let returned;
    await act(async () => {
      returned = await result.current.updateTag("tag-1", "not-urgent", "blue");
    });

    expect(returned).toEqual(updated);
    expect(result.current.tags).toEqual([updated]);
    expect(mockInvoke).toHaveBeenCalledWith("update_tag", {
      id: "tag-1",
      name: "not-urgent",
      color: "blue",
    });
  });

  it("deleteTag removes the tag from local state", async () => {
    mockCommands({
      list_tags: () => [tag],
      delete_tag: () => undefined,
    });

    const { result } = renderHook(() => useTags());
    await waitFor(() => expect(result.current.tags).toEqual([tag]));

    await act(async () => {
      await result.current.deleteTag("tag-1");
    });

    expect(result.current.tags).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("delete_tag", { id: "tag-1" });
  });
});
