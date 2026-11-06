import { describe, expect, it } from "vitest";
import { safeText, toCsv } from "./csv";

describe("safeText", () => {
  it.each([
    ["=SUM(A1:A9)", "'=SUM(A1:A9)"],
    ["+1 555 0100", "'+1 555 0100"],
    ["-2+3", "'-2+3"],
    ["@handle", "'@handle"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "'\rcmd"],
  ])(
    "neutralizes %j, which a spreadsheet would run as a formula",
    (value, expected) => {
      expect(safeText(value)).toBe(expected);
    },
  );

  it.each(["Stripe", "", "a=b", "Pilot.com, Inc.", "100 - 20", " =1"])(
    "leaves %j alone",
    (value) => {
      expect(safeText(value)).toBe(value);
    },
  );
});

describe("toCsv", () => {
  it("writes a header and rows with CRLF line endings, including the last", () => {
    expect(
      toCsv(
        ["Date", "Description", "Amount"],
        [
          ["2026-06-17", "Stripe", 11048.2],
          ["2026-06-03", "Amazon Web Services", -15137.39],
        ],
      ),
    ).toBe(
      "Date,Description,Amount\r\n" +
        "2026-06-17,Stripe,11048.2\r\n" +
        "2026-06-03,Amazon Web Services,-15137.39\r\n",
    );
  });

  it("writes only the header when there are no rows", () => {
    expect(toCsv(["Date", "Amount"], [])).toBe("Date,Amount\r\n");
  });

  it("writes null as an empty cell and keeps zero", () => {
    expect(toCsv(["Note", "Amount", "Memo"], [[null, 0, ""]])).toBe(
      "Note,Amount,Memo\r\n,0,\r\n",
    );
  });

  it("quotes cells containing commas", () => {
    expect(toCsv(["Name"], [["Pilot.com, Inc."]])).toBe(
      'Name\r\n"Pilot.com, Inc."\r\n',
    );
  });

  it("quotes cells containing quotes, doubling each one", () => {
    expect(toCsv(["Note"], [['Paid "in full"']])).toBe(
      'Note\r\n"Paid ""in full"""\r\n',
    );
  });

  it("quotes cells containing line breaks so they stay in one field", () => {
    expect(toCsv(["Note"], [["line one\nline two"], ["a\r\nb"]])).toBe(
      'Note\r\n"line one\nline two"\r\n"a\r\nb"\r\n',
    );
  });

  it("escapes header cells the same way", () => {
    expect(toCsv(["Amount, USD"], [[1]])).toBe('"Amount, USD"\r\n1\r\n');
  });
});
