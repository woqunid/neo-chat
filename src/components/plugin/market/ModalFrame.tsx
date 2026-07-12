import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function trapFocus(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== "Tab" || !container) return;
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE),
  ).filter((element) => element.offsetParent !== null);
  if (!elements.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const [first] = elements;
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

interface ModalFrameProps {
  titleId: string;
  descriptionId?: string;
  closeLabel: string;
  onClose(): void;
  children: ReactNode;
  disabled?: boolean;
  wide?: boolean;
}

function handleModalKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  props: ModalFrameProps,
  dialog: HTMLElement | null,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    if (!props.disabled) props.onClose();
    return;
  }
  trapFocus(event, dialog);
}

export function ModalFrame(props: ModalFrameProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);
  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.disabled)
          props.onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
        aria-describedby={props.descriptionId}
        tabIndex={-1}
        onKeyDown={(event) =>
          handleModalKeyDown(event, props, dialogRef.current)
        }
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-border dark:bg-card ${props.wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        <button
          ref={closeRef}
          type="button"
          aria-label={props.closeLabel}
          onClick={props.onClose}
          disabled={props.disabled}
          className="absolute self-end m-4 rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-muted"
        >
          <X size={20} />
        </button>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
