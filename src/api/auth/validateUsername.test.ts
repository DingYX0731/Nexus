import { describe, it, expect } from 'vitest';
import { validateUsername, validateEmail, validatePassword, validateBio } from './validateUsername';

describe('validateUsername', () => {
  it('rejects empty', () => expect(validateUsername('').ok).toBe(false));
  it('rejects too short', () => expect(validateUsername('a').ok).toBe(false));
  it('rejects too long', () => expect(validateUsername('a'.repeat(21)).ok).toBe(false));
  it('rejects illegal chars', () => expect(validateUsername('bad name!').ok).toBe(false));
  it('accepts cjk', () => expect(validateUsername('小红').ok).toBe(true));
  it('accepts alnum_underscore', () => expect(validateUsername('kira_2024').ok).toBe(true));
});

describe('validateEmail', () => {
  it('rejects no-at', () => expect(validateEmail('foo.com').ok).toBe(false));
  it('accepts valid', () => expect(validateEmail('a@b.com').ok).toBe(true));
});

describe('validatePassword', () => {
  it('rejects under 6', () => expect(validatePassword('12345').ok).toBe(false));
  it('accepts 6+', () => expect(validatePassword('123456').ok).toBe(true));
});

describe('validateBio', () => {
  it('accepts empty', () => expect(validateBio('').ok).toBe(true));
  it('accepts under 80', () => expect(validateBio('a'.repeat(80)).ok).toBe(true));
  it('rejects over 80', () => expect(validateBio('a'.repeat(81)).ok).toBe(false));
});
