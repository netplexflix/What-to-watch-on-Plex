// File: src/components/admin/StatisticsTab.tsx
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart3, Loader2, Users, Trophy, Calendar, Film, Tv, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";

type Unit = "days" | "weeks" | "months" | "years";

interface StatsResponse {
  range: { amount: number; unit: string; fromISO: string; toISO: string };
  kpis: { totalSessions: number; uniqueParticipants: number; avgParticipantsPerSession: number };
  activity: Array<{ bucketStartISO: string; count: number }>;
  sessionTypes: { classic: number; timed: number; target: number };
  mediaTypes: Record<string, number>;
  participantDistribution: Record<string, number>;
  topParticipants: Array<{ name: string; count: number }>;
  topWinners: Array<{ title: string; thumb: string | null; count: number }>;
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  classic: "hsl(var(--primary))",
  timed: "hsl(var(--accent))",
  target: "hsl(var(--destructive))",
};

const MEDIA_TYPE_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

const PARTICIPANT_PALETTE = [
  "hsl(210 80% 60%)",
  "hsl(160 70% 50%)",
  "hsl(45 90% 55%)",
  "hsl(15 80% 60%)",
  "hsl(280 65% 60%)",
  "hsl(330 70% 60%)",
  "hsl(190 70% 55%)",
  "hsl(100 60% 50%)",
];

const RADIAN = Math.PI / 180;

function makePieLabel(formatter: (name: string, value: number) => string) {
  return (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, name, value } = props;
    if (percent < 0.02) return null;
    const labelRadius = outerRadius + 14;
    const x = cx + labelRadius * Math.cos(-midAngle * RADIAN);
    const y = cy + labelRadius * Math.sin(-midAngle * RADIAN);
    const isRight = x > cx;
    return (
      <text
        x={x}
        y={y}
        fill="hsl(var(--foreground))"
        textAnchor={isRight ? "start" : "end"}
        dominantBaseline="central"
        fontSize={11}
      >
        {formatter(String(name), value as number)}
      </text>
    );
  };
}

