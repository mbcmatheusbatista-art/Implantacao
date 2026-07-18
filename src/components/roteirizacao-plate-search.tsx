import { useState, useRef, useMemo, useEffect, useCallback, type KeyboardEvent, type MouseEvent } from "react";
import { Search, MessageCircle } from "lucide-react";
import type { ConfirmedService } from "@/types";
import { normalizePlate } from "@/utils/normalize-text";
import { parseResponsibleContact } from "@/utils/parse-responsible-contact";
import { associatePeopleAndPhones } from "@/utils/extract-phones";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { getGreetingByCurrentTime } from "@/utils/greeting";

function hasValidAddress(service: ConfirmedService): boolean {
  const addr = (service.fullAddress || "").trim().toLowerCase();
  if (!addr) return false;
  const invalidValues = new Set(["-", "não informado", "nao informado", "sem endereço", "sem endereco"]);
  if (invalidValues.has(addr)) return false;
  return true;
}

function getWppInfo(service: ConfirmedService) {
  const parsed = parseResponsibleContact(service.responsibleOriginal);
  const phoneAssoc = associatePeopleAndPhones(
    service.phoneOriginal || "",
    !!parsed.pessoaIndicada,
  );
  const greeting = getGreetingByCurrentTime();

  const buttons: { name: string; url: string | null; label: string }[] = [];

  const primaryName = parsed.responsavelPrincipal || service.firstName || service.responsibleOriginal || "";
  const primaryFirst = primaryName.split(" ")[0] || primaryName;
  const primaryMsg = `Olá, ${greeting} ${primaryFirst}!`;
  const primaryUrl = phoneAssoc.primaryPerson.phone
    ? buildWhatsAppUrl(phoneAssoc.primaryPerson.phone, primaryMsg)
    : null;
  buttons.push({ name: primaryFirst, url: primaryUrl, label: `Entrar em contato com ${primaryFirst} pelo WhatsApp` });

  if (parsed.pessoaIndicada && phoneAssoc.indicatedPerson?.phone) {
    const indFirst = parsed.pessoaIndicada.split(" ")[0];
    const indMsg = `Olá, ${greeting} ${indFirst}!`;
    const indUrl = buildWhatsAppUrl(phoneAssoc.indicatedPerson.phone, indMsg);
    buttons.push({ name: indFirst, url: indUrl, label: `Entrar em contato com ${indFirst} pelo WhatsApp` });
  }

  return buttons;
}

interface Props {
  clients: ConfirmedService[];
  onSelect: (service: ConfirmedService) => void;
}

export function PlateSearch({ clients, onSelect }: Props) {
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
    const q = normalizePlate(debouncedQuery);
    if (q.length === 0) return [];

    return clients.filter((c) => {
      const plate = normalizePlate(c.plateOriginal || "");
      return plate.includes(q);
    });
  }, [debouncedQuery, clients]);

  const handleSelect = useCallback(
    (service: ConfirmedService) => {
      onSelect(service);
      setQuery("");
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleWppClick = useCallback(
    (e: MouseEvent, url: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    [],
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
          placeholder="Buscar placa..."
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
      {isOpen && debouncedQuery.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhuma placa encontrada.
            </div>
          ) : (
            results.map((svc, i) => {
              const hasAddr = hasValidAddress(svc);
              const wppButtons = getWppInfo(svc);
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={svc.id}
                  onMouseDown={() => handleSelect(svc)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-accent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {svc.plateOriginal || "?"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {svc.responsibleOriginal || "?"}
                        {svc.serviceStatus ? ` — ${svc.serviceStatus}` : ""}
                      </div>
                      {hasAddr && svc.cityDetected && svc.stateDetected && (
                        <div className="text-[10px] text-muted-foreground/70 truncate">
                          {svc.cityDetected}/{svc.stateDetected}
                          {svc.dataHora ? ` — ${svc.dataHora}` : ""}
                        </div>
                      )}
                      {!hasAddr && (
                        <div className="text-xs font-medium text-red-600 mt-0.5">
                          Placa sem endereço
                        </div>
                      )}
                    </div>
                    {wppButtons.some((b) => b.url) && (
                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        {wppButtons.map((btn, bi) =>
                          btn.url ? (
                            <a
                              key={bi}
                              href={btn.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={btn.label}
                              title={btn.label}
                              onMouseDown={(e) => handleWppClick(e, btn.url)}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(btn.url, "_blank", "noopener,noreferrer");
                              }}
                              className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-green-100 text-green-600 transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
