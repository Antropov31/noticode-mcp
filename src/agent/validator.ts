export type ValidationResult = {
  ok: boolean;
  message: string;
};

export function validateAction(result: unknown): ValidationResult {
  if (result === undefined || result === null) {
    return {
      ok: false,
      message: "No result returned",
    };
  }

  return {
    ok: true,
    message: "Action completed",
  };
}

export function validateBuild(output: string): ValidationResult {
  const failed = /error|failed|exception/i.test(output);

  return {
    ok: !failed,
    message: failed ? "Build output contains errors" : "Build looks successful",
  };
}
