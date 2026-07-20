import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* Menu "kebab" (⋮) per le azioni secondarie di una riga: il pulsante resta
 * nella cella, la tendina è renderizzata in un portal con position:fixed così
 * non viene tagliata dai contenitori overflow della tabella.
 *
 * La navigazione da tastiera segue lo stesso schema del Select: il focus resta
 * sul pulsante e la voce attiva è indicata da aria-activedescendant. */

export interface KebabMenuItem {
  key: string;
  label: string;
  /** Icona 14x14, con `stroke="currentColor"` per ereditare il colore della voce */
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Perché la voce è bloccata: mostrato sotto la label quando `disabled` */
  disabledReason?: string;
  /** Azione distruttiva: accento rosso */
  danger?: boolean;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
  /** Nome accessibile del pulsante */
  label: string;
  /** Classi del pulsante, per allinearlo agli altri della riga */
  buttonClassName?: string;
}

const MENU_WIDTH = 248;
const GAP = 6;
const EDGE_PAD = 8;

const itemCls = (item: KebabMenuItem, isActive: boolean) => {
  if (item.disabled) return 'cursor-not-allowed text-slate-500';
  if (item.danger) return `cursor-pointer text-red-400 ${isActive ? 'bg-red-500/12' : ''}`;
  return `cursor-pointer ${isActive ? 'bg-white/8 text-slate-100' : 'text-slate-300'}`;
};

export default function KebabMenu({ items, label, buttonClassName = '' }: KebabMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const open = () => {
    if (items.length === 0) return;
    setActiveIndex(items.findIndex((i) => !i.disabled));
    setIsOpen(true);
  };

  const close = (refocus = false) => {
    setIsOpen(false);
    setPos(null);
    setActiveIndex(-1);
    if (refocus) btnRef.current?.focus();
  };

  const pick = (item: KebabMenuItem) => {
    if (item.disabled) return;
    close();
    item.onSelect();
  };

  // Ancora la tendina al pulsante, allineata a destra; si ribalta verso l'alto
  // se sotto non c'è spazio. Misurabile solo dopo il primo render: fino ad
  // allora il menu è reso invisibile per evitare lo sfarfallio.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = menuRef.current?.offsetHeight ?? 0;
    const openUp =
      rect.bottom + GAP + height > window.innerHeight - EDGE_PAD && rect.top - GAP - height > EDGE_PAD;
    setPos({
      top: openUp ? rect.top - GAP - height : rect.bottom + GAP,
      left: Math.min(
        Math.max(EDGE_PAD, rect.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - EDGE_PAD,
      ),
    });
  }, [isOpen]);

  // Chiudi al click fuori; allo scroll o al resize l'ancora si sposta ma la
  // tendina (fixed) no, quindi la si chiude invece di inseguirla.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) close();
    };
    const onReflow = () => close();
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [isOpen]);

  // Salta le voci disabilitate, avvolgendosi agli estremi
  const move = (dir: 1 | -1) => {
    setActiveIndex((cur) => {
      const n = items.length;
      for (let step = 1; step <= n; step++) {
        const next = (cur + dir * step + n * n) % n;
        if (!items[next].disabled) return next;
      }
      return cur;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) open();
        else if (activeIndex >= 0) pick(items[activeIndex]);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) open();
        else move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) open();
        else move(-1);
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          close(true);
        }
        break;
      case 'Tab':
        if (isOpen) close();
        break;
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined}
        disabled={items.length === 0}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        className={buttonClassName}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: MENU_WIDTH,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-[1000] animate-menu-in rounded-xl border border-white/6 bg-gray-900/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(124,58,237,0.06)] backdrop-blur-2xl"
          >
            {items.map((item, i) => (
              <button
                key={item.key}
                id={`${menuId}-${i}`}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onPointerMove={() => setActiveIndex(i)}
                onClick={() => pick(item)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-[0.85rem] transition ${itemCls(
                  item,
                  i === activeIndex,
                )}`}
              >
                <span className="mt-0.5 shrink-0">{item.icon}</span>
                <span className="flex flex-col gap-0.5">
                  <span>{item.label}</span>
                  {item.disabled && item.disabledReason && (
                    <span className="text-[0.7rem] leading-snug text-slate-600">
                      {item.disabledReason}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
