import { describe, expect, it } from "vitest";
import { rankCandidates } from "./ranking";
describe("feed ranking",()=>{
  it("protects new writers from pure popularity lock-in",()=>{
    const result=rankCandidates([
      {id:'popular',affinity:.9,quality:.9,recency:.8,exposure:8,isNew:false},
      {id:'new',affinity:.72,quality:.82,recency:.95,exposure:0,isNew:true},
    ]);
    expect(result[0].id).toBe('new');
  });
});
