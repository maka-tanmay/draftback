(function (root) {
  'use strict';
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clean = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const sensitive = value => /login|hint answer|hint question|password|passcode|\bpin\b|\botp\b|one time|captcha|security code|verification code|secret|security answer|security question|credit card|debit card|card number|cardholder|cc number|cc num|\bcvv\b|\bcvc\b|\biban\b|\bswift\b|bank account|routing number|social security|\bssn\b|passport ?(number|num|no|id)|aadhaar|aadhar|national (id|identity)|tax (id|number)|pan number|driver.*licen|consent|terms|agree|certify|declaration|signature|attest/i.test(clean(value));
  function label(el) {
    let nearby='';
    // Some production forms visually label a control without a label-for association.
    // Only use a short preceding label within a one-control container.
    if(el.parentElement?.querySelectorAll('input,select,textarea,[contenteditable]').length===1) {
      for(let sibling=el.previousElementSibling;sibling;sibling=sibling.previousElementSibling) {
        const text=sibling.textContent.trim();
        if(text && text.length<=160 && !sibling.matches('input,select,textarea,button') && !sibling.querySelector('input,select,textarea,button')) {nearby=text;break;}
      }
    }
    return el.getAttribute('aria-label') || Array.from(el.labels || []).map(x => x.textContent).join(' ') ||
      (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => el.getRootNode().getElementById?.(id)?.textContent || '').join(' ').trim() || nearby;
  }
  function kind(el) {
    if (el.tagName === 'SELECT') return el.multiple ? 'multiple' : 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.isContentEditable && !el.parentElement?.isContentEditable) return 'editable';
    if (el.tagName === 'INPUT' && /^(text|email|tel|url|number|date|month|week|time|datetime-local|checkbox|radio)$/.test(el.type)) return el.type;
    return null;
  }
  function eligible(el) {
    if (!kind(el) || el.matches(':disabled') || el.readOnly || el.closest('[inert],[aria-hidden="true"],[aria-disabled="true"],[data-draftback-ui]')) return false;
    if (el.getAttribute('role') === 'combobox' || el.closest('[role="combobox"]') || /react-select|select2|selectize/.test(el.className || '')) return false;
    if (el.checkVisibility ? !el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) : !el.getClientRects().length) return false;
    const meta = [el.type, el.name, el.id, label(el), el.placeholder, el.autocomplete, el.closest('fieldset')?.querySelector('legend')?.textContent].join(' ');
    return !sensitive(meta) && !/cc-|one-time-code|current-password|new-password/.test(el.autocomplete || '');
  }
  function value(el) {
    const type = kind(el);
    if (type === 'checkbox' || type === 'radio') return el.checked;
    if (type === 'multiple') return Array.from(el.selectedOptions).map(o => o.value);
    if (type === 'editable') return el.innerText;
    return el.value;
  }
  function identity(el, prefix) {
    const type = kind(el), form = el.form || el.closest('form');
    const name = el.name || el.getAttribute('name') || el.id || clean(el.placeholder) || clean(label(el));
    if (!name) return null;
    const formKey = form ? (form.id || form.getAttribute('name') || form.getAttribute('aria-label') ||
      Array.from(form.querySelectorAll('input,select,textarea')).map(x => x.name || x.id).filter(Boolean).sort().join('|')) : 'unwrapped';
    return JSON.stringify([prefix, formKey, type, name, /^(checkbox|radio)$/.test(type) ? el.value : '']);
  }
  function fields(doc = document) {
    const found = [], seen = new Set(); let unsupported = 0;
    function scan(container, prefix) {
      if (seen.has(container)) return; seen.add(container);
      for (const el of container.querySelectorAll('*')) {
        if (el.hasAttribute('data-draftback-ui')) continue;
        if (el.matches('input,select,textarea,[contenteditable="true"],[contenteditable=""],[role="combobox"]')) {
          if (eligible(el)) {
            const key = identity(el, prefix);
            if (key) found.push({key, el, kind:kind(el)}); else unsupported++;
          } else if (el.type !== 'hidden') unsupported++;
        }
        if (el.shadowRoot) scan(el.shadowRoot, prefix + '/shadow:' + (el.id || el.getAttribute('name') || el.tagName));
        if (el.tagName === 'IFRAME') {
          try {
            if (el.contentDocument && el.checkVisibility()) scan(el.contentDocument, prefix + '/frame:' + (el.id || el.name || el.getAttribute('src') || 'anonymous'));
            else unsupported++;
          } catch { unsupported++; }
        }
      }
    }
    scan(doc, 'page');
    const counts = new Map();
    for (const f of found) counts.set(f.key, (counts.get(f.key) || 0) + 1);
    unsupported += found.filter(f => counts.get(f.key) > 1).length;
    return {fields:found.filter(f => counts.get(f.key) === 1), unsupported};
  }
  function canRestore(field, saved, baseline, touched) {
    if (touched || !equal(value(field.el), baseline)) return false;
    const current = value(field.el);
    if (equal(current, saved)) return false;
    if (['checkbox','radio','select','multiple'].includes(field.kind)) return true;
    return current === '';
  }
  function write(field, saved) {
    const {el, kind:type} = field, win = el.ownerDocument.defaultView;
    if (!eligible(el)) return false;
    if (type === 'select' || type === 'multiple') {
      const wanted = Array.isArray(saved) ? saved : [saved];
      if (!wanted.every(v => Array.from(el.options).some(o => o.value === v && !o.disabled && !o.parentElement.disabled))) return false;
      if (type === 'multiple') for (const option of el.options) option.selected = wanted.includes(option.value);
      else Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype,'value').set.call(el,saved);
    } else if (type === 'editable') el.textContent = saved;
    else {
      const prop = /^(checkbox|radio)$/.test(type) ? 'checked' : 'value';
      if (prop === 'value' && el.maxLength >= 0 && String(saved).length > el.maxLength) return false;
      const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,prop).set.call(el,saved);
    }
    el.dispatchEvent(new win.Event('input',{bubbles:true,composed:true}));
    el.dispatchEvent(new win.Event('change',{bubbles:true,composed:true}));
    return equal(value(el),saved);
  }
  const api = {equal,clean,sensitive,kind,eligible,label,value,identity,fields,canRestore,write};
  root.DraftBackRecoveryCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
