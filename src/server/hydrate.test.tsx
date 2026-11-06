// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type QueryKey,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Hydrate } from "./hydrate";

type Account = { name: string };

/** A client component reading a query the way the app's views do. */
function AccountName({
  queryKey,
  fetchAccount,
}: {
  queryKey: QueryKey;
  fetchAccount: () => Promise<Account>;
}) {
  const { data, status } = useQuery({
    queryKey,
    queryFn: fetchAccount,
    staleTime: 60_000,
  });
  return (
    <p>
      {status}: {data?.name ?? "nothing yet"}
    </p>
  );
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const withClient = (client: QueryClient, children: ReactNode) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("Hydrate", () => {
  it("lets a client query read server-loaded data on first render without fetching", () => {
    const fetchAccount = vi.fn(async () => ({ name: "From the network" }));
    const client = newClient();

    render(
      withClient(
        client,
        <Hydrate
          entries={[[["accounts", "abc"], { name: "Operating Checking" }]]}
        >
          <AccountName
            queryKey={["accounts", "abc"]}
            fetchAccount={fetchAccount}
          />
        </Hydrate>,
      ),
    );

    expect(screen.getByText("success: Operating Checking")).toBeInTheDocument();
    expect(fetchAccount).not.toHaveBeenCalled();
    expect(client.getQueryData(["accounts", "abc"])).toEqual({
      name: "Operating Checking",
    });
  });

  it("puts the data in the server-rendered HTML", () => {
    const html = renderToString(
      withClient(
        newClient(),
        <Hydrate entries={[[["accounts", "abc"], { name: "Treasury" }]]}>
          <AccountName
            queryKey={["accounts", "abc"]}
            fetchAccount={async () => ({ name: "From the network" })}
          />
        </Hydrate>,
      ),
    );

    expect(html).toContain("Treasury");
    expect(html).not.toContain("nothing yet");
  });

  it("seeds every entry it is given", () => {
    const fetchAccount = vi.fn(async () => ({ name: "From the network" }));

    render(
      withClient(
        newClient(),
        <Hydrate
          entries={[
            [["accounts", "a"], { name: "Operating Checking" }],
            [["accounts", "b"], { name: "Savings Reserve" }],
          ]}
        >
          <AccountName
            queryKey={["accounts", "a"]}
            fetchAccount={fetchAccount}
          />
          <AccountName
            queryKey={["accounts", "b"]}
            fetchAccount={fetchAccount}
          />
        </Hydrate>,
      ),
    );

    expect(screen.getByText("success: Operating Checking")).toBeInTheDocument();
    expect(screen.getByText("success: Savings Reserve")).toBeInTheDocument();
    expect(fetchAccount).not.toHaveBeenCalled();
  });

  it("leaves queries it was not given data for to fetch as usual", async () => {
    const fetchAccount = vi.fn(async () => ({ name: "From the network" }));

    render(
      withClient(
        newClient(),
        <Hydrate
          entries={[[["accounts", "a"], { name: "Operating Checking" }]]}
        >
          <AccountName
            queryKey={["accounts", "z"]}
            fetchAccount={fetchAccount}
          />
        </Hydrate>,
      ),
    );

    expect(screen.getByText("pending: nothing yet")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("success: From the network")).toBeInTheDocument(),
    );
    expect(fetchAccount).toHaveBeenCalledTimes(1);
  });

  it("renders its children when there is nothing to seed", () => {
    render(
      withClient(
        newClient(),
        <Hydrate entries={[]}>
          <p>Plain content</p>
        </Hydrate>,
      ),
    );

    expect(screen.getByText("Plain content")).toBeInTheDocument();
  });
});
