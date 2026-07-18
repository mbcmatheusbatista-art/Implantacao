import { useState, useRef, useMemo, useEffect, useCallback, type KeyboardEvent, type MouseEvent } from "react";
import { Search, MessageCircle, X } from "lucide-react";
import type { ConfirmedService } from "@/types";
import { normalizePlate } from "@/utils/normalize-text";
import {
  parsePeopleFromResponsibleText,
  normalizePersonName,
  type PersonInfo,
} from "@/utils/parse-responsible-contact";
import { associatePhonesToPeople, extractPhoneNumbers } from "@/utils/extract-phones";
import { buildWhatsAppUrl } from "@/utils/whatsapp-url";
import { getGreetingByCurrentTime } from "@/utils/greeting";

function hasValidAddress(service: ConfirmedService): boolean {
  const addr = (service.fullAddress || "").trim().toLowerCase();
  if (!addr) return false;
  const invalidValues = new Set(["-", "não informado", "nao informado", "sem endereço", "sem endereco"]);
  if (invalidValues.has(addr)) return false;
  return true;
}

interface PersonGroup {
  normName: string;
  displayName: string;
  records: ConfirmedService[];
}

interface VehicleInfo {
  service: ConfirmedService;
  people: PersonInfo[];
  phones: { phone: string | null; role: string }[];
  hasAddress: boolean;
}

interface Props {
  clients: ConfirmedService[];
  onSelectVehicle: (service: ConfirmedService) => void;
  onFilterPerson: (personName: string, allRecordIds: string[], validRecordIds: string[]) => void;
  onClearFilter: () => void;
}

function getWppButtonsForVehicle(
  vehicle: VehicleInfo,
  matchedPersonNorm: string,
) {
  const greeting = getGreetingByCurrentTime();
  const buttons: { name: string; url: string | null; label: string; isVehicleHolder: boolean }[] = [];

  for (let i = 0; i < vehicle.people.length; i++) {
    const person = vehicle.people[i];
    const phoneInfo = vehicle.phones[i];
    if (!phoneInfo || !phoneInfo.phone) continue;

    const shortName = person.firstName || person.fullName.split(" ")[0];
    const msg = `Ol\u00e1, ${greeting} ${shortName}!`;
    const url = buildWhatsAppUrl(phoneInfo.phone, msg);
    const norm = normalizePersonName(person.fullName);

    buttons.push({
      name: shortName,
      url,
      label: `Entrar em contato com ${shortName} pelo WhatsApp`,
      isVehicleHolder: person.role === "vehicle_holder" && norm !== matchedPersonNorm,
    });
  }

  return buttons;
}

