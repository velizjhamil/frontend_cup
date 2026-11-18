import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AttemptHistoryItem } from '../types/attempt';

type AttemptHistoryChartProps = {
  data: AttemptHistoryItem[];
};

type ChartPoint = {
  id: string;
  label: string;
  percentage: number;
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });
}

/**
 * Evolución del porcentaje de aciertos a lo largo del tiempo. `data` llega
 * ordenado por `createdAt` descendente (igual que `getAttemptsHistory`), así
 * que acá se ordena una copia ascendente para que el gráfico vaya de
 * izquierda (más viejo) a derecha (más nuevo).
 */
export function AttemptHistoryChart({ data }: AttemptHistoryChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
        Todavía no tenés simulacros registrados para graficar tu progreso.
      </p>
    );
  }

  const points: ChartPoint[] = [...data]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((item) => ({
      id: item.id,
      label: formatShortDate(item.createdAt),
      percentage: item.percentage,
    }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip
            formatter={(value) => [`${value}%`, 'Porcentaje']}
            labelFormatter={(label) => `Fecha: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="percentage"
            stroke="#2563eb"
            strokeWidth={2}
            dot
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
