import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { MouseEvent as ReactMouseEvent, FocusEvent, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* Tooltip custom dell'app, in sostituzione di quello nativo del browser
 * (attributo `title`). Renderizzato in un portal con position:fixed, quindi
 * non viene mai tagliato da contenitori con overflow (tabelle, chat, modali).
 *
 * Di default non aggiunge nodi al DOM: clona il figlio e vi aggancia gli
 * eventi mouse/focus, così layout e stili restano invariati. */

interface TooltipProps {
  /** Contenuto del tooltip; se vuoto il figlio è reso senza tooltip */
  content: ReactNode;
  /** Lato preferito; si ribalta da solo se non c'è spazio nel viewport */
  side?: 'top' | 'bottom';
  /** 'element' àncora al centro del figlio, 'cursor' segue il mouse
   * (utile su elementi larghi come le righe di tabella) */
  anchor?: 'element' | 'cursor';
  /** Avvolge il figlio in uno span: necessario per elementi `disabled`,
   * che non emettono eventi mouse */
  wrap?: boolean;
  /** Per testo semplice (non bottoni/icone): mostra il tooltip solo se il
   * figlio è effettivamente troncato (ellissi). Su testo non troncato il
   * tooltip sarebbe ridondante col testo già visibile, quindi resta nascosto. */
  truncateOnly?: boolean;
  children: ReactElement<Record<string, unknown>>;
}

/* Troncato = il contenuto reale è più largo dello spazio visibile
 * (funziona con .truncate / overflow-hidden + white-space: nowrap) */
const isTruncated = (el: Element) => el.scrollWidth > el.clientWidth + 1;

interface Pos {
  x: number;
  top: number;
  bottom: number;
}

const EDGE_PAD = 8;

export default function Tooltip({
  content,
  side = 'top',
  anchor = 'element',
  wrap = false,
  truncateOnly = false,
  children,
}: TooltipProps) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [flip, setFlip] = useState(false);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const visible = pos !== null && Boolean(content);

  const showFromElement = (el: Element) => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  const handleMouseEnter = (e: ReactMouseEvent) => {
    if (truncateOnly && !isTruncated(e.currentTarget)) return;
    if (anchor === 'cursor') setPos({ x: e.clientX, top: e.clientY - 10, bottom: e.clientY + 18 });
    else showFromElement(e.currentTarget);
  };
  const handleMouseMove =
    anchor === 'cursor'
      ? (e: ReactMouseEvent) => setPos({ x: e.clientX, top: e.clientY - 10, bottom: e.clientY + 18 })
      : undefined;
  const handleFocus = (e: FocusEvent) => {
    if (truncateOnly && !isTruncated(e.currentTarget)) return;
    showFromElement(e.currentTarget);
  };
  const hide = () => {
    setPos(null);
    setFlip(false);
  };

  // Allo scroll l'ancora si sposta ma il tooltip (fixed) no: nascondilo
  useEffect(() => {
    if (!visible) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [visible]);

  const placeTop = (side === 'top') !== flip;

  // Dopo il render: rientra nel viewport in orizzontale e ribalta il lato
  // se il tooltip esce sopra/sotto
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || !pos) return;
    const r = tip.getBoundingClientRect();
    let shift = 0;
    if (r.left < EDGE_PAD) shift = EDGE_PAD - r.left;
    else if (r.right > window.innerWidth - EDGE_PAD) shift = window.innerWidth - EDGE_PAD - r.right;
    tip.style.marginLeft = `${shift}px`;
    if (!flip) {
      if (placeTop && r.top < EDGE_PAD) setFlip(true);
      else if (!placeTop && r.bottom > window.innerHeight - EDGE_PAD) setFlip(true);
    }
  }, [pos, flip, placeTop]);

  const eventProps = {
    onMouseEnter: handleMouseEnter,
    onMouseMove: handleMouseMove,
    onMouseLeave: hide,
    onFocus: handleFocus,
    onBlur: hide,
  };

  const target = wrap ? (
    <span className="inline-flex" {...eventProps}>
      {children}
    </span>
  ) : (
    cloneElement(children, {
      ...eventProps,
      onMouseEnter: (e: ReactMouseEvent) => {
        (children.props.onMouseEnter as ((e: ReactMouseEvent) => void) | undefined)?.(e);
        handleMouseEnter(e);
      },
      onMouseLeave: (e: ReactMouseEvent) => {
        (children.props.onMouseLeave as ((e: ReactMouseEvent) => void) | undefined)?.(e);
        hide();
      },
    })
  );

  return (
    <>
      {target}
      {visible &&
        pos &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none fixed z-[1100] max-w-[280px] animate-fade-in rounded-xl border border-white/10 bg-gray-900/95 px-3 py-1.5 text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-[0_8px_24px_rgba(0,0,0,0.45),0_0_20px_rgba(124,58,237,0.12)] backdrop-blur-md [animation-duration:0.15s]"
            style={
              placeTop
                ? { left: pos.x, top: pos.top - EDGE_PAD, transform: 'translate(-50%, -100%)' }
                : { left: pos.x, top: pos.bottom + EDGE_PAD, transform: 'translateX(-50%)' }
            }
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
