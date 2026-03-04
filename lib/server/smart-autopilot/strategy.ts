import type { AnalysisOutput, ScheduleSlot } from './types';

export function buildStrategySummary(analysis: AnalysisOutput, schedule: ScheduleSlot[]) {
  const platforms = Array.from(new Set(schedule.map((slot) => slot.platform))).join(', ');
  const topSlot = [...schedule].sort((a, b) => b.score - a.score)[0];

  const safetyNote =
    analysis.safetyFlags.length > 0
      ? `Wykryto ${analysis.safetyFlags.length} flag bezpieczeństwa; włączono dodatkowe ograniczenia publikacji.`
      : 'Nie wykryto krytycznych flag bezpieczeństwa.';

  return [
    `Persona: ${analysis.persona} (confidence ${analysis.confidence.toFixed(2)}).`,
    `Typ treści: ${analysis.contentType}, intencja: ${analysis.intent}.`,
    `Platformy: ${platforms}.`,
    topSlot
      ? `Najlepszy slot: ${topSlot.platform} o ${topSlot.scheduledFor} (${topSlot.timezone}) z oceną ${topSlot.score.toFixed(2)}.`
      : 'Brak slotów harmonogramu.',
    safetyNote,
  ].join(' ');
}
