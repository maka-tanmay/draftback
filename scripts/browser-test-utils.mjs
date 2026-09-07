export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export class CDP {
  constructor(url) {
    this.seq = 0; this.pending = new Map(); this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!this.pending.has(message.id)) return;
      const [resolve, reject] = this.pending.get(message.id); this.pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 25000);
      this.pending.set(id, [value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }]);
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async eval(expression) {
    const response = await this.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true, userGesture:true});
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  close() { this.ws.close(); }
}
export async function until(fn, message, attempts = 60) {
  const deadline=Date.now()+attempts*150;
  while(Date.now()<deadline) { try { const value=await fn(); if(value) return value; } catch(error) { if(!/context|navigat/i.test(error.message)) throw error; } await pause(150); }
  throw new Error(message);
}
