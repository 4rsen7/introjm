import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function HeaderSelect({ label, value, options, onChange, testId, compact = false }) {
  const listId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const optionRefs = useRef([]);
  const searchRef = useRef('');
  const searchTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const active = Math.min(activeIndex, options.length - 1);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const root = rootRef.current;
      const list = listRef.current;
      if (!root || !list) return;
      const rect = root.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const width = Math.min(compact ? 160 : rect.width, Math.max(0, viewportWidth - 24));
      const preferredLeft = compact ? rect.right - width : rect.left;
      const left = Math.max(12, Math.min(preferredLeft, viewportWidth - width - 12));
      const below = Math.max(0, window.innerHeight - rect.bottom - 16);
      const above = Math.max(0, rect.top - 16);
      const upwards = below < Math.min(192, above);
      Object.assign(list.style, {
        width: `${width}px`, left: `${left - rect.left}px`, right: 'auto',
        maxHeight: `${Math.min(192, upwards ? above : below)}px`,
        top: upwards ? 'auto' : '100%', bottom: upwards ? '100%' : 'auto',
        marginTop: upwards ? '0' : '4px', marginBottom: upwards ? '4px' : '0',
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, compact]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);
  useEffect(() => {
    if (open) optionRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const openAt = index => { setActiveIndex(index); setOpen(true); };
  const choose = index => {
    const next = options[index];
    setOpen(false);
    if (next && next.value !== value) onChange(next.value);
    triggerRef.current?.focus();
  };
  const onKeyDown = event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); triggerRef.current?.focus(); return;
    }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) { openAt(event.key === 'ArrowUp' ? Math.max(0, selectedIndex - 1) : event.key === 'End' ? options.length - 1 : event.key === 'Home' ? 0 : selectedIndex); return; }
      setActiveIndex(current => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else openAt(selectedIndex);
      return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      searchRef.current += event.key.toLocaleLowerCase();
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => { searchRef.current = ''; }, 650);
      const start = open ? active + 1 : selectedIndex + 1;
      const match = Array.from({ length: options.length }, (_, offset) => (start + offset) % options.length)
        .find(index => options[index].label.toLocaleLowerCase().startsWith(searchRef.current));
      if (match !== undefined) { event.preventDefault(); openAt(match); }
    }
  };
  const selected = options[selectedIndex];
  return <div ref={rootRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} className={`research-header-select ${compact ? 'research-header-select-compact' : 'research-header-select-workspace'}`}>
    <button ref={triggerRef} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-controls={listId} aria-expanded={open} aria-activedescendant={open ? `${listId}-option-${active}` : undefined} data-testid={testId} title={selected?.label} onClick={() => open ? setOpen(false) : openAt(selectedIndex)} onKeyDown={onKeyDown} className="research-header-select-trigger">
      <span className="min-w-0 truncate">{selected?.shortLabel || selected?.label}</span><ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div ref={listRef} id={listId} role="listbox" aria-label={label} className="research-header-select-list">{options.map((option, index) => <div key={option.value} id={`${listId}-option-${index}`} role="option" aria-selected={option.value === value} ref={element => { optionRefs.current[index] = element; }} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(index)} data-testid={`${testId}-option`} data-value={option.value} className={`research-header-select-option ${option.value === value ? 'is-selected' : ''} ${active === index ? 'is-active' : ''}`}><span className="min-w-0 flex-1 break-words">{option.label}</span>{option.meta && <span className="shrink-0 text-xs text-slate-400">{option.meta}</span>}</div>)}</div>}
  </div>;
}
