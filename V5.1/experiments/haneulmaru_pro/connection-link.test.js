import test from 'node:test';import assert from 'node:assert/strict';import {parseConnectionLink} from './connection-link.js';
test('full QR link keeps its session key and normalizes copied addresses',()=>{
 const key='abcdefghijklmnopqrstuvwx',expected='https://demo.trycloudflare.com/phone#'+key;
 for(const s of [expected,' demo.trycloudflare.com/phone/#'+key+' ','"'+expected+'"'])assert.equal(parseConnectionLink(s),expected);
 for(const s of ['https://demo.trycloudflare.com/phone','http://demo.trycloudflare.com/phone#'+key,'https://user@demo.trycloudflare.com/phone#'+key,'javascript:alert(1)',expected.replace('/phone','/admin')])assert.throws(()=>parseConnectionLink(s));
});
