// node tests/verify_pipe_specs.js — reference values from the 2024.12 Hume Pipe Association manual.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','M_APP_005.html'),'utf8');
const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'pipe_spec_expected.json'),'utf8')).rows;
const ctx=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('const PIPE_DB ='),html.indexOf('// 85章: 管の有効断面積')),ctx);
vm.runInContext(html.slice(html.indexOf('const HUME_MEAN ='),html.indexOf('let pipeSpecNeedsReview')),ctx);
let combinations=0;
for(const [dia,row] of Object.entries(expected))for(const grade of ['1shu','2shu'])for(const strength of [50,70,90]){
 const got=vm.runInContext(`humePipeData('${grade}',${dia},${strength})`,ctx);
 assert.equal(got.Fa,row['Fa'+strength],`${dia}/${grade}/${strength}: Fa`);
 assert.equal(got.Ae,row.Ae);assert.equal(got.W,row.W);
 assert.equal(got.Pext,row[grade==='1shu'?'P1':'P2']);
 assert.ok(Math.abs(got.outer-got.inner-2*got.t)<1e-9);
 assert.ok(Math.abs(got.W-Math.PI*(got.inner+got.t)*got.t*24)<.01);
 combinations++;
}
assert.equal(combinations,138);
console.log(`PASS: ${combinations} independent external-class/strength/diameter combinations and geometry/weight consistency`);
