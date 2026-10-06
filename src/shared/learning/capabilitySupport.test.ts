import { describe, expect, it } from 'vitest';
import { buildCapabilityModel, planCourseRoute, routeStructure, type RoutePlanningInput, type RoutePrerequisite, type CapabilityEnable } from './routePlanning';
const enable = (source: string, target: string): CapabilityEnable => ({ id: `${source}>${target}`, source, target, relation: 'enables', strength: .8 });
const pre = (source: string, target: string, strength: 'hard' | 'soft' = 'hard'): RoutePrerequisite => ({ id: `${source}>${target}`, source, target, strength });
const input = (nodeIds: string[], prerequisiteEdges: RoutePrerequisite[], enablesEdges: CapabilityEnable[], targets = ['T'], currentNodeIds = ['A']): RoutePlanningInput => ({ nodeIds, prerequisiteEdges, enablesEdges, currentNodeIds, courseOrder: targets.map((nodeId, coverageOrder) => ({ nodeId, lessonOrder: 0, coverageOrder })) });
const ids = (data: RoutePlanningInput) => [...buildCapabilityModel(data).orderedNodeIds].sort();
describe('capability support is not a learning prerequisite', () => {
  it('keeps an enables-only blue-gray-green chain and factual relation strength', () => {
    const data = input(['A','X','T'], [], [enable('A','X'),enable('X','T')]);
    expect(ids(data)).toEqual(['A','T','X']);
    expect(buildCapabilityModel(data).supportEdges).toEqual(data.enablesEdges);
    expect(buildCapabilityModel(data).prerequisiteEdges).toEqual([]);
    expect(planCourseRoute(data)).toMatchObject({ valid: true, route: { selectedNodeIds: ['T'], prerequisiteEdges: [] } });
  });
  it('supports mixed arbitrary-depth chains', () => {
    const nodes = ['A', ...Array.from({length: 100}, (_, i) => `X${i}`), 'T'];
    const hard: RoutePrerequisite[] = []; const enables: CapabilityEnable[] = [];
    nodes.slice(1).forEach((node, i) => { if (i % 2) hard.push(pre(nodes[i], node)); else enables.push(enable(nodes[i], node)); });
    expect(ids(input(nodes, hard, enables))).toHaveLength(nodes.length);
  });
  it('prunes gray dead branches and history before acquired boundaries', () => {
    const data = input(['H','A','X','Dead','T'], [], [enable('H','A'),enable('A','X'),enable('X','T'),enable('A','Dead')]);
    expect(ids(data)).toEqual(['A','T','X']);
  });
  it('does not bootstrap an unanchored enables cycle or no-blue roots', () => {
    const data = input(['A','X','Y','T'], [], [enable('X','Y'),enable('Y','X'),enable('Y','T')], ['T'], []);
    expect(ids(data)).toEqual(['T']);
  });
  it('supports an anchored cycle without imposing route ordering or cycles', () => {
    const data = input(['A','X','Y','T'], [], [enable('A','X'),enable('X','Y'),enable('Y','X'),enable('Y','T')]);
    expect(ids(data)).toEqual(['A','T','X','Y']);
    expect(planCourseRoute(data).valid).toBe(true);
  });
  it('enables cannot bypass an unacquired hard branch', () => {
    const data = input(['A','B','X','T'], [pre('A','X'),pre('B','X')], [enable('A','X'),enable('X','T')]);
    expect(ids(data)).toEqual(['T']);
    expect(buildCapabilityModel(data).actionableNodeIds).not.toContain('X');
    expect(ids({...data,currentNodeIds:['A','B']})).toEqual(['A','B','T','X']);
  });
  it('preserves hard facts from missing endpoints', () => {
    expect(ids(input(['A','X','T'], [pre('missing','X')], [enable('A','X'),enable('X','T')]))).toEqual(['T']);
  });
  it('keeps all target context without admitting unanchored target-to-target edges', () => {
    const data = input(['A','T','U'], [], [enable('T','U')], ['A','T','U'], ['A']);
    expect(ids(data)).toEqual(['A','T','U']);
    expect(buildCapabilityModel(data).supportEdges).toEqual([]);
  });
  it('Include takes only hard closure, Exclude enables origin is not a hard conflict', () => {
    const data = input(['A','H','X','T'], [pre('H','X')], [enable('A','H'),enable('X','T')]);
    const plan = planCourseRoute(data,{includeNodeIds:['X'],excludeNodeIds:['A']});
    expect(plan).toMatchObject({ valid:true,route:{selectedNodeIds:['H','T','X'],prerequisiteEdges:[pre('H','X')]} });
    expect(planCourseRoute(data,{includeNodeIds:['X'],excludeNodeIds:['H']})).toMatchObject({valid:false,conflicts:[{kind:'excluded_hard_prerequisite'}]});
  });
  it('soft support is not a gate and input order does not alter support', () => {
    const data = input(['A','X','T','B'],[pre('B','X','soft')],[enable('A','X'),enable('X','T')]);
    const before = JSON.stringify(data);
    const model = buildCapabilityModel(data);
    expect(model.orderedNodeIds.sort()).toEqual(['A','T','X']);
    expect(buildCapabilityModel({...data,nodeIds:[...data.nodeIds].reverse(),enablesEdges:[...data.enablesEdges!].reverse()})).toEqual(buildCapabilityModel(data));
    expect(JSON.stringify(data)).toBe(before);
  });
  it('fingerprints support changes but never acquired state or snapshots', () => {
    const data = input(['A','X','T'],[],[enable('A','X'),enable('X','T')]);
    const constraints = {includeNodeIds:[],excludeNodeIds:[]};
    expect(routeStructure(data,constraints)).toEqual(routeStructure({...data,currentNodeIds:[]},constraints));
    expect(routeStructure(data,constraints)).not.toEqual(routeStructure({...data,enablesEdges:[]},constraints));
  });
});
