export type TileCandidate<TRequest> = {
  blob: Blob;
  request: TRequest;
  key: string;
};

export type TileCandidateResult<TRequest> =
  | { source: 'network'; candidate: TileCandidate<TRequest> }
  | { source: 'cache'; candidate: TileCandidate<TRequest> }
  | null;

type ResolveTileCandidateOptions<TRequest> = {
  isOnline: boolean;
  loadFromCacheHierarchy: () => Promise<TileCandidate<TRequest> | null>;
  loadFromNetwork: () => Promise<TileCandidate<TRequest>>;
};

export const resolveTileCandidate = async <TRequest>({
  isOnline,
  loadFromCacheHierarchy,
  loadFromNetwork,
}: ResolveTileCandidateOptions<TRequest>): Promise<TileCandidateResult<TRequest>> => {
  if (!isOnline) {
    const cached = await loadFromCacheHierarchy();
    return cached ? { source: 'cache', candidate: cached } : null;
  }

  try {
    const network = await loadFromNetwork();
    return { source: 'network', candidate: network };
  } catch {
    const cached = await loadFromCacheHierarchy();
    return cached ? { source: 'cache', candidate: cached } : null;
  }
};
