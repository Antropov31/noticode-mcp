export type DebugResult = {
  success: boolean;
  error?: string;
};

export async function analyzeFailure(output: string): Promise<DebugResult> {
  const text = output.toLowerCase();
  if (!text.includes("error") && !text.includes("failed")) {
    return { success: true };
  }

  return {
    success: false,
    error: "Build or command failed. Agent should inspect logs, locate related files, and retry with a fix.",
  };
}
