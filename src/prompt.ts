import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ConfirmationRequest } from "./checks.js";
import { TripwireError } from "./types.js";

export async function confirmRequests(
  requests: ConfirmationRequest[],
  options: { yes: boolean; noInput: boolean }
): Promise<void> {
  if (requests.length === 0) {
    return;
  }
  if (options.yes) {
    return;
  }
  if (options.noInput || !input.isTTY || !output.isTTY) {
    const messages = requests.map((request) => `- ${request.message}`).join("\n");
    throw new TripwireError(`Tripwire needs local confirmation, but no interactive terminal is available:\n${messages}`);
  }

  const rl = createInterface({ input, output });
  try {
    for (const request of requests) {
      if (request.details.length > 0) {
        output.write(`${request.details.map((detail) => `  ${detail}`).join("\n")}\n`);
      }
      const answer = await rl.question(`${request.message} Type "yes" to continue: `);
      if (answer.trim().toLowerCase() !== "yes") {
        throw new TripwireError("Tripwire confirmation declined.");
      }
    }
  } finally {
    rl.close();
  }
}
