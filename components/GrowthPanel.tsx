'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type Goal = {
  id: string;
  description: string;
  createdAt: string;
};

type FollowerGrowthEntry = {
  platform: string;
  current: number;
  weekAgo: number | null;
  monthAgo: number | null;
};

function formatDelta(current: number, reference: number | null) {
  if (reference === null) {
    return 'brak jeszcze wystarczających danych';
  }

  const delta = current - reference;
  if (delta === 0) {
    return 'bez zmian';
  }

  return `${delta > 0 ? '+' : ''}${delta}`;
}

// Web equivalent of the Telegram /goal, /goals, /goal-done, /followers commands.
export function GrowthPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [growth, setGrowth] = useState<FollowerGrowthEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newGoal, setNewGoal] = useState('');
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [completingGoalId, setCompletingGoalId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [goalsResponse, growthResponse] = await Promise.all([
        apiClient.get<{ goals: Goal[] }>('/goals'),
        apiClient.get<{ growth: FollowerGrowthEntry[] }>('/growth'),
      ]);
      setGoals(goalsResponse.data.goals);
      setGrowth(growthResponse.data.growth);
    } catch {
      toast.error('Nie udało się pobrać danych o wzroście konta.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addGoal = async () => {
    const description = newGoal.trim();
    if (!description) {
      return;
    }

    try {
      setIsAddingGoal(true);
      await apiClient.post('/goals', { description });
      setNewGoal('');
      toast.success('Cel zapisany.');
      await load();
    } catch {
      toast.error('Nie udało się zapisać celu.');
    } finally {
      setIsAddingGoal(false);
    }
  };

  const completeGoal = async (goal: Goal) => {
    try {
      setCompletingGoalId(goal.id);
      await apiClient.post(`/goals/${goal.id}/complete`);
      toast.success('Cel oznaczony jako zrobiony.');
      await load();
    } catch {
      toast.error('Nie udało się oznaczyć celu.');
    } finally {
      setCompletingGoalId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Ładowanie...</p>;
  }

  return (
    <div className="space-y-6">
      <section className="bg-card border border-border rounded-xl p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cele</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aktywne cele są uwzględniane w cotygodniowym coachingu na Telegramie - agent odnosi się do nich
            wprost, nie tylko do suchych liczb.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newGoal}
            onChange={(event) => setNewGoal(event.target.value)}
            placeholder="Np. Publikować 3x w tygodniu"
            className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={addGoal}
            disabled={isAddingGoal || !newGoal.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {isAddingGoal ? 'Zapisywanie...' : 'Dodaj'}
          </button>
        </div>

        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak aktywnych celów.</p>
        ) : (
          <ul className="divide-y divide-border">
            {goals.map((goal) => (
              <li key={goal.id} className="py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{goal.description}</span>
                <button
                  type="button"
                  onClick={() => completeGoal(goal)}
                  disabled={completingGoalId === goal.id}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {completingGoalId === goal.id ? '...' : '✓ Zrobione'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Wzrost obserwujących</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Zbierane raz dziennie per platforma - trend pojawia się po tygodniu/miesiącu zebranych danych.
          </p>
        </div>

        {growth.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak jeszcze danych - podłącz konto social i poczekaj na pierwsze zebranie (codziennie).
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {growth.map((entry) => (
              <div key={entry.platform} className="bg-secondary/30 border border-border rounded-lg p-4">
                <p className="text-sm font-medium text-foreground">{entry.platform}</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{entry.current}</p>
                <p className="text-xs text-muted-foreground mt-1">Tydzień: {formatDelta(entry.current, entry.weekAgo)}</p>
                <p className="text-xs text-muted-foreground">Miesiąc: {formatDelta(entry.current, entry.monthAgo)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
