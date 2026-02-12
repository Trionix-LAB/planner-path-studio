import { createTrackRecorderState } from './src/features/mission/model/trackRecorder.ts';
const s = createTrackRecorderState(null, {}, 'stopped' as any);
console.log(typeof (s as any).trackStatusByAgentId, Array.isArray((s as any).trackStatusByAgentId), (s as any).trackStatusByAgentId);
