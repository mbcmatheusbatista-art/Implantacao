import { useState, useRef, useMemo, useEffect, useCallback, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { Technician } from "@/types";

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface Props {
  technicians: Technician[];
  onSelect: (technician: Technician) => void;
}

export function TechSearch({ technicians, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const results = useMemo(() => {
    if (!debouncedQuery) return [];
    const q = normalizeText(debouncedQuery);
    if (q.length === 0) return [];
    return technicians.filter((t) => {
      const name = normalizeText(t.nameOriginal || "");
      const firstName = normalizeText(t.firstName || "");
      return name.includes(q) || firstName.includes(q);
    });
  }, [debouncedQuery, technicians]);

  const handleSelect = useCallback(
    (tech: Technician) => {
      onSelect(tech);
      setQuery("");
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" && results.length > 0) {
        setIsOpen(true);
        setSelectedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
    }
  };

  const handleIconClick = () => {
    if (results.length === 1) {
      handleSelect(results[0]);
    } else if (results.length > 1) {
      handleSelect(results[0]);
    }
  };

  return (
    <div className="relative" style={{ zIndex: 1000 }}>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground cursor-pointer"
          onClick={handleIconClick}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar técnico..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onBlur={() => setTimeout(() => setIsOpen(false), 180)}
          onKeyDown={handleKeyDown}
          className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {isOpen && query.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum técnico encontrado.
            </div>
          ) : (
            results.map((tech, i) => (
              <button
                key={tech.id}
                onMouseDown={() => handleSelect(tech)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-popover-foreground hover:bg-accent"
                }`}
              >
                {tech.nameOriginal}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