function formatBucketLabel(iso: string, unit: Unit): string {
  const d = new Date(iso);
  if (unit === "days") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (unit === "weeks") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (unit === "months") {
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return String(d.getUTCFullYear());
}

export const StatisticsTab = () => {
  const [amount, setAmount] = useState<number | "">(30);
  const [unit, setUnit] = useState<Unit>("days");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (amount === "" || amount < 1) return;
    const t = setTimeout(() => loadStats(amount, unit), 200);
    return () => clearTimeout(t);
  }, [amount, unit]);

  const loadStats = async (a: number, u: Unit) => {
    if (!a || a < 1) return;
    setIsLoading(true);
    try {
      const { data, error } = await adminApi.getStats(a, u);
      if (error) throw new Error(error);
      if (data) setStats(data);
    } catch (err) {
      console.error("Error loading stats:", err);
      toast.error("Failed to load statistics");
    } finally {
      setIsLoading(false);
    }
  };

  const activityChartData = useMemo(
    () =>
      (stats?.activity || []).map((b) => ({
        label: formatBucketLabel(b.bucketStartISO, unit),
        count: b.count,
      })),
    [stats, unit]
  );

  const sessionTypeData = useMemo(() => {
    if (!stats) return [];
    return (["classic", "timed", "target"] as const)
      .map((k) => ({ name: k, value: stats.sessionTypes[k] }))
      .filter((d) => d.value > 0);
  }, [stats]);

  const mediaTypeData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.mediaTypes)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [stats]);

  const participantDistData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.participantDistribution)
      .map(([count, value]) => ({ name: count, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));
  }, [stats]);

  const sessionTotal = sessionTypeData.reduce((a, b) => a + b.value, 0);
  const mediaTotal = mediaTypeData.reduce((a, b) => a + b.value, 0);
  const participantDistTotal = participantDistData.reduce((a, b) => a + b.value, 0);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2"
      >
        <BarChart3 size={20} className="text-primary" />
        <h2 className="font-semibold text-foreground">Statistics</h2>
      </motion.div>

      {/* Range picker */}
      <div className="glass-card rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar size={14} />
          <span>Show stats for the last</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setAmount("");
                return;
              }
              const n = parseInt(v, 10);
              if (Number.isNaN(n)) return;
              setAmount(Math.min(999, Math.max(0, n)));
            }}
            onBlur={() => {
              if (amount === "" || amount < 1) setAmount(1);
            }}
            className="w-24 bg-secondary border-secondary"
          />
          <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
            <SelectTrigger className="w-32 bg-secondary border-secondary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="weeks">Weeks</SelectItem>
              <SelectItem value="months">Months</SelectItem>
              <SelectItem value="years">Years</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Sessions" value={stats.kpis.totalSessions} />
            <KpiCard label="Unique usernames" value={stats.kpis.uniqueParticipants} />
            <KpiCard label="Avg users / session" value={stats.kpis.avgParticipantsPerSession} />
          </div>

          {/* Activity chart */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="font-medium text-foreground mb-3">Activity over time</h3>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    fontSize={11}
                    interval="preserveStartEnd"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={11}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                    labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pies */}
          <div className="grid grid-cols-1 gap-3">
            <div className="glass-card rounded-xl p-4">
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Layers size={14} className="text-primary" />
                Session modes
              </h3>
              {sessionTypeData.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 12, right: 100, bottom: 12, left: 100 }}>
                      <Pie
                        data={sessionTypeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={32}
                        outerRadius={55}
                        paddingAngle={2}
                        label={makePieLabel(
                          (name, value) =>
                            `${cap(name)}: ${value}x (${pct(value, sessionTotal)}%)`
                        )}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                      >
                        {sessionTypeData.map((d) => (
                          <Cell key={d.name} fill={SESSION_TYPE_COLORS[d.name]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "hsl(var(--popover-foreground))",
                        }}
                        itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                        labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                        formatter={(value: number, name: string) =>
                          [`${value} (${pct(value, sessionTotal)}%)`, cap(name)]
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="glass-card rounded-xl p-4">
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Film size={14} className="text-primary" />
                Media types
              </h3>
              {mediaTypeData.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 12, right: 100, bottom: 12, left: 100 }}>
                      <Pie
                        data={mediaTypeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={32}
                        outerRadius={55}
                        paddingAngle={2}
                        label={makePieLabel(
                          (name, value) =>
                            `${cap(name)}: ${value}x (${pct(value, mediaTotal)}%)`
                        )}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                      >
                        {mediaTypeData.map((d, i) => (
                          <Cell key={d.name} fill={MEDIA_TYPE_PALETTE[i % MEDIA_TYPE_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "hsl(var(--popover-foreground))",
                        }}
                        itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                        labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                        formatter={(value: number, name: string) =>
                          [`${value} (${pct(value, mediaTotal)}%)`, cap(name)]
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Participants-per-session distribution */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
              <Users size={14} className="text-primary" />
              Participants per session
            </h3>
            {participantDistData.length === 0 ? (
              <EmptyChart />
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 12, right: 120, bottom: 12, left: 120 }}>
                    <Pie
                      data={participantDistData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={65}
                      paddingAngle={2}
                      label={makePieLabel((name, value) => {
                        const noun = name === "1" ? "person" : "people";
                        return `${name} ${noun}: ${value}x (${pct(value, participantDistTotal)}%)`;
                      })}
                      labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                    >
                      {participantDistData.map((d, i) => (
                        <Cell key={d.name} fill={PARTICIPANT_PALETTE[i % PARTICIPANT_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "hsl(var(--popover-foreground))",
                      }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                      labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                      formatter={(value: number, name: string) => [
                        `${value} ${value === 1 ? "session" : "sessions"} (${pct(value, participantDistTotal)}%)`,
                        `${name} ${name === "1" ? "person" : "people"}`,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Leaderboards */}
          <div className="grid grid-cols-1 gap-3">
            <div className="glass-card rounded-xl p-4">
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Users size={14} className="text-primary" />
                Top participants
              </h3>
              {stats.topParticipants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data in range</p>
              ) : (
                <ol className="space-y-2">
                  {stats.topParticipants.map((p, i) => (
                    <li key={p.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                        <span className="truncate text-foreground">{p.name}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {p.count} {p.count === 1 ? "session" : "sessions"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="glass-card rounded-xl p-4">
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Trophy size={14} className="text-accent" />
                Top winners
              </h3>
              {stats.topWinners.length === 0 ? (
                <p className="text-sm text-muted-foreground">No winners in range</p>
              ) : (
                <ol className="space-y-2">
                  {stats.topWinners.map((w, i) => (
                    <li key={w.title} className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                      {w.thumb ? (
                        <img
                          src={w.thumb}
                          alt=""
                          className="w-8 h-12 object-cover rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-8 h-12 bg-secondary rounded flex items-center justify-center">
                          <Tv size={14} className="text-muted-foreground" />
                        </div>
                      )}
                      <span className="truncate text-foreground flex-1">{w.title}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {w.count} {w.count === 1 ? "win" : "wins"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
};

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-xl p-3 text-center">
      <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-56 flex items-center justify-center">
      <p className="text-sm text-muted-foreground">No data in range</p>
    </div>
  );
}
