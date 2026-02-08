import type { MapObject } from '@/features/map/model/types';
import { generateLanesForZone } from './laneGeneration';
import type { LaneFeature } from './types';

export type OutdatedZoneIds = Record<string, true>;

export const generateLanesFromZoneObject = (zone: MapObject): LaneFeature[] => {
  if (zone.type !== 'zone' || zone.geometry?.type !== 'zone') {
    return [];
  }

  return generateLanesForZone({
    parentAreaId: zone.id,
    points: zone.geometry.points,
    laneAngleDeg: zone.laneAngle === 90 ? 90 : 0,
    laneWidthM: Number.isFinite(zone.laneWidth) ? Math.max(1, zone.laneWidth ?? 5) : 5,
    laneBearingDeg: zone.laneBearingDeg,
    start: zone.laneStart,
  });
};

export const countZoneLanes = (laneFeatures: LaneFeature[], zoneId: string): number =>
  laneFeatures.filter((lane) => lane.properties.parent_area_id === zoneId).length;

export const replaceZoneLanes = (
  laneFeatures: LaneFeature[],
  zoneId: string,
  nextLanes: LaneFeature[],
): LaneFeature[] => [...laneFeatures.filter((lane) => lane.properties.parent_area_id !== zoneId), ...nextLanes];

export const markZoneLanesOutdated = (outdatedZoneIds: OutdatedZoneIds, zoneId: string): OutdatedZoneIds => ({
  ...outdatedZoneIds,
  [zoneId]: true,
});

export const clearZoneLanesOutdated = (outdatedZoneIds: OutdatedZoneIds, zoneId: string): OutdatedZoneIds => {
  if (!outdatedZoneIds[zoneId]) return outdatedZoneIds;
  const next = { ...outdatedZoneIds };
  delete next[zoneId];
  return next;
};

export const didZoneLaneInputsChange = (zone: MapObject, updates: Partial<MapObject>): boolean => {
  if (zone.type !== 'zone') return false;

  if (updates.geometry?.type === 'zone') {
    return true;
  }

  if (typeof updates.laneAngle === 'number' && updates.laneAngle !== zone.laneAngle) {
    return true;
  }

  if (typeof updates.laneWidth === 'number' && updates.laneWidth !== zone.laneWidth) {
    return true;
  }

  if (typeof updates.laneBearingDeg === 'number' && updates.laneBearingDeg !== zone.laneBearingDeg) {
    return true;
  }

  if (updates.laneStart && (updates.laneStart.lat !== zone.laneStart?.lat || updates.laneStart.lon !== zone.laneStart?.lon)) {
    return true;
  }

  return false;
};

export type CascadeDeleteZoneInput = {
  objects: MapObject[];
  laneFeatures: LaneFeature[];
  outdatedZoneIds: OutdatedZoneIds;
  zoneId: string;
};

export type CascadeDeleteZoneResult = {
  objects: MapObject[];
  laneFeatures: LaneFeature[];
  outdatedZoneIds: OutdatedZoneIds;
  removedLaneCount: number;
};

export const cascadeDeleteZone = (input: CascadeDeleteZoneInput): CascadeDeleteZoneResult => {
  const zone = input.objects.find((obj) => obj.id === input.zoneId);
  if (!zone || zone.type !== 'zone') {
    return {
      objects: input.objects,
      laneFeatures: input.laneFeatures,
      outdatedZoneIds: input.outdatedZoneIds,
      removedLaneCount: 0,
    };
  }

  const removedLaneCount = countZoneLanes(input.laneFeatures, input.zoneId);
  return {
    objects: input.objects.filter((obj) => obj.id !== input.zoneId),
    laneFeatures: input.laneFeatures.filter((lane) => lane.properties.parent_area_id !== input.zoneId),
    outdatedZoneIds: clearZoneLanesOutdated(input.outdatedZoneIds, input.zoneId),
    removedLaneCount,
  };
};
