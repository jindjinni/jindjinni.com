"use server";

import { redirect } from "next/navigation";
import { guardPublicForm } from "@/lib/human-check";
import { completePasswordReset, requestPasswordReset } from "@/lib/password-reset";
import { emailCheck, looksLikeStaffUsername, normalizeResetEmail, passwordProblem } from "@/lib/password-reset-rules";

export type ForgotState = { error?: string; sent?: boolean } | undefined;
export type ResetState = { error?: string; expired?: boolean } | undefined;

/**
 * "Forgot password?": the email box. The answer is the same whether or not there is an account, so this page can't be used to find
 * out who has one. Public form: trap field, human check when switched on, and a limit per network address.
 */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const blocked = await guardPublicForm(formData, { scope: "pw-reset", max: 6, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const raw = String(formData.get("email") ?? "");
  const email = normalizeResetEmail(raw);

  if (looksLikeStaffUsername(raw)) {
    return { error: "That looks like a staff username. Staff logins have no email, so your company's admin resets them for you." };
  }
  const check = emailCheck(email);
  if (!check.ok) return { error: check.error };

  try {
    await requestPasswordReset(email);
  } catch (err) {
    console.error("[password-reset] request failed:", err);
    return { error: "Something went wrong. Please try again in a minute." };
  }
  return { sent: true };
}

/** The "choose a new password" page. The token in the address is the proof; it is checked again here, not only when the page opened. */
export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const blocked = await guardPublicForm(formData, { scope: "pw-reset-do", max: 20, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  let result;
  try {
    result = await completePasswordReset(token, password);
  } catch (err) {
    console.error("[password-reset] reset failed:", err);
    return { error: "Something went wrong. Please try again." };
  }
  if (!result.ok) {
    return {
      expired: true,
      error: result.status === "used" ? "This link was already used. Ask for a new one." : "This link has expired or isn't valid. Ask for a new one.",
    };
  }
  redirect("/login?reset=1");
}
