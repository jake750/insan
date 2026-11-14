"use client";
import { useMemo, useState } from "react";
import { Dialog } from "./Dialog";
import type { Strings } from "./i18n";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  /** extra search words (e.g. English names for Arabic labels) */
  keywords?: string;
  run: () => void;
  disabled?: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function CommandPalette({ t, commands, onClose }: { t: Strings; commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const n = norm(q.trim());
    return commands.filter((c) => !c.disabled && (!n || n.split(/\s+/).every((w) => norm(c.label + " " + (c.keywords ?? "")).includes(w))));
  }, [q, commands]);

  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    setTimeout(c.run, 0);
  };

  return (
    <Dialog title={t.commandPalette} onClose={onClose} closeLabel={t.close} className="palette" hideHead>
      <input
        data-autofocus
        value={q}
        placeholder={t.typeCommand}
        aria-label={t.typeCommand}
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={list[active] ? `cmd-${list[active].id}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(list.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(list[active]);
          }
        }}
      />
      <ul id="palette-list" role="listbox">
        {list.length === 0 && <li className="help" style={{ padding: "10px 12px" }}>{t.noCommands}</li>}
        {list.map((c, i) => (
          <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === active}>
            <button data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
              {c.label}
              {c.hint && <span className="kbd">{c.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