export function ClientSearch({ clients, onSelectVehicle, onFilterPerson, onClearFilter }: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPerson, setSelectedPerson] = useState<PersonGroup | null>(null);
  const [showVehicleList, setShowVehicleList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const handleClearRef = useRef<() => void>(() => {});

  const personIndex = useMemo(() => {
    const map = new Map<string, PersonGroup>();

    for (const svc of clients) {
      const parsed = parsePeopleFromResponsibleText(svc.responsibleOriginal);
      for (const person of parsed.people) {
        const norm = normalizePersonName(person.fullName);
        if (!norm) continue;
        const existing = map.get(norm);
        if (existing) {
          if (!existing.records.some((r) => r.id === svc.id)) {
            existing.records.push(svc);
          }
        } else {
          map.set(norm, {
            normName: norm,
            displayName: person.fullName,
            records: [svc],
          });
        }
      }
    }

    return map;
  }, [clients]);

  const searchResults = useMemo(() => {
    if (!debouncedQuery) return [];
    const q = normalizePersonName(debouncedQuery);
    if (q.length === 0) return [];

    const matches: PersonGroup[] = [];
    for (const group of personIndex.values()) {
      if (group.normName.includes(q)) {
        matches.push(group);
      }
    }
    matches.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return matches;
  }, [debouncedQuery, personIndex]);

  const selectedVehicles = useMemo((): VehicleInfo[] => {
    if (!selectedPerson) return [];

    return selectedPerson.records.map((svc) => {
      const parsed = parsePeopleFromResponsibleText(svc.responsibleOriginal);
      const phones = associatePhonesToPeople(
        svc.phoneOriginal || "",
        parsed.people.length,
        parsed.people.findIndex((p) => p.role === "manager"),
        parsed.people
          .map((p, i) => (p.role === "vehicle_holder" ? i : -1))
          .filter((i) => i >= 0),
      );

      return {
        service: svc,
        people: parsed.people,
        phones,
        hasAddress: hasValidAddress(svc),
      };
    });
  }, [selectedPerson]);

  const handleSelectPerson = useCallback(
    (group: PersonGroup) => {
      setSelectedPerson(group);
      setQuery(group.displayName);
      setDebouncedQuery(group.displayName);
      setIsOpen(false);
      setShowVehicleList(false);
      setSelectedIndex(0);
      const allIds = group.records.map((r) => r.id);
      const validIds = group.records.filter((r) => hasValidAddress(r)).map((r) => r.id);
      onFilterPerson(group.displayName, allIds, validIds);
    },
    [onFilterPerson],
  );

  const handleVehicleClick = useCallback(
    (vehicle: VehicleInfo) => {
      if (vehicle.hasAddress) {
        onSelectVehicle(vehicle.service);
      }
    },
    [onSelectVehicle],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    const hadPerson = selectedPerson !== null;
    setSelectedPerson(null);
    setIsOpen(false);
    setShowVehicleList(false);
    setSelectedIndex(0);
    if (hadPerson) {
      onClearFilter();
    }
  }, [selectedPerson, onClearFilter]);

  useEffect(() => {
    handleClearRef.current = handleClear;
  }, [handleClear]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;
      const target = e.target as Node;
      if (!container.contains(target)) {
        handleClearRef.current();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    if (selectedPerson) {
      if (e.key === "Escape") {
        handleClear();
      }
      return;
    }

    if (!isOpen) {
      if (e.key === "ArrowDown" && searchResults.length > 0) {
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
        setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          handleSelectPerson(searchResults[selectedIndex]);
        }
        break;
    }
  };

  const handleIconClick = () => {
    if (selectedPerson) {
      handleClear();
      return;
    }
    if (searchResults.length >= 1) {
      handleSelectPerson(searchResults[0]);
    }
  };

  const matchedPersonNorm = selectedPerson ? selectedPerson.normName : "";

  return (
    <div className="relative" style={{ zIndex: 1000 }}>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground cursor-pointer"
          onClick={handleIconClick}
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar cliente..."
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setSelectedIndex(0);
            setIsOpen(true);
            if (selectedPerson) {
              setSelectedPerson(null);
              onClearFilter();
            } else {
              setSelectedPerson(null);
            }
          }}
          onFocus={() => {
            if (selectedPerson) {
              handleClear();
              return;
            }
            if (searchResults.length > 0) setIsOpen(true);
          }}
          onBlur={() => setTimeout(() => setIsOpen(false), 180)}
          onKeyDown={handleKeyDown}
          className="w-full h-9 pl-8 pr-8 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {!selectedPerson && isOpen && debouncedQuery.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {searchResults.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </div>
          ) : (
            searchResults.map((group, i) => (
              <button
                key={group.normName}
                onMouseDown={() => handleSelectPerson(group)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-popover-foreground hover:bg-accent"
                }`}
              >
                <span className="font-medium">{group.displayName}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {group.records.length} veículo{group.records.length !== 1 ? "s" : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {selectedPerson && showVehicleList && selectedVehicles.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
          role="listbox"
        >
          <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border">
            {selectedPerson.displayName} — {selectedVehicles.length} veículo{selectedVehicles.length !== 1 ? "s" : ""} encontrado{selectedVehicles.length !== 1 ? "s" : ""}
          </div>
          {selectedVehicles.map((veh) => {
            const wppButtons = getWppButtonsForVehicle(veh, matchedPersonNorm);
            const peopleText = veh.people
              .filter((p) => p.role !== "primary")
              .map((p) => {
                if (p.role === "vehicle_holder") return `está com ${p.fullName}`;
                if (p.role === "manager") return `Gestor ${p.fullName}`;
                return p.fullName;
              })
              .join(" ");
            return (
              <button
                key={veh.service.id}
                onMouseDown={() => handleVehicleClick(veh)}
                className="w-full text-left px-3 py-2 text-sm transition-colors text-popover-foreground hover:bg-accent border-b border-border/50 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">
                      {veh.service.plateOriginal || "?"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {veh.service.responsibleOriginal || "?"}
                    </div>
                    {veh.hasAddress && veh.service.fullAddress && (
                      <div className="text-[10px] text-muted-foreground/70 truncate" title={veh.service.fullAddress}>
                        {veh.service.fullAddress}
                      </div>
                    )}
                    {!veh.hasAddress && (
                      <div className="text-[11px] font-medium text-red-600">
                        Placa sem endereço
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground/70">
                      {veh.service.dataHora && (
                        <span>{veh.service.dataHora}</span>
                      )}
                      {veh.service.serviceStatus && (
                        <span className={veh.service.serviceStatus === "AGENDADO" ? "text-green-600 font-medium" : ""}>
                          {veh.service.serviceStatus}
                        </span>
                      )}
                    </div>
                    {peopleText && (
                      <div className="text-[10px] text-muted-foreground/70 truncate">
                        {peopleText}
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
                            className={`inline-flex items-center justify-center w-6 h-6 rounded hover:bg-green-100 transition-colors ${
                              btn.isVehicleHolder ? "text-red-500 hover:text-red-600" : "text-green-600"
                            }`}
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
          })}
          {selectedVehicles.every((v) => !v.hasAddress) && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Nenhum dos veículos relacionados possui endereço válido.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
