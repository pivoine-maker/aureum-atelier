import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { defaultSettings } from "../../shared/settings";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  it("updates visual intensity and movement filters", () => {
    const update = vi.fn();
    render(<SettingsPanel onClose={vi.fn()} onUpdate={update} settings={defaultSettings} />);

    fireEvent.change(screen.getByRole("slider", { name: "Background intensity" }), { target: { value: "68" } });
    expect(update).toHaveBeenCalledWith({ backgroundIntensity: 68 });

    fireEvent.click(screen.getByRole("checkbox", { name: "Baroque" }));
    expect(update).toHaveBeenCalledWith({
      enabledMovements: ["classicism", "neoclassicism", "romanticism"],
    });
  });
});
