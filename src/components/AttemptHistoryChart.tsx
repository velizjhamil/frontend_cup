import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AttemptHistoryItem } from '../types/attempt';

// Hex on purpose: Recharts writes these as SVG presentation attributes, where
// `var(--primary)` is not reliably resolved. Keep in sync with index.css tokens.
const CHART_COLORS = {
  line: '#0E2F76', // --primary
  area: '#AAC0E1', // --secondary
  grid: '#E2E8F0', // slate-200: guía horizontal apenas visible
  axis: '#64748B', // slate-500
} as const;

type TooltipPayloadEntry = { value?: number | string };

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipPayloadEntry[];
};

/** Tooltip compacto: fecha arriba, porcentaje destacado, sin bordes extra. */
function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-primary tabular-nums">{payload[0]?.value}% aciertos</p>
    </div>
  );
}

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
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-slate-600">
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
    <div className="h-60 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 8, bottom: 4, left: -12 }}>
          <defs>
            <linearGradient id="attempt-progress-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.area} stopOpacity={0.55} />
              <stop offset="100%" stopColor={CHART_COLORS.area} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            minTickGap={16}
            tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => `${value}%`}
            tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: CHART_COLORS.area, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="percentage"
            stroke={CHART_COLORS.line}
            strokeWidth={2}
            fill="url(#attempt-progress-fill)"
            dot={points.length <= 12 ? { r: 2.5, fill: CHART_COLORS.line, strokeWidth: 0 } : false}
            activeDot={{ r: 4.5, fill: CHART_COLORS.line, stroke: '#FFFFFF', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
