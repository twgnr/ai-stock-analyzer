import { connectDB } from "./mongodb";
import { UsageLog } from "./models/UsageLog";
import { estimateCostUSD } from "./aiPricing";
import type { Types } from "mongoose";

export interface LogArgs {
  userId: Types.ObjectId | string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  success?: boolean;
  errorMessage?: string;
}

export async function logClaudeUsage(args: LogArgs): Promise<void> {
  try {
    await connectDB();
    const cost = estimateCostUSD(
      args.model,
      args.inputTokens,
      args.outputTokens,
      args.cacheCreationTokens,
      args.cacheReadTokens
    );
    await UsageLog.create({
      userId: args.userId,
      operation: args.operation,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheCreationTokens: args.cacheCreationTokens || 0,
      cacheReadTokens: args.cacheReadTokens || 0,
      estimatedCostUSD: cost,
      success: args.success !== false,
      errorMessage: args.errorMessage,
    });
  } catch (e) {
    console.error("[usage-log]", e instanceof Error ? e.message : e);
  }
}
