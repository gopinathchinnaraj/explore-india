// Spot status transitions — one place that keeps `status` and `isActive` consistent.
// The public site shows a spot only when status = APPROVED AND isActive = true.

import { after } from "next/server";
import prisma from "@/lib/db/prisma";
import { enrichMissingResources, refreshNearbyAround } from "./syncService";
import { computeNearbyForSpots } from "./spotService";

export const SPOT_STATUSES = ["DISCOVERED", "PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"] as const;
export type SpotStatus = (typeof SPOT_STATUSES)[number];

export function isSpotStatus(value: unknown): value is SpotStatus {
  return typeof value === "string" && (SPOT_STATUSES as readonly string[]).includes(value);
}

/**
 * Change the status of one or more spots. Approving makes them public immediately and
 * schedules background enrichment for anything they are missing (after the response).
 * Must be called from a route handler or server action (uses next/server `after`).
 */
export async function setSpotStatus(spotIds: number[], status: SpotStatus) {
  const approved = status === "APPROVED";
  const before = await prisma.spot.findMany({ where: { id: { in: spotIds } }, select: { id: true, status: true } });

  await prisma.spot.updateMany({
    where: { id: { in: spotIds } },
    data: {
      status,
      isActive: approved,
      ...(approved ? { isVerified: true } : {}),
    },
  });

  const newlyPublic = before.filter((s) => approved && s.status !== "APPROVED").map((s) => s.id);
  const noLongerPublic = before.filter((s) => !approved && s.status === "APPROVED").map((s) => s.id);

  if (newlyPublic.length || noLongerPublic.length) {
    after(async () => {
      for (const id of newlyPublic) {
        try {
          await enrichMissingResources(id);
          await refreshNearbyAround(id);
        } catch (err) {
          console.warn(`[SpotStatus] Background enrichment failed for spot ${id}:`, err);
        }
      }
      if (noLongerPublic.length) {
        // Remove hidden spots from other spots' nearby lists
        const affected = await prisma.spotNearby.findMany({
          where: { nearbySpotId: { in: noLongerPublic } },
          select: { spotId: true },
          distinct: ["spotId"],
        });
        await computeNearbyForSpots(affected.map((a) => a.spotId));
      }
    });
  }

  return { updated: spotIds.length, status, isActive: approved, enrichmentQueued: newlyPublic.length };
}
