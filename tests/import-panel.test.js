const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8');
const functions = source.slice(source.indexOf('function toggleImportPanel()'), source.indexOf('let appUpdateDownloadUrl'));

test('import panel defaults closed, tolerates unavailable storage and loads only on expansion', () => {
  for (const stored of [null, '1', '0', 'unavailable']) {
    let expanded;
    let loads = 0;
    const body = { hidden: false };
    const context = vm.createContext({
      elements: { importPanelBody: body, importPanelToggle: { setAttribute: (_, value) => { expanded = value; } } },
      localStorage: { getItem() { if (stored === 'unavailable') throw Error('blocked'); return stored; }, setItem() {} },
      loadTeamsForSelectedLeague() { loads++; }
    });
    vm.runInContext(functions + ';restoreImportPanelState();', context);
    assert.equal(body.hidden, stored !== '0');
    assert.equal(expanded, String(stored === '0'));
    vm.runInContext('toggleImportPanel();', context);
    assert.equal(loads, stored === '0' ? 0 : 1);
    assert.equal(expanded, String(!body.hidden));
  }
});
