import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { Avatar } from "./Avatar";
import "./ui.css";

export type AccountMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  kbd?: string;
  danger?: boolean;
  onSelect?: () => void;
};

export type AccountMenuProps = {
  open: boolean;
  name: string;
  email: string;
  onOpenPanel: () => void;
  items?: AccountMenuItem[];
  onLogout?: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
};

/**
 * Account popover opened from the avatar. The first row is always
 * 「打开我的面板」; arrows move between rows and Escape closes/returns focus.
 */
export function AccountMenu({ open, name, email, onOpenPanel, items = [], onLogout, onClose, returnFocusRef, className = "" }: AccountMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const controlRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function close() {
    onClose();
    returnFocusRef?.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  function onArrow(event: ReactKeyboardEvent<HTMLButtonElement>, direction: 1 | -1) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const controls = controlRefs.current.filter((control): control is HTMLButtonElement => Boolean(control));
    const index = controls.indexOf(event.currentTarget);
    const next = controls[(index + direction + controls.length) % controls.length];
    next?.focus();
  }

  return (
    <div
      ref={rootRef}
      className={`ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24 ef-ui-account ${className}`.trim()}
      role="menu"
      aria-label="账户菜单"
      aria-orientation="vertical"
      data-open="true"
    >
      <div className="ef-ui-account-head">
        <Avatar name={name} size={32} personColor="me" />
        <div className="ef-ui-account-id">
          <div className="ef-ui-account-name">{name}</div>
          <div className="ef-ui-account-email">{email}</div>
        </div>
        <button
          ref={(node) => { firstRef.current = node; controlRefs.current[0] = node; }}
          type="button"
          role="menuitem"
          className="ef-ui-account-open"
          onClick={() => { onClose(); onOpenPanel(); }}
          onKeyDown={(event) => onArrow(event, event.key === "ArrowUp" ? -1 : 1)}
        >
          打开我的面板
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="ef-ui-account-list">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => { controlRefs.current[index + 1] = node; }}
            type="button"
            role="menuitem"
            className={`ef-ui-account-item${item.danger ? " is-danger" : ""}`}
            onKeyDown={(event) => onArrow(event, event.key === "ArrowUp" ? -1 : 1)}
            onClick={() => { onClose(); item.onSelect?.(); }}
          >
            {item.icon ? <span className="ef-ui-account-item-icon" aria-hidden="true">{item.icon}</span> : null}
            <span>{item.label}</span>
            {item.kbd ? <kbd className="ef-ui-account-kbd">{item.kbd}</kbd> : null}
          </button>
        ))}
      </div>
      {onLogout ? (
        <>
          <div className="ef-ui-account-divider" role="separator" />
          <button
            ref={(node) => { controlRefs.current[items.length + 1] = node; }}
            type="button"
            role="menuitem"
            className="ef-ui-account-item is-danger"
            onKeyDown={(event) => onArrow(event, event.key === "ArrowUp" ? -1 : 1)}
            onClick={() => { onClose(); onLogout(); }}
          >
            退出登录
          </button>
        </>
      ) : null}
    </div>
  );
}
