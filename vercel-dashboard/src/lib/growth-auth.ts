
import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type { NextRequest } from "next/server";

export const GROWTH_COOKIE = "greenmind_growth_session";

const SESSION_DURATION = 8 * 60 * 60; // 8 hours

function getSecret(): string {
  const secret = process.env.GREENMIND_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "GREENMIND_SESSION_SECRET must contain at least 32 characters."
    );
  }

  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret())
    .update(value)
    .digest("hex");
}

export function verifyAdminPin(pin: string): boolean {
  const configuredPin = process.env.GREENMIND_ADMIN_PIN;

  if (!configuredPin || !pin) {
    return false;
  }

  const supplied = Buffer.from(pin);
  const expected = Buffer.from(configuredPin);

  if (supplied.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(supplied, expected);
}

export function createGrowthSession() {
  const expiresAt =
    Math.floor(Date.now() / 1000) + SESSION_DURATION;

  const payload = String(expiresAt);

  return {
    token: `${payload}.${sign(payload)}`,
    maxAge: SESSION_DURATION,
  };
}

export function isGrowthSessionValid(
  request: NextRequest
): boolean {
  try {
    const token = request.cookies.get(
      GROWTH_COOKIE
    )?.value;

    if (!token) return false;

    const parts = token.split(".");

    if (parts.length !== 2) return false;

    const [payload, suppliedSignature] = parts;
    const expiresAt = Number(payload);

    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    const expectedSignature = sign(payload);
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);

    if (supplied.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}
