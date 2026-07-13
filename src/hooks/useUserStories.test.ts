import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUserStories } from "./useUserStories";
import { mockInvoke, mockCommands } from "@/test/tauriMock";
import { makeUserStory } from "@/test/factories";

describe("useUserStories", () => {
  it("does nothing when projectId is null", () => {
    const { result } = renderHook(() => useUserStories(null));
    expect(result.current.userStories).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches user stories for the given project", async () => {
    const story = makeUserStory({ id: "story-1" });
    mockCommands({ list_user_stories: () => [story] });

    const { result } = renderHook(() => useUserStories("project-1"));

    await waitFor(() => expect(result.current.userStories).toEqual([story]));
    expect(mockInvoke).toHaveBeenCalledWith("list_user_stories", {
      projectId: "project-1",
    });
  });

  it("surfaces an error without throwing", async () => {
    mockCommands({
      list_user_stories: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useUserStories("project-1"));

    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
  });

  it("createUserStory appends the created story and returns it", async () => {
    const story = makeUserStory({ id: "story-1", title: "Onboarding" });
    mockCommands({
      list_user_stories: () => [],
      create_user_story: () => story,
    });

    const { result } = renderHook(() => useUserStories("project-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createUserStory("Onboarding", "epic-1");
    });

    expect(created).toEqual(story);
    expect(result.current.userStories).toEqual([story]);
    expect(mockInvoke).toHaveBeenCalledWith("create_user_story", {
      projectId: "project-1",
      epicId: "epic-1",
      title: "Onboarding",
      description: null,
    });
  });

  it("deleteUserStory removes the story from local state", async () => {
    const story = makeUserStory({ id: "story-1" });
    mockCommands({
      list_user_stories: () => [story],
      delete_user_story: () => undefined,
    });

    const { result } = renderHook(() => useUserStories("project-1"));
    await waitFor(() => expect(result.current.userStories).toEqual([story]));

    await act(async () => {
      await result.current.deleteUserStory("story-1");
    });

    expect(result.current.userStories).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("delete_user_story", {
      id: "story-1",
    });
  });

  it("updateUserStory replaces the story with the renamed version", async () => {
    const story = makeUserStory({ id: "story-1", title: "Onboarding" });
    const renamed = makeUserStory({ id: "story-1", title: "Onboarding v2" });
    mockCommands({
      list_user_stories: () => [story],
      update_user_story: () => renamed,
    });

    const { result } = renderHook(() => useUserStories("project-1"));
    await waitFor(() => expect(result.current.userStories).toEqual([story]));

    await act(async () => {
      await result.current.updateUserStory("story-1", "Onboarding v2");
    });

    expect(result.current.userStories).toEqual([renamed]);
    expect(mockInvoke).toHaveBeenCalledWith("update_user_story", {
      id: "story-1",
      title: "Onboarding v2",
      description: null,
      epicId: null,
    });
  });

  it("does not rename the story locally when the update fails", async () => {
    const story = makeUserStory({ id: "story-1", title: "Onboarding" });
    mockCommands({
      list_user_stories: () => [story],
      update_user_story: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useUserStories("project-1"));
    await waitFor(() => expect(result.current.userStories).toEqual([story]));

    await expect(
      act(async () => {
        await result.current.updateUserStory("story-1", "Onboarding v2");
      }),
    ).rejects.toThrow("boom");

    expect(result.current.userStories).toEqual([story]);
  });

  it("does not remove the story locally when deletion fails", async () => {
    const story = makeUserStory({ id: "story-1" });
    mockCommands({
      list_user_stories: () => [story],
      delete_user_story: () => {
        throw new Error("boom");
      },
    });

    const { result } = renderHook(() => useUserStories("project-1"));
    await waitFor(() => expect(result.current.userStories).toEqual([story]));

    await expect(
      act(async () => {
        await result.current.deleteUserStory("story-1");
      }),
    ).rejects.toThrow("boom");

    expect(result.current.userStories).toEqual([story]);
  });
});
