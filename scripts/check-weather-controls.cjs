// Desktop integration check; this does not certify Android touch hardware.
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const out = process.env.CAR_QA_OUT || 'docs/round42';
(async () => {
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader']});
  const result = {environment: 'Desktop Chrome, CDP touch and DOM visibility simulation; no Android test', errors: []};
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}, hasTouch: true});
    page.on('pageerror', e => result.errors.push(String(e)));
    await page.addInitScript(() => {
      if (!localStorage.getItem('qa-initialized')) {
        localStorage.setItem('qa-initialized', 'yes');
        localStorage.setItem('car-driving-guide-v2', 'done');
        localStorage.setItem('parking-master-settings-v1', JSON.stringify({soundEnabled: false, weatherEnabled: true, weatherSnow: true}));
      }
      window.addEventListener('physics-debug-readout', e => window.qaPhysics = e.detail);
    });
    await page.goto(process.env.CAR_QA_URL || 'http://127.0.0.1:5190/?controls=touch');
    await page.getByRole('button', {name: '02 选择出发地'}).click();
    assert.equal(await page.getByRole('combobox', {name: '驾驶时段'}).inputValue(), 'DAY');
    await page.getByRole('button', {name: '启动引擎 →'}).click();
    await page.waitForFunction(() => window.__dshCar?.group?.parent && window.qaPhysics);
    const scene = () => page.evaluate(() => {
      let root = window.__dshCar.group; while (root.parent) root = root.parent;
      const rain = root.getObjectByName('weather-rain'), snow = root.getObjectByName('weather-snow');
      return {background: root.background.getHexString(), fog: !!root.fog, rain: rain?.uuid ?? null, snow: snow?.uuid ?? null,
        snowY: snow?.position.y, surface: window.qaPhysics.surfaceHeight};
    });
    result.start = await scene();
    assert.equal(result.start.background, 'c0cad6');
    assert(result.start.snow && !result.start.rain && !result.start.fog);

    const cdp = await page.context().newCDPSession(page);
    const gas = await page.getByRole('button', {name: '触屏油门'}).boundingBox();
    const reset = await page.getByRole('button', {name: '重置车辆', exact: true}).boundingBox();
    const a = {x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 81};
    const b = {x: reset.x + reset.width / 2, y: reset.y + reset.height / 2, id: 82};
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});
    result.hitTargets = await page.evaluate(({a,b})=>[document.elementFromPoint(a.x,a.y)?.outerHTML, document.elementFromPoint(b.x,b.y)?.outerHTML],{a,b});
    await page.evaluate(()=>{window.qaEvents=[];for(const n of ['pointerdown','pointerup','pointercancel','free-drive-stop'])window.addEventListener(n,e=>window.qaEvents.push({type:e.type,target:e.target?.getAttribute?.('aria-label'),id:e.pointerId}),true);});
    await touch('touchStart', [a]);
    await page.waitForFunction(() => document.querySelector('[role="meter"]').getAttribute('aria-valuenow') === '12');
    await touch('touchStart', [a, b]); // A second finger resets while gas remains held.
    await touch('touchMove', [{...a, y: a.y - 45}, b]);
    await page.waitForTimeout(200);
    result.touchEvents=await page.evaluate(()=>window.qaEvents);
    await page.screenshot({path:out+'/touch-debug.png'});
    assert.equal(await page.getByRole('meter').getAttribute('aria-valuenow'), '0');
    await touch('touchEnd', []);
    await touch('touchStart', [a]);
    await page.waitForFunction(() => document.querySelector('[role="meter"]').getAttribute('aria-valuenow') === '12');
    await touch('touchEnd', []);
    result.resetHeldPedal = 'PASS: old contact remains released, fresh touch works';

    await page.getByRole('button', {name: '驻车制动', exact: true}).click();
    await page.getByRole('button', {name: '前进挡', exact: true}).click();
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.qaPhysics?.throttleActual > .05);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new KeyboardEvent('keydown', {key: 'w', repeat: true, bubbles: true}));
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => window.qaPhysics?.throttleActual < .001);
    await page.keyboard.up('w');
    await page.keyboard.press('v');
    await page.waitForFunction(()=>document.querySelector('[aria-label="空挡"]').getAttribute('aria-pressed')==='true');
    assert.equal(await page.getByRole('button',{name:'驻车制动',exact:true}).getAttribute('aria-pressed'),'false');
    await page.keyboard.press('k');
    await page.getByLabel('雨刮器运行').waitFor({state:'visible'});
    await page.keyboard.press('k');
    await page.getByLabel('雨刮器运行').waitFor({state:'hidden'});
    result.keyboardAuxiliary = 'PASS: V selects neutral without applying parking brake, K toggles wipers';
    result.hiddenKeyboard = 'PASS: hidden without blur releases throttle; repeated key does not reapply it';
    await page.getByRole('button', {name: '重置车辆', exact: true}).click();

    await page.getByRole('button', {name: '设置', exact: true}).click();
    await page.getByRole('button', {name: /画面 光影与驾驶视野/}).click();
    result.combinations = [];
    for (let mask = 0; mask < 8; mask++) {
      for (const [name, flag] of [['降雨', 1], ['降雪', 2], ['大雾', 4]]) {
        await page.getByRole('checkbox', {name: new RegExp('^' + name)}).setChecked(!!(mask & flag));
      }
      await page.waitForTimeout(240);
      const state = await scene();
      assert.equal(!!state.rain, !!(mask & 1)); assert.equal(!!state.snow, !!(mask & 2)); assert.equal(state.fog, !!(mask & 4));
      result.combinations.push({mask, ...state});
    }
    const before = await scene();
    await page.getByRole('combobox', {name: '驾驶时段'}).selectOption('NIGHT');
    await page.waitForTimeout(240);
    const night = await scene();
    assert.equal(night.background, '0a0e1a'); assert.equal(night.rain, before.rain); assert.equal(night.snow, before.snow);
    await page.getByRole('checkbox', {name: /^天气效果/}).uncheck();
    await page.waitForTimeout(240);
    const dryNight = await scene();
    assert.equal(dryNight.background, '0a0e1a'); assert(!dryNight.rain && !dryNight.snow && !dryNight.fog);
    await page.getByRole('checkbox', {name: /^天气效果/}).check();
    await page.getByRole('checkbox', {name: /^降雨/}).uncheck();
    await page.getByRole('checkbox', {name: /^大雾/}).uncheck();
    await page.getByRole('combobox', {name: '驾驶时段'}).selectOption('DAY');
    await page.waitForTimeout(350);
    await page.getByRole('button', {name: /继续驾驶/}).click();
    await page.waitForTimeout(300);
    await page.screenshot({path: out + '/weather-day-snow.png'});
    result.daylight = 'PASS: independent, live change, buffers reused';

    // Reload restores only the chosen snow and daylight settings.
    await page.reload();
    await page.getByRole('button', {name: '02 选择出发地'}).click();
    assert.equal(await page.getByRole('combobox', {name: '驾驶时段'}).inputValue(), 'DAY');
    assert(await page.getByRole('checkbox', {name: '降雪', exact: true}).isChecked());
    assert(!await page.getByRole('checkbox', {name: '降雨', exact: true}).isChecked());
    assert(!await page.getByRole('checkbox', {name: '大雾', exact: true}).isChecked());
    result.persistence = 'PASS';
    await page.getByRole('button', {name: '雪岭冰路', exact: true}).click();
    await page.getByRole('button', {name: '启动引擎 →'}).click();
    await page.waitForFunction(() => window.__dshCar?.group?.parent && window.qaPhysics);
    const highPoint = await page.evaluate(async () => {
      const {GENERATE_LEVEL} = await import('/constants.ts');
      const {challengeMeshHeight} = await import('/utils/challengeMaps.ts');
      const level = GENERATE_LEVEL(9);
      let best = {x: 0, y: 0, height: -Infinity};
      for (let x = 1000; x < 8000; x += 500) for (let y = 1000; y < 6000; y += 500) {
        const height = challengeMeshHeight(level, x, y);
        if (height > best.height) best = {x, y, height};
      }
      window.dispatchEvent(new CustomEvent('test-teleport', {detail: {...best, rotation: 0}}));
      return best;
    });
    await page.waitForFunction(() => window.qaPhysics?.surfaceHeight > 600);
    const mountain = await scene();
    assert(Math.abs(mountain.snowY - mountain.surface + 20) < 2);
    await page.getByRole('button', {name: '设置', exact: true}).click();
    await page.getByRole('button', {name: /画面 光影与驾驶视野/}).click();
    await page.getByRole('checkbox', {name: /^降雨/}).check();
    await page.waitForTimeout(250);
    const pausedRain = await page.evaluate(() => {
      let root = window.__dshCar.group; while (root.parent) root = root.parent;
      return root.getObjectByName('weather-rain').position.y;
    });
    assert(Math.abs(pausedRain - mountain.surface + 20) < 2);
    await page.screenshot({path: out + '/weather-settings.png'});
    await page.getByRole('button', {name: /继续驾驶/}).click();
    await page.waitForTimeout(300);
    await page.screenshot({path: out + '/mountain-weather.png'});
    result.mountain = {highPoint, ...mountain, pausedRain};
    assert.deepEqual(result.errors, []);
    result.status = 'PASS';
  } catch (e) { result.status = 'FAIL'; result.failure = String(e); throw e; }
  finally { fs.writeFileSync(out + '/browser.json', JSON.stringify(result, null, 2) + '\n'); await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
