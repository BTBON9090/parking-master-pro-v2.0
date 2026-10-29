const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const out='docs/round43';fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});const result={errors:[],environment:'Desktop Chrome touch emulation; no Android hardware'};
try{const page=await browser.newPage({viewport:{width:1000,height:600},hasTouch:true});page.on('pageerror',e=>result.errors.push(String(e)));
await page.addInitScript(()=>{localStorage.setItem('car-driving-guide-v2','done');if(!localStorage.getItem('qa-save-init')){localStorage.setItem('qa-save-init','1');localStorage.setItem('parking-master-settings-v1',JSON.stringify({soundEnabled:false,shadowsEnabled:false,renderQuality:'low'}));}window.addEventListener('physics-debug-readout',e=>window.qaPhysics=e.detail);});
await page.goto('http://127.0.0.1:5190/?controls=touch');
await page.getByRole('dialog',{name:'这次更新了什么'}).waitFor();await page.screenshot({path:out+'/release-popup.png'});
await page.getByRole('button',{name:'知道了，继续'}).click();await page.getByRole('button',{name:'设置',exact:true}).click();
await page.getByRole('button',{name:/关于我的介绍/}).click();await page.getByRole('button',{name:'查看本次更新变化'}).click();await page.getByRole('dialog',{name:'这次更新了什么'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'这次更新了什么'}).count(),0);
// Returning from modal preserves the settings page.
await page.getByRole('dialog',{name:'游戏设置'}).waitFor();await page.screenshot({path:out+'/menu-settings.png'});
await page.getByRole('button',{name:'返回 ESC'}).click();
await page.getByRole('button',{name:'02 选择出发地'}).click();await page.getByRole('button',{name:/三层地库/}).first().click();await page.getByRole('button',{name:'启动引擎 →'}).click();
await page.waitForFunction(()=>window.__dshCar?.group?.parent&&window.qaPhysics,{timeout:60000});
await page.waitForTimeout(1200);
// Use actual emitted support position and store it, then reload the whole app.
await page.evaluate(()=>window.dispatchEvent(new Event('save-progress')));
const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('parking-master-progress-v1')));assert.equal(before.levelId,6);assert(before.pose.elevation<0);
await page.reload();assert.equal(await page.getByRole('dialog',{name:'这次更新了什么'}).count(),0);await page.getByRole('button',{name:/继续上次驾驶/}).click();
await page.waitForFunction(()=>window.__dshCar?.group?.parent&&window.qaPhysics);await page.waitForTimeout(1200);
const after=await page.evaluate(()=>window.qaPhysics);result.save=before;result.resumed=after;
assert(Math.abs(after.surfaceHeight-before.pose.elevation)<1);await page.getByRole('button',{name:'驻车制动',exact:true}).waitFor();
assert.equal(await page.getByRole('meter').getAttribute('aria-valuenow'),'0');
await page.screenshot({path:out+'/save-resumed.png'});assert.deepEqual(result.errors,[]);result.result='PASS';
}finally{fs.writeFileSync(out+'/progress-ui.json',JSON.stringify(result,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
