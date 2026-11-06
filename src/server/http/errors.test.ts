// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AppError,
  conflict,
  insufficientFunds,
  invalid,
  notFound,
} from "./errors";

describe("AppError", () => {
  it("is a real Error carrying a machine-readable code and an HTTP status", () => {
    const error = new AppError("teapot", 418, "I am a teapot.");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.message).toBe("I am a teapot.");
    expect(error.code).toBe("teapot");
    expect(error.status).toBe(418);
    expect(error.fields).toBeUndefined();
  });

  it("can point at the form fields that caused it", () => {
    const error = new AppError("validation_error", 422, "Fix the form.", {
      name: "Required",
    });

    expect(error.fields).toEqual({ name: "Required" });
  });
});

describe("error factories", () => {
  it("notFound names the missing thing and maps to 404", () => {
    expect(notFound("Card")).toMatchObject({
      code: "not_found",
      status: 404,
      message: "Card was not found.",
    });
    expect(notFound("Card").fields).toBeUndefined();
  });

  it("invalid maps to 422 and keeps per-field messages", () => {
    expect(
      invalid("Some fields need attention.", { email: "Bad" }),
    ).toMatchObject({
      code: "validation_error",
      status: 422,
      message: "Some fields need attention.",
      fields: { email: "Bad" },
    });
  });

  it("invalid works without field details", () => {
    const error = invalid("Not allowed.");

    expect(error.status).toBe(422);
    expect(error.fields).toBeUndefined();
  });

  it("conflict maps to 409", () => {
    expect(conflict("Already being processed.")).toMatchObject({
      code: "conflict",
      status: 409,
      message: "Already being processed.",
    });
  });

  it("insufficientFunds names the account and blames the amount field", () => {
    expect(insufficientFunds("Operating Checking")).toMatchObject({
      code: "insufficient_funds",
      status: 422,
      message: "Operating Checking does not have enough available funds.",
      fields: { amountCents: "Amount exceeds the available balance" },
    });
  });

  it("every factory returns an AppError", () => {
    for (const error of [
      notFound("Account"),
      invalid("Nope"),
      conflict("Nope"),
      insufficientFunds("Checking"),
    ]) {
      expect(error).toBeInstanceOf(AppError);
    }
  });
});
