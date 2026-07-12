export function getGreetingByCurrentTime(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "bom dia";
  if (h >= 12 && h < 18) return "boa tarde";
  return "boa noite";
}
