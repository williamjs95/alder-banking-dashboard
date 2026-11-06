import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DateRangeFilter,
  describeRange,
  type DateRange,
} from "./date-range-filter";

function setup(value: DateRange = {}) {
  const onChange = vi.fn();
  render(<DateRangeFilter value={value} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

/** Opens the popover; its trigger is the only button until then. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button"));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("describeRange", () => {
  it("names both ends of a closed range", () => {
    expect(describeRange({ from: "2026-06-01", to: "2026-06-30" })).toBe(
      "Jun 1 – Jun 30",
    );
  });

  it("describes a range with only a start", () => {
    expect(describeRange({ from: "2026-03-09" })).toBe("Since Mar 9");
  });

  it("describes a range with only an end", () => {
    expect(describeRange({ to: "2026-12-31" })).toBe("Until Dec 31");
  });

  it("says so when there is no range", () => {
    expect(describeRange({})).toBe("Any date");
  });
});

describe("DateRangeFilter", () => {
  it("shows the applied range on its button", () => {
    setup({ from: "2026-06-01", to: "2026-06-30" });

    expect(screen.getByRole("button")).toHaveAccessibleName("Jun 1 – Jun 30");
  });

  it("reads “Any date” when no range is applied", () => {
    setup();

    expect(screen.getByRole("button")).toHaveAccessibleName("Any date");
  });

  describe("presets", () => {
    // A Thursday mid-month, late enough in the UTC day that a local-time
    // implementation would land on the wrong date in most of the world.
    const NOW = new Date("2026-06-18T23:30:00.000Z");

    it.each([
      ["Last 7 days", { from: "2026-06-12" }],
      ["Last 30 days", { from: "2026-05-20" }],
      ["Last 90 days", { from: "2026-03-21" }],
      ["This month", { from: "2026-06-01" }],
      ["Last month", { from: "2026-05-01", to: "2026-05-31" }],
    ])("%s counts back from today in UTC", async (label, range) => {
      // Only the clock is faked, so Radix and user-event keep real timers.
      vi.useFakeTimers({ toFake: ["Date"], now: NOW });
      const { onChange, user } = setup();

      await open(user);
      await user.click(screen.getByRole("button", { name: label }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith(range);
    });

    it("“Last month” spans the previous year when today is in January", async () => {
      vi.useFakeTimers({
        toFake: ["Date"],
        now: new Date("2027-01-10T08:00:00.000Z"),
      });
      const { onChange, user } = setup();

      await open(user);
      await user.click(screen.getByRole("button", { name: "Last month" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: "2026-12-01",
        to: "2026-12-31",
      });
    });

    it("replaces a custom range rather than merging with it", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: NOW });
      const { onChange, user } = setup({
        from: "2026-01-01",
        to: "2026-01-31",
      });

      await open(user);
      await user.click(screen.getByRole("button", { name: "Last 7 days" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ from: "2026-06-12" });
    });
  });

  describe("custom dates", () => {
    it("fills both fields from the applied range", async () => {
      const { user } = setup({ from: "2026-06-01", to: "2026-06-30" });

      await open(user);

      expect(screen.getByLabelText("From")).toHaveValue("2026-06-01");
      expect(screen.getByLabelText("To")).toHaveValue("2026-06-30");
    });

    it("leaves both fields empty and unbounded when no range is applied", async () => {
      const { user } = setup();

      await open(user);

      expect(screen.getByLabelText("From")).toHaveValue("");
      expect(screen.getByLabelText("From")).not.toHaveAttribute("max");
      expect(screen.getByLabelText("To")).toHaveValue("");
      expect(screen.getByLabelText("To")).not.toHaveAttribute("min");
    });

    it("stops each field from crossing the other", async () => {
      const { user } = setup({ from: "2026-06-01", to: "2026-06-30" });

      await open(user);

      expect(screen.getByLabelText("From")).toHaveAttribute(
        "max",
        "2026-06-30",
      );
      expect(screen.getByLabelText("To")).toHaveAttribute("min", "2026-06-01");
    });

    it("sets the start and keeps the end", async () => {
      const { onChange, user } = setup({ to: "2026-06-30" });

      await open(user);
      fireEvent.change(screen.getByLabelText("From"), {
        target: { value: "2026-06-10" },
      });

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: "2026-06-10",
        to: "2026-06-30",
      });
    });

    it("sets the end and keeps the start", async () => {
      const { onChange, user } = setup({ from: "2026-06-01" });

      await open(user);
      fireEvent.change(screen.getByLabelText("To"), {
        target: { value: "2026-06-15" },
      });

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: "2026-06-01",
        to: "2026-06-15",
      });
    });

    it("drops the start when its field is emptied", async () => {
      const { onChange, user } = setup({
        from: "2026-06-01",
        to: "2026-06-30",
      });

      await open(user);
      await user.clear(screen.getByLabelText("From"));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: undefined,
        to: "2026-06-30",
      });
    });

    it("drops the end when its field is emptied", async () => {
      const { onChange, user } = setup({
        from: "2026-06-01",
        to: "2026-06-30",
      });

      await open(user);
      await user.clear(screen.getByLabelText("To"));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: "2026-06-01",
        to: undefined,
      });
    });
  });

  describe("clearing", () => {
    it.each<[string, DateRange]>([
      ["a start", { from: "2026-06-01" }],
      ["an end", { to: "2026-06-30" }],
    ])("clears a range that has only %s", async (_name, value) => {
      const { onChange, user } = setup(value);

      await open(user);
      await user.click(screen.getByRole("button", { name: "Clear dates" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({});
    });

    it("offers no Clear button when no range is applied", async () => {
      const { user } = setup();

      await open(user);

      expect(screen.getByRole("button", { name: "Last 7 days" })).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Clear dates" }),
      ).not.toBeInTheDocument();
    });
  });
});
