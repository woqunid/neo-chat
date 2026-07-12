"use client";

import { forwardRef } from "react";
import MessageInputView from "./message-input/MessageInputView";
import { useMessageInputController } from "./message-input/useMessageInputController";
import type { MessageInputProps, MessageInputRef } from "./message-input/types";

const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(
  (props, ref) => (
    <MessageInputView controller={useMessageInputController(props, ref)} />
  ),
);

MessageInput.displayName = "MessageInput";

export type { MessageInputRef } from "./message-input/types";
export default MessageInput;
