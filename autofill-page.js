(function () {
  "use strict";
  if (globalThis.DraftBackForm) return;
  const core = globalThis.DraftBackAutofill;
  let changes = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function roots(root = document, result = []) {
    result.push(root);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) roots(el.shadowRoot, result);
      if (el.tagName === "IFRAME") { try { if (el.contentDocument?.documentElement) roots(el.contentDocument, result); } catch {} }
    }
    return result;
  }
  function visible(el) {
    const view = el.ownerDocument.defaultView;
    return !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length && view.getComputedStyle(el).visibility !== 'hidden';
  }
  function candidates(scope) {
    const controls = roots().flatMap(root => [...root.querySelectorAll('input, select, textarea, [role="combobox"]')]).filter(el =>
      !el.matches(':disabled') && !el.closest('[aria-disabled="true"]') && !(el.tagName==='BUTTON'&&el.type==='submit') && !el.multiple && (!el.readOnly || isCombo(el)) && visible(el) &&
      (el.tagName !== "INPUT" || ["text", "email", "tel", "url", "date", "number"].includes(el.type) || (el.type==='search' && isCombo(el))));
    if(scope)return controls.filter(el => (el.closest('form') || document)===scope);
    const focusedForm = document.activeElement?.closest("form");
    if (focusedForm) return controls.filter(el => el.closest("form") === focusedForm);
    const groups = new Map();
    for (const el of controls) {
      const form = el.closest("form") || document;
      if (!groups.has(form)) groups.set(form, []);
      groups.get(form).push(el);
    }
    return [...groups.values()].sort((a, b) => b.filter(keyFor).length - a.filter(keyFor).length)[0] || [];
  }
  function keyFor(el) {
    const labelText = label => { const copy = label.cloneNode(true); copy.querySelectorAll('input,select,textarea,button').forEach(child=>child.remove()); return copy.textContent.trim(); };
    const labels = [...(el.labels || [])].map(labelText);
    const aria = (el.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => el.getRootNode().getElementById(id)?.textContent || "");
    const cell = el.closest("td");
    const adjacent = cell?.previousElementSibling?.textContent?.trim() || "";
    const ac = (el.autocomplete || "").split(/\s+/).at(-1);
    const legends=[];for(let group=el.closest('fieldset');group;group=group.parentElement?.closest('fieldset'))legends.push(group.querySelector(':scope > legend')?.textContent || '');
    if(legends.some(text=>/emergency|father|mother|spouse|referee|reference contact/i.test(text)))return null;
    const legend=legends.join(' ');
    const key = core.classify([ac, ...labels, el.getAttribute("aria-label"), ...aria, el.name, el.id, el.placeholder, adjacent]);
    if (!key && /birth/i.test(legend)) return ({day:'birthDay',month:'birthMonth',year:'birthYear'})[core.norm(labels[0])];
    return key;
  }
  const isCombo = el => el.getAttribute('role') === 'combobox' && el.tagName !== 'SELECT';
  const comboContainer = el => el.closest('[class*="__control"], [data-combobox]') || el.parentElement;
  function comboValue(el) {
    const selected = comboContainer(el)?.querySelector('[class*="__single-value"], [data-selected-value]');
    if (selected) {
      // International telephone widgets sometimes show only a flag and dial code.
      const flag = selected.querySelector('.iti__flag');
      const region = flag && [...flag.classList].map(name=>/^iti__([a-z]{2})$/.exec(name)?.[1]).find(Boolean);
      if (region) return new Intl.DisplayNames(['en'], {type:'region'}).of(region.toUpperCase());
      return selected.textContent.trim();
    }
    if (el.tagName !== 'INPUT') return el.textContent.trim();
    return el.getAttribute('aria-expanded') === 'true' ? '' : el.value;
  }
  function blank(el) {
    if (isCombo(el)) return !comboValue(el) || el.hasAttribute('data-placeholder') || /^(?:select|choose|please select)(?:\s+(?:a|an|your))?(?:\s+(?:country|state|province|city|option|value|nationality|title|degree|school))?[.\s…]*$/i.test(comboValue(el));
    if (el.tagName !== "SELECT") return !el.value.trim();
    const label = el.selectedOptions[0]?.textContent.trim() || "";
    return !el.value || /^(?:[-–—]+|select\b.*|choose\b.*|please\b.*|month|day|year|\(select.*\))$/i.test(label);
  }
  function selection(el, value, key) {
    const norm = core.norm;
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const values = [norm(value)];
    if (["birthMonth", "birthDay"].includes(key)) values.push(String(Number(value)));
    if (key === "birthMonth" && months[Number(value) - 1]) values.push(months[Number(value) - 1], months[Number(value) - 1].slice(0, 3));
    const options=[...el.options].filter(o=>!o.disabled&&!o.closest('optgroup[disabled]'));
    const matches=options.filter(o=>key==='country' ? [o.value,o.textContent.trim()].some(v=>norm(core.countryName(v))===norm(core.countryName(value))) : values.includes(norm(o.value)) || values.includes(norm(o.textContent)));
    return new Set(matches.map(o=>o.value)).size===1 ? matches[0].value : null;
  }
  function write(el, value) {
    const view = el.ownerDocument.defaultView;
    const proto = el.tagName === "SELECT" ? view.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new view.Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new view.Event("change", { bubbles: true, composed: true }));
  }
  function click(el) {
    const view = el.ownerDocument.defaultView, r = el.getBoundingClientRect();
    for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
      const EventType = type.startsWith('pointer') ? view.PointerEvent : view.MouseEvent;
      el.dispatchEvent(new EventType(type,{bubbles:true,cancelable:true,composed:true,view,button:0,buttons:type.endsWith('down')?1:0,detail:1,clientX:r.x+Math.min(10,r.width/2),clientY:r.y+Math.min(10,r.height/2),pointerType:'mouse'}));
    }
  }
  const optionName = (text,key) => {const label=String(text).replace(/\s*\+\d[\d\s-]*$/, '');return core.norm(key==='country'?core.countryName(label):label)};
  async function chooseCombo(el, value, key) {
    const root = el.getRootNode();
    const existing = new Set([...root.querySelectorAll('[role="listbox"]')].filter(visible));
    el.focus(); click(el); await wait(100);
    if (el.tagName === 'INPUT' && !el.readOnly) { write(el, value); await wait(150); }
    let chosen;
    for (let i=0;i<8&&!chosen;i++) {
      const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`.trim().split(/\s+/);
      const linked = ids.map(id=>root.getElementById(id)).filter(Boolean);
      const lists = linked.length ? linked : [...root.querySelectorAll('[role="listbox"]')].filter(list=>visible(list)&&!existing.has(list));
      const options = lists.flatMap(list=>[...list.querySelectorAll('[role="option"]')]);
      const matches=options.filter(option=>visible(option)&&option.getAttribute('aria-disabled')!=='true'&&optionName(option.textContent,key)===optionName(value,key));
      if(matches.length===1)chosen=matches[0];
      if (!chosen) await wait(100);
    }
    if (chosen) { click(chosen); await wait(150); }
    const committed = chosen && optionName(comboValue(el),key)===optionName(value,key) && el.getAttribute('aria-expanded')!=='true';
    if (!committed && el.tagName==='INPUT') write(el,'');
    if (el.getAttribute('aria-expanded')==='true') el.dispatchEvent(new el.ownerDocument.defaultView.KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,bubbles:true}));
    el.blur();
    return Boolean(committed);
  }
  function dateFormat(el) {
    const hints=[el.placeholder,el.getAttribute('aria-label'),...(el.labels||[])].map(item=>typeof item==='string'?item:item?.textContent || '');
    for(const id of `${el.getAttribute('aria-describedby')||''} ${el.getAttribute('aria-labelledby')||''}`.split(/\s+/))hints.push(el.getRootNode().getElementById(id)?.textContent || '');
    const format=/\b(dd|mm|yyyy)([/.\-])(dd|mm|yyyy)\2(dd|mm|yyyy)\b/i.exec(hints.join(' '));
    return format&&new Set([format[1],format[3],format[4]].map(s=>s.toLowerCase())).size===3 ? format : null;
  }
  function formattedValue(el, value, key) {
    if (key !== 'birthDate' || el.type === 'date') return value;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!iso) return null;
    const format = dateFormat(el);
    if (!format) return null;
    const parts = {yyyy:iso[1],mm:iso[2],dd:iso[3]};
    return [format[1],format[3],format[4]].map(part=>parts[part.toLowerCase()]).join(format[2]);
  }
  function rememberedValue(el, key) {
    if (isCombo(el)) return comboValue(el).replace(/\s*\+\d[\d\s-]*$/, '');
    if (el.tagName==='SELECT' && !['birthDay','birthMonth','birthYear'].includes(key)) return el.selectedOptions[0]?.textContent.trim() || '';
    if (key==='birthDate' && el.type!=='date') {
      const format=dateFormat(el);
      const values=el.value.split(/[/.\-]/);
      if(!format||values.length!==3)return '';
      const map=Object.fromEntries([format[1],format[3],format[4]].map((part,i)=>[part.toLowerCase(),values[i]]));
      return `${map.yyyy}-${map.mm.padStart(2,'0')}-${map.dd.padStart(2,'0')}`;
    }
    return el.value;
  }
  function highlight(el) {
    el.animate?.([{ outline: "3px solid #d63f72", outlineOffset: "2px" }, { outline: "3px solid transparent", outlineOffset: "2px" }], { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1800 });
  }
  async function fill(profile) {
    const result = { filled: 0, preserved: 0, missing: 0, unmatched: 0, rejected: 0, embeddedForms: document.querySelectorAll("iframe").length };
    const batch = [];
    const visited = new Set();
    const initial=candidates(),scope=initial[0]?.closest('form') || document;
    for (let pass=0;pass<5;pass++) {
    const retries=[];
    for (const el of candidates(scope)) {
      if(visited.has(el))continue;
      visited.add(el);
      const key = keyFor(el);
      if (!key) { result.unmatched++; continue; }
      if (!blank(el)) { result.preserved++; continue; }
      let value = core.valueFor(profile, key);
      if (!value) { result.missing++; continue; }
      if (isCombo(el)) {
        const before = comboValue(el);
        if (await chooseCombo(el,key==='country'?core.countryName(value):value,key)) { result.filled++; changes.push({el,before,after:comboValue(el),combo:true}); highlight(el); }
        else result.rejected++;
        continue;
      }
      value = formattedValue(el,value,key);
      if (el.tagName === "SELECT") value = selection(el, value, key);
      if (value === null || (el.maxLength > 0 && value.length > el.maxLength)) { result.rejected++; if(el.tagName==='SELECT'&&pass<4)retries.push(el); continue; }
      const before = el.value;
      write(el, value);
      batch.push({ el, before, after: value, key });
    }
    await wait([250,500,750,1000,150][pass]);
    for(const el of retries){visited.delete(el);result.rejected--;}
    }
    for (const item of batch) {
      const phone = ['phone','homePhone','workPhone','fax'].includes(item.key);
      const same = item.el.value === item.after || (phone && item.el.value.replace(/\D/g,'') === item.after.replace(/\D/g,''));
      if (item.el.isConnected && same && item.el.validity?.valid !== false) { item.after=item.el.value; result.filled++; changes.push(item); highlight(item.el); }
      else { result.rejected++; if(item.el.isConnected && same)write(item.el,item.before); }
    }
    changes = changes.filter(item => item.el.isConnected);
    return result;
  }
  function remember() {
    const values = new Map();
    for (const el of candidates()) {
      const key = keyFor(el);
      if (!key || blank(el)) continue;
      const value = rememberedValue(el,key).trim().slice(0, 500);
      if (!value) continue;
      if (!values.has(key)) values.set(key, new Set());
      values.get(key).add(value);
    }
    const profile = {};
    let conflicts = 0;
    for (const [key, set] of values) {
      if (set.size === 1) profile[key] = [...set][0];
      else conflicts++;
    }
    if (profile.birthYear && profile.birthMonth && profile.birthDay) {
      const month = Number(profile.birthMonth) || ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(profile.birthMonth.slice(0, 3).toLowerCase()) + 1;
      if (month >= 1 && month <= 12) profile.birthDate = `${profile.birthYear}-${String(month).padStart(2, "0")}-${profile.birthDay.padStart(2, "0")}`;
    }
    return { profile: core.sanitize(profile), conflicts };
  }
  async function undo() {
    let restored = 0, manual = 0;
    for (const item of changes.reverse()) {
      if (!item.el.isConnected) continue;
      if (item.combo) {
        if (comboValue(item.el)!==item.after) continue;
        item.el.focus();
        if(item.el.tagName==='INPUT') write(item.el,'');
        item.el.dispatchEvent(new item.el.ownerDocument.defaultView.KeyboardEvent('keydown',{key:'Backspace',code:'Backspace',keyCode:8,bubbles:true}));
        await wait(100);
        if(blank(item.el)) restored++;
        else manual++;
        item.el.blur();
      } else if (item.el.value === item.after) { write(item.el, item.before); restored++; }
    }
    changes = [];
    return {restored, manual};
  }
  globalThis.DraftBackForm = { fill, remember, undo, hasUndo:()=>changes.some(item=>item.el.isConnected) };
})();
