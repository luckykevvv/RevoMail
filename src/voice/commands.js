export function parseCommand(text) {
  const command = String(text).trim().toLowerCase().replace(/[.!?]$/, "").replace(/\s+/g, " ");
  if (/^summari[sz]e (the )?current email$/.test(command)) return "summary";
  if (/^(draft|generate) a reply$/.test(command)) return "reply";
  if (/^show (my )?tasks$/.test(command)) return "tasks";
  return null;
}

export function validateCommand(text, targetId, currentId) {
  const command = parseCommand(text);
  if (!command) throw new Error("Unsupported command. Choose one of the English examples.");
  if (command !== "tasks" && (!targetId || String(targetId) !== String(currentId))) {
    throw new Error("Select an email, then reopen voice commands to confirm the target.");
  }
  return command;
}
