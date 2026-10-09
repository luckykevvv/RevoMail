import { describe, expect, it } from "vitest";

import { messageFrameDocument } from "./email-html.js";

describe("formatted email document", () => {
  it("keeps normal words horizontal and hides common preheader content", () => {
    const document = messageFrameDocument('<div class="mcnPreviewText">Fender</div><span id="preheader">Preview</span><table><tr><td>DomesticStudentResources</td></tr></table>');

    expect(document).toContain('<base target="_blank">');
    expect(document).toContain("overflow-wrap:break-word");
    expect(document).toContain("td,th{overflow-wrap:normal!important;word-break:normal!important}");
    expect(document).toContain('[class*="mcnpreviewtext" i]');
    expect(document).toContain('[id*="preheader" i]');
    expect(document).not.toContain("overflow-wrap:anywhere");
  });

  it("keeps the restrictive frame policy while allowing sanitized images", () => {
    const document = messageFrameDocument('<a href="https://example.com/message"><img src="https://images.example/logo.png" alt="Brand" style="font-size:16px;color:red"></a>');

    expect(document).toContain("default-src 'none'; img-src https: data:");
    expect(document).toContain('<img src="https://images.example/logo.png" alt="Brand"');
    expect(document).toContain('<a href="https://example.com/message" target="_blank" rel="noopener noreferrer">');
    expect(document).toContain("color:transparent!important;font-size:0!important");
  });

  it("replaces unsafe link browsing targets with external noopener links", () => {
    const document = messageFrameDocument('<a href="https://example.com" target="_self" rel="opener">Open</a>');

    expect(document).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Open</a>');
    expect(document).not.toContain('target="_self"');
    expect(document).not.toContain('rel="opener"');
  });
});
