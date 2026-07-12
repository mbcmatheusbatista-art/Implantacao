import type { ConfirmedService, Technician } from "@/types";

export interface ScoredTechnician {
  technician: Technician;
  score: number;
  reasons: string[];
  category: "recomendados" | "mesma_uf" | "confirmar" | "sem_material" | "outras";
}

export function calculateTechnicianScore(
  tech: Technician,
  service: ConfirmedService,
  sessionLoad: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const svcCity = (service.cityDetected ?? "").trim().toLocaleLowerCase("pt-BR");
  const svcUF = (service.stateDetected ?? "").trim().toUpperCase();
  const tCity = tech.cityNormalized.trim().toLocaleLowerCase("pt-BR");
  const tUF = tech.state.trim().toUpperCase();

  if (svcCity && svcUF && tCity && tUF && tCity === svcCity && tUF === svcUF) {
    score += 100;
    reasons.push("Mesma cidade e UF");
  } else if (svcUF && tUF && tUF === svcUF) {
    score += 40;
    reasons.push("Mesma UF");
  } else if (!svcCity || !svcUF || !tCity || !tUF) {
    score += 5;
    reasons.push("Localidade não informada");
  }

  const availableAfterSession = (tech.availableQuantity ?? 0) - sessionLoad;
  switch (tech.stockStatus) {
    case "DISPONIVEL":
      score += 80;
      reasons.push("Material disponível");
      if (availableAfterSession > 0) {
        score += 30;
        reasons.push("Saldo suficiente após sessão");
      }
      break;
    case "CONFIRMAR":
      score += 10;
      reasons.push("Requer confirmação");
      break;
    case "SEM_MATERIAL":
      score -= 100;
      reasons.push("Sem material");
      break;
    default:
      reasons.push("Quantidade não informada");
      break;
  }

  score -= 15 * sessionLoad;
  if (sessionLoad > 0) reasons.push(`${sessionLoad} atendimento(s) na sessão`);

  return { score, reasons };
}

export function categorize(t: Technician, svc: ConfirmedService): ScoredTechnician["category"] {
  if (t.stockStatus === "SEM_MATERIAL") return "sem_material";
  if (t.stockStatus === "CONFIRMAR") return "confirmar";
  const svcUF = (svc.stateDetected ?? "").toUpperCase();
  const svcCity = (svc.cityDetected ?? "").toLocaleLowerCase("pt-BR");
  const tUF = t.state.toUpperCase();
  const tCity = t.cityNormalized.toLocaleLowerCase("pt-BR");
  if (svcCity && tCity === svcCity && svcUF && tUF === svcUF) return "recomendados";
  if (svcUF && tUF === svcUF) return "mesma_uf";
  return "outras";
}

export function rankTechnicians(
  techs: Technician[],
  service: ConfirmedService,
  sessionLoads: Map<string, number>,
): ScoredTechnician[] {
  const scored = techs.map((t) => {
    const load = sessionLoads.get(t.id) ?? 0;
    const { score, reasons } = calculateTechnicianScore(t, service, load);
    return { technician: t, score, reasons, category: categorize(t, service) };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCity = (a.technician.cityNormalized || "").toLocaleLowerCase("pt-BR");
    const bCity = (b.technician.cityNormalized || "").toLocaleLowerCase("pt-BR");
    const sCity = (service.cityDetected ?? "").toLocaleLowerCase("pt-BR");
    const aSame = aCity === sCity ? 1 : 0;
    const bSame = bCity === sCity ? 1 : 0;
    if (aSame !== bSame) return bSame - aSame;
    const aBal = (a.technician.availableQuantity ?? 0) - (sessionLoads.get(a.technician.id) ?? 0);
    const bBal = (b.technician.availableQuantity ?? 0) - (sessionLoads.get(b.technician.id) ?? 0);
    if (bBal !== aBal) return bBal - aBal;
    return a.technician.nameOriginal.localeCompare(b.technician.nameOriginal, "pt-BR");
  });
  return scored;
}
