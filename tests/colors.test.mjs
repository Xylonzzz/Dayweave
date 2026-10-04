import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeColor} from '../public/color-inputs.mjs';
test('color entry accepts common hex/RGB formats but rejects out-of-range and executable CSS',()=>{
 for(const input of ['#ffffff','0#FFFFFF','0xFFFFFF','FFFFFF','#fff','rgb(255, 255, 255)'])assert.equal(normalizeColor(input),'#FFFFFF');
 for(const input of ['rgb(256,0,0)','rgb(-1,0,0)','#ffff','url(https://example.com)','red;position:fixed',''])assert.equal(normalizeColor(input),null);
});
