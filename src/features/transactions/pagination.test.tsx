import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

function setup(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPage = vi.fn();
  const onPageSize = vi.fn();
  render(
    <Pagination
      page={2}
      pageCount={5}
      pageSize={25}
      total={1234}
      onPage={onPage}
      onPageSize={onPageSize}
      {...props}
    />,
  );
  return { onPage, onPageSize, user: userEvent.setup() };
}

describe("Pagination", () => {
  it("describes the rows on screen and the page position", () => {
    setup();

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toHaveTextContent("26–50 of 1,234");
    expect(nav).toHaveTextContent("Page 2 of 5");
    expect(
      screen.getByRole("combobox", { name: "Rows per page" }),
    ).toHaveTextContent("25 per page");
  });

  it("caps the last row at the total on a short final page", () => {
    setup({ page: 5, pageCount: 5, total: 110 });

    expect(screen.getByText("101–110 of 110")).toBeInTheDocument();
  });

  it("shows 0–0 of 0 when there is nothing to page through", () => {
    setup({ page: 1, pageCount: 1, total: 0 });

    expect(screen.getByText("0–0 of 0")).toBeInTheDocument();
  });

  it("moves one page back and one page forward", async () => {
    const { onPage, user } = setup();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPage).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    expect(onPage).toHaveBeenCalledTimes(2);
  });

  it("disables Previous on the first page", () => {
    setup({ page: 1 });

    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("disables Next on the last page", () => {
    setup({ page: 5 });

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("offers every page size and reports the chosen one as a number", async () => {
    const { onPageSize, user } = setup();

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["10 per page", "25 per page", "50 per page", "100 per page"]);

    await user.click(screen.getByRole("option", { name: "50 per page" }));
    expect(onPageSize).toHaveBeenCalledExactlyOnceWith(50);
  });
});
