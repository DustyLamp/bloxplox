const { chromium, launchOptions, url, screenshotPath } = require('./helpers.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch(launchOptions);
 const page=await browser.newPage({viewport:{width:1056,height:1400},colorScheme:'light'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let f;
 async function reset(){await page.goto(url);f=page;await f.waitForSelector('.bp2-band');await f.evaluate(()=>document.fonts.ready)}
 async function date(d){await f.locator('[data-calendar]').click();await f.locator('.bp2-calhead').waitFor();await f.evaluate(d=>{const existing=document.querySelector('.bp2-calendar [data-date]');existing.dataset.date=d},d);await f.locator('.bp2-calendar [data-date]').first().click()}
 async function swipe(loc,dx){const b=await loc.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5+dx,b.y+b.height*.5,{steps:6});await page.mouse.up();await page.waitForTimeout(230)}
 async function newSchedule(id,repeat,start='2026-10-20',time='10:00'){
  await f.locator('[data-tracker]').click();await f.locator(`[data-habitmenu="${id}"]`).click();await f.locator('[data-schedulehabit]').click();
  await f.locator('#bp2-schedule-start').fill(start);await f.locator('#bp2-schedule-time').fill(time);await f.locator('#bp2-schedule-repeat').selectOption(repeat);
 }
 async function save(){await f.locator('[data-saveschedule]').click();assert.equal(await f.locator('.bp2-overlay').getAttribute('hidden'),'');}
 const names=()=>f.locator('.bp2-name').allTextContents();
 await reset();assert.equal(await f.locator('.bp2-switch button').first().innerText(),'Blocks');
 assert.equal(await f.evaluate(()=>document.fonts.check('700 16px Poppins')),true);
 await f.locator('[data-layout="list"]').click();
 for(const [dx,state,count] of [[100,'','3 / 17'],[100,'bp2-isdone','4 / 17'],[-100,'bp2-ismissed','3 / 17'],[-100,'','3 / 17'],[100,'bp2-isdone','4 / 17'],[-100,'bp2-ismissed','3 / 17']]){
  await swipe(f.locator('[data-open="2"]'),dx);const cls=await f.locator('[data-block="2"]').getAttribute('class');if(state)assert.ok(cls.includes(state));else assert.ok(!/bp2-isdone|bp2-ismissed/.test(cls));assert.match(await f.locator('.rt-progress').innerText(),new RegExp(count));
 }
 const top=await f.locator('.rt-history').evaluate(e=>getComputedStyle(e).borderTopLeftRadius);assert.equal(top,'0px');
 const initial=await f.locator('.rt-day').first().getAttribute('data-date');
 for(let i=0;i<5;i++){await f.locator('.rt-history').evaluate(e=>e.scrollLeft=0);await page.waitForTimeout(60)}
 const earlier=await f.locator('.rt-day').first().getAttribute('data-date');assert.ok(earlier<initial);
 for(let i=0;i<10;i++){await f.locator('.rt-history').evaluate(e=>e.scrollLeft=e.scrollWidth);await page.waitForTimeout(60)}
 const later=await f.locator('.rt-day').last().getAttribute('data-date');assert.ok(later>'2027-02-01');assert.ok(await f.locator('.rt-day').count()<=151);
 assert.equal(await f.locator('.bp2-datebutton').innerText(),'Sun 11 Oct');
 await f.locator('[data-day="1"]').click();await f.locator('[data-day="-1"]').click();
 await f.locator('[data-open="2"]').click();await f.locator('[data-linkhabit]').click();await f.locator('#bp2-linkedhabit').selectOption('4');await f.locator('[data-savelink]').click();await f.locator('[data-close]').click();
 await swipe(f.locator('[data-open="2"]'),100);await f.locator('[data-tracker]').click();assert.match(await f.locator('[data-habitrow="4"]').getAttribute('class'),/rt-done/);
 await swipe(f.locator('[data-habitrow="4"] .rt-rowbody'),-100);await f.locator('.bp2-switch [data-page="schedule"]').click();assert.match(await f.locator('[data-block="2"]').getAttribute('class'),/bp2-ismissed/);
 console.log('PASS font, exact swipe transitions, shared completion, infinite history, square corners.');
 await reset();await newSchedule(4,'interval');await f.locator('#bp2-schedule-interval').fill('3');await save();assert.ok((await names()).includes('Meditate'));
 await date('2026-10-22');assert.ok(!(await names()).includes('Meditate'));await date('2026-10-23');assert.ok((await names()).includes('Meditate'));
 let block=await f.locator('.bp2-block').filter({hasText:'MEDITATE'}).count();
 await f.locator('.bp2-face').filter({hasText:'Meditate'}).first().click();await f.locator('[data-blockstatus="done"]').click();await f.locator('[data-tracker]').click();assert.match(await f.locator('[data-habitrow="4"]').getAttribute('class'),/rt-done/);
 await f.locator('.bp2-switch [data-page="schedule"]').click();await f.locator('.bp2-face').filter({hasText:'Meditate'}).first().click();await f.locator('[data-editschedule]').click();await f.locator('#bp2-schedule-interval').fill('4');await save();await date('2026-10-23');assert.ok(!(await names()).includes('Meditate'));await date('2026-10-24');assert.ok((await names()).includes('Meditate'));
 await f.locator('.bp2-face').filter({hasText:'Meditate'}).first().click();await f.locator('[data-editschedule]').click();await f.locator('[data-removeschedule]').click();assert.ok(!(await names()).includes('Meditate'));
 console.log('PASS every N days, two-way status, repeat editing/removal.');
 await reset();await newSchedule(4,'weekly','2026-10-12','08:30');await f.locator('#bp2-schedule-end').fill('2026-10-25');await save();
 for(const [d,yes] of [['2026-10-12',true],['2026-10-13',false],['2026-10-14',true],['2026-10-16',true],['2026-10-17',false],['2026-10-26',false]]){await date(d);assert.equal((await names()).includes('Meditate'),yes,d)}
 await date('2026-10-14');await f.locator('.bp2-face').filter({hasText:'Meditate'}).first().click();await f.locator('[data-move="tomorrow"]').click();assert.ok(!(await names()).includes('Meditate'));await date('2026-10-15');assert.ok((await names()).includes('Meditate'));await date('2026-10-14');assert.ok(!(await names()).includes('Meditate'));
 console.log('PASS selected weekdays, end date, moving one occurrence.');
 await reset();await newSchedule(4,'monthly','2026-10-31','10:00');await f.locator('#bp2-schedule-monthday').fill('31');await save();
 for(const [d,yes] of [['2026-11-30',true],['2026-12-31',true],['2027-02-28',true],['2027-03-30',false],['2027-03-31',true]]){await date(d);assert.equal((await names()).includes('Meditate'),yes,d)}
 console.log('PASS monthly and shorter-month boundaries.');
 await reset();await newSchedule(6,'once');await save();assert.ok((await names()).includes('No alcohol'));await date('2026-10-21');assert.ok(!(await names()).includes('No alcohol'));
 await reset();await newSchedule(4,'daily','2026-10-20','10:00');await f.locator('#bp2-schedule-end').fill('2026-10-22');await save();await date('2026-10-21');assert.ok((await names()).includes('Meditate'));await date('2026-10-23');assert.ok(!(await names()).includes('Meditate'));
 console.log('PASS once and daily repeat.');
 await reset();await newSchedule(4,'weekly');await f.locator('#bp2-schedule-count').fill('4');await f.locator('[data-saveschedule]').click();assert.match(await f.locator('#bp2-schedule-error').innerText(),/Choose 4 weekdays/);await f.locator('[data-scheduleday="1"]').click();await save();
 await reset();await newSchedule(4,'interval','2026-10-11','08:30');await f.locator('#bp2-schedule-conflict').selectOption('free');await save();await f.locator('.bp2-face').filter({hasText:'Meditate'}).first().click();assert.equal(await f.locator('[data-start]').inputValue(),'20:00');
 await reset();await newSchedule(4,'weekly');
 for(const width of [1056,768,392,352]){await page.setViewportSize({width,height:1500});const overflow=await f.locator('.bp2-dialog').evaluate(e=>[...e.querySelectorAll('button,input,select')].some(n=>n.getBoundingClientRect().right>e.getBoundingClientRect().right));assert.equal(overflow,false,`Schedule dialog overflow at ${width}`);if(width===392){const b=await f.locator('#bloxplox-v2').boundingBox();await page.screenshot({path:screenshotPath('bp2-schedule-habit-mobile.png'),clip:{x:b.x,y:b.y,width:b.width,height:Math.min(1490,b.height)}})}}
 await page.setViewportSize({width:1056,height:1400});await f.locator('#bp2-schedule-repeat').selectOption('monthly');const b=await f.locator('#bloxplox-v2').boundingBox();await page.screenshot({path:screenshotPath('bp2-schedule-habit-desktop.png'),clip:{x:b.x,y:b.y,width:b.width,height:Math.min(1300,b.height)}});
 assert.deepEqual(errors,[]);console.log('PASS weekly validation, overlap placement, responsive schedule form. No JS errors.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
