import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "@omnimcp/core-application";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}
