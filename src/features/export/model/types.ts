import type { CoordinateInputFormat } from '@/features/geo/coordinateInputFormat';
import type { CrsId } from '@/features/geo/crs';

export type ExportTracksFormat = 'gpx' | 'kml' | 'csv';
export type ExportRoutesFormat = 'gpx' | 'kml' | 'csv';
export type ExportMarkersFormat = 'csv' | 'gpx';

export type ExportTracksMode = 'active' | 'selected' | 'all';
export type ExportObjectsMode = 'selected' | 'all';

export type ExportCsvCoordinateOptions = {
  crs: CrsId;
  format: CoordinateInputFormat;
};

export type ExportRequest = {
  exportPath: string;
  tracks?: {
    format: ExportTracksFormat;
    mode: ExportTracksMode;
    selectedTrackIds?: string[];
    csv?: ExportCsvCoordinateOptions;
  };
  routes?: {
    format: ExportRoutesFormat;
    mode: ExportObjectsMode;
    selectedObjectIds?: string[];
    csv?: ExportCsvCoordinateOptions;
  };
  markers?: {
    format: ExportMarkersFormat;
    mode: ExportObjectsMode;
    selectedObjectIds?: string[];
    csv?: ExportCsvCoordinateOptions;
  };
};
