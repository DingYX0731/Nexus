import { describe, it, expect } from 'vitest';
import { avatarColorFor } from './avatarColor';

describe('avatarColorFor', () => {
  it('returns a hex color', () => {
    expect(avatarColorFor('alex')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it('is deterministic for same seed', () => {
    expect(avatarColorFor('alex')).toBe(avatarColorFor('alex'));
  });
  it('handles empty string', () => {
    expect(avatarColorFor('')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
