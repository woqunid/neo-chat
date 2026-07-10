import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminToggle } from "../components/superadmin/AdminFormControls";

describe("AdminToggle", () => {
  it("keeps the enabled thumb inside the track", () => {
    const html = renderToStaticMarkup(
      <AdminToggle label="Enabled" checked onChange={vi.fn()} />,
    );

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("left-0.5");
    expect(html).toContain("translate-x-5");
  });

  it("anchors the disabled thumb at the left track inset", () => {
    const html = renderToStaticMarkup(
      <AdminToggle label="Enabled" checked={false} onChange={vi.fn()} />,
    );

    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("left-0.5");
    expect(html).toContain("translate-x-0");
    expect(html).not.toContain("translate-x-0.5");
  });
});
