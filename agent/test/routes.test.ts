import { describe, expect, it } from "vitest";
import { vehicleOf } from "../src/routes/parse";

const icon = (name: string) => `https://maps.gstatic.com/mapfiles/transit/iw2/svg/${name}`;

describe("vehicle of a transit leg", () => {
  it("reads a bus from Google's icon, even when the headsign names a train station", () => {
    // AC Transit 211 toward "Union City BART" is a bus (live search, 2026-10-05).
    expect(vehicleOf({ icon: icon("bus2.svg"), service_run_by: { name: "AC TRANSIT" } }, "211")).toBe("bus");
  });

  it("reads S-Bahn and U-Bahn as rail", () => {
    expect(
      vehicleOf({ icon: icon("de-sbahn.svg"), service_run_by: { name: "DB Regio AG S-Bahn München" } }, "S6"),
    ).toBe("rail");
    expect(vehicleOf({ icon: icon("de-metro.svg"), service_run_by: { name: "MVG München" } }, "U2")).toBe("rail");
  });

  it("reads ferries as sea", () => {
    expect(vehicleOf({ icon: icon("ferry.svg") }, "F1")).toBe("sea");
    expect(vehicleOf({ service_run_by: "San Francisco Bay Ferry" }, "Oakland")).toBe("sea");
  });

  it("falls back to the line name and operator, never the headsign", () => {
    expect(vehicleOf({ service_run_by: { name: "BART" } }, "Yellow")).toBe("rail");
    expect(vehicleOf({}, "U5")).toBe("rail");
    expect(vehicleOf({ service_run_by: { name: "MVG München" } }, "139")).toBe("bus");
  });
});
