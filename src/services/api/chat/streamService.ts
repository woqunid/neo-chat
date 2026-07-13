import { createGrokSearchStatusTracker } from "../grokSearchStatus";
import { createMessageOutputBlockBuilder } from "../../../lib/chat/messageOutputBlocks";
import { prepareChatRequest } from "./streamSetup";
import { ChatStreamRuntime } from "./streamRuntime";
import { runDirectImageRequest } from "./streamDirectImage";
import { runToolRounds } from "./streamToolLoop";
import { createSearchResearchPolicy } from "./searchResearchPolicy";
import type { StreamChatOptions, StreamChatResponseArgs } from "./streamTypes";

function toOptions(args: StreamChatResponseArgs): StreamChatOptions {
  const [
    sessionId,
    model,
    history,
    newMessage,
    attachments,
    config,
    onChunk,
    userSystemInstruction,
    onSearchStatus,
    onToolUpdate,
    onImage,
    onUsage,
    signal,
    activePlugins,
    skillsContext,
    onOutputBlocks,
  ] = args;
  return {
    sessionId,
    model,
    history,
    newMessage,
    attachments,
    config,
    onChunk,
    userSystemInstruction,
    onSearchStatus,
    onToolUpdate,
    onImage,
    onUsage,
    signal,
    activePlugins,
    skillsContext,
    onOutputBlocks,
  };
}

export async function streamChatResponse(
  ...args: StreamChatResponseArgs
): Promise<string> {
  const options = toOptions(args);
  const output = createMessageOutputBlockBuilder();
  const emitBlocks = () => options.onOutputBlocks?.(output.getBlocks());
  const tracker = createGrokSearchStatusTracker((update) => {
    output.upsertSearch(update);
    options.onSearchStatus?.(update.isSearching, update.results);
    emitBlocks();
  });
  const prepared = await prepareChatRequest(options, tracker);
  const runtime = new ChatStreamRuntime(
    prepared,
    createSearchResearchPolicy(),
    output,
    tracker,
  );
  const directResult = await runDirectImageRequest(runtime);
  if (directResult !== null) return directResult;
  return runToolRounds(runtime);
}
