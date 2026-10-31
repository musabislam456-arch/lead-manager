// Run: cd tests && npm install && npm test
// Tests the pure logic region of ../script.js plus real XLSX/PDF/DOCX generation in Node.
import fs from 'node:fs'; import assert from 'node:assert/strict';
import XLSX from 'xlsx'; import * as jspdfMod from 'jspdf'; import { applyPlugin } from 'jspdf-autotable'; import * as docx from 'docx';
const src = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const a = src.indexOf('// <PURE>'), b = src.indexOf('// </PURE>'); assert(a > 0 && b > a, 'PURE markers missing');
const L = new Function(src.slice(a, b) + '; return {FIELDS,OPT,validateRecord,parseJsonText,analyzeImport,summarize,newIndex,addToIndex,toExportJson,buildXlsx,buildPdf,buildDocx,today};')();
const jsPDF = jspdfMod.jsPDF; applyPlugin(jsPDF);
let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1; } };
const ta = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1; } };

t('exactly 24 fields in order', () => { assert.equal(L.FIELDS.length, 24); assert.equal(L.FIELDS[0][0], 'lead_id'); assert.equal(L.FIELDS[23][0], 'next_follow_up_date'); });
t('invalid JSON rejected', () => assert.match(L.parseJsonText('{bad').error, /Invalid JSON/));
t('empty file / empty array / scalar rejected', () => { assert(L.parseJsonText('  ').error); assert(L.parseJsonText('[]').error); assert(L.parseJsonText('5').error); });
t('single object and array accepted', () => { assert.equal(L.parseJsonText('{"business_name":"A"}').records.length, 1); assert.equal(L.parseJsonText('[{"business_name":"A"},{"business_name":"B"}]').records.length, 2); });
t('business_name required', () => assert(L.validateRecord({ city: 'x' }).errors.some(e => /Business Name is required/.test(e))));
t('type, date and enum validation', () => {
  const v = L.validateRecord({ business_name: 'A', phone_number_1: 123, next_follow_up_date: '2026-02-30', website_status: 'Great', contact_channel: 'Pigeon', lead_status: 'Won' });
  assert.equal(v.errors.length, 5, v.errors.join('|'));
});
t('extra and missing fields are reported, not silent', () => { const v = L.validateRecord({ business_name: 'A', foo: 1 }); assert(v.warnings.some(w => /Unknown fields.*foo/.test(w))); assert(v.warnings.some(w => /Missing fields/.test(w))); });
t('defaults applied; phone leading zero/plus preserved', () => {
  const v = L.validateRecord({ business_name: ' A ', phone_number_1: '+92 0300 1234567' }); assert.equal(v.rec.lead_status, 'New'); assert.equal(v.rec.website_status, 'Website Status Unverified'); assert.equal(v.rec.phone_number_1, '+92 0300 1234567'); assert.equal(v.rec.business_name, 'A');
});
t('missing URL does not mark "No Website Found"', () => assert.equal(L.validateRecord({ business_name: 'A' }).rec.website_status, 'Website Status Unverified'));
t('HTML in text is kept as plain data (rendered via textContent)', () => assert.equal(L.validateRecord({ business_name: '<img src=x onerror=alert(1)>' }).rec.business_name, '<img src=x onerror=alert(1)>'));
t('duplicates: db, file, phone; similar names NOT merged', () => {
  const db = L.newIndex(); L.addToIndex(db, { business_name: 'Joe\'s Pizza', city: 'Karachi', country: 'Pakistan', phone_number_1: '+92 300 1112233' }, 'LM-000001');
  const items = L.analyzeImport([
    { business_name: 'JOES  pizza!', city: 'karachi', country: 'PAKISTAN' },           // db dup by name
    { business_name: 'Other', phone_number_1: '0300-1112233' },                         // db dup by phone
    { business_name: 'Joe\'s Pizza Palace', city: 'Karachi', country: 'Pakistan' },     // similar, NOT dup
    { business_name: 'New Cafe', city: 'Lahore', country: 'Pakistan' },
    { business_name: 'new cafe', city: 'Lahore', country: 'Pakistan' },                 // file dup
    { business_name: '' }], db);
  assert.deepEqual(items.map(i => i.dup?.where ?? (i.errors.length ? 'invalid' : 'new')), ['database', 'database', 'new', 'new', 'file', 'invalid']);
  assert.equal(items[0].action, 'skip'); assert.equal(items[2].action, 'import');
  const s = L.summarize(items); assert.equal(s.fresh, 2); assert.equal(s.dupDb, 2); assert.equal(s.dupFile, 1); assert.equal(s.invalid, 1); assert.equal(s.toImport, 2);
});
const leads = [{ id: 'u1', lead_id: 'LM-000001', date_added: '2026-10-01', business_name: 'Café Ünï', business_category: 'Cafe', country: 'Pakistan', city: 'Karachi', phone_number_1: '+92 0300 0000001', website_status: 'No Website Found', lead_status: 'New',
  research_notes: 'Line1\nLine2 ' + 'long '.repeat(400), personalized_first_message: 'Hello\n\nWorld', next_follow_up_date: '2026-11-05', contact_channel: 'WhatsApp' },
  { id: 'u2', lead_id: 'LM-000002', date_added: '2026-10-02', business_name: 'B2', website_status: 'Active Website', lead_status: 'Contacted' }];
