import { expect, it } from 'vitest';
import { createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator, createUiController, DEFAULT_NEW_GAME_REQUEST } from '../../src/index.js';
it('clears transport previews on same-revision load and hides them during a private handoff',async()=>{
  const engine=createGameplayEngine(createMemoryGameplayPorts());
  const created=await createNewGameOrchestrator(engine).create({...DEFAULT_NEW_GAME_REQUEST,
    map:{width:24,height:18,style:'WESTERN_EUROPE'},oob:{scale:'STANDARD',divisionsPerSide:3,armoredDivisionsPerSide:1,air:'NONE'},
    seeds:{map:23101,oob:23102,deployment:23103,rules:23104}});
  if(!created.ok)throw Error('Natural package failed');
  const {session,scenario,bindings}=created.value,controller=createUiController({engine,session,scenario,bindings});
  const sources=session.getLogisticsOverview(bindings[0]!.seatId,[])!.dumps;
  const request={sourceId:sources[0]!.id,destination:sources[1]!.hexId,tokens:8},save=controller.serializeSave();
  controller.previewLogistics(request);expect(controller.getSnapshot().logisticsPlan?.delivered).toBe(8);
  await controller.loadSave(save);expect(controller.getSnapshot().logisticsPlan).toBeNull();
  controller.previewLogistics(request);expect(controller.getSnapshot().logisticsPlan).not.toBeNull();
  controller.beginHandoff();expect(controller.getSnapshot().view.privacyLocked).toBe(true);expect(controller.getSnapshot().logisticsPlan).toBeNull();
  controller.completeHandoff();expect(controller.getSnapshot().logisticsPlan).toBeNull();controller.dispose();await session.close();
});
