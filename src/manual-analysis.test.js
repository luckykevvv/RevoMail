import { describe, expect, it } from "vitest";
import { createManualState, editableSuggestions, manualFileProblem, manualPayload, manualProblem, manualView, resetManualResults } from "./manual-analysis.js";

describe("manual analysis contracts", () => {
  it("rejects empty, binary and oversized body and unsupported uploads", () => {
    const input = createManualState();
    expect(manualProblem(input)).toMatch(/Paste email/);
    expect(manualProblem({ body: "x".repeat(15001) })).toMatch(/15,000/);
    expect(manualProblem({ body: "binary\x00" })).toMatch(/binary/);
    expect(manualProblem({ body: "Outlook message" })).toBe("");
    expect(manualFileProblem({ name: "email.pdf", size: 100 })).toMatch(/supported/);
    expect(manualFileProblem({ name: "email.txt", size: 0 })).toMatch(/empty/);
    expect(manualFileProblem({ name: "email.eml", size: 1048577 })).toMatch(/1 MiB/);
    expect(manualFileProblem({ name: "EMAIL.EML", size: 100 })).toBe("");
  });
  it("builds text-only payloads with draft fields only for drafting", () => {
    const input = { ...createManualState(), body: "Email", draft: "Editable draft", instructions: "Say thanks", message_id: "must-not-leak" };
    expect(manualPayload(input, "extract")).toEqual({ body: "Email", subject: "", sender: "", email_date: "" });
    expect(manualPayload(input, "draft-reply")).toMatchObject({ tone: "professional", instructions: "Say thanks", current_draft: "Editable draft" });
    expect(manualPayload(input, "draft-reply")).not.toHaveProperty("message_id");
  });
  it("invalidates stale results without persisting or discarding source text", () => {
    const input = { ...createManualState(), body: "Keep source", draft: "Old", summary: { summary: "Old" }, extraction: {}, error: "Old" };
    resetManualResults(input);
    expect(input.body).toBe("Keep source");
    expect(input.summary).toBeNull(); expect(input.draft).toBe(""); expect(input.extraction).toBeNull();
    expect(createManualState().body).toBe("");
  });
  it("makes extraction editable without creating task or calendar identities", () => {
    expect(editableSuggestions({ tasks: [{ title: "Review", due_date: null }], events: [{ title: "Meeting", start: null }] })).toEqual({ tasks: ["title: Review"], events: ["title: Meeting"], warning: undefined });
  });
  it("escapes untrusted input and output and exposes no send/create controls", () => {
    const escape = value => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const input = { ...createManualState(), body: "<script>attack</script>", summary: { summary: "<img src=x>", bullets: [] }, draft: "</textarea><script>attack</script>" };
    const html = manualView(input, escape, () => "");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src=x>");
    expect(html).toContain("Not synchronised with Gmail"); expect(html).not.toMatch(/data-send|data-confirm-calendar/);
  });
});
