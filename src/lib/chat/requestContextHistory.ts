import type { Message } from "../../types";
import { getMessageTextChars } from "./requestContextSizing";

const HISTORY_TRUNCATION_NOTICE = "\n[History truncated to context budget.]";

function groupTurns(messages: Message[]): Message[][] {
  const turns: Message[][] = [];
  for (const message of messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([message]);
      continue;
    }
    turns[turns.length - 1].push(message);
  }
  return turns;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= HISTORY_TRUNCATION_NOTICE.length) {
    return HISTORY_TRUNCATION_NOTICE.slice(0, Math.max(0, maxChars));
  }
  return `${value.slice(0, maxChars - HISTORY_TRUNCATION_NOTICE.length)}${HISTORY_TRUNCATION_NOTICE}`;
}

function fitLatestTurn(turn: Message[], maxChars: number): Message[] {
  if (turn.length === 0 || maxChars <= 0) return [];
  const perMessageBudget = Math.max(1, Math.floor(maxChars / turn.length));
  return turn.map((message) => ({
    ...message,
    content: truncateText(message.content, perMessageBudget),
  }));
}

export function selectHistoryTurns(
  history: Message[],
  maxChars: number,
): Message[] {
  const turns = groupTurns(history);
  const selectedTurns: Message[][] = [];
  let remaining = maxChars;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const turnChars = turn.reduce(
      (sum, message) => sum + getMessageTextChars(message),
      0,
    );
    if (turnChars <= remaining) {
      selectedTurns.unshift(turn);
      remaining -= turnChars;
      continue;
    }
    if (selectedTurns.length === 0) {
      selectedTurns.unshift(fitLatestTurn(turn, remaining));
    }
    break;
  }
  return selectedTurns.flat();
}
