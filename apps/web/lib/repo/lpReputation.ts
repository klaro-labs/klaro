/**
 * LP reputation reader. Live mode pulls the single row per `lp_id`; dev mode
 * returns null so the page shows an honest empty state instead of fake history.
 */
import { tryDb } from "../db";

export interface LpReputation {
  lpId: string;
  score: number;
  ordersCompleted: number;
  disputesOpened: number;
  disputesLost: number;
  medianMinutes: number | null;
  lastCalcAt: Date;
}

export async function getLpReputation(
  lpId: string,
): Promise<LpReputation | null> {
  const c = await tryDb();
  if (!c) return null;
  const { data, error } = await c
    .from("lp_reputation")
    .select("*")
    .eq("lp_id", lpId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    lpId: String(data.lp_id),
    score: Number(data.score),
    ordersCompleted: Number(data.orders_completed),
    disputesOpened: Number(data.disputes_opened),
    disputesLost: Number(data.disputes_lost),
    medianMinutes:
      data.median_minutes == null ? null : Number(data.median_minutes),
    lastCalcAt: new Date(String(data.last_calc_at)),
  };
}
