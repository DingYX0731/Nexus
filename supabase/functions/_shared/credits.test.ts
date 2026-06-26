import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyCharge } from './credits.ts';

Deno.test('charges when enough', () => {
  assertEquals(applyCharge(5, 1), { ok: true, next: 4 });
});
Deno.test('rejects when insufficient', () => {
  assertEquals(applyCharge(0, 1), { ok: false, next: 0 });
});
