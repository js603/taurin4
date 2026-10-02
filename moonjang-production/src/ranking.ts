export interface Candidate { id:string; affinity:number; recency:number; quality:number; exposure:number; isNew:boolean; }
export function rankCandidates(items: Candidate[]) {
  return [...items].sort((a,b) => score(b)-score(a));
}
export function score(c:Candidate) {
  const exposurePenalty = Math.min(c.exposure * .08, .55);
  const newWriterBoost = c.isNew ? .16 : 0;
  return c.affinity*.4 + c.quality*.36 + c.recency*.24 + newWriterBoost - exposurePenalty;
}
