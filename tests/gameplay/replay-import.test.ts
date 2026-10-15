import { describe, expect, it } from 'vitest';
import { createGameplayFixture } from '../../src/index.js';

describe('replay-file loading',()=>{
  it('reproduces a session including action history and rejects corrupted hashes and actions',async()=>{
    const {engine,session,players,seats}=await createGameplayFixture();
    session.start();
    const action=session.getActionCandidates(seats[0],{kind:'ADVANCE_SEQUENCE',pieceId:null,budget:1}).actions[0];
    if(action) await session.dispatch({requestId:'replay-test:1' as never,seatId:seats[0],action});
    const replay=session.exportReplay();
    const bindings=seats.map((seatId,index)=>({seatId,playerId:players[index]!,label:String(index)}));
    const loaded=await engine.loadReplay(JSON.stringify(replay),bindings);
    expect(loaded.getDiagnostics().stateHash).toBe(session.getDiagnostics().stateHash);
    expect(loaded.getHistory({offset:0,limit:100,actionKind:null}).total).toBe(session.getHistory({offset:0,limit:100,actionKind:null}).total);
    await expect(engine.loadReplay(JSON.stringify({...replay,finalStateHash:replay.initialStateHash===replay.finalStateHash?'sha256:'+'0'.repeat(64):replay.initialStateHash}),bindings)).rejects.toThrow();
    await expect(engine.loadReplay(JSON.stringify({...replay,actions:[{kind:'NOT_AN_ACTION'}]}),bindings)).rejects.toThrow();
    await loaded.close();await session.close();
  });
});
