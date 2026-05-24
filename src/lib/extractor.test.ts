import { describe, expect, it } from "vitest";
import { extractCandidates, maskSecretPreview } from "./extractor";
import type { EmailSample } from "./types";

const sample: EmailSample = {
  sender: "AWS <no-reply@signin.aws>",
  subject: "Your verification code is 839204",
  bodyText:
    "Use code 839204 to continue. Confirm your sign in: https://console.aws.amazon.com/verify?token=abc123&utm_source=email",
  bodyHtml:
    '<a href="https://console.aws.amazon.com/verify?token=abc123&utm_source=email">Verify account</a>',
};

describe("extractCandidates", () => {
  it("extracts verification codes and authentication links with confidence ordering", () => {
    const candidates = extractCandidates(sample);

    expect(candidates[0]).toMatchObject({
      type: "code",
      value: "839204",
    });
    expect(candidates.some((item) => item.type === "link" && item.value.includes("token=abc123"))).toBe(true);
  });

  it("deduplicates repeated codes and strips tracking noise from links", () => {
    const candidates = extractCandidates(sample);
    const codes = candidates.filter((item) => item.type === "code");
    const links = candidates.filter((item) => item.type === "link");

    expect(codes).toHaveLength(1);
    expect(links[0].value).toBe("https://console.aws.amazon.com/verify?token=abc123");
  });
});

describe("maskSecretPreview", () => {
  it("masks code and link values for SQLite previews", () => {
    expect(maskSecretPreview("839204", "code")).toBe("83****04");
    expect(maskSecretPreview("https://example.com/verify?token=abcdef", "link")).toBe(
      "https://example.com/verify?...",
    );
  });
});
