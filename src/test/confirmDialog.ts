import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

// Every destructive-action confirmation in the app now goes through the
// in-app ConfirmDialog (see useConfirm.ts) instead of a mocked native
// dialog — tests render <ConfirmDialog /> alongside the component under
// test and use these to answer it, the same way a user would click through
// the real thing.
export async function acceptConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Confirm" }));
}

export async function declineConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Cancel" }));
}
