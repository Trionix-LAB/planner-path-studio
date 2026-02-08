export type ExportTracksFormat = 'gpx' | 'kml';
export type ExportRoutesFormat = 'gpx' | 'kml';
export type ExportMarkersFormat = 'csv' | 'gpx';

export type ExportTracksMode = 'active' | 'selected' | 'all';
export type ExportObjectsMode = 'selected' | 'all';

export type ExportRequest = {
  exportPath: string;
  tracks?: {
    format: ExportTracksFormat;
    mode: ExportTracksMode;
    selectedTrackIds?: string[];
  };
  routes?: {
    format: ExportRoutesFormat;
    mode: ExportObjectsMode;
    selectedObjectIds?: string[];
  };
  markers?: {
    format: ExportMarkersFormat;
    mode: ExportObjectsMode;
    selectedObjectIds?: string[];
  };
};

