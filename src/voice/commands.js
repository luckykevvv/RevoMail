const PRIORITY = { high: 3, medium: 2, low: 1 };

export function parseCommand(text) {
  const command = String(text).trim().toLowerCase().replace(/[.!?。！？]$/, "").replace(/\s+/g, " ");
  if (/^summari[sz]e (the )?current email$/.test(command) || /^(总结|概括)(当前|这封)邮件$/.test(command)) return "summary";
  if (/^(draft|generate) a reply$/.test(command) || /^(生成|起草)(一封)?回复(草稿)?$/.test(command)) return "reply";
  if (/^show (my )?tasks$/.test(command) || /^(显示|查看)(我的)?任务$/.test(command)) return "tasks";
  return null;
}

export function validateCommand(text, targetId, currentId) {
  const command = parseCommand(text);
  if (!command) throw new Error("Unsupported command. Choose one of the suggested examples.");
  if (command !== "tasks" && (!targetId || String(targetId) !== String(currentId))) {
    throw new Error("Select an email before confirming this command.");
  }
  return command;
}

export function parseOrdinal(text) {
  const command = String(text).trim().toLowerCase().replace(/[.!?。！？]/g, "");
  const chinese = command.match(/(?:第)?([一二三四五12345])(?:封|个)?/);
  if (chinese) return ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 }[chinese[1]] || Number(chinese[1])) - 1;
  const english = command.match(/\b(?:number\s+)?(first|second|third|fourth|fifth|[1-5])(?:\s+(?:one|email|message))?\b/);
  if (!english) return -1;
  return ({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }[english[1]] || Number(english[1])) - 1;
}

export function needsMessage(action) {
  return ["open_message", "summarize_message", "draft_reply", "extract_details"].includes(action);
}

export function rankCandidates(messages) {
  return [...messages].sort((a, b) => {
    const priority = (PRIORITY[b.priority] || 0) - (PRIORITY[a.priority] || 0);
    if (priority) return priority;
    return new Date(b.receivedAt || b.date || 0).getTime() - new Date(a.receivedAt || a.date || 0).getTime();
  });
}

export function filterCandidates(messages, target = {}) {
  const includes = (value, query) => !query || String(value || "").toLocaleLowerCase().includes(String(query).toLocaleLowerCase());
  const terms = String(target.terms || "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rankCandidates(messages.filter(message => {
    const haystack = `${message.sender || ""} ${message.subject || ""} ${message.preview || ""}`.toLocaleLowerCase();
    return includes(message.sender, target.sender)
      && includes(message.subject, target.subject)
      && (target.unread == null || Boolean(message.unread) === target.unread)
      && (target.starred == null || Boolean(message.starred) === target.starred)
      && (!target.priority || message.priority === target.priority)
      && terms.every(term => haystack.includes(term));
  })).slice(0, 5);
}

export function chunkSpeech(text, maximum = 4000) {
  const value = String(text || "").trim();
  if (!value) return [];
  const chunks = [];
  let remaining = value;
  while (remaining.length > maximum) {
    const window = remaining.slice(0, maximum + 1);
    const boundaries = [...window.matchAll(/[.!?。！？]\s*|\n+/g)];
    const boundary = boundaries.filter(match => match.index + match[0].length <= maximum).at(-1);
    const whitespace = window.slice(0, maximum + 1).lastIndexOf(" ");
    const split = boundary ? boundary.index + boundary[0].length : whitespace > maximum / 2 ? whitespace : maximum;
    chunks.push(remaining.slice(0, split).trim());
    remaining = remaining.slice(split).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
