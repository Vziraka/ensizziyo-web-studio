import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfIncomingStorageAllowance} from './shared-operations-exact-mail.mjs';

const fixture = () => ({config:{internal_dispatch:{limits:{bytes_tick:1000}}},state:{updated_at:'2026-11-04T00:00:00Z',padding:'x'},dispatch_source:{dependencies:[]}});
test('PDF reserve rechecks mutated state on each invocation',()=>{
 const data=fixture();pdfIncomingStorageAllowance(data);
 data.state.padding='x'.repeat(14_000_000);
 assert.throws(()=>pdfIncomingStorageAllowance(data),/finite storage reserve/);
 data.state.padding='x';pdfIncomingStorageAllowance(data);
 data.config.internal_dispatch.limits.bytes_tick=10_000_000;
 assert.throws(()=>pdfIncomingStorageAllowance(data),/finite storage reserve/);
});
test('PDF reserve counts UTF-8 bytes and escaped backup body independently',()=>{
 const data=fixture();data.state.padding='x'.repeat(13_900_000);pdfIncomingStorageAllowance(data);
 data.state.padding='é'.repeat(7_000_000);
 assert.throws(()=>pdfIncomingStorageAllowance(data),/finite storage reserve/);
 data.state.padding='"'.repeat(6_300_000);
 assert.throws(()=>pdfIncomingStorageAllowance(data),/finite storage reserve/);
});
