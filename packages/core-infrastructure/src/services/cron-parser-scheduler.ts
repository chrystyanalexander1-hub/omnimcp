import cronParser from "cron-parser";
import type { CronScheduler } from "@omnimcp/core-application";

const { parseExpression } = cronParser;

export class CronParserScheduler implements CronScheduler {
  isValid(cronExpression: string): boolean {
    try {
      parseExpression(cronExpression);
      return true;
    } catch {
      return false;
    }
  }

  nextRunAt(cronExpression: string, after: Date): Date {
    const interval = parseExpression(cronExpression, { currentDate: after });
    return interval.next().toDate();
  }
}
