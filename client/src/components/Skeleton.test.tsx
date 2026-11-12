import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonCards } from "./Skeleton";

describe("Skeleton", () => {
  it("renders placeholders marked as busy", () => {
    render(<SkeletonCards n={3} />);
    expect(screen.getByLabelText("טוען")).toHaveAttribute("aria-busy", "true");
  });
});
