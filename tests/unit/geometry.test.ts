import { describe, expect, it } from "vitest";
import { cellCenter, circleFromQuad, circumcircle, coordName } from "../../src/geometry";

describe("geometry", () => {
  it("maps points to Go-style coordinates", () => {
    expect(coordName(0)).toBe("A1");
    expect(coordName(8)).toBe("J1");
    expect(coordName(40)).toBe("E5");
    expect(coordName(80)).toBe("J9");
  });

  it("computes circumcircle of a right triangle on the grid", () => {
    // (0.5,0.5), (2.5,0.5), (0.5,2.5) -> center (1.5,1.5) r=sqrt(2)
    const c = circumcircle(cellCenter(0), cellCenter(2), cellCenter(18));
    expect(c).not.toBeNull();
    expect(c!.cx).toBeCloseTo(1.5, 10);
    expect(c!.cy).toBeCloseTo(1.5, 10);
    expect(c!.r).toBeCloseTo(Math.SQRT2, 10);
  });

  it("returns null for collinear points", () => {
    expect(circumcircle(cellCenter(0), cellCenter(1), cellCenter(2))).toBeNull();
  });

  it("builds a circle from a 4-point quad via the first three", () => {
    const c = circleFromQuad([0, 2, 18, 20]);
    expect(c).not.toBeNull();
    expect(c!.r).toBeGreaterThan(0);
  });
});