t('JSON export -> re-import round-trip (no errors, no warnings, no loss)', () => {
  const json = L.toExportJson(leads), p = L.parseJsonText(json); assert.equal(p.records.length, 2); assert.equal(Object.keys(p.records[0]).length, 24);
  const items = L.analyzeImport(p.records, L.newIndex()); assert(items.every(i => !i.errors.length && !i.warnings.length), JSON.stringify(items.map(i => [i.errors, i.warnings])));
  assert.equal(items[0].rec.research_notes, leads[0].research_notes); assert.equal(items[0].rec.phone_number_1, '+92 0300 0000001');
});
t('XLSX: 24 headers, phone kept as text, notes intact', () => {
  const wb = L.buildXlsx(XLSX, leads), buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }), back = XLSX.read(buf), ws = back.Sheets.Leads;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }); assert.equal(rows[0].length, 24); assert.equal(rows[0][14], 'Phone Number 1'); assert.equal(rows[1][14], '+92 0300 0000001'); assert.equal(typeof rows[1][14], 'string'); assert.equal(rows[1][18], leads[0].research_notes); assert.equal(rows.length, 3);
});
await ta('PDF: landscape, summary+details, page numbers', async () => {
  const doc = L.buildPdf(jsPDF, leads, { details: true, gen: 'now' }); assert(doc.getNumberOfPages() >= 3); assert(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  const one = L.buildPdf(jsPDF, [leads[0]], { details: true, gen: 'now' }); assert(one.getNumberOfPages() >= 1); assert(doc.output('arraybuffer').byteLength > 2000);
  const sum = L.buildPdf(jsPDF, leads, { details: false, gen: 'now' }); assert.equal(sum.getNumberOfPages(), 1);
});
await ta('DOCX: valid zip, full text preserved', async () => {
  const buf = await docx.Packer.toBuffer(L.buildDocx(docx, leads, 'now')); assert.equal(buf.slice(0, 2).toString(), 'PK'); assert(buf.length > 3000);
  const { default: JSZip } = await import('jszip').catch(() => ({ default: null }));
  if (JSZip) { const z = await JSZip.loadAsync(buf), xml = await z.file('word/document.xml').async('string'); assert(xml.includes('Line2')); assert(xml.includes('long long long')); assert(xml.includes('LM-000002')); }
});
console.log(`\n${pass} checks passed${process.exitCode ? ' (with FAILURES)' : ''}`);
