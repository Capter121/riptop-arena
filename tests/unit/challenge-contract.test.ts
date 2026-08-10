import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/challenge-contract-v1.json';
import {
  normalizeBattleInputLog,
  normalizeBattleOutcome,
  normalizeCreateOfferRequest,
} from '../../server/challenges/challenge-contract.mjs';

describe('shared challenge fixture', () => {
  it('normalizes the same request and battle records used by the server', () => {
    expect(normalizeCreateOfferRequest(fixture.createRequest)).toEqual({
      ...fixture.createRequest,
      message: 'Ready to spin',
    });
    expect(normalizeBattleInputLog(fixture.inputLog)).toEqual(fixture.inputLog);
    expect(normalizeBattleOutcome(fixture.outcome)).toEqual(fixture.outcome);
  });
});
